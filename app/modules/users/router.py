import json
import re
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import verify_secret_key
from app.modules.users.models import User, UserSettings
from app.modules.users.schemas import (
    UserCreate,
    UserUpdate,
    UserResponse,
    UserSettingsUpdate,
    UserSettingsResponse,
    ModuleCatalogItem,
)
from app.modules.users.service import (
    MODULE_CATALOG,
    get_default_modules_for_role,
    get_or_create_default_admin,
)

users_router = APIRouter(
    prefix="/users",
    tags=["Users & Profiles"],
    dependencies=[Depends(verify_secret_key)],
)



@users_router.get("/catalog/modules", response_model=List[ModuleCatalogItem])
def get_module_catalog():
    """Повертає повний каталог доступних модулів для налаштування профілів."""
    return MODULE_CATALOG


@users_router.get("", response_model=List[UserResponse])
def list_users(db: Session = Depends(get_db)):
    """Отримати список усіх користувачів системи."""
    get_or_create_default_admin(db)
    users = db.query(User).all()
    results = []
    for u in users:
        settings_dto = None
        if u.settings:
            try:
                mods = json.loads(u.settings.enabled_modules_json or "[]")
            except Exception:
                mods = []
            settings_dto = UserSettingsResponse(
                id=u.settings.id,
                user_id=u.settings.user_id,
                enabled_modules=mods,
                ai_persona=u.settings.ai_persona,
                currency=u.settings.currency,
                custom_system_prompt=u.settings.custom_system_prompt,
                updated_at=u.settings.updated_at,
            )
        results.append(
            UserResponse(
                id=u.id,
                username=u.username,
                display_name=u.display_name,
                role=u.role,
                telegram_id=u.telegram_id,
                is_active=u.is_active,
                created_at=u.created_at,
                settings=settings_dto,
            )
        )
    return results


@users_router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, db: Session = Depends(get_db)):
    """Створити нового користувача з індивідуальним набором модулів."""
    existing = db.query(User).filter(User.username == payload.username.strip()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Користувач з таким username вже існує")

    user = User(
        username=payload.username.strip(),
        display_name=payload.display_name.strip(),
        role=payload.role,
        telegram_id=payload.telegram_id.strip() if payload.telegram_id else None,
        is_active=payload.is_active,
    )
    db.add(user)
    db.flush()

    # Determine enabled modules
    modules = payload.initial_modules
    if modules is None:
        modules = get_default_modules_for_role(payload.role)

    settings = UserSettings(
        user_id=user.id,
        enabled_modules_json=json.dumps(modules),
        ai_persona="tutor_buddy" if payload.role == "child" else "warm_concierge",
        currency="UAH",
    )
    db.add(settings)
    db.commit()
    db.refresh(user)

    settings_dto = UserSettingsResponse(
        id=settings.id,
        user_id=settings.user_id,
        enabled_modules=modules,
        ai_persona=settings.ai_persona,
        currency=settings.currency,
        custom_system_prompt=settings.custom_system_prompt,
        updated_at=settings.updated_at,
    )
    return UserResponse(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        role=user.role,
        telegram_id=user.telegram_id,
        is_active=user.is_active,
        created_at=user.created_at,
        settings=settings_dto,
    )


@users_router.put("/{user_id}/settings", response_model=UserSettingsResponse)
def update_user_settings(user_id: int, payload: UserSettingsUpdate, db: Session = Depends(get_db)):
    """Увімкнути/вимкнути окремі модулі або змінити налаштування конкретного користувача."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Користувача не знайдено")

    settings = user.settings
    if not settings:
        settings = UserSettings(user_id=user.id, enabled_modules_json="[]")
        db.add(settings)

    if payload.enabled_modules is not None:
        settings.enabled_modules_json = json.dumps(payload.enabled_modules)
    if payload.ai_persona is not None:
        settings.ai_persona = payload.ai_persona
    if payload.currency is not None:
        settings.currency = payload.currency
    if payload.custom_system_prompt is not None:
        settings.custom_system_prompt = payload.custom_system_prompt

    db.commit()
    db.refresh(settings)

    try:
        mods = json.loads(settings.enabled_modules_json or "[]")
    except Exception:
        mods = []

    return UserSettingsResponse(
        id=settings.id,
        user_id=settings.user_id,
        enabled_modules=mods,
        ai_persona=settings.ai_persona,
        currency=settings.currency,
        custom_system_prompt=settings.custom_system_prompt,
        updated_at=settings.updated_at,
    )


@users_router.get("/me/profile")
def get_current_user_profile(request: Request, db: Session = Depends(get_db)):
    """Отримати профіль та активні модулі поточного користувача."""
    raw_user = request.headers.get("x-secretary-user") or request.query_params.get("user") or "admin"
    clean_user = re.sub(r"[^a-zA-Z0-9_-]", "", raw_user.strip().lower())
    if not clean_user:
        clean_user = "admin"

    if clean_user in ("admin", "owner", "default"):
        user = get_or_create_default_admin(db)
    else:
        user = db.query(User).filter(User.username == clean_user).first()
        if not user:
            user = User(
                username=clean_user,
                display_name=clean_user.capitalize(),
                role="guest",
                is_active=True,
            )
            db.add(user)
            db.flush()
            default_mods = ["feed", "music", "movies", "tasks", "shopping"]
            settings_obj = UserSettings(
                user_id=user.id,
                enabled_modules_json=json.dumps(default_mods),
                ai_persona="friendly",
                currency="UAH",
            )
            db.add(settings_obj)
            db.commit()
            db.refresh(user)

    enabled_mods = []
    if user.settings and user.settings.enabled_modules_json:
        try:
            enabled_mods = json.loads(user.settings.enabled_modules_json)
        except Exception:
            enabled_mods = []

    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
        "enabled_modules": enabled_mods,
        "currency": user.settings.currency if user.settings else "UAH",
        "ai_persona": user.settings.ai_persona if user.settings else "warm_concierge",
    }


@users_router.put("/me/modules")
def update_current_user_modules(payload: dict, request: Request, db: Session = Depends(get_db)):
    """Оновити список активних модулів поточного користувача."""
    raw_user = request.headers.get("x-secretary-user") or request.query_params.get("user") or "admin"
    clean_user = re.sub(r"[^a-zA-Z0-9_-]", "", raw_user.strip().lower())
    if not clean_user:
        clean_user = "admin"

    if clean_user in ("admin", "owner", "default"):
        user = get_or_create_default_admin(db)
    else:
        user = db.query(User).filter(User.username == clean_user).first()
        if not user:
            user = User(
                username=clean_user,
                display_name=clean_user.capitalize(),
                role="guest",
                is_active=True,
            )
            db.add(user)
            db.flush()

    if not user.settings:
        user.settings = UserSettings(user_id=user.id, enabled_modules_json="[]")
        db.add(user.settings)

    new_mods = payload.get("enabled_modules", [])
    user.settings.enabled_modules_json = json.dumps(new_mods)
    db.commit()

    return {"status": "ok", "enabled_modules": new_mods}


@users_router.post("/invite")
def create_invite_link(payload: dict, request: Request):
    """
    Генератор швидких персональних посилань для друзів/сім'ї.
    Створює посилання без встановлення додаткових додатків.
    """
    username = payload.get("username", "").strip()
    clean_user = re.sub(r"[^a-zA-Z0-9_-]", "", username.lower())
    if not clean_user:
        raise HTTPException(status_code=400, detail="Вкажіть коректне ім'я користувача (латиницею)")

    from app.config import settings
    base_url = str(request.base_url).rstrip("/")
    # Forwarded host check for Cloudflare / Reverse Proxy
    forwarded_host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    forwarded_proto = request.headers.get("x-forwarded-proto", "https")
    if forwarded_host:
        base_url = f"{forwarded_proto}://{forwarded_host}"

    from app.services.media_token import generate_media_token
    # Generate an isolated user token with 1 year validity (never leak master SECRET_KEY)
    user_token = generate_media_token(action="user_session", resource_id=clean_user, user=clean_user, ttl_seconds=31536000)
    invite_url = f"{base_url}/?user={clean_user}&token={user_token}"

    return {
        "username": clean_user,
        "invite_url": invite_url,
        "instructions": "Надішліть це персональне посилання другу. Він відкриє його у Safari/Chrome і матиме доступ виключно до свого ізольованого кабінету."
    }

