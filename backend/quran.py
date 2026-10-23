"""Read-only Quran.Foundation integration. Credentials never leave the server."""

import base64
from collections import OrderedDict
from functools import lru_cache
from html.parser import HTMLParser
import json
import os
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

from fastapi import APIRouter, HTTPException, Path, Query

router = APIRouter(prefix="/api/quran", tags=["Al-Qur'an"])


class QuranUnavailable(Exception):
    pass


def request_json(url, headers, body=None):
    # Quran.Foundation blocks Python-urllib's default User-Agent (HTTP 403/1010).
    request = Request(
        url,
        data=body,
        headers={
            "User-Agent": "KitabDigital/1.0",
            "Accept": "application/json",
            **headers,
        },
    )
    with urlopen(request, timeout=20) as response:
        return json.load(response)


class QuranClient:
    def __init__(self, client_id, secret, environment, translation_id=""):
        self.client_id = client_id
        self.secret = secret
        self.translation_id = translation_id
        suffix = "-prelive" if environment == "prelive" else ""
        self.api = f"https://apis{suffix}.quran.foundation/content/api/v4"
        self.auth = (
            "https://prelive-oauth2.quran.foundation/oauth2/token"
            if environment == "prelive"
            else "https://oauth2.quran.foundation/oauth2/token"
        )
        self.token = ""
        self.expires = 0
        self.cache = OrderedDict()
        self.lock = threading.RLock()

    def access_token(self):
        if self.token and time.monotonic() < self.expires:
            return self.token
        basic = base64.b64encode(f"{self.client_id}:{self.secret}".encode()).decode()
        result = request_json(
            self.auth,
            {
                "Authorization": f"Basic {basic}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            b"grant_type=client_credentials&scope=content",
        )
        self.token = result["access_token"]
        self.expires = time.monotonic() + max(0, int(result["expires_in"]) - 60)
        return self.token

    def get(self, path, **params):
        key = path + "?" + urlencode(params)
        # Serialize refreshes and coalesce concurrent requests for the same resource.
        with self.lock:
            now = time.monotonic()
            if key in self.cache and self.cache[key][0] > now:
                self.cache.move_to_end(key)
                return self.cache[key][1]
            try:
                for attempt in range(2):
                    token = self.access_token()
                    try:
                        result = request_json(
                            self.api + key,
                            {"x-auth-token": token, "x-client-id": self.client_id},
                        )
                        break
                    except HTTPError as error:
                        if error.code != 401 or attempt:
                            raise
                        self.token = ""
                self.cache[key] = (time.monotonic() + 3600, result)
                self.cache.move_to_end(key)
                while len(self.cache) > 256:
                    self.cache.popitem(last=False)
                return result
            except (
                HTTPError,
                URLError,
                OSError,
                ValueError,
                KeyError,
                TypeError,
            ) as error:
                raise QuranUnavailable() from error

    def translation(self):
        resources = self.get("/resources/translations", language="id")["translations"]
        choices = [
            r
            for r in resources
            if str(r.get("language_name", "")).lower() == "indonesian"
        ]
        if self.translation_id:
            choices = [r for r in choices if str(r["id"]) == self.translation_id]
        if not choices:
            raise QuranUnavailable()
        return sorted(choices, key=lambda r: int(r["id"]))[0]


@lru_cache(maxsize=1)
def configured_client(client_id, secret, environment, translation_id):
    return QuranClient(client_id, secret, environment, translation_id)


def get_client():
    client_id = os.getenv("QF_CLIENT_ID", "").strip()
    secret = os.getenv("QF_CLIENT_SECRET", "").strip()
    environment = os.getenv("QF_ENV", "production").strip()
    translation = os.getenv("QF_TRANSLATION_ID", "").strip()
    if not client_id or not secret:
        raise HTTPException(503, "Layanan Al-Qur’an belum diaktifkan oleh pengurus.")
    if environment not in ("prelive", "production") or (
        translation and not translation.isdecimal()
    ):
        raise HTTPException(
            503, "Konfigurasi layanan Al-Qur’an perlu diperiksa oleh pengurus."
        )
    return configured_client(client_id, secret, environment, translation)


class TranslationText(HTMLParser):
    """Render upstream markup as plain text; omit superscript footnote links."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("sup", "script", "style"):
            self.skip += 1
        elif tag in ("br", "p") and not self.skip:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("sup", "script", "style") and self.skip:
            self.skip -= 1

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def plain_translation(value):
    parser = TranslationText()
    parser.feed(value)
    return "".join(parser.parts).strip()


def unavailable():
    return HTTPException(
        503, "Layanan Al-Qur’an sementara tidak dapat dihubungi. Silakan coba lagi."
    )


@router.get("/reciters")
def reciters():
    client = get_client()
    try:
        rows = client.get("/resources/chapter_reciters", language="en")["reciters"]
        return {
            "reciters": [
                {
                    "id": int(row["id"]),
                    "name": row["name"],
                    "style": (row.get("style") or {}).get("name") or "",
                }
                for row in rows
            ],
            "source": "Quran.Foundation",
        }
    except (QuranUnavailable, KeyError, TypeError, ValueError):
        raise unavailable()


@router.get("/reciters/{reciter}/audio")
def reciter_audio(reciter: int = Path(ge=1, le=100000)):
    client = get_client()
    try:
        rows = client.get(f"/chapter_recitations/{reciter}")["audio_files"]
        files = []
        seen = set()
        for row in rows:
            chapter = int(row["chapter_id"])
            url = row["audio_url"]
            parsed = urlsplit(url)
            # Only expose secure, public CDN URLs, never arbitrary schemes.
            host = parsed.hostname or ""
            allowed = any(
                host == domain or host.endswith("." + domain)
                for domain in (
                    "quranicaudio.com", "qurancdn.com", "quran.com", "quran.foundation"
                )
            )
            if (
                parsed.scheme != "https"
                or not allowed
                or parsed.username
                or parsed.password
                or parsed.port not in (None, 443)
            ):
                raise QuranUnavailable()
            if not 1 <= chapter <= 114 or chapter in seen:
                raise QuranUnavailable()
            seen.add(chapter)
            files.append({"chapter_id": chapter, "audio_url": url})
        return {
            "audio_files": sorted(files, key=lambda row: row["chapter_id"]),
            "source": "Quran.Foundation",
        }
    except (QuranUnavailable, KeyError, TypeError, ValueError):
        raise unavailable()


@router.get("/chapters")
def chapters():
    client = get_client()
    try:
        rows = client.get("/chapters", language="id")["chapters"]
        return {
            "chapters": [
                {
                    key: row[key]
                    for key in (
                        "id",
                        "name_simple",
                        "name_arabic",
                        "verses_count",
                        "revelation_place",
                    )
                }
                for row in rows
            ],
            "source": "Quran.Foundation",
        }
    except (QuranUnavailable, KeyError, TypeError, ValueError):
        raise unavailable()


@router.get("/chapters/{chapter}/verses")
def verses(chapter: int = Path(ge=1, le=114), page: int = Query(default=1, ge=1, le=6)):
    client = get_client()
    try:
        resource = client.translation()
        result = client.get(
            f"/verses/by_chapter/{chapter}",
            fields="text_uthmani",
            words="false",
            translations=resource["id"],
            language="id",
            page=page,
            per_page=50,
        )
        rows = []
        for verse in result["verses"]:
            translation = next(
                (
                    t
                    for t in verse.get("translations", [])
                    if t.get("resource_id") == resource["id"]
                ),
                None,
            )
            if not verse.get("text_uthmani") or not translation:
                raise QuranUnavailable()
            rows.append(
                {
                    "verse_key": verse["verse_key"],
                    "verse_number": verse["verse_number"],
                    "text_uthmani": verse["text_uthmani"],
                    "translation": plain_translation(translation["text"]),
                }
            )
        return {
            "verses": rows,
            "pagination": result["pagination"],
            "translation": {
                "id": resource["id"],
                "name": resource["name"],
                "author_name": resource.get("author_name", ""),
            },
            "source": "Quran.Foundation",
        }
    except (QuranUnavailable, KeyError, TypeError, ValueError, StopIteration):
        raise unavailable()
