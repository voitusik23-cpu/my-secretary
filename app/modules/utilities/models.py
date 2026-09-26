from datetime import datetime
from sqlalchemy import Column, Integer, Float, String, DateTime
from app.database import Base


class UtilityReading(Base):
    __tablename__ = "utility_readings"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    meter_type = Column(String(50), nullable=False, index=True)  # electricity, water, gas
    reading_value = Column(Float, nullable=False)
    previous_value = Column(Float, nullable=True)
    delta = Column(Float, nullable=True)  # reading_value - previous_value
    recorded_at = Column(DateTime, default=datetime.utcnow, index=True)
