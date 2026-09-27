from sqlalchemy.orm import Session
from app.core.undo_service import record_action
from app.modules.health_vitals.service import (
    create_bp_log,
    get_bp_logs,
    compute_analytics,
    classify_bp,
    infer_time_of_day,
)
from app.modules.health_vitals.schemas import BloodPressureCreateRequest


def handle_vitals_intent(db: Session, data: dict, raw_text: str) -> dict:
    """Обробляє голосові та текстові наміри щодо щоденника тиску."""
    action = data.get("action", "log")
    if action == "query" or not (data.get("systolic") and data.get("diastolic")):
        logs = get_bp_logs(db=db, days=90)
        if not logs:
            return {
                "intent": "health_vitals",
                "reply": "❤️ У щоденнику поки немає записів тиску. Ви можете сказати, наприклад: «Давление 120 на 80 пульс 70».",
                "summary": "Немає записів тиску",
                "created": None
            }
        stats = compute_analytics(logs)
        latest = logs[0]
        cls_name, _ = classify_bp(latest.systolic, latest.diastolic)
        reply = (
            f"❤️ Останній вимір: {latest.systolic}/{latest.diastolic} (пульс: {latest.pulse or '—'}). {cls_name}.\n"
            f"📊 Загалом {stats.total_readings} вимірів: середній {stats.avg_systolic}/{stats.avg_diastolic}."
        )
        return {"intent": "health_vitals", "reply": reply, "summary": "Статистика тиску", "created": stats}

    sys_val = int(data.get("systolic"))
    dia_val = int(data.get("diastolic"))
    pulse_val = int(data.get("pulse")) if data.get("pulse") else None
    tod_val = data.get("time_of_day") or infer_time_of_day()
    meds_val = data.get("medications_taken")
    notes_val = data.get("notes") or raw_text

    req = BloodPressureCreateRequest(
        systolic=sys_val,
        diastolic=dia_val,
        pulse=pulse_val,
        time_of_day=tod_val,
        medications_taken=meds_val,
        notes=notes_val
    )
    log = create_bp_log(db=db, data=req)
    record_action("health_vitals", [log.id], f"Тиск: {log.systolic}/{log.diastolic}")

    cls_name, _ = classify_bp(sys_val, dia_val)
    tod_ua = {"morning": "ранок", "evening": "вечір", "afternoon": "день", "night": "ніч"}.get(tod_val, tod_val)
    pulse_info = f", пульс {pulse_val}" if pulse_val else ""
    meds_info = f", ліки: «{meds_val}»" if meds_val else ""

    if sys_val >= 160 or dia_val >= 100:
        advice = "🚨 Тиск значно підвищений! Прийміть призначені препарати та відпочиньте."
    elif sys_val >= 140 or dia_val >= 90:
        advice = "⚠️ Тиск підвищений (гіпертензія 1 ступеня). Контролюйте самопочуття."
    elif sys_val >= 130 or dia_val >= 85:
        advice = "ℹ️ Тиск високий нормальний. Рекомендовано зменшити стрес."
    else:
        advice = "✅ Чудово, тиск в ідеальній нормі!"

    reply_msg = f"Записано: {sys_val}/{dia_val}{pulse_info} ({tod_ua}{meds_info}). {cls_name}. {advice}"
    return {
        "intent": "health_vitals",
        "reply": reply_msg,
        "summary": f"Тиск: {sys_val}/{dia_val}",
        "created": {"id": log.id, "systolic": sys_val, "diastolic": dia_val}
    }
