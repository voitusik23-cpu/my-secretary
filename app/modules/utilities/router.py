from datetime import datetime
from typing import List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.database import get_db
from app.auth import verify_secret_key
from app.modules.utilities.models import UtilityReading
from app.modules.utilities.schemas import (
    UtilityReadingCreate,
    UtilityReadingResponse,
    UtilitySummaryItem,
    UtilitySummaryResponse,
)

router = APIRouter(prefix="/utilities", tags=["Utilities"], dependencies=[Depends(verify_secret_key)])

METER_CONFIG = {
    "electricity": {"label": "Електроенергія", "unit": "кВт·год"},
    "water": {"label": "Вода", "unit": "м³"},
    "gas": {"label": "Газ", "unit": "м³"},
}


@router.post("/reading", response_model=UtilityReadingResponse, status_code=status.HTTP_201_CREATED)
def record_utility_reading(payload: UtilityReadingCreate, db: Session = Depends(get_db)):
    """
    Записує показники лічильника і автоматично вираховує різницю (дельта) від попереднього запису.
    """
    m_type = payload.meter_type.lower().strip()

    # Шукаємо останній попередній запис цього лічильника
    prev_reading = db.query(UtilityReading).filter(
        UtilityReading.meter_type == m_type
    ).order_by(desc(UtilityReading.recorded_at)).first()

    prev_val = prev_reading.reading_value if prev_reading else None
    delta = None
    if prev_val is not None:
        delta = round(payload.reading_value - prev_val, 2)

    reading = UtilityReading(
        meter_type=m_type,
        reading_value=payload.reading_value,
        previous_value=prev_val,
        delta=delta,
        recorded_at=payload.recorded_at or datetime.utcnow(),
    )
    db.add(reading)
    db.commit()
    db.refresh(reading)
    return reading


@router.get("/readings", response_model=List[UtilityReadingResponse])
def get_utility_readings(
    db: Session = Depends(get_db),
    meter_type: Optional[str] = Query(None, description="Фільтр: electricity, water, gas"),
    limit: int = Query(50, ge=1, le=200),
):
    query = db.query(UtilityReading)
    if meter_type:
        query = query.filter(UtilityReading.meter_type == meter_type.lower())
    return query.order_by(desc(UtilityReading.recorded_at)).limit(limit).all()


@router.get("/summary", response_model=UtilitySummaryResponse)
def get_utility_summary(db: Session = Depends(get_db)):
    """
    Повертає поточні показники та витрати (дельту) по кожному з лічильників.
    """
    summary_map: Dict[str, UtilitySummaryItem] = {}

    for m_type, conf in METER_CONFIG.items():
        latest = db.query(UtilityReading).filter(
            UtilityReading.meter_type == m_type
        ).order_by(desc(UtilityReading.recorded_at)).first()

        summary_map[m_type] = UtilitySummaryItem(
            meter_type=m_type,
            label=conf["label"],
            unit=conf["unit"],
            latest_value=latest.reading_value if latest else None,
            previous_value=latest.previous_value if latest else None,
            delta=latest.delta if latest else None,
            last_recorded_at=latest.recorded_at if latest else None,
        )

    recent = db.query(UtilityReading).order_by(desc(UtilityReading.recorded_at)).limit(15).all()

    return UtilitySummaryResponse(
        meters=summary_map,
        recent_readings=recent,
    )


@router.delete("/readings/{reading_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_utility_reading(reading_id: int, db: Session = Depends(get_db)):
    reading = db.query(UtilityReading).filter(UtilityReading.id == reading_id).first()
    if not reading:
        raise HTTPException(status_code=404, detail="Запис не знайдено")
    db.delete(reading)
    db.commit()
    return None
