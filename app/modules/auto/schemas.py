from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class AutoLogCreate(BaseModel):
    event_type: str = Field(..., description="Тип події: mileage (пробіг), maintenance (ТО / сервіс), insurance (страховка)")
    current_mileage: Optional[int] = Field(default=None, description="Поточний пробіг у км")
    next_service_mileage: Optional[int] = Field(default=None, description="Пробіг наступного ТО / заміни мастила")
    insurance_expiry_date: Optional[datetime] = Field(default=None, description="Дата закінчення страховки")
    notes: Optional[str] = Field(default=None, description="Опис робіт або примітки")


class AutoLogResponse(BaseModel):
    id: int
    event_type: str
    current_mileage: Optional[int] = None
    next_service_mileage: Optional[int] = None
    insurance_expiry_date: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AutoStatusResponse(BaseModel):
    current_mileage: Optional[int] = None
    next_service_mileage: Optional[int] = None
    km_until_service: Optional[int] = None
    service_status_message: str
    insurance_expiry_date: Optional[datetime] = None
    insurance_days_left: Optional[int] = None
    insurance_status_message: str
    recent_logs: List[AutoLogResponse]
