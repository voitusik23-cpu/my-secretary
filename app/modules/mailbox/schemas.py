from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class MailAccountCreate(BaseModel):
    email: str = Field(..., description="Адреса електронної пошти")
    name: Optional[str] = Field(None, description="Зручна назва (наприклад, 'Робоча Ukr.net')")
    imap_server: Optional[str] = Field(None, description="IMAP сервер (автовизначається за доменом)")
    imap_port: Optional[int] = Field(993, description="Порт IMAP (за замовчуванням 993)")
    use_ssl: Optional[bool] = Field(True, description="Використовувати SSL/TLS")
    password: str = Field(..., description="Пароль додатка або IMAP-пароль")


class MailAccountResponse(BaseModel):
    id: int
    email: str
    name: str
    imap_server: str
    imap_port: int
    is_active: bool
    last_checked_at: Optional[datetime]
    created_at: datetime
    messages_count: int = 0
    spam_count: int = 0
    important_count: int = 0


class MailMessageResponse(BaseModel):
    id: int
    account_id: int
    account_name: Optional[str] = None
    account_email: Optional[str] = None
    message_uid: str
    subject: str
    sender: str
    sender_email: Optional[str] = None
    date: Optional[datetime] = None
    snippet: str
    category: str  # "spam", "important", "other"
    is_spam: bool
    spam_reason: Optional[str] = None
    is_read: bool


class MailboxCheckResponse(BaseModel):
    status: str
    checked_accounts: int
    new_messages: int
    spam_detected: int
    important_detected: int
    summary: str


class CleanSpamRequest(BaseModel):
    account_id: Optional[int] = Field(None, description="ID конкретної скриньки, або null для всіх")
    message_ids: Optional[List[int]] = Field(None, description="Список ID листів або null для видалення всього знайденого спаму")


class CleanSpamResponse(BaseModel):
    status: str
    deleted_count: int
    message: str


class TestConnectionRequest(BaseModel):
    email: str
    password: str
    imap_server: Optional[str] = None
    imap_port: Optional[int] = 993
    use_ssl: Optional[bool] = True
