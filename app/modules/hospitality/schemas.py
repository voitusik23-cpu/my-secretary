from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class BookingCreate(BaseModel):
    guest_name: str = Field(..., min_length=1, description="Ім'я та прізвище гостя")
    check_in_date: date = Field(..., description="Дата заїзду")
    check_out_date: date = Field(..., description="Дата виїзду")
    apartment_unit: str = Field(default="Apartment #1", description="Назва або номер апартаментів")
    daily_rate: float = Field(..., gt=0, description="Добова вартість проживання")
    prepayment: float = Field(default=0.0, ge=0, description="Внесена передоплата")
    status: Optional[str] = Field(default="active", description="active | completed | cancelled")
    notes: Optional[str] = Field(default=None, description="Додаткові примітки (побажання, контакти)")


class BookingUpdate(BaseModel):
    guest_name: Optional[str] = None
    check_in_date: Optional[date] = None
    check_out_date: Optional[date] = None
    apartment_unit: Optional[str] = None
    daily_rate: Optional[float] = None
    prepayment: Optional[float] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class BookingResponse(BaseModel):
    id: int
    guest_name: str
    check_in_date: date
    check_out_date: date
    apartment_unit: str
    daily_rate: float
    total_days: int
    total_amount: float
    prepayment: float
    remaining_balance: float
    status: str
    notes: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class HospitalitySummaryResponse(BaseModel):
    active_bookings_count: int
    total_revenue_expected: float
    total_prepayments_received: float
    total_pending_balance: float
    upcoming_bookings: List[BookingResponse]
