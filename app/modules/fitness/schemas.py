from datetime import date as dt_date, datetime as dt_datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field


class FitnessSyncRequest(BaseModel):
    """
    Дані для синхронізації з Apple Health або ручного введення.
    """
    date: Optional[dt_date] = Field(default=None, description="Дата активності (за замовчуванням сьогодні)")
    steps: int = Field(default=0, ge=0, description="Кількість кроків")
    distance_km: float = Field(default=0.0, ge=0.0, description="Дистанція в кілометрах")
    flights_climbed: int = Field(default=0, ge=0, description="Пройдено поверхів (flights climbed)")
    calories: int = Field(default=0, ge=0, description="Активні калорії (ккал)")
    workout_type: Optional[str] = Field(default="general", description="Тип тренування: skiing | running | general")
    workout_details: Optional[Dict[str, Any]] = Field(default=None, description="Додаткові метрики (спуски, швидкість, висота)")


class FitnessLogResponse(BaseModel):
    id: int
    date: dt_date
    steps: int
    distance_km: float
    flights_climbed: int
    calories: int
    workout_type: str
    workout_details: Optional[Dict[str, Any]] = None
    created_at: dt_datetime

    class Config:
        from_attributes = True


class WeeklyStats(BaseModel):
    total_steps: int
    avg_steps_daily: int
    total_distance_km: float
    total_calories: int
    days_recorded: int


class FitnessSummaryResponse(BaseModel):
    today: Optional[FitnessLogResponse] = None
    weekly_stats: WeeklyStats
    ski_logs: List[FitnessLogResponse] = []
    recent_logs: List[FitnessLogResponse] = []
