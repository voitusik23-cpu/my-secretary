import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
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
    prefix="/api/v1/users",
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
