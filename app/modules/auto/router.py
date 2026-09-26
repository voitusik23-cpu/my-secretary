from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.database import get_db
from app.auth import verify_secret_key
from app.modules.auto.models import AutoLog
from app.modules.auto.schemas import (
    AutoLogCreate,
    AutoLogResponse,
    AutoStatusResponse,
)

router = APIRouter(prefix="/auto", tags=["Auto & Garage"], dependencies=[Depends(verify_secret_key)])


def _to_response(log: AutoLog) -> AutoLogResponse:
    return AutoLogResponse(
        id=log.id,
        event_type=log.event_type,
        current_mileage=log.current_mileage,
        next_service_mileage=log.next_service_mileage,
        insurance_expiry_date=log.insurance_expiry_date,
        notes=log.encrypted_notes,
        created_at=log.created_at,
    )


@router.post("/log", response_model=AutoLogResponse, status_code=status.HTTP_201_CREATED)
def record_auto_log(payload: AutoLogCreate, db: Session = Depends(get_db)):
    """
    Записує подію авто: оновлення пробігу, проведення ТО або страховку.
    """
    log = AutoLog(
        event_type=payload.event_type.lower(),
        current_mileage=payload.current_mileage,
        next_service_mileage=payload.next_service_mileage,
        insurance_expiry_date=payload.insurance_expiry_date,
        encrypted_notes=payload.notes,
        created_at=datetime.utcnow(),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return _to_response(log)


@router.get("/logs", response_model=List[AutoLogResponse])
def get_auto_logs(
    db: Session = Depends(get_db),
    event_type: Optional[str] = Query(None, description="Фільтр за типом: mileage, maintenance, insurance"),
    limit: int = Query(50, ge=1, le=200),
):
    query = db.query(AutoLog)
    if event_type:
        query = query.filter(AutoLog.event_type == event_type.lower())
    logs = query.order_by(desc(AutoLog.created_at)).limit(limit).all()
    return [_to_response(l) for l in logs]


@router.get("/status", response_model=AutoStatusResponse)
def get_auto_status(db: Session = Depends(get_db)):
    """
    Повертає поточний статус авто: пробіг, залишок до ТО та стан страховки.
    """
    # 1. Знаходимо останній зафіксований пробіг
    latest_mileage_log = db.query(AutoLog).filter(
        AutoLog.current_mileage.isnot(None)
    ).order_by(desc(AutoLog.created_at)).first()
    current_km = latest_mileage_log.current_mileage if latest_mileage_log else None

    # 2. Знаходимо наступне ТО
    latest_service_log = db.query(AutoLog).filter(
        AutoLog.next_service_mileage.isnot(None)
    ).order_by(desc(AutoLog.created_at)).first()
    next_service_km = latest_service_log.next_service_mileage if latest_service_log else None

    km_until_service = None
    if current_km and next_service_km:
        km_until_service = next_service_km - current_km
        if km_until_service <= 0:
            service_msg = f"⚠️ УВАГА! Термін ТО настав ({abs(km_until_service)} км тому при пробігу {current_km} км)!"
        elif km_until_service <= 1000:
            service_msg = f"⚡ Наближається ТО: залишилось {km_until_service} км (при {next_service_km} км)"
        else:
            service_msg = f"✅ До наступного ТО залишилось {km_until_service} км (план: {next_service_km} км)"
    elif next_service_km:
        service_msg = f"План наступного ТО: {next_service_km} км"
    else:
        service_msg = "Наступне ТО ще не заплановано"

    # 3. Знаходимо останній поліс страховки
    latest_ins_log = db.query(AutoLog).filter(
        AutoLog.insurance_expiry_date.isnot(None)
    ).order_by(desc(AutoLog.created_at)).first()

    ins_expiry = latest_ins_log.insurance_expiry_date if latest_ins_log else None
    ins_days_left = None

    if ins_expiry:
        now = datetime.utcnow()
        delta_days = (ins_expiry - now).days
        ins_days_left = delta_days
        if delta_days < 0:
            ins_msg = f"🚨 Страховка прострочена на {abs(delta_days)} дн. ({ins_expiry.strftime('%d.%m.%Y')})"
        elif delta_days <= 14:
            ins_msg = f"⚠️ Страховка закінчується через {delta_days} дн. ({ins_expiry.strftime('%d.%m.%Y')})"
        else:
            ins_msg = f"✅ Страховка дійсна ще {delta_days} дн. (до {ins_expiry.strftime('%d.%m.%Y')})"
    else:
        ins_msg = "Дані про страховку відсутні"

    recent_logs = db.query(AutoLog).order_by(desc(AutoLog.created_at)).limit(10).all()

    return AutoStatusResponse(
        current_mileage=current_km,
        next_service_mileage=next_service_km,
        km_until_service=km_until_service,
        service_status_message=service_msg,
        insurance_expiry_date=ins_expiry,
        insurance_days_left=ins_days_left,
        insurance_status_message=ins_msg,
        recent_logs=[_to_response(l) for l in recent_logs],
    )


@router.delete("/logs/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_auto_log(log_id: int, db: Session = Depends(get_db)):
    log = db.query(AutoLog).filter(AutoLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Запис не знайдено")
    db.delete(log)
    db.commit()
    return None
