from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime
from app.database import Base, EncryptedText


class AutoLog(Base):
    __tablename__ = "auto_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    event_type = Column(String(50), nullable=False, index=True)  # mileage, maintenance, insurance
    current_mileage = Column(Integer, nullable=True)
    next_service_mileage = Column(Integer, nullable=True)
    insurance_expiry_date = Column(DateTime, nullable=True)
    encrypted_notes = Column(EncryptedText, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
