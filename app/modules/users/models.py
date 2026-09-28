from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class User(Base):
    """
    Таблиця користувачів системи Секретар AI.
    Підтримує ролі: admin (власник), family (члени сім'ї), child (діти), guest (друзі).
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    display_name = Column(String(100), nullable=False)
    role = Column(String(20), default="family", nullable=False)  # admin, family, child, guest
    telegram_id = Column(String(50), unique=True, index=True, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    settings = relationship("UserSettings", back_populates="user", uselist=False, cascade="all, delete-orphan")


class UserSettings(Base):
    """
    Персональні налаштування користувача:
    - активні модулі (JSON-список увімкнених блоків)
    - стиль / персона ІІ (business, warm_concierge, tutor_buddy, friendly)
    - валюта за замовчуванням
    - персональний системний промпт
    """
    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    
    # JSON array of enabled module identifiers (e.g. ["finance", "shopping", "plants"])
    enabled_modules_json = Column(Text, default="[]", nullable=False)
    
    ai_persona = Column(String(50), default="warm_concierge", nullable=False)
    currency = Column(String(10), default="UAH", nullable=False)
    custom_system_prompt = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="settings")
