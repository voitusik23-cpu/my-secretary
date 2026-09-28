from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime
from app.database import Base, EncryptedString, EncryptedText


class Plant(Base):
    """
    Модель кімнатної рослини / квітки для контролю поливу та догляду.
    """
    __tablename__ = "plants"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(EncryptedString(150), nullable=False)
    room = Column(String(100), default="Кімната", index=True)
    watering_interval_days = Column(Integer, default=7, nullable=False)
    last_watered_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    spraying_interval_days = Column(Integer, nullable=True)
    last_sprayed_at = Column(DateTime, nullable=True)
    notes = Column(EncryptedText, nullable=True)
    user_id = Column(String(50), default="default", index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
