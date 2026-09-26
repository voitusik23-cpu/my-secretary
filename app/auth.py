import logging
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
    Verifies that the incoming request contains the configured SECRET_KEY.
    Supports:
    1. Header: 'X-Secret-Key: your_key'
    2. Header: 'Authorization: Bearer your_key'
    3. Query parameter: '?secret=your_key' or '?key=your_key'
    """
    configured_key = settings.SECRET_KEY.strip() if settings.SECRET_KEY else ""

    # If no SECRET_KEY is set in .env, permit requests in dev mode
    if not configured_key:
        return True

    provided_key: Optional[str] = None

    # 1. Check custom header
    if "x-secret-key" in request.headers:
        provided_key = request.headers.get("x-secret-key")

    # 2. Check Bearer token
    elif bearer_auth and bearer_auth.credentials:
        provided_key = bearer_auth.credentials

    # 3. Check query parameters
    elif "secret" in request.query_params:
        provided_key = request.query_params.get("secret")
    elif "key" in request.query_params:
        provided_key = request.query_params.get("key")

    if not provided_key or provided_key.strip() != configured_key:
        logger.warning(f"Unauthorized access attempt to {request.url.path}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный или отсутствующий Секретный Ключ (SECRET_KEY)",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return True
