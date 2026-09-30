from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class VaultItemBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    category: str = Field("other", max_length=50)
    login: Optional[str] = None
    password: Optional[str] = None
    website_url: Optional[str] = None
    plan_type: Optional[str] = None  # "pro" | "free" | null
    two_factor_note: Optional[str] = None
    notes: Optional[str] = None
    is_favorite: bool = False


class VaultItemCreate(VaultItemBase):
    pass


class VaultItemUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    login: Optional[str] = None
    password: Optional[str] = None
    website_url: Optional[str] = None
    plan_type: Optional[str] = None
    two_factor_note: Optional[str] = None
    notes: Optional[str] = None
    is_favorite: Optional[bool] = None


class VaultItemResponse(VaultItemBase):
    id: int
    user_phone: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BulkSaveRequest(BaseModel):
    items: List[VaultItemCreate]


class AITextParseRequest(BaseModel):
    text: str = Field(..., min_length=1)


class ExportResponse(BaseModel):
    category: Optional[str] = None
    count: int
    text_content: str
