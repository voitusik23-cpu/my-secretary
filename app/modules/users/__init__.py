from app.modules.users.models import User, UserSettings
from app.modules.users.router import users_router
from app.modules.users.service import (
    MODULE_CATALOG,
    get_or_create_default_admin,
    is_module_active_for_user,
    get_default_modules_for_role,
)

__all__ = [
    "User",
    "UserSettings",
    "users_router",
    "MODULE_CATALOG",
    "get_or_create_default_admin",
    "is_module_active_for_user",
    "get_default_modules_for_role",
]
