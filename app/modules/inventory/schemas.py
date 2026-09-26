from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class InventoryItemBase(BaseModel):
    item_name: str = Field(..., description="Назва речі / предмета")
    location: str = Field(..., description="Місцезнаходження речі")
    tags: Optional[str] = Field(default=None, description="Теги (наприклад: інструменти, одяг, документи)")
    dimensions_or_spec: Optional[str] = Field(default=None, description="Розміри або характеристики")
    user_id: Optional[str] = Field(default="default", description="ID користувача")


class InventoryItemCreate(InventoryItemBase):
    pass


class InventoryItemUpdate(BaseModel):
    item_name: Optional[str] = None
    location: Optional[str] = None
    tags: Optional[str] = None
    dimensions_or_spec: Optional[str] = None


class InventoryItemResponse(BaseModel):
    id: int
    user_id: str
    item_name: str
    location: str
    tags: Optional[str] = None
    dimensions_or_spec: Optional[str] = None
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class InventoryQueryResponse(BaseModel):
    found: bool
    query: str
    message: str
    items: List[InventoryItemResponse]
