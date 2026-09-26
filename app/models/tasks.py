from datetime import datetime
from typing import Optional
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from pydantic import BaseModel, Field, ConfigDict
from app.database import Base, EncryptedText, EncryptedString


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(EncryptedString(255), nullable=False)
    description = Column(EncryptedText, nullable=True)
    due_date = Column(DateTime, nullable=True, index=True)
    priority = Column(String(20), default="medium", index=True)  # "low", "medium", "high"
    is_completed = Column(Boolean, default=False, index=True)
    category = Column(EncryptedString(100), default="Личное", index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)


class TaskBase(BaseModel):
    title: str = Field(..., description="Название задачи")
    description: Optional[str] = Field(default=None, description="Описание или подпункты")
    due_date: Optional[datetime] = Field(default=None, description="Срок выполнения")
    priority: str = Field(default="medium", description="Приоритет: low, medium, high")
    is_completed: bool = Field(default=False, description="Статус выполнения")
    category: str = Field(default="Личное", description="Категория (Работа, Личное, Учёба и т.д.)")


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: Optional[str] = "medium"
    is_completed: Optional[bool] = False
    category: Optional[str] = "Личное"


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: Optional[str] = None
    is_completed: Optional[bool] = None
    category: Optional[str] = None


class TaskResponse(TaskBase):
    id: int
    created_at: datetime
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
