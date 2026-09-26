from datetime import date, datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.auth import verify_secret_key
from app.modules.hospitality.models import Booking
from app.modules.hospitality.schemas import (
    BookingCreate,
    BookingUpdate,
    BookingResponse,
    HospitalitySummaryResponse,
)

router = APIRouter(prefix="/hospitality", tags=["Hospitality & Bookings"], dependencies=[Depends(verify_secret_key)])


def _calc_booking_financials(check_in: date, check_out: date, daily_rate: float, prepayment: float):
    days = (check_out - check_in).days
    total_days = max(1, days)
    total_amount = round(total_days * daily_rate, 2)
    remaining_balance = round(total_amount - prepayment, 2)
    return total_days, total_amount, remaining_balance


def _to_response(b: Booking) -> BookingResponse:
    return BookingResponse(
        id=b.id,
        guest_name=b.guest_name,
        check_in_date=b.check_in_date,
        check_out_date=b.check_out_date,
        apartment_unit=b.apartment_unit,
        daily_rate=b.daily_rate,
        total_days=b.total_days,
        total_amount=b.total_amount,
        prepayment=b.prepayment,
        remaining_balance=b.remaining_balance,
        status=b.status,
        notes=b.encrypted_notes,
        created_at=b.created_at,
    )


@router.post("/bookings", response_model=BookingResponse, status_code=status.HTTP_201_CREATED)
def create_booking(payload: BookingCreate, db: Session = Depends(get_db)):
    """
    Створення нового бронювання з автоматичним розрахунком діб, загальної вартості та залишку.
    """
    if payload.check_out_date <= payload.check_in_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Дата виїзду повинна бути пізнішою за дату заїзду."
        )

    total_days, total_amount, remaining_balance = _calc_booking_financials(
        payload.check_in_date,
        payload.check_out_date,
        payload.daily_rate,
        payload.prepayment
    )

    booking = Booking(
        guest_name=payload.guest_name.strip(),
        check_in_date=payload.check_in_date,
        check_out_date=payload.check_out_date,
        apartment_unit=payload.apartment_unit.strip(),
        daily_rate=payload.daily_rate,
        total_days=total_days,
        total_amount=total_amount,
        prepayment=payload.prepayment,
        remaining_balance=remaining_balance,
        status=payload.status or "active",
        encrypted_notes=payload.notes,
        created_at=datetime.utcnow(),
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return _to_response(booking)


@router.get("/bookings", response_model=List[BookingResponse])
def get_bookings(
    status_filter: Optional[str] = Query(None, alias="status"),
    unit_filter: Optional[str] = Query(None, alias="unit"),
    db: Session = Depends(get_db)
):
    """
    Отримання списку бронювань з можливістю фільтрації за статусом та апартаментами.
    """
    query = db.query(Booking)
    if status_filter:
        query = query.filter(Booking.status == status_filter)
    if unit_filter:
        query = query.filter(Booking.apartment_unit == unit_filter)
    
    bookings = query.order_by(Booking.check_in_date.asc()).all()
    return [_to_response(b) for b in bookings]


@router.get("/bookings/{booking_id}", response_model=BookingResponse)
def get_booking(booking_id: int, db: Session = Depends(get_db)):
    """
    Деталі одного бронювання за ID.
    """
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Бронювання не знайдено.")
    return _to_response(booking)


@router.put("/bookings/{booking_id}", response_model=BookingResponse)
def update_booking(booking_id: int, payload: BookingUpdate, db: Session = Depends(get_db)):
    """
    Оновлення даних бронювання з автоматичним перерахунком суми та залишку.
    """
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Бронювання не знайдено.")

    check_in = payload.check_in_date or booking.check_in_date
    check_out = payload.check_out_date or booking.check_out_date
    daily_rate = payload.daily_rate if payload.daily_rate is not None else booking.daily_rate
    prepayment = payload.prepayment if payload.prepayment is not None else booking.prepayment

    if check_out <= check_in:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Дата виїзду повинна бути пізнішою за дату заїзду."
        )

    total_days, total_amount, remaining_balance = _calc_booking_financials(
        check_in, check_out, daily_rate, prepayment
    )

    if payload.guest_name is not None:
        booking.guest_name = payload.guest_name.strip()
    if payload.apartment_unit is not None:
        booking.apartment_unit = payload.apartment_unit.strip()
    if payload.status is not None:
        booking.status = payload.status
    if payload.notes is not None:
        booking.encrypted_notes = payload.notes

    booking.check_in_date = check_in
    booking.check_out_date = check_out
    booking.daily_rate = daily_rate
    booking.total_days = total_days
    booking.total_amount = total_amount
    booking.prepayment = prepayment
    booking.remaining_balance = remaining_balance

    db.commit()
    db.refresh(booking)
    return _to_response(booking)


@router.delete("/bookings/{booking_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_booking(booking_id: int, db: Session = Depends(get_db)):
    """
    Видалення бронювання.
    """
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Бронювання не знайдено.")
    db.delete(booking)
    db.commit()
    return None


@router.get("/summary", response_model=HospitalitySummaryResponse)
def get_hospitality_summary(db: Session = Depends(get_db)):
    """
    Зведена фінансова та операційна аналітика по апартаментах.
    """
    all_active = db.query(Booking).filter(Booking.status == "active").all()
    total_rev = round(sum(b.total_amount for b in all_active), 2)
    total_prep = round(sum(b.prepayment for b in all_active), 2)
    total_rem = round(sum(b.remaining_balance for b in all_active), 2)

    upcoming = db.query(Booking).filter(
        Booking.status == "active",
        Booking.check_in_date >= date.today()
    ).order_by(Booking.check_in_date.asc()).limit(5).all()

    return HospitalitySummaryResponse(
        active_bookings_count=len(all_active),
        total_revenue_expected=total_rev,
        total_prepayments_received=total_prep,
        total_pending_balance=total_rem,
        upcoming_bookings=[_to_response(b) for b in upcoming]
    )
