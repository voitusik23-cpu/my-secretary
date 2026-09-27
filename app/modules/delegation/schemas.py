from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class FamilyContactBase(BaseModel):
    name: str = Field(..., description="Ім'я члена сім'ї")
    relationship: str = Field(default="other", description="Ступінь спорідненості: wife, daughter, son, husband, mother, father, other")
    telegram_chat_id: Optional[str] = Field(default=None, description="Telegram Chat ID або username")
    phone: Optional[str] = Field(default=None, description="Номер телефону")
    can_add_items: bool = Field(default=True, description="Дозвіл поповнювати списки користувача")


class FamilyContactCreate(FamilyContactBase):
    pass


class FamilyContactUpdate(BaseModel):
    name: Optional[str] = None
    relationship: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    phone: Optional[str] = None
    can_add_items: Optional[bool] = None


class FamilyContactResponse(FamilyContactBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DelegationSendRequest(BaseModel):
    contact_id: Optional[int] = Field(default=None, description="ID контакту в системі")
    relationship: Optional[str] = Field(default=None, description="Пошук за спорідненістю (наприклад, 'wife' або 'дочка')")
    domain: str = Field(default="shopping", description="Домен: shopping (список покупок) або tasks (список завдань)")
    custom_message: Optional[str] = Field(default=None, description="Додатковий текст від користувача")


class DelegationSendResponse(BaseModel):
    status: str
    contact_name: str
    message_sent: str
    telegram_message_id: Optional[int] = None
    simulated: bool = False
