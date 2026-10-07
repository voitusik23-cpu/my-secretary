import hmac
import logging
import re
from typing import Optional, Any
from fastapi import HTTPException, Security, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import settings

logger = logging.getLogger("my_secretary.auth")

security_bearer = HTTPBearer(auto_error=False)


def get_provided_key(request: Request, bearer_auth: Any = None) -> Optional[str]:
    """
    Extracts the secret key/token strictly from headers.
    URL query parameters (?key=, ?secret=) are deliberately disallowed to prevent token leakage in server/proxy logs.
    """
    if "x-secret-key" in request.headers:
        return request.headers.get("x-secret-key")
    if hasattr(bearer_auth, "credentials") and bearer_auth.credentials:
        return bearer_auth.credentials
    # Fallback for authorization header
    auth_header = request.headers.get("authorization")
    if auth_header:
        parts = auth_header.split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            return parts[1]
        elif len(parts) == 1:
            return parts[0]
    return None



async def verify_secret_key(
    request: Request,
    bearer_auth: Optional[HTTPAuthorizationCredentials] = Security(security_bearer)
) -> bool:
    """
    Secure authentication verifier:
    1. Uses timing-safe string comparison (hmac.compare_digest) against timing attacks.
    2. Prohibits reading secrets from URL query parameters.
    3. Strictly enforces authentication on all sensitive endpoints.
    """
    configured_key = settings.SECRET_KEY.strip() if settings.SECRET_KEY else ""
    if not configured_key:
        logger.critical("SECURITY ALERT: SECRET_KEY is not configured! Denying all access.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server security misconfiguration: SECRET_KEY is not set."
        )

    provided_key = get_provided_key(request, bearer_auth)
    if not provided_key:
        logger.warning(f"Unauthorized access attempt without credentials to {request.url.path}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Отсутствует ключ авторизации (X-Secret-Key или Bearer Token)",
            headers={"WWW-Authenticate": "Bearer"},
        )

    provided_clean = provided_key.strip()

    # 1. Check if it matches master admin key
    if hmac.compare_digest(provided_clean, configured_key):
        return True

    # 2. Check if it is a signed user session token
    user_header = request.headers.get("x-secretary-user") or request.query_params.get("user")
    clean_user = re.sub(r"[^a-zA-Z0-9_-]", "", user_header.strip().lower()) if user_header else ""

    if clean_user and clean_user not in ("admin", "owner", "default"):
        from app.services.media_token import verify_media_token
        try:
            token_data = verify_media_token(provided_clean, expected_action="user_session", expected_resource_id=clean_user)
            if token_data.get("user") == clean_user:
                return True
        except Exception:
            pass

    logger.warning(f"Invalid credentials supplied to {request.url.path}")
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Неверный ключ или токен авторизации",
        headers={"WWW-Authenticate": "Bearer"},
    )
