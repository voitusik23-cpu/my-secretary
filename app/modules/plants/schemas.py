from typing import Optional
from datetime import datetime as dt_datetime
from pydantic import BaseModel, Field


class PlantBase(BaseModel):
    name: str = Field(..., description="Назва квітки/рослини")
    room: Optional[str] = Field("Кімната", description="Розташування: спальня, кухня, балкон")
    watering_interval_days: int = Field(7, ge=1, le=90, description="Інтервал поливу в днях")
    spraying_interval_days: Optional[int] = Field(None, ge=1, le=90, description="Інтервал обприскування")
    notes: Optional[str] = Field(None, description="Особливості догляду, освітлення, ґрунт")


class PlantCreate(PlantBase):
    last_watered_at: Optional[dt_datetime] = None
    user_id: Optional[str] = "default"


class PlantUpdate(BaseModel):
    name: Optional[str] = None
    room: Optional[str] = None
    watering_interval_days: Optional[int] = None
    spraying_interval_days: Optional[int] = None
    notes: Optional[str] = None
    last_watered_at: Optional[dt_datetime] = None
    last_sprayed_at: Optional[dt_datetime] = None


class PlantResponse(PlantBase):
    id: int
    last_watered_at: dt_datetime
    last_sprayed_at: Optional[dt_datetime] = None
    user_id: str
    created_at: dt_datetime
    
    # Розрахункові поля
    next_watering_at: Optional[dt_datetime] = None
    needs_watering_now: bool = False
    days_until_next_watering: int = 0

    class Config:
        from_attributes = True
