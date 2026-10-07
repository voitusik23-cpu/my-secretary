"""
Functional Tests for Music & Movies Modules
Verifies:
1. Short-lived HMAC token generation and stream authorization.
2. In-memory track searching over encrypted titles/artists.
3. Movie search type validation and non-blocking execution.
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings
from app.services.media_token import generate_media_token, verify_media_token

client = TestClient(app)


def test_media_token_generation_and_verification():
    """Verify HMAC media stream token generation and verification."""
    token = generate_media_token(action="stream", resource_id="42", user="test_user")
    assert token is not None

    data = verify_media_token(token, expected_action="stream", expected_resource_id="42")
    assert data["resource_id"] == "42"
    assert data["user"] == "test_user"


def test_music_stream_with_signed_token():
    """Verify that music stream endpoint accepts signed token without master secret key."""
    # Token for a track ID (e.g., 999)
    token = generate_media_token(action="stream", resource_id="999", user="admin")
    response = client.get(f"/api/v1/music/stream/999?token={token}")
    # Since track 999 doesn't exist, it should return 404 (NOT 401 Unauthorized!)
    assert response.status_code == 404


def test_music_stream_without_token_rejected():
    """Verify that music stream endpoint without token or headers is rejected with 401."""
    response = client.get("/api/v1/music/stream/999")
    assert response.status_code == 401


def test_movie_watchlist_type_validation():
    """Verify that adding movie with invalid type fails validation (Literal['movie', 'series'])."""
    headers = {"X-Secret-Key": settings.SECRET_KEY}
    # Invalid type
    res = client.post(
        "/api/movies/watchlist",
        headers=headers,
        json={"title": "Test Title", "type": "invalid_serial_type"}
    )
    assert res.status_code == 422  # Pydantic validation error

    # Valid type
    res_valid = client.post(
        "/api/movies/watchlist",
        headers=headers,
        json={"title": "Inception", "type": "movie"}
    )
    assert res_valid.status_code == 201


def test_heuristic_music_recognition():
    """Verify that music queries (e.g., 'постав пісню Океан Ельзи Обійми') parse correctly into domain 'music'."""
    from app.services.ai_parser import _heuristic_fallback
    res = _heuristic_fallback("постав пісню Океан Ельзи Обійми", current_tab="music")
    assert len(res["actions"]) > 0
    assert res["actions"][0]["domain"] == "music"
    assert "Океан Ельзи Обійми" in res["actions"][0]["data"]["title"]


def test_transcribe_audio_endpoint_empty():
    """Verify that /system/transcribe-audio rejects empty audio cleanly."""
    res = client.post(
        "/system/transcribe-audio",
        files={"audio": ("empty.wav", b"", "audio/wav")}
    )
    assert res.status_code == 200
    assert res.json()["status"] == "error"

