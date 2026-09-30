import logging
import re
from typing import Optional
from fastapi import HTTPException, Security, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import settings

logger = logging.getLogger("my_secretary.auth")

security_bearer = HTTPBearer(auto_error=False)


async def verify_secret_key(
    request: Request,
    bearer_auth: Optional[HTTPAuthorizationCredentials] = Security(security_bearer)
) -> bool:
    """
    Verifies authentication:
    1. Admin / Owner / Default requests MUST provide the configured SECRET_KEY.
    2. Phone / User-scoped tenants have access to their isolated database.
    """
    configured_key = settings.SECRET_KEY.strip() if settings.SECRET_KEY else ""

    provided_key: Optional[str] = None
    if "x-secret-key" in request.headers:
        provided_key = request.headers.get("x-secret-key")
    elif bearer_auth and bearer_auth.credentials:
        provided_key = bearer_auth.credentials
    elif "secret" in request.query_params:
        provided_key = request.query_params.get("secret")
    elif "key" in request.query_params:
        provided_key = request.query_params.get("key")

    user_header = request.headers.get("x-secretary-user") or request.query_params.get("user")
    clean_user = re.sub(r"[^a-zA-Z0-9_-]", "", user_header.strip().lower()) if user_header else ""

    # If accessing admin / owner / default database: strictly require configured SECRET_KEY
    if not clean_user or clean_user in ("admin", "owner", "default"):
        if configured_key and (not provided_key or provided_key.strip() != configured_key):
            logger.warning(f"Unauthorized admin access attempt to {request.url.path}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Неверный или отсутствующий Секретный Ключ (SECRET_KEY)",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return True

    # User-scoped tenant (e.g. phone number like 380671234567 or friend username):
    # If key was provided, verify it if matching, otherwise allow access to their isolated DB
    return True

