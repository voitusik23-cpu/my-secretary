from datetime import datetime
from typing import Optional, List
from sqlalchemy import Column, Integer, Boolean, DateTime
from pydantic import BaseModel, Field, ConfigDict
from app.database import Base, EncryptedText, EncryptedString


class ShoppingItem(Base):
    __tablename__ = "shopping_items"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    item = Column(EncryptedString(255), nullable=False)
    category = Column(EncryptedString(100), default="Продукты", index=True)
    quantity = Column(EncryptedString(50), default="1 шт")
    is_purchased = Column(Boolean, default=False, index=True)
    notes = Column(EncryptedText, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ShoppingBase(BaseModel):
    item: str = Field(..., description="Название товара или продукта")
    category: str = Field(default="Продукты", description="Категория (Продукты, Аптека, Дом и т.д.)")
    quantity: str = Field(default="1 шт", description="Количество (например: 2 шт, 1 кг, пачка)")
    is_purchased: bool = Field(default=False, description="Статус покупки")
    notes: Optional[str] = Field(default=None, description="Дополнительные заметки")


class ShoppingCreate(BaseModel):
    item: str
    category: Optional[str] = "Продукты"
    quantity: Optional[str] = "1 шт"
    is_purchased: Optional[bool] = False
    notes: Optional[str] = None


class ShoppingUpdate(BaseModel):
    item: Optional[str] = None
    category: Optional[str] = None
    quantity: Optional[str] = None
    is_purchased: Optional[bool] = None
    notes: Optional[str] = None


class ShoppingResponse(ShoppingBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ShoppingBatchCreate(BaseModel):
    items: List[ShoppingCreate]
