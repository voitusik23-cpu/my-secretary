from typing import List, Optional
from datetime import datetime as dt_datetime
from pydantic import BaseModel, Field


class ModuleCatalogItem(BaseModel):
    id: str = Field(..., description="Унікальний ідентифікатор модуля (напр. plants, finance)")
    title: str = Field(..., description="Назва модуля")
    description: str = Field(..., description="Короткий опис можливостей")
    category: str = Field(..., description="Категорія (Дім і побут, Фінанси, Здоров'я, тощо)")
    icon: str = Field("📦", description="Емодзі або іконка модуля")
    default_for_roles: List[str] = Field(default_factory=list, description="Ролі, для яких модуль увімкнено за замовчуванням")


class UserSettingsBase(BaseModel):
    enabled_modules: List[str] = Field(default_factory=list, description="Список увімкнених модулів")
    ai_persona: str = Field("warm_concierge", description="business, warm_concierge, tutor_buddy, friendly")
    currency: str = Field("UAH", description="Основна валюта")
    custom_system_prompt: Optional[str] = Field(None, description="Додаткові побажання до стилю відповідей ІІ")


class UserSettingsUpdate(BaseModel):
    enabled_modules: Optional[List[str]] = None
    ai_persona: Optional[str] = None
    currency: Optional[str] = None
    custom_system_prompt: Optional[str] = None


class UserSettingsResponse(UserSettingsBase):
    id: int
    user_id: int
    updated_at: dt_datetime

    class Config:
        from_attributes = True


class UserBase(BaseModel):
    username: str = Field(..., min_length=2, max_length=50)
    display_name: str = Field(..., min_length=2, max_length=100)
    role: str = Field("family", description="admin, family, child, guest")
    telegram_id: Optional[str] = None
    is_active: bool = True


class UserCreate(UserBase):
    initial_modules: Optional[List[str]] = None


class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    role: Optional[str] = None
    telegram_id: Optional[str] = None
    is_active: Optional[bool] = None


class UserResponse(UserBase):
    id: int
    created_at: dt_datetime
    settings: Optional[UserSettingsResponse] = None

    class Config:
        from_attributes = True
