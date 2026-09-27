import csv
import io
import re
from datetime import datetime, timedelta, date as dt_date
from typing import List, Tuple, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.modules.health_vitals.models import BloodPressureLog
from app.modules.health_vitals.schemas import (
    BloodPressureCreateRequest,
    BloodPressureItemResponse,
    BloodPressureAnalyticsResponse,
    LifestyleCorrelation,
)


def classify_bp(systolic: int, diastolic: int) -> Tuple[str, str]:
    """
    Класифікація артеріального тиску згідно з клінічними рекомендаціями ESC/ESH.
    Повертає текстовий статус та колірний код.
    """
    if systolic >= 180 or diastolic >= 120:
        return "Гіпертонічний криз (небезпечно)", "#ff453a"
    if systolic >= 160 or diastolic >= 100:
        return "Гіпертензія 2 ступеня", "#ff9f0a"
    if systolic >= 140 or diastolic >= 90:
        return "Гіпертензія 1 ступеня", "#ffd60a"
    if systolic >= 130 or diastolic >= 85:
        return "Високий нормальний", "#0a84ff"
    if systolic >= 120 and diastolic < 80:
        return "Нормальний тиск", "#30d158"
    if systolic < 120 and diastolic < 80:
        return "Оптимальний тиск", "#30d158"
    return "Нормальний", "#30d158"


def infer_time_of_day(dt: Optional[datetime] = None) -> str:
    """Визначає час доби на основі години вимірювання."""
    target = dt or datetime.now()
    hour = target.hour
    if 5 <= hour < 12:
        return "morning"
    if 12 <= hour < 17:
        return "afternoon"
    if 17 <= hour < 23:
        return "evening"
    return "night"


def map_log_to_response(log: BloodPressureLog) -> BloodPressureItemResponse:
    """Перетворює модель БД у валідовану Pydantic схему з клінічною оцінкою."""
    classification, color = classify_bp(log.systolic, log.diastolic)
    return BloodPressureItemResponse(
        id=log.id,
        recorded_at=log.recorded_at,
        systolic=log.systolic,
        diastolic=log.diastolic,
        pulse=log.pulse,
        time_of_day=log.time_of_day,
        medications_taken=log.medications_taken,
        notes=log.encrypted_notes,
        classification=classification,
        color=color,
        created_at=log.created_at,
    )


def create_bp_log(db: Session, data: BloodPressureCreateRequest) -> BloodPressureLog:
    """Створює новий запис вимірювання тиску."""
    rec_time = data.recorded_at or datetime.utcnow()
    tod = data.time_of_day or infer_time_of_day(rec_time)

    log = BloodPressureLog(
        recorded_at=rec_time,
        systolic=data.systolic,
        diastolic=data.diastolic,
        pulse=data.pulse,
        time_of_day=tod,
        medications_taken=(
            "Прийнято ліки" if data.medications_taken is True else (
                str(data.medications_taken).strip() if data.medications_taken and data.medications_taken is not False else None
            )
        ),
        encrypted_notes=data.notes.strip() if data.notes else None,
        created_at=datetime.utcnow(),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def get_bp_logs(
    db: Session,
    days: int = 90,
    start_date: Optional[dt_date] = None,
    end_date: Optional[dt_date] = None
) -> List[BloodPressureLog]:
    """Отримує історію вимірювань за вказаний діапазон днів або дат."""
    query = db.query(BloodPressureLog)
    if start_date and end_date:
        query = query.filter(
            BloodPressureLog.recorded_at >= datetime.combine(start_date, datetime.min.time()),
            BloodPressureLog.recorded_at <= datetime.combine(end_date, datetime.max.time()),
        )
    elif days > 0:
        since = datetime.utcnow() - timedelta(days=days)
        query = query.filter(BloodPressureLog.recorded_at >= since)
    return query.order_by(desc(BloodPressureLog.recorded_at)).all()


def export_bp_csv(logs: List[BloodPressureLog]) -> str:
    """Експортує вимірювання в CSV файл з підтримкою кирилиці (UTF-8 BOM)."""
    output = io.StringIO()
    output.write("\ufeff")  # UTF-8 BOM for MS Excel
    writer = csv.writer(output, delimiter=";")
    writer.writerow([
        "Дата та час",
        "Час доби",
        "Систолічний (SYS)",
        "Діастолічний (DIA)",
        "Пульс (BPM)",
        "Категорія",
        "Прийняті ліки",
        "Замітки / Фактори"
    ])
    tod_map = {"morning": "Ранок", "afternoon": "День", "evening": "Вечір", "night": "Ніч"}
    for log in logs:
        cls_name, _ = classify_bp(log.systolic, log.diastolic)
        writer.writerow([
            log.recorded_at.strftime("%Y-%m-%d %H:%M"),
            tod_map.get(log.time_of_day, log.time_of_day),
            log.systolic,
            log.diastolic,
            log.pulse if log.pulse is not None else "",
            cls_name,
            log.medications_taken or "",
            log.encrypted_notes or ""
        ])
    return output.getvalue()


def compute_analytics(logs: List[BloodPressureLog]) -> BloodPressureAnalyticsResponse:
    """Розраховує середні показники, екстремуми та кореляції зі стилем життя."""
    if not logs:
        return BloodPressureAnalyticsResponse(
            total_readings=0,
            avg_systolic=0.0,
            avg_diastolic=0.0,
        )

    sys_vals = [l.systolic for l in logs]
    dia_vals = [l.diastolic for l in logs]
    pulse_vals = [l.pulse for l in logs if l.pulse is not None]

    avg_sys = round(sum(sys_vals) / len(sys_vals), 1)
    avg_dia = round(sum(dia_vals) / len(dia_vals), 1)
    avg_pulse = round(sum(pulse_vals) / len(pulse_vals), 1) if pulse_vals else None

    # Morning vs Evening
    morning_logs = [l for l in logs if l.time_of_day == "morning"]
    evening_logs = [l for l in logs if l.time_of_day == "evening"]

    morning_avg = None
    if morning_logs:
        morning_avg = {
            "systolic": round(sum(l.systolic for l in morning_logs) / len(morning_logs), 1),
            "diastolic": round(sum(l.diastolic for l in morning_logs) / len(morning_logs), 1),
            "count": len(morning_logs)
        }

    evening_avg = None
    if evening_logs:
        evening_avg = {
            "systolic": round(sum(l.systolic for l in evening_logs) / len(evening_logs), 1),
            "diastolic": round(sum(l.diastolic for l in evening_logs) / len(evening_logs), 1),
            "count": len(evening_logs)
        }

    # Percentages
    normal_count = sum(1 for l in logs if l.systolic < 130 and l.diastolic < 85)
    elevated_count = len(logs) - normal_count
    normal_pct = round((normal_count / len(logs)) * 100, 1)
    elevated_pct = round((elevated_count / len(logs)) * 100, 1)

    # Lifestyle factor correlation analysis
    factor_keywords = [
        ("🍷 Алкоголь / Вино", ["вино", "алкогол", "пиво", "коньяк", "виски", "wine", "beer"]),
        ("☕ Кава / Кофеїн", ["кава", "кофе", "эспрессо", "espresso", "coffee"]),
        ("⚡ Стрес / Перевтома", ["стрес", "стресс", "нерв", "хвилюван", "переживан", "втома"]),
        ("🏃 Спорт / Тренування", ["спорт", "тренуван", "тренировк", "біг", "бег", "пробіжк"]),
        ("💊 Прийом ліків", ["таблетк", "эналаприл", "ліки", "бисопролол", "амлодипин", "лекарств"]),
    ]

    correlations: List[LifestyleCorrelation] = []
    for label, keywords in factor_keywords:
        matching = []
        for l in logs:
            text = f"{l.medications_taken or ''} {l.encrypted_notes or ''}".lower()
            if any(k in text for k in keywords):
                matching.append(l)

        if len(matching) >= 2:
            sub_avg = round(sum(m.systolic for m in matching) / len(matching), 1)
            delta = round(sub_avg - avg_sys, 1)
            impact = "negative" if delta > 4.0 else ("positive" if delta < -4.0 else "neutral")
            correlations.append(LifestyleCorrelation(
                factor=label,
                count=len(matching),
                avg_systolic=sub_avg,
                baseline_systolic=avg_sys,
                delta=delta,
                impact=impact
            ))

    latest = map_log_to_response(logs[0]) if logs else None

    return BloodPressureAnalyticsResponse(
        total_readings=len(logs),
        avg_systolic=avg_sys,
        avg_diastolic=avg_dia,
        avg_pulse=avg_pulse,
        min_systolic=min(sys_vals),
        max_systolic=max(sys_vals),
        min_diastolic=min(dia_vals),
        max_diastolic=max(dia_vals),
        morning_avg=morning_avg,
        evening_avg=evening_avg,
        normal_percentage=normal_pct,
        elevated_percentage=elevated_pct,
        lifestyle_correlations=correlations,
        latest_reading=latest
    )
