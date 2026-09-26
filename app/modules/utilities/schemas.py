from datetime import datetime
from typing import Optional, List, Dict
from pydantic import BaseModel, Field, ConfigDict


class UtilityReadingCreate(BaseModel):
    meter_type: str = Field(..., description="Тип лічильника: electricity (світло), water (вода), gas (газ)")
    reading_value: float = Field(..., ge=0, description="Поточні показники лічильника")
    recorded_at: Optional[datetime] = Field(default_factory=datetime.utcnow, description="Дата і час фіксації показників")


class UtilityReadingResponse(BaseModel):
    id: int
    meter_type: str
    reading_value: float
    previous_value: Optional[float] = None
    delta: Optional[float] = None
    recorded_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UtilitySummaryItem(BaseModel):
    meter_type: str
    label: str
    unit: str
    latest_value: Optional[float] = None
    previous_value: Optional[float] = None
    delta: Optional[float] = None
    last_recorded_at: Optional[datetime] = None


class UtilitySummaryResponse(BaseModel):
    meters: Dict[str, UtilitySummaryItem]
    recent_readings: List[UtilityReadingResponse]
