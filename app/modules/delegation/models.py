from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from app.database import Base


class FamilyContact(Base):
    """
    Модель контакту члена сім'ї для делегування списків та завдань через Telegram.
    """
    __tablename__ = "family_contacts"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    relationship = Column(String(50), default="other", nullable=False)  # wife, daughter, son, husband, mother, other
    telegram_chat_id = Column(String(100), nullable=True, index=True)
    phone = Column(String(50), nullable=True)
    can_add_items = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
