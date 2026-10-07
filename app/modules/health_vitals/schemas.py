from datetime import datetime, date as dt_date
from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field, ConfigDict


class BloodPressureCreateRequest(BaseModel):
    systolic: int = Field(..., ge=50, le=260, description="Систолічний тиск (верхній, мм рт. ст.)")
    diastolic: int = Field(..., ge=30, le=180, description="Діастолічний тиск (нижній, мм рт. ст.)")
    pulse: Optional[int] = Field(None, ge=30, le=220, description="Пульс (уд./хв)")
    recorded_at: Optional[datetime] = Field(None, description="Час вимірювання (за замовчуванням зараз)")
    time_of_day: Optional[str] = Field(None, description="Час доби: morning, afternoon, evening, night")
    medications_taken: Optional[Union[str, bool]] = Field(None, description="Прийняті ліки або дозування")
    notes: Optional[str] = Field(None, description="Замітки способу життя: кава, алкоголь, стрес, спорт")


class BloodPressureItemResponse(BaseModel):
    id: str
    recorded_at: datetime
    systolic: int
    diastolic: int
    pulse: Optional[int] = None
    time_of_day: str
    medications_taken: Optional[str] = None
    notes: Optional[str] = None
    classification: str
    color: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LifestyleCorrelation(BaseModel):
    factor: str
    count: int
    avg_systolic: float
    baseline_systolic: float
    delta: float
    impact: str


class BloodPressureAnalyticsResponse(BaseModel):
    total_readings: int
    avg_systolic: float
    avg_diastolic: float
    avg_pulse: Optional[float] = None
    min_systolic: Optional[int] = None
    max_systolic: Optional[int] = None
    min_diastolic: Optional[int] = None
    max_diastolic: Optional[int] = None
    morning_avg: Optional[Dict[str, float]] = None
    evening_avg: Optional[Dict[str, float]] = None
    normal_percentage: float = 0.0
    elevated_percentage: float = 0.0
    lifestyle_correlations: List[LifestyleCorrelation] = []
    latest_reading: Optional[BloodPressureItemResponse] = None
