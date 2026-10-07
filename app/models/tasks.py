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
    remind_at = Column(DateTime, nullable=True, index=True)
    reminder_sent = Column(Boolean, default=False, nullable=False)
    priority = Column(String(20), default="medium", index=True)  # "low", "medium", "high"
    is_completed = Column(Boolean, default=False, index=True)
    category = Column(EncryptedString(100), default="Личное", index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)


class TaskBase(BaseModel):
    title: str = Field(..., description="Назва завдання")
    description: Optional[str] = Field(default=None)
    due_date: Optional[datetime] = Field(default=None)
    remind_at: Optional[datetime] = Field(default=None)
    priority: str = Field(default="medium")
    is_completed: bool = Field(default=False)
    category: str = Field(default="Особисте")


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    remind_at: Optional[datetime] = None
    priority: Optional[str] = "medium"
    is_completed: Optional[bool] = False
    category: Optional[str] = "Особисте"


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    remind_at: Optional[datetime] = None
    priority: Optional[str] = None
    is_completed: Optional[bool] = None
    category: Optional[str] = None


class TaskResponse(TaskBase):
    id: int
    created_at: datetime
    completed_at: Optional[datetime] = None
    reminder_sent: bool = False

    model_config = ConfigDict(from_attributes=True)
