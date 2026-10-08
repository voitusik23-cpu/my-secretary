"""
Media & Stream Token Service
Generates and verifies short-lived HMAC-signed tokens for audio streaming and CSV exports.
Eliminates passing the master SECRET_KEY in URLs.
"""
import time
import hmac
import hashlib
import base64
from typing import Optional, Dict, Any
from fastapi import HTTPException, status
from app.config import settings

TOKEN_TTL_SECONDS = 300  # 5 minutes validity


def generate_media_token(action: str, resource_id: str, user: str = "admin", ttl_seconds: int = TOKEN_TTL_SECONDS) -> str:
    """
    Generates an HMAC-SHA256 signed token:
    payload = f"{action}:{resource_id}:{user}:{exp_timestamp}"
    signature = HMAC_SHA256(secret_key, payload)
    token = base64url(payload + "." + signature)
    """
    secret = settings.SECRET_KEY.strip().encode("utf-8")
    exp = int(time.time()) + ttl_seconds
    payload = f"{action}:{resource_id}:{user}:{exp}"
    sig = hmac.new(secret, payload.encode("utf-8"), hashlib.sha256).hexdigest()
    raw = f"{payload}.{sig}"
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("utf-8")


def verify_media_token(token: str, expected_action: str, expected_resource_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Verifies token validity, expiration, and signature.
    Returns payload dictionary: {"action": ..., "resource_id": ..., "user": ..., "exp": ...}
    Raises HTTPException(401) on invalid or expired token.
    """
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Відсутній токен доступу до медіа")

    try:
        raw = base64.urlsafe_b64decode(token.encode("utf-8")).decode("utf-8")
        parts = raw.split(".")
        if len(parts) != 2:
            raise ValueError("Malformed token format")

        payload, sig = parts[0], parts[1]
        secret = settings.SECRET_KEY.strip().encode("utf-8")
        expected_sig = hmac.new(secret, payload.encode("utf-8"), hashlib.sha256).hexdigest()

        if not hmac.compare_digest(sig, expected_sig):
            raise ValueError("Invalid signature")

        p_parts = payload.split(":")
        if len(p_parts) != 4:
            raise ValueError("Malformed payload format")

        action, resource_id, user, exp_str = p_parts[0], p_parts[1], p_parts[2], p_parts[3]
        exp = int(exp_str)

        if time.time() > exp:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Термін дії токена стрімінгу вичерпано")

        if action != expected_action:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Невідповідний тип медіа токена")

        if expected_resource_id is not None and str(resource_id) != str(expected_resource_id):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Токен видано для іншого ресурсу")

        return {
            "action": action,
            "resource_id": resource_id,
            "user": user,
            "exp": exp,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недійсний токен медіа")
