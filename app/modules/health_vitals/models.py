import uuid
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime
from app.database import Base, EncryptedText


class BloodPressureLog(Base):
    """
    Модель щоденника артеріального тиску та пульсу (Blood Pressure & Vitals).
    Зберігає показники тиску (систолічний, діастолічний), пульс, час доби,
    прийняті медикаменти та зашифровані замітки про спосіб життя.
    """
    __tablename__ = "blood_pressure_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    user_id = Column(String(36), nullable=True, default="default")
    recorded_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    systolic = Column(Integer, nullable=False)
    diastolic = Column(Integer, nullable=False)
    pulse = Column(Integer, nullable=True)
    time_of_day = Column(String(20), default="morning", nullable=False)
    medications_taken = Column(String(255), nullable=True)
    encrypted_notes = Column(EncryptedText, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
