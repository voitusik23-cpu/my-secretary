from datetime import date, datetime, timedelta
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.auth import verify_secret_key
from app.modules.fitness.models import FitnessLog
from app.modules.fitness.schemas import (
    FitnessSyncRequest,
    FitnessLogResponse,
    FitnessSummaryResponse,
    WeeklyStats,
)

router = APIRouter(prefix="/fitness", tags=["Fitness & Apple Health"], dependencies=[Depends(verify_secret_key)])


@router.post("/sync", response_model=FitnessLogResponse, status_code=status.HTTP_201_CREATED)
def sync_fitness_data(payload: FitnessSyncRequest, db: Session = Depends(get_db)):
    """
    Приймає щоденні дані активності від Apple Health / iOS Shortcuts або Apple Watch.
    Якщо запис для даної дати та типу тренування вже існує — оновлює його або підсумовує.
    """
    target_date = payload.date or date.today()

    # Шукаємо існуючий запис для дати та типу тренування
    existing = db.query(FitnessLog).filter(
        FitnessLog.date == target_date,
        FitnessLog.workout_type == (payload.workout_type or "general")
    ).first()

    if existing:
        # Оновлюємо актуальними значеннями
        existing.steps = payload.steps if payload.steps > 0 else existing.steps
        existing.distance_km = payload.distance_km if payload.distance_km > 0 else existing.distance_km
        existing.flights_climbed = payload.flights_climbed if payload.flights_climbed > 0 else existing.flights_climbed
        existing.calories = payload.calories if payload.calories > 0 else existing.calories
        if payload.workout_details:
            existing.workout_details = payload.workout_details
        db.commit()
        db.refresh(existing)
        return existing
    else:
        new_log = FitnessLog(
            date=target_date,
            steps=payload.steps,
            distance_km=payload.distance_km,
            flights_climbed=payload.flights_climbed,
            calories=payload.calories,
            workout_type=payload.workout_type or "general",
            workout_details=payload.workout_details,
            created_at=datetime.utcnow()
        )
        db.add(new_log)
        db.commit()
        db.refresh(new_log)
        return new_log


@router.get("/summary", response_model=FitnessSummaryResponse)
def get_fitness_summary(db: Session = Depends(get_db)):
    """
    Повертає підсумок активності:
    - Показники за сьогодні (кроки, км, поверхи, калорії).
    - Статистику за останні 7 днів.
    - Журнал гірськолижних спусків (skiing).
    - Останні 10 тренувань.
    """
    today = date.today()

    # 1. За сьогодні (загальна активність або перша знайдена)
    today_log = db.query(FitnessLog).filter(FitnessLog.date == today).order_by(desc(FitnessLog.steps)).first()

    # 2. За останні 7 днів
    week_ago = today - timedelta(days=7)
    weekly_logs = db.query(FitnessLog).filter(FitnessLog.date >= week_ago).all()

    total_steps = sum(log.steps for log in weekly_logs)
    total_dist = round(sum(log.distance_km for log in weekly_logs), 2)
    total_cals = sum(log.calories for log in weekly_logs)
    days_count = len(set(log.date for log in weekly_logs))
    avg_steps = int(total_steps / max(1, days_count))

    # 3. Лижні тренування (skiing)
    ski_logs = db.query(FitnessLog).filter(
        FitnessLog.workout_type == "skiing"
    ).order_by(desc(FitnessLog.date)).limit(10).all()

    # 4. Останні 10 записів загалом
    recent_logs = db.query(FitnessLog).order_by(desc(FitnessLog.date), desc(FitnessLog.id)).limit(10).all()

    return FitnessSummaryResponse(
        today=today_log,
        weekly_stats=WeeklyStats(
            total_steps=total_steps,
            avg_steps_daily=avg_steps,
            total_distance_km=total_dist,
            total_calories=total_cals,
            days_recorded=days_count,
        ),
        ski_logs=ski_logs,
        recent_logs=recent_logs,
    )


@router.get("/logs", response_model=List[FitnessLogResponse])
def get_fitness_logs(limit: int = 30, db: Session = Depends(get_db)):
    """
    Список записів активності за останні дні.
    """
    return db.query(FitnessLog).order_by(desc(FitnessLog.date), desc(FitnessLog.id)).limit(limit).all()
