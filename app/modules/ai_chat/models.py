from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime
from app.database import Base


class AIChatMessage(Base):
    """
    Історія повідомлень у персональному чаті з AI.
    """
    __tablename__ = "ai_chat_messages"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_phone = Column(String(50), nullable=True, index=True, default="admin")
    role = Column(String(20), nullable=False)  # "user" або "assistant"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
