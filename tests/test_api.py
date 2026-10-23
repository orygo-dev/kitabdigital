import os, tempfile
import uuid, pytest
import subprocess, sys, sqlite3

os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="kitab-api-test-")
os.environ.pop("DATABASE_URL", None)
from fastapi.testclient import TestClient
from argon2 import PasswordHasher
from backend.main import app
from backend.models import Session, AdminUser
from tests.fixtures import fixtures


def test_test_database_does_not_use_inherited_production_url(tmp_path):
    protected = tmp_path / "database-yang-tidak-boleh-disentuh.db"
    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite:///{protected}"
    script = "import tests.test_api; from backend.models import engine,DATA; from pathlib import Path; assert Path(engine.url.database)==DATA/'app.db'"
    result = subprocess.run(
        [sys.executable, "-c", script], env=env, capture_output=True, text=True
    )
    assert result.returncode == 0, result.stderr
    assert not protected.exists()


@pytest.mark.parametrize("username,password_length", [("u" * 101, 12), ("valid", 513)])
def test_initial_setup_rejects_credentials_unusable_by_login(
    tmp_path, username, password_length
):
    env = os.environ.copy()
    env["DATA_DIR"] = str(tmp_path)
    env.pop("DATABASE_URL", None)
    script = f"""from unittest.mock import patch
from backend.setup_admin import main
from backend.models import Session,AdminUser
from sqlalchemy import select
with patch('builtins.input',return_value={username!r}), patch('getpass.getpass',return_value='x'*{password_length}):
    try: main()
    except SystemExit:
        with Session() as db: assert db.scalar(select(AdminUser)) is None
    else: raise AssertionError('Kredensial tidak valid diterima')
"""
    result = subprocess.run(
        [sys.executable, "-c", script], env=env, capture_output=True, text=True
    )
    assert result.returncode == 0, result.stderr


def test_upgrade_preserves_existing_admin(tmp_path):
    path = tmp_path / "app.db"
    with sqlite3.connect(path) as db:
        db.execute(
            "CREATE TABLE admin_users (id INTEGER PRIMARY KEY, username VARCHAR(100) NOT NULL UNIQUE, password_hash TEXT NOT NULL)"
        )
        db.execute("INSERT INTO admin_users VALUES (1, 'admin-lama', 'hash-lama')")
    env = os.environ.copy()
    env["DATA_DIR"] = str(tmp_path)
    env.pop("DATABASE_URL", None)
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "from backend.models import Session,AdminUser; db=Session(); user=db.get(AdminUser,1); assert user.username=='admin-lama' and user.password_hash=='hash-lama' and user.session_token_hash==''",
        ],
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr


@pytest.fixture
def authenticated():
    username = uuid.uuid4().hex
    with Session() as db:
        db.add(
            AdminUser(
                username=username,
                password_hash=PasswordHasher().hash("PengujianAman123!"),
            )
        )
        db.commit()
    client = TestClient(app)
    response = client.post(
        "/api/auth/login", json={"username": username, "password": "PengujianAman123!"}
    )
    assert response.status_code == 200
    client.headers["x-csrf-token"] = response.json()["csrf"]
    return client, username


@pytest.mark.parametrize(
    "file,detail",
    [("", "wajib diunggah"), ("audio/" + "a" * 32 + ".mp3", "Unggah ulang")],
)
def test_missing_audio_file_explains_recovery(authenticated, file, detail):
    client, _ = authenticated
    response = client.post(
        "/api/admin/audio", json={"title": "Uji audio", "file": file}
    )
    assert response.status_code == 400
    assert detail in response.json()["detail"]


def test_logout_and_new_login_revoke_old_cookie(authenticated):
    client, username = authenticated
    stolen = TestClient(app)
    stolen.cookies.update(client.cookies)
    assert stolen.get("/api/admin/books").status_code == 200
    assert client.post("/api/auth/logout").status_code == 200
    assert stolen.get("/api/admin/books").status_code == 401
    response = client.post(
        "/api/auth/login", json={"username": username, "password": "PengujianAman123!"}
    )
    stolen.cookies.clear()
    stolen.cookies.update(client.cookies)
    assert (
        client.post(
            "/api/auth/login",
            json={"username": username, "password": "PengujianAman123!"},
        ).status_code
        == 200
    )
    assert stolen.get("/api/auth/session").status_code == 401


def test_upload_rejected_before_parsing_and_size_limits(authenticated, monkeypatch):
    client, _ = authenticated
    assert (
        TestClient(app)
        .post("/api/admin/uploads/books", content=b"invalid multipart")
        .status_code
        == 401
    )
    assert (
        TestClient(app)
        .post(
            "/api/admin/uploads/books",
            headers={"content-length": "999999999"},
            content=b"x",
        )
        .status_code
        == 401
    )
    monkeypatch.setenv("MAX_PDF_MB", "1")
    assert (
        client.post(
            "/api/admin/uploads/books",
            content=b"x",
            headers={"content-length": "2000000"},
        ).status_code
        == 413
    )

    def chunks():
        yield b'--audit\r\nContent-Disposition: form-data; name="file"; filename="test.pdf"\r\nContent-Type: application/pdf\r\n\r\n'
        for _ in range(40):
            yield b"x" * 65536
        yield b"\r\n--audit--\r\n"

    response = client.post(
        "/api/admin/uploads/books",
        content=chunks(),
        headers={"content-type": "multipart/form-data; boundary=audit"},
    )
    assert response.status_code == 413, response.text


def test_invalid_types_and_database_constraints(authenticated):
    client, _ = authenticated
    assert (
        client.put("/api/admin/settings", json={"splash_duration": True}).status_code
        == 400
    )
    assert (
        client.post("/api/admin/book-categories", json={"name": "x" * 121}).status_code
        == 400
    )
    assert (
        client.post(
            "/api/admin/playlists", json={"name": "Uji", "audio_ids": [True]}
        ).status_code
        == 400
    )
    assert client.post("/api/admin/books", json=[]).status_code == 400
    assert (
        client.post(
            "/api/admin/books",
            content="{",
            headers={"content-type": "application/json"},
        ).status_code
        == 400
    )
    from sqlalchemy.exc import IntegrityError
    from backend.models import Book

    with Session() as db:
        db.add(Book(title="Uji FK", file="tidak-ada.pdf", category_id=2147483647))
        with pytest.raises(IntegrityError):
            db.commit()


def test_workflows():
    with Session() as db:
        db.add(
            AdminUser(
                username="penguji",
                password_hash=PasswordHasher().hash("KataSandiPengujian123!"),
            )
        )
        db.commit()
    client = TestClient(app)
    guest = TestClient(app)
    assert guest.get("/api/admin/books").status_code == 401
    assert (
        client.post(
            "/api/auth/login", json={"username": "penguji", "password": "salah"}
        ).status_code
        == 401
    )
    login = client.post(
        "/api/auth/login",
        json={"username": "penguji", "password": "KataSandiPengujian123!"},
    )
    assert login.status_code == 200
    assert (
        client.post("/api/admin/book-categories", json={"name": "Uji"}).status_code
        == 403
    )
    client.headers["x-csrf-token"] = login.json()["csrf"]
    category = client.post(
        "/api/admin/book-categories", json={"name": "Sholawat", "position": 1}
    ).json()
    pdf, png, mp3 = fixtures()

    def upload(kind, name, content):
        r = client.post("/api/admin/uploads/" + kind, files={"file": (name, content)})
        assert r.status_code == 200, r.text
        return r.json()["file"]

    pdfref = upload("books", "uji.pdf", pdf)
    cover = upload("images", "uji.png", png)
    assert (
        client.post(
            "/api/admin/uploads/books", files={"file": ("palsu.pdf", b"not pdf")}
        ).status_code
        == 400
    )
    payload = {
        "title": "Kitab pengujian",
        "file": pdfref,
        "cover": cover,
        "category_id": category["id"],
        "direction": "rtl",
        "published": False,
        "downloadable": True,
        "featured": True,
    }
    book = client.post("/api/admin/books", json=payload)
    assert book.status_code == 200, book.text
    bid = book.json()["id"]
    assert guest.get("/api/public/books").json() == []
    assert guest.get("/api/files/" + pdfref).status_code == 404
    assert (
        client.put(f"/api/admin/books/{bid}", json={"published": True}).status_code
        == 200
    )
    assert guest.get("/api/public/books").json()[0]["direction"] == "rtl"
    assert guest.get("/api/files/" + pdfref).content == pdf
    assert (
        guest.get("/api/files/" + pdfref, headers={"Range": "bytes=0-99"}).status_code
        == 206
    )
    assert (
        client.delete("/api/admin/book-categories/" + str(category["id"])).status_code
        == 409
    )
    assert (
        client.put(
            f"/api/admin/books/{bid}", json={"direction": "ltr", "downloadable": False}
        ).status_code
        == 200
    )
    assert guest.get("/api/files/" + pdfref + "?download=true").status_code == 403
    assert (
        client.put(
            f"/api/admin/books/{bid}", json={"file": "../../etc/passwd"}
        ).status_code
        == 400
    )
    audio = client.post(
        "/api/admin/audio",
        json={
            "title": "Nada pengujian",
            "file": upload("audio", "uji.mp3", mp3),
            "published": True,
        },
    ).json()
    assert guest.get("/api/files/" + audio["file"]).status_code == 200
    playlist = client.post(
        "/api/admin/playlists", json={"name": "Daftar uji", "audio_ids": [audio["id"]]}
    ).json()
    assert guest.get("/api/public/playlists").json()[0]["audio_ids"] == [audio["id"]]
    config = {
        "name": "Majelis Pengujian",
        "logo": cover,
        "splash_logo": cover,
        "splash_enabled": True,
        "splash_duration": 1,
        "splash_text": "Selamat datang",
    }
    assert client.put("/api/admin/settings", json=config).status_code == 200
    assert guest.get("/api/settings").json()["name"] == "Majelis Pengujian"
    assert guest.get("/api/manifest.webmanifest").json()["name"] == "Majelis Pengujian"
    assert (
        client.put("/api/admin/settings", json={"splash_duration": 8}).status_code
        == 400
    )
    assert client.delete("/api/admin/audio/" + str(audio["id"])).status_code == 200
    assert guest.get("/api/public/playlists").json()[0]["audio_ids"] == []
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/admin/books").status_code == 401
