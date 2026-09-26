from datetime import datetime
from typing import Optional
from sqlalchemy import Column, Integer, String, DateTime
from pydantic import BaseModel, Field, ConfigDict
from app.database import Base, EncryptedText, EncryptedString


class MediaNote(Base):
    __tablename__ = "media_notes"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(EncryptedString(255), nullable=False)
    type = Column(String(50), default="note", index=True)  # movie, series, book, podcast, article, note
    url = Column(String(500), nullable=True)
    author_creator = Column(EncryptedString(255), nullable=True)
    comment = Column(EncryptedText, nullable=True)
    status = Column(String(50), default="to_review", index=True)  # to_read, to_watch, completed, in_progress
    rating = Column(Integer, nullable=True)  # 1-10
    created_at = Column(DateTime, default=datetime.utcnow)


class MediaNoteBase(BaseModel):
    title: str = Field(..., description="Название фильма, книги, подкаста или заметки")
    type: str = Field(default="note", description="Тип: movie, series, book, podcast, article, note")
    url: Optional[str] = Field(default=None, description="Ссылка на материал")
    author_creator: Optional[str] = Field(default=None, description="Автор, режиссер или ведущий")
    comment: Optional[str] = Field(default=None, description="Впечатления, краткое содержание или заметка")
    status: str = Field(default="to_review", description="Статус: to_watch, to_read, completed, in_progress")
    rating: Optional[int] = Field(default=None, ge=1, le=10, description="Оценка от 1 до 10")


class MediaNoteCreate(BaseModel):
    title: str
    type: Optional[str] = "note"
    url: Optional[str] = None
    author_creator: Optional[str] = None
    comment: Optional[str] = None
    status: Optional[str] = "to_review"
    rating: Optional[int] = None


class MediaNoteUpdate(BaseModel):
    title: Optional[str] = None
    type: Optional[str] = None
    url: Optional[str] = None
    author_creator: Optional[str] = None
    comment: Optional[str] = None
    status: Optional[str] = None
    rating: Optional[int] = None


class MediaNoteResponse(MediaNoteBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
