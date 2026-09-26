from datetime import datetime, date
from sqlalchemy import Column, Integer, String, Float, DateTime, Date, JSON
from app.database import Base


class FitnessLog(Base):
    """
    Модель активності та синхронізації зі здоров'ям (Apple Health / Apple Watch).
    Зберігає кроки, дистанцію, підйоми (поверхи), калорії та тренування (біг, лижі тощо).
    """
    __tablename__ = "fitness_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    date = Column(Date, nullable=False, index=True)
    steps = Column(Integer, default=0, nullable=False)
    distance_km = Column(Float, default=0.0, nullable=False)
    flights_climbed = Column(Integer, default=0, nullable=False)
    calories = Column(Integer, default=0, nullable=False)
    
    # Тип тренування: skiing | running | cycling | general
    workout_type = Column(String(50), default="general", nullable=False)
    
    # Додаткові деталі (наприклад, лижні спуски: кількість спусків, макс. швидкість, перепад висоти)
    workout_details = Column(JSON, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
