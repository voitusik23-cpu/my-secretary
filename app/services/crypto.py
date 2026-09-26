import logging
from typing import Optional
from cryptography.fernet import Fernet, InvalidToken
from app.config import settings

logger = logging.getLogger("my_secretary.crypto")

_fernet_instance: Optional[Fernet] = None


def get_fernet() -> Optional[Fernet]:
    """
    Returns an initialized Fernet instance if ENCRYPTION_KEY is provided and valid.
    """
    global _fernet_instance
    if _fernet_instance is not None:
        return _fernet_instance

    key = settings.ENCRYPTION_KEY.strip() if settings.ENCRYPTION_KEY else ""
    if not key:
        logger.warning(
            "ENCRYPTION_KEY is not set. Database records will be stored in plaintext. "
            "To enable encryption, generate a key with: "
            "python3 -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'"
        )
        return None

    try:
        _fernet_instance = Fernet(key.encode("utf-8"))
        logger.info("Fernet database encryption active.")
        return _fernet_instance
    except Exception as e:
        logger.error(f"Invalid ENCRYPTION_KEY provided: {e}. Falling back to plaintext.")
        return None


def encrypt_str(value: Optional[str]) -> Optional[str]:
    """
    Encrypts a string value using Fernet. If no key is set or value is None, returns original.
    """
    if value is None:
        return None
    fernet = get_fernet()
    if not fernet:
        return value

    try:
        encrypted_bytes = fernet.encrypt(value.encode("utf-8"))
        return f"enc::{encrypted_bytes.decode('utf-8')}"
    except Exception as e:
        logger.error(f"Encryption failed: {e}")
        return value


def decrypt_str(value: Optional[str]) -> Optional[str]:
    """
    Decrypts a string value using Fernet. If value does not have the 'enc::' prefix or
    decryption fails, returns original string.
    """
    if value is None:
        return None
    if not isinstance(value, str) or not value.startswith("enc::"):
        return value

    fernet = get_fernet()
    if not fernet:
        # If encrypted but key missing, return the raw value
        return value

    raw_token = value[5:]  # Strip 'enc::'
    try:
        decrypted_bytes = fernet.decrypt(raw_token.encode("utf-8"))
        return decrypted_bytes.decode("utf-8")
    except InvalidToken:
        logger.warning("Failed to decrypt string: InvalidToken (wrong key?). Returning raw value.")
        return value
    except Exception as e:
        logger.error(f"Decryption error: {e}")
        return value
