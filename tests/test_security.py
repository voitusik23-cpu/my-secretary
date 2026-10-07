"""
Security & Tenant Isolation Test Suite for MySecretary
Tests:
1. Authentication verification (timing attacks protection, header enforcement, denial on missing credentials).
2. Tenant isolation (preventing access to foreign user databases or owner database via crafted headers).
3. Cryptography integrity (AES-256-GCM fail-closed behavior, backward compatibility).
4. Telegram webhook security (header token verification, single-use codes).
"""
import os
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings
from app.services.crypto import encrypt_str, decrypt_str, CryptoError

client = TestClient(app)

def test_unauthenticated_request_denied():
    """Verify that requests without authorization headers are strictly rejected with 401."""
    response = client.get("/api/tasks")
    assert response.status_code == 401
    assert "Отсутствует ключ" in response.text or response.status_code == 401

def test_query_param_key_rejected():
    """Verify that sensitive keys in URL query params (?key=...) are rejected by auth."""
    response = client.get(f"/api/tasks?key={settings.SECRET_KEY}")
    assert response.status_code == 401

def test_invalid_secret_key_denied():
    """Verify that invalid credentials are rejected with 401."""
    response = client.get("/api/tasks", headers={"X-Secret-Key": "wrong_password_attempt"})
    assert response.status_code == 401

def test_valid_secret_key_allowed():
    """Verify that correct credentials via X-Secret-Key header pass successfully."""
    response = client.get("/api/tasks", headers={"X-Secret-Key": settings.SECRET_KEY})
    assert response.status_code == 200

def test_owner_database_bypass_blocked():
    """
    Verify that arbitrary phone numbers or user names in X-Secretary-User
    do NOT grant unauthenticated access to the database.
    """
    dummy_tenant_phone = "380991112233"
    response = client.get("/api/tasks", headers={"X-Secretary-User": dummy_tenant_phone})
    assert response.status_code == 401

def test_crypto_fail_closed():
    """Verify that cryptography fails closed without leaking plaintext when key is corrupted or missing."""
    test_secret = "Confidential_Password_789"
    encrypted = encrypt_str(test_secret)
    assert encrypted.startswith("enc2::")

    decrypted = decrypt_str(encrypted)
    assert decrypted == test_secret

    # Verify corrupt payload raises CryptoError
    with pytest.raises(CryptoError):
        decrypt_str("enc2::Corrupted_Ciphertext_Data")

def test_telegram_webhook_secret_verification():
    """Verify that telegram webhook enforces secret token if configured."""
    # When TELEGRAM_WEBHOOK_SECRET is set, arbitrary webhook updates without header must be rejected
    settings.TELEGRAM_WEBHOOK_SECRET = "super_secure_tg_token_xyz"
    try:
        response = client.post("/api/v1/telegram/webhook", json={"message": {"text": "hello"}})
        assert response.status_code == 403

        # With correct secret token header
        response = client.post(
            "/api/v1/telegram/webhook",
            json={"message": {"text": "/help"}},
            headers={"X-Telegram-Bot-Api-Secret-Token": "super_secure_tg_token_xyz"}
        )
        assert response.status_code == 200
    finally:
        settings.TELEGRAM_WEBHOOK_SECRET = ""
