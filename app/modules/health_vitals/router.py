from datetime import date as dt_date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import verify_secret_key
from app.core.undo_service import record_action
from app.modules.health_vitals.models import BloodPressureLog
from app.modules.health_vitals.schemas import (
    BloodPressureCreateRequest,
    BloodPressureItemResponse,
    BloodPressureAnalyticsResponse,
)
from app.modules.health_vitals.service import (
    create_bp_log,
    get_bp_logs,
    export_bp_csv,
    compute_analytics,
    map_log_to_response,
)

router = APIRouter(
    prefix="/vitals/bp",
    tags=["Blood Pressure & Vitals"],
    dependencies=[Depends(verify_secret_key)],
)


@router.post("", response_model=BloodPressureItemResponse, status_code=status.HTTP_201_CREATED)
def record_blood_pressure(payload: BloodPressureCreateRequest, db: Session = Depends(get_db)):
    """Фіксує новий вимір артеріального тиску та пульсу."""
    log = create_bp_log(db=db, data=payload)
    tod_label = {"morning": "ранок", "evening": "вечір", "afternoon": "день", "night": "ніч"}.get(log.time_of_day, log.time_of_day)
    summary_text = f"Тиск: {log.systolic}/{log.diastolic} ({tod_label})"
    record_action("health_vitals", [log.id], summary_text)
    return map_log_to_response(log)


@router.get("", response_model=List[BloodPressureItemResponse])
def list_blood_pressure(
    days: int = Query(90, ge=1, le=365, description="Кількість днів для фільтрації"),
    start_date: Optional[dt_date] = Query(None, description="Початкова дата YYYY-MM-DD"),
    end_date: Optional[dt_date] = Query(None, description="Кінцева дата YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    """Повертає історію вимірювань за вказаний проміжок часу."""
    logs = get_bp_logs(db=db, days=days, start_date=start_date, end_date=end_date)
    return [map_log_to_response(log) for log in logs]


@router.get("/export")
def export_blood_pressure_csv(
    days: int = Query(90, ge=1, le=365),
    start_date: Optional[dt_date] = Query(None),
    end_date: Optional[dt_date] = Query(None),
    db: Session = Depends(get_db),
):
    """Експортує вимірювання тиску у форматі CSV для лікаря або архіву."""
    logs = get_bp_logs(db=db, days=days, start_date=start_date, end_date=end_date)
    csv_content = export_bp_csv(logs)
    filename = f"blood_pressure_journal_{dt_date.today().isoformat()}.csv"
    return Response(
        content=csv_content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/analytics", response_model=BloodPressureAnalyticsResponse)
def get_blood_pressure_analytics(
    days: int = Query(90, ge=1, le=365),
    start_date: Optional[dt_date] = Query(None),
    end_date: Optional[dt_date] = Query(None),
    db: Session = Depends(get_db),
):
    """Розраховує аналітику: середні значення, ранок/вечір та кореляцію зі способом життя."""
    logs = get_bp_logs(db=db, days=days, start_date=start_date, end_date=end_date)
    return compute_analytics(logs)


@router.delete("/{log_id}", status_code=status.HTTP_200_OK)
def delete_blood_pressure(log_id: str, db: Session = Depends(get_db)):
    """Видаляє один запис тиску за його ID."""
    log = db.query(BloodPressureLog).filter(BloodPressureLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Запис тиску не знайдено")
    db.delete(log)
    db.commit()
    return {"status": "success", "message": "Запис тиску успішно видалено"}
