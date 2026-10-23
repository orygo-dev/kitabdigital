import io
from urllib.error import HTTPError, URLError

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from backend import quran


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("QF_CLIENT_ID", "test-client")
    monkeypatch.setenv("QF_CLIENT_SECRET", "secret-never-returned")
    monkeypatch.setenv("QF_ENV", "prelive")
    monkeypatch.delenv("QF_TRANSLATION_ID", raising=False)
    quran.configured_client.cache_clear()
    app = FastAPI()
    app.include_router(quran.router)
    yield TestClient(app)
    quran.configured_client.cache_clear()


def test_missing_credentials_returns_actionable_message(client, monkeypatch):
    monkeypatch.delenv("QF_CLIENT_SECRET")
    response = client.get("/api/quran/chapters")
    assert response.status_code == 503
    assert "belum diaktifkan" in response.json()["detail"]


def test_chapters_cache_and_credentials_stay_on_server(client, monkeypatch):
    calls = []

    def request(url, headers, body=None):
        calls.append((url, headers, body))
        if body:
            assert "Basic " in headers["Authorization"]
            return {"access_token": "private-token", "expires_in": 3600}
        assert headers == {
            "x-auth-token": "private-token",
            "x-client-id": "test-client",
        }
        return {
            "chapters": [
                {
                    "id": 1,
                    "name_simple": "Al-Fatihah",
                    "name_arabic": "الفاتحة",
                    "verses_count": 7,
                    "revelation_place": "makkah",
                    "private": "not-forwarded",
                }
            ]
        }

    monkeypatch.setattr(quran, "request_json", request)
    first = client.get("/api/quran/chapters")
    assert first.status_code == 200
    assert len(first.json()["chapters"]) == 1
    assert client.get("/api/quran/chapters").json() == first.json()
    assert len(calls) == 2
    assert "secret" not in first.text and "private" not in first.text
    assert "apis-prelive.quran.foundation" in calls[1][0]


def test_verses_select_indonesian_resource_and_keep_arabic(client, monkeypatch):
    arabic = "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ"

    def request(url, headers, body=None):
        if body:
            return {"access_token": "token", "expires_in": 3600}
        if "resources/translations" in url:
            return {
                "translations": [
                    {"id": 9, "language_name": "english", "name": "English"},
                    {
                        "id": 33,
                        "language_name": "indonesian",
                        "name": "Indonesia",
                        "author_name": "Sumber resmi",
                    },
                ]
            }
        assert "page=2" in url and "per_page=50" in url and "translations=33" in url
        return {
            "verses": [
                {
                    "verse_key": "2:51",
                    "verse_number": 51,
                    "text_uthmani": arabic,
                    "translations": [
                        {
                            "resource_id": 33,
                            "text": 'Terjemahan <sup foot_note="1">1</sup><b>resmi</b> &amp; utuh.',
                        }
                    ],
                }
            ],
            "pagination": {"current_page": 2, "total_pages": 6, "next_page": 3},
        }

    monkeypatch.setattr(quran, "request_json", request)
    response = client.get("/api/quran/chapters/2/verses?page=2")
    assert response.status_code == 200, response.text
    assert response.json()["verses"][0] == {
        "verse_key": "2:51",
        "verse_number": 51,
        "text_uthmani": arabic,
        "translation": "Terjemahan resmi & utuh.",
    }
    assert response.json()["translation"]["author_name"] == "Sumber resmi"


def test_refresh_expired_token_once(client, monkeypatch):
    tokens = []
    requests = []

    def request(url, headers, body=None):
        if body:
            tokens.append("token")
            return {"access_token": f"token-{len(tokens)}", "expires_in": 3600}
        requests.append(headers["x-auth-token"])
        if len(requests) == 1:
            raise HTTPError(url, 401, "expired", {}, io.BytesIO())
        return {"chapters": []}

    monkeypatch.setattr(quran, "request_json", request)
    assert client.get("/api/quran/chapters").status_code == 200
    assert requests == ["token-1", "token-2"]


@pytest.mark.parametrize(
    "failure",
    [
        URLError("secret-never-returned"),
        ValueError("invalid json"),
        HTTPError("https://example.com", 429, "limit", {}, None),
    ],
)
def test_upstream_failures_do_not_leak_details(client, monkeypatch, failure):
    def request(*args, **kwargs):
        raise failure

    monkeypatch.setattr(quran, "request_json", request)
    response = client.get("/api/quran/chapters")
    assert response.status_code == 503
    assert "secret-never-returned" not in response.text


@pytest.mark.parametrize(
    "path",
    [
        "/chapters/0/verses",
        "/chapters/115/verses",
        "/chapters/1/verses?page=0",
        "/chapters/1/verses?page=7",
    ],
)
def test_invalid_navigation_never_reaches_upstream(client, monkeypatch, path):
    monkeypatch.setattr(
        quran, "request_json", lambda *args: pytest.fail("Unexpected upstream call")
    )
    assert client.get("/api/quran" + path).status_code == 422


def test_translation_configuration_cannot_select_non_indonesian(client, monkeypatch):
    monkeypatch.setenv("QF_TRANSLATION_ID", "9")

    def request(url, headers, body=None):
        if body:
            return {"access_token": "token", "expires_in": 3600}
        return {
            "translations": [{"id": 9, "language_name": "english", "name": "English"}]
        }

    monkeypatch.setattr(quran, "request_json", request)
    assert client.get("/api/quran/chapters/1/verses").status_code == 503
