import json, os, re, secrets, time, hashlib
from collections import defaultdict
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request, Depends, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.sessions import SessionMiddleware
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from pydantic import BaseModel, Field
from pypdf import PdfReader
from PIL import Image
from mutagen.mp3 import MP3
from .models import (
    DATA,
    Session,
    AdminUser,
    Book,
    Audio,
    BookCategory,
    AudioCategory,
    Playlist,
    PlaylistItem,
    AppSettings,
)
from .storage import storage
from .quran import router as quran_router

UPLOADS = DATA / "uploads"
UPLOADS.mkdir(exist_ok=True)
secret = os.getenv("SESSION_SECRET")
if not secret:
    secret_path = DATA / "session.key"
    if not secret_path.exists():
        try:
            with secret_path.open("x") as f:
                f.write(secrets.token_hex(32))
            secret_path.chmod(0o600)
        except FileExistsError:
            pass
    secret = secret_path.read_text()
app = FastAPI(title="API Kitab Majelis")
defaults = {
    "name": "Kitab Majelis",
    "description": "Teman ibadah dan sholawat Anda",
    "primary": "#06634f",
    "secondary": "#c19b4b",
    "logo": "",
    "welcome": "Assalamu’alaikum, selamat datang",
    "splash_enabled": False,
    "splash_logo": "",
    "splash_background": "",
    "splash_color": "#06634f",
    "splash_text": "Mari bersholawat",
    "splash_duration": 2,
}
models = {
    "books": Book,
    "audio": Audio,
    "book-categories": BookCategory,
    "audio-categories": AudioCategory,
    "playlists": Playlist,
}
attempts = defaultdict(list)


def db_session():
    with Session() as db:
        yield db


def authenticated_user(request, db):
    user = db.get(AdminUser, request.session.get("uid", -1))
    token = request.session.get("auth_token", "")
    if (
        not user
        or not token
        or not user.session_token_hash
        or not secrets.compare_digest(
            user.session_token_hash, hashlib.sha256(token.encode()).hexdigest()
        )
    ):
        return None
    return user


def admin(request: Request, db=Depends(db_session)):
    user = authenticated_user(request, db)
    if not user:
        raise HTTPException(401, "Silakan masuk sebagai administrator.")
    if request.method not in ("GET", "HEAD") and not secrets.compare_digest(
        request.headers.get("x-csrf-token", ""), request.session.get("csrf", "!")
    ):
        raise HTTPException(403, "Sesi tidak valid. Muat ulang halaman.")
    return user


def serialize(obj):
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


def settings(db):
    row = db.get(AppSettings, 1)
    return defaults | (json.loads(row.value) if row else {})


@app.exception_handler(StarletteHTTPException)
async def http_error(request, exc):
    detail = {
        404: "Alamat atau konten tidak ditemukan.",
        405: "Metode permintaan tidak didukung.",
    }.get(exc.status_code, exc.detail)
    if detail == "There was an error parsing the body":
        detail = "Berkas atau isi permintaan tidak dapat dibaca."
    return JSONResponse({"detail": detail}, status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    return JSONResponse(
        {"detail": "Data tidak valid. Periksa kelengkapan dan format isian."},
        status_code=422,
    )


@app.exception_handler(IntegrityError)
async def database_conflict(request, exc):
    return JSONResponse(
        {
            "detail": "Data masih digunakan atau telah berubah. Muat ulang halaman lalu coba lagi."
        },
        status_code=409,
    )


async def json_body(request):
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Isi permintaan harus berupa JSON yang valid.")
    if not isinstance(body, dict):
        raise HTTPException(400, "Isi permintaan harus berupa objek.")
    return body


@app.middleware("http")
async def security(request, call_next):
    if request.url.path.startswith("/api/admin/uploads/"):
        with Session() as db:
            if not authenticated_user(request, db):
                return JSONResponse(
                    {"detail": "Silakan masuk sebagai administrator."}, status_code=401
                )
        if not secrets.compare_digest(
            request.headers.get("x-csrf-token", ""), request.session.get("csrf", "!")
        ):
            return JSONResponse(
                {"detail": "Sesi tidak valid. Muat ulang halaman."}, status_code=403
            )
        kind = request.url.path.rsplit("/", 1)[-1]
        limits = {
            "books": int(os.getenv("MAX_PDF_MB", "100")),
            "audio": int(os.getenv("MAX_AUDIO_MB", "200")),
            "images": int(os.getenv("MAX_IMAGE_MB", "10")),
        }
        try:
            length = int(request.headers.get("content-length", "0"))
        except ValueError:
            return JSONResponse(
                {"detail": "Ukuran permintaan tidak valid."}, status_code=400
            )
        if kind in limits and length > limits[kind] * 1024 * 1024 + 65536:
            return JSONResponse(
                {"detail": f"Batas unggahan {limits[kind]} MB."}, status_code=413
            )
        original_receive = request._receive
        received = 0
        exceeded = False

        async def limited_receive():
            nonlocal received, exceeded
            message = await original_receive()
            received += len(message.get("body", b""))
            if kind in limits and received > limits[kind] * 1024 * 1024 + 65536:
                exceeded = True
                raise HTTPException(413, "Berkas terlalu besar.")
            return message

        request._receive = limited_receive
    response = await call_next(request)
    if request.url.path.startswith("/api/admin/uploads/") and exceeded:
        return JSONResponse(
            {"detail": f"Batas unggahan {limits[kind]} MB."}, status_code=413
        )
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    if request.url.path.startswith(("/api/auth/", "/api/admin/")):
        response.headers["Cache-Control"] = "no-store"
    return response


class Login(BaseModel):
    username: str = Field(max_length=100)
    password: str = Field(max_length=512)


@app.post("/api/auth/login")
def login(body: Login, request: Request, db=Depends(db_session)):
    key = request.client.host
    now = time.time()
    attempts[key] = [t for t in attempts[key] if t > now - 300]
    if len(attempts[key]) >= 10:
        raise HTTPException(
            429, "Terlalu banyak percobaan. Coba lagi dalam lima menit."
        )
    attempts[key].append(now)
    user = db.scalar(select(AdminUser).where(AdminUser.username == body.username))
    try:
        PasswordHasher().verify(
            user.password_hash if user else PasswordHasher().hash("invalid-account"),
            body.password,
        )
        if not user:
            raise ValueError()
    except (VerificationError, ValueError):
        raise HTTPException(401, "Nama pengguna atau kata sandi salah.")
    token = secrets.token_hex(32)
    user.session_token_hash = hashlib.sha256(token.encode()).hexdigest()
    db.commit()
    attempts.pop(key, None)
    request.session.clear()
    request.session.update(uid=user.id, csrf=secrets.token_hex(32), auth_token=token)
    return {"csrf": request.session["csrf"]}


@app.get("/api/auth/session")
def session(request: Request, user=Depends(admin)):
    return {"username": user.username, "csrf": request.session["csrf"]}


@app.post("/api/auth/logout")
def logout(request: Request, user=Depends(admin), db=Depends(db_session)):
    user.session_token_hash = ""
    db.commit()
    request.session.clear()
    return {"ok": True}


@app.get("/api/settings")
def get_settings(db=Depends(db_session)):
    return settings(db)


@app.put("/api/admin/settings")
async def save_settings(request: Request, user=Depends(admin), db=Depends(db_session)):
    body = await json_body(request)
    value = settings(db)
    for key, v in body.items():
        if key not in defaults:
            raise HTTPException(400, "Pengaturan tidak dikenal.")
        if key == "splash_enabled":
            if not isinstance(v, bool):
                raise HTTPException(400, "Pilihan layar pembuka tidak valid.")
        elif key == "splash_duration":
            if type(v) not in (int, float) or not 1 <= v <= 5:
                raise HTTPException(400, "Durasi harus 1–5 detik.")
        elif not isinstance(v, str) or len(v) > 2000:
            raise HTTPException(400, "Nilai pengaturan tidak valid.")
        if key in ("primary", "secondary", "splash_color") and not re.fullmatch(
            r"#[0-9a-fA-F]{6}", v
        ):
            raise HTTPException(400, "Warna tidak valid.")
        if key == "name" and (not v.strip() or len(v) > 200):
            raise HTTPException(
                400, "Nama aplikasi wajib diisi, maksimal 200 karakter."
            )
        if (
            key in ("logo", "splash_logo", "splash_background")
            and v
            and not valid_file(v, "images")
        ):
            raise HTTPException(400, "Gambar tidak ditemukan.")
        value[key] = v
    row = db.get(AppSettings, 1) or AppSettings(id=1)
    row.value = json.dumps(value)
    db.add(row)
    db.commit()
    return value


def valid_file(name, kind=None):
    patterns = {
        "books": r"books/[a-f0-9]{32}\.pdf",
        "audio": r"audio/[a-f0-9]{32}\.mp3",
        "images": r"images/[a-f0-9]{32}\.(png|jpg|webp)",
    }
    actual = name.split("/", 1)[0] if isinstance(name, str) else ""
    return (
        actual in patterns
        and bool(re.fullmatch(patterns[actual], name))
        and (not kind or actual == kind)
        and storage.exists(name)
    )


@app.post("/api/admin/uploads/{kind}")
async def upload(kind: str, file: UploadFile, user=Depends(admin)):
    limits = {
        "books": int(os.getenv("MAX_PDF_MB", "100")),
        "audio": int(os.getenv("MAX_AUDIO_MB", "200")),
        "images": int(os.getenv("MAX_IMAGE_MB", "10")),
    }
    if kind not in limits:
        raise HTTPException(404, "Jenis unggahan tidak ditemukan.")
    ext = Path(file.filename or "").suffix.lower()
    if (
        ext
        not in {
            "books": [".pdf"],
            "audio": [".mp3"],
            "images": [".jpg", ".jpeg", ".png", ".webp"],
        }[kind]
    ):
        raise HTTPException(400, "Format berkas tidak didukung.")
    if ext == ".jpeg":
        ext = ".jpg"
    folder = UPLOADS / kind
    folder.mkdir(exist_ok=True)
    target = folder / (secrets.token_hex(16) + ext)
    total = 0
    try:
        with target.open("wb") as out:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > limits[kind] * 1024 * 1024:
                    raise HTTPException(413, f"Batas unggahan {limits[kind]} MB.")
                out.write(chunk)
        if kind == "books":
            pdf = PdfReader(target)
            if pdf.is_encrypted or not len(pdf.pages):
                raise ValueError()
        elif kind == "audio":
            MP3(target)
        else:
            with Image.open(target) as img:
                if (
                    img.format != {".png": "PNG", ".jpg": "JPEG", ".webp": "WEBP"}[ext]
                    or img.width * img.height > 16000000
                ):
                    raise ValueError()
                img.verify()
    except HTTPException:
        target.unlink(missing_ok=True)
        raise
    except Exception:
        target.unlink(missing_ok=True)
        raise HTTPException(400, "Berkas rusak, terenkripsi, atau tidak sesuai format.")
    finally:
        await file.close()
    return {"file": f"{kind}/{target.name}"}


@app.get("/api/files/{kind}/{name}")
def serve_file(
    kind: str,
    name: str,
    request: Request,
    download: bool = False,
    db=Depends(db_session),
):
    ref = f"{kind}/{name}"
    if not valid_file(ref):
        raise HTTPException(404, "Berkas tidak ditemukan.")
    is_admin = bool(authenticated_user(request, db))
    if not is_admin:
        if kind == "images":
            refs = [
                v
                for k, v in settings(db).items()
                if k in ("logo", "splash_logo", "splash_background")
            ]
            public = ref in refs or any(
                db.scalar(select(m.id).where(m.cover == ref, m.published == True))
                for m in (Book, Audio)
            )
        else:
            m = Book if kind == "books" else Audio
            public = bool(
                db.scalar(select(m.id).where(m.file == ref, m.published == True))
            )
            if (
                public
                and download
                and not db.scalar(
                    select(m.id).where(
                        m.file == ref, m.published == True, m.downloadable == True
                    )
                )
            ):
                raise HTTPException(403, "Unduhan dinonaktifkan.")
        if not public:
            raise HTTPException(404, "Berkas tidak tersedia.")
    return FileResponse(
        storage.path(ref),
        filename=name if download else None,
        headers={"Cache-Control": "private, no-cache"},
    )


@app.get("/api/public/{kind}")
def public_list(kind: str, db=Depends(db_session)):
    if kind not in models:
        raise HTTPException(404, "Konten tidak ditemukan.")
    m = models[kind]
    q = select(m)
    if kind in ("books", "audio"):
        q = q.where(m.published == True)
    q = q.order_by(m.position, m.id) if hasattr(m, "position") else q.order_by(m.id)
    rows = [serialize(r) for r in db.scalars(q)]
    if kind == "playlists":
        public_ids = set(db.scalars(select(Audio.id).where(Audio.published == True)))
        for r in rows:
            r["audio_ids"] = [
                i.audio_id
                for i in db.scalars(
                    select(PlaylistItem)
                    .where(PlaylistItem.playlist_id == r["id"])
                    .order_by(PlaylistItem.position)
                )
                if i.audio_id in public_ids
            ]
    return rows


@app.get("/api/home")
def home_content(db=Depends(db_session)):
    books = public_list("books", db)
    audio = public_list("audio", db)
    return {
        "settings": settings(db),
        "featured_books": [b for b in books if b["featured"]],
        "categories": public_list("book-categories", db),
        "featured_audio": [a for a in audio if a["featured"]],
        "recent_audio": sorted(audio, key=lambda a: a["created_at"], reverse=True)[:6],
    }


@app.get("/api/admin/dashboard")
def dashboard(user=Depends(admin), db=Depends(db_session)):
    return {
        "books": db.scalar(select(func.count()).select_from(Book)),
        "categories": db.scalar(select(func.count()).select_from(BookCategory)),
        "audio": db.scalar(select(func.count()).select_from(Audio)),
        "recent": sorted(
            [
                dict(serialize(r), kind=k)
                for k, m in [("books", Book), ("audio", Audio)]
                for r in db.scalars(select(m).order_by(m.id.desc()).limit(5))
            ],
            key=lambda r: r["created_at"],
            reverse=True,
        )[:10],
    }


@app.get("/api/admin/{kind}")
def admin_list(kind: str, user=Depends(admin), db=Depends(db_session)):
    if kind not in models:
        raise HTTPException(404, "Konten tidak ditemukan.")
    rows = [serialize(r) for r in db.scalars(select(models[kind]))]
    if kind == "playlists":
        for r in rows:
            r["audio_ids"] = [
                i.audio_id
                for i in db.scalars(
                    select(PlaylistItem)
                    .where(PlaylistItem.playlist_id == r["id"])
                    .order_by(PlaylistItem.position)
                )
            ]
    return rows


async def write_content(kind, request, db, id=None):
    if kind not in models:
        raise HTTPException(404, "Konten tidak ditemukan.")
    m = models[kind]
    body = await json_body(request)
    row = db.get(m, id) if id else m()
    if row is None:
        raise HTTPException(404, "Konten tidak ditemukan.")
    allowed = (
        {
            "title",
            "author",
            "description",
            "file",
            "cover",
            "position",
            "published",
            "downloadable",
            "featured",
            "category_id",
            "direction",
        }
        if kind in ("books", "audio")
        else {"name", "position"} if kind != "playlists" else {"name", "audio_ids"}
    )
    if kind == "audio":
        allowed.discard("direction")
    if set(body) - allowed:
        raise HTTPException(400, "Kolom tidak dikenal.")
    required = "title" if kind in ("books", "audio") else "name"
    if not str(body.get(required, getattr(row, required, "")) or "").strip():
        raise HTTPException(400, "Nama atau judul wajib diisi.")
    ids = body.pop("audio_ids", None)
    for k, v in body.items():
        if k in ("published", "downloadable", "featured"):
            if not isinstance(v, bool):
                raise HTTPException(400, "Pilihan tidak valid.")
        elif k in ("position", "category_id"):
            if k == "category_id" and v is None:
                pass
            elif type(v) != int or not 0 <= v <= 2147483647:
                raise HTTPException(400, "Nomor tidak valid.")
        elif not isinstance(v, str) or len(v) > (
            10000 if k == "description" else 120 if k == "name" else 200
        ):
            raise HTTPException(400, "Teks terlalu panjang atau tidak valid.")
        if k == "direction" and v not in ("rtl", "ltr"):
            raise HTTPException(400, "Arah baca tidak valid.")
        if k == "file":
            if not v:
                raise HTTPException(
                    400,
                    "Berkas utama wajib diunggah. Pilih berkas dan tunggu hingga unggahan berhasil sebelum menyimpan.",
                )
            if not valid_file(v, kind):
                raise HTTPException(
                    400,
                    "Berkas unggahan tidak ditemukan di server. Unggah ulang berkas sebelum menyimpan.",
                )
        if k == "cover" and v and not valid_file(v, "images"):
            raise HTTPException(400, "Sampul tidak ditemukan.")
        if (
            k == "category_id"
            and v is not None
            and not db.get(BookCategory if kind == "books" else AudioCategory, v)
        ):
            raise HTTPException(400, "Kategori tidak ditemukan.")
        setattr(row, k, v.strip() if isinstance(v, str) else v)
    if kind in ("books", "audio") and not row.file:
        raise HTTPException(400, "Berkas utama wajib diunggah.")
    if ids is not None and (
        not isinstance(ids, list)
        or any(type(i) != int or not db.get(Audio, i) for i in ids)
        or len(set(ids)) != len(ids)
    ):
        raise HTTPException(400, "Daftar audio tidak valid.")
    db.add(row)
    db.flush()
    if ids is not None:
        for item in db.scalars(
            select(PlaylistItem).where(PlaylistItem.playlist_id == row.id)
        ):
            db.delete(item)
        for pos, aid in enumerate(ids):
            db.add(PlaylistItem(playlist_id=row.id, audio_id=aid, position=pos))
    db.commit()
    return serialize(row)


@app.post("/api/admin/{kind}")
async def create(
    kind: str, request: Request, user=Depends(admin), db=Depends(db_session)
):
    return await write_content(kind, request, db)


@app.put("/api/admin/{kind}/{id}")
async def update(
    kind: str, id: int, request: Request, user=Depends(admin), db=Depends(db_session)
):
    return await write_content(kind, request, db, id)


@app.delete("/api/admin/{kind}/{id}")
def delete(kind: str, id: int, user=Depends(admin), db=Depends(db_session)):
    if kind not in models:
        raise HTTPException(404, "Konten tidak ditemukan.")
    row = db.get(models[kind], id)
    if not row:
        raise HTTPException(404, "Konten tidak ditemukan.")
    if kind in ("book-categories", "audio-categories"):
        m = Book if kind == "book-categories" else Audio
        if db.scalar(select(m.id).where(m.category_id == id)):
            raise HTTPException(409, "Kategori masih digunakan.")
    if kind in ("audio", "playlists"):
        q = (
            select(PlaylistItem).where(PlaylistItem.audio_id == id)
            if kind == "audio"
            else select(PlaylistItem).where(PlaylistItem.playlist_id == id)
        )
        for item in db.scalars(q):
            db.delete(item)
        db.flush()
    db.delete(row)
    db.commit()
    return {"ok": True}


@app.get("/api/manifest.webmanifest")
def manifest(db=Depends(db_session)):
    s = settings(db)
    return JSONResponse(
        {
            "name": s["name"],
            "short_name": s["name"][:20],
            "start_url": "/",
            "display": "standalone",
            "background_color": "#faf7ee",
            "theme_color": s["primary"],
            "icons": [
                {
                    "src": f"/icon-{size}.png",
                    "sizes": f"{size}x{size}",
                    "type": "image/png",
                    "purpose": "any",
                }
                for size in (192, 512)
            ],
        },
        media_type="application/manifest+json",
    )


app.include_router(quran_router)

app.add_middleware(
    SessionMiddleware,
    secret_key=secret,
    https_only=os.getenv("COOKIE_SECURE", "false") == "true",
    same_site="strict",
    max_age=28800,
)
DIST = Path(__file__).resolve().parent.parent / "dist"
if (DIST / "assets").is_dir() and (DIST / "index.html").is_file():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def frontend(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "Alamat API tidak ditemukan.")
        target = (DIST / path).resolve()
        if target.is_relative_to(DIST) and target.is_file():
            return FileResponse(target)
        return FileResponse(DIST / "index.html")
