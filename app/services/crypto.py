"""
Crypto service v2 — AES-256-GCM (upgraded from Fernet/AES-128-CBC)

Переваги AES-256-GCM над Fernet:
- 256-бітний ключ замість 128-бітного
- GCM (Galois/Counter Mode) — автентифіковане шифрування (AEAD)
- Швидше на сучасних процесорах із hardware AES підтримкою
- Стандарт для банківських і урядових систем

Зворотна сумісність:
- Старі записи з префіксом "enc::" (Fernet) — автоматично розшифровуються старим ключем
- Нові записи зберігаються з префіксом "enc2::" (AES-256-GCM)
- Повна міграція відбувається прозоро при наступному записі
"""
import os
import logging
import base64
from typing import Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.fernet import Fernet, InvalidToken
from app.config import settings

logger = logging.getLogger("secretary.crypto")

# Prefix markers
_PREFIX_V2 = "enc2::"   # AES-256-GCM (new)
_PREFIX_V1 = "enc::"    # Fernet/AES-128 (legacy, read-only)

_aes_key: Optional[bytes] = None
_fernet_instance = None


def _get_aes_key() -> Optional[bytes]:
    """Derive a 32-byte AES-256 key from ENCRYPTION_KEY using PBKDF2."""
    global _aes_key
    if _aes_key is not None:
        return _aes_key

    raw_key = settings.ENCRYPTION_KEY.strip() if settings.ENCRYPTION_KEY else ""
    if not raw_key:
        logger.warning("ENCRYPTION_KEY not set — data stored in plaintext!")
        return None

    try:
        # Use the raw key bytes as seed — derive 32-byte AES key
        raw_bytes = raw_key.encode("utf-8")

        # Fixed salt derived from key itself (deterministic, no extra storage needed)
        salt = raw_bytes[:16].ljust(16, b"\x00")

        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100_000,
        )
        _aes_key = kdf.derive(raw_bytes)
        logger.info("AES-256-GCM encryption key derived successfully.")
        return _aes_key
    except Exception as e:
        logger.error(f"Failed to derive AES key: {e}")
        return None


def _get_fernet():
    """Legacy Fernet instance for reading old enc:: records."""
    global _fernet_instance
    if _fernet_instance is not None:
        return _fernet_instance
    raw_key = settings.ENCRYPTION_KEY.strip() if settings.ENCRYPTION_KEY else ""
    if not raw_key:
        return None
    try:
        _fernet_instance = Fernet(raw_key.encode("utf-8"))
        return _fernet_instance
    except Exception:
        return None


# Public API — same interface as before, drop-in replacement

def get_fernet():
    """Kept for backward compatibility — returns Fernet or None."""
    return _get_fernet()


class CryptoError(RuntimeError):
    """Raised when an encryption or decryption operation fails."""
    pass


def encrypt_str(value: Optional[str]) -> Optional[str]:
    """
    Encrypt using AES-256-GCM. Returns 'enc2::' prefixed base64 string.
    Fail-closed: raises CryptoError instead of storing plaintext if encryption key is missing or operation fails.
    """
    if value is None:
        return None

    key = _get_aes_key()
    if not key:
        raise CryptoError("Cannot encrypt data: ENCRYPTION_KEY is missing or invalid.")

    try:
        aesgcm = AESGCM(key)
        # 12-byte random nonce (NIST recommended for AES-GCM)
        nonce = os.urandom(12)
        ciphertext = aesgcm.encrypt(nonce, value.encode("utf-8"), None)
        payload = base64.urlsafe_b64encode(nonce + ciphertext).decode("utf-8")
        return f"{_PREFIX_V2}{payload}"
    except Exception as e:
        logger.critical(f"AES-256-GCM encryption failed: {e}")
        raise CryptoError(f"Encryption failed: {e}") from e


def decrypt_str(value: Optional[str]) -> Optional[str]:
    """
    Decrypt AES-256-GCM (enc2::) or legacy Fernet (enc::) strings.
    Fail-closed: raises CryptoError if an encrypted record cannot be decrypted.
    """
    if value is None:
        return None
    if not isinstance(value, str):
        return value

    # ── New format: AES-256-GCM ──────────────────────────────────
    if value.startswith(_PREFIX_V2):
        key = _get_aes_key()
        if not key:
            raise CryptoError("Cannot decrypt enc2:: data: ENCRYPTION_KEY is missing.")
        try:
            raw = base64.urlsafe_b64decode(value[len(_PREFIX_V2):])
            nonce = raw[:12]
            ciphertext = raw[12:]
            aesgcm = AESGCM(key)
            plaintext = aesgcm.decrypt(nonce, ciphertext, None)
            return plaintext.decode("utf-8")
        except Exception as e:
            logger.critical(f"AES-256-GCM decryption failed: {e}")
            raise CryptoError(f"Decryption failed: {e}") from e

    # ── Legacy format: Fernet (AES-128-CBC) ──────────────────────
    if value.startswith(_PREFIX_V1):
        fernet = _get_fernet()
        if not fernet:
            raise CryptoError("Cannot decrypt legacy enc:: data: Fernet key unavailable.")
        try:
            decrypted = fernet.decrypt(value[len(_PREFIX_V1):].encode("utf-8"))
            return decrypted.decode("utf-8")
        except Exception as e:
            logger.critical(f"Fernet decryption error: {e}")
            raise CryptoError(f"Legacy decryption failed: {e}") from e

    # ── Plaintext (no prefix) ────────────────────────────────────
    return value
