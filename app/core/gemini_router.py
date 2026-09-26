import json
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db
from app.auth import verify_secret_key
from app.core.web_agent import perform_web_search, WebSource
from app.modules.inventory.models import InventoryItem
from app.modules.auto.models import AutoLog
from app.modules.utilities.models import UtilityReading
from app.models.finance import FinanceRecord
from app.models.shopping import ShoppingItem
from app.models.tasks import Task
from app.models.media_notes import MediaNote
from app.modules.auto.router import get_auto_status
from app.modules.inventory.router import query_location

logger = logging.getLogger("my_secretary.gemini_router")

router = APIRouter(tags=["Gemini Extended Router"], dependencies=[Depends(verify_secret_key)])

EXTENDED_CLASSIFICATION_INSTRUCTION = """Ти — інтелектуальний персональний асистент Секретаря.
Твоє завдання — визначити намір (intent) користувача та витягти структуровані дані.

Доступні наміри (intents):
1. "finance" — витрати/доходи (сума, категорія, валюта: за замовчуванням UAH).
2. "shopping" — товари в список покупок (item, category, quantity).
3. "tasks" — завдання і нагадування (title, due_date, priority).
4. "media_notes" — фільми, книги, замітки (title, type, comment).
5. "inventory" — пошук або збереження місцезнаходження речей ("де паспорт", "поклав ключі в тумбочку в передпокої").
   - action: "query" (запитання де річ) або "add" (зберегти річ і локацію).
   - item_name: назва речі
   - location: де знаходиться (для add)
6. "auto" — обслуговування авто ("запиши пробіг 120000", "заміна масла на 130000", "страховка до 15.12.2026", "коли ТО").
   - action: "status" (запитання про стан/ТО) або "log" (фіксація даних)
   - event_type: "mileage" | "maintenance" | "insurance"
   - current_mileage, next_service_mileage, insurance_expiry_date (ISO дата), notes
7. "utility" — показники лічильників ("світло 1234", "вода 45", "газ 780").
   - meter_type: "electricity" | "water" | "gas"
   - reading_value: float число
8. "web_search" — запитання до інтернету, актуальні факти, погода, інструкції, довідка ("яка погода", "курс валют", "як полагодити...", "хто винайшов...").
9. "fitness" — фізична активність, тренування, кроки, калорії, лижі ("скільки кроків пройшов", "запиши 10000 кроків", "покажи лижні спуски", "скільки пробіг").
   - action: "query_steps" | "query_skiing" | "log"
   - steps, distance_km, calories, workout_type, workout_details

Поточна дата: {current_time}.

Формат відповіді СУВОРО JSON:
{{
  "intent": "finance" | "shopping" | "tasks" | "media_notes" | "inventory" | "auto" | "utility" | "web_search" | "fitness",
  "summary": "Коротке резюме дії або відповіді",
  "data": {{ ... }}
}}
"""


class ProcessRequest(BaseModel):
    text: str = Field(..., description="Текст запиту або розпізнаного голосу")


@router.post("/gemini/process")
async def process_intent(payload: ProcessRequest, db: Session = Depends(get_db)):
    """
    Розширений обробник запитів: класифікує намір (finance, shopping, tasks, media, inventory, auto, utility, web_search)
    та виконує відповідну дію або делегує до Web Search Agent.
    """
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Текст запиту не може бути порожнім")

    api_key = settings.GEMINI_API_KEY.strip() if settings.GEMINI_API_KEY else ""

    parsed_intent = "web_search"
    summary = "Запит оброблено"
    data = {}

    if api_key:
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=api_key)
            prompt = EXTENDED_CLASSIFICATION_INSTRUCTION.format(
                current_time=datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            )

            res = client.models.generate_content(
                model=settings.AI_MODEL,
                contents=text,
                config=types.GenerateContentConfig(
                    system_instruction=prompt,
                    response_mime_type="application/json",
                    temperature=0.1,
                )
            )

            clean_text = res.text.strip()
            if clean_text.startswith("```json"):
                clean_text = clean_text[7:]
            if clean_text.endswith("```"):
                clean_text = clean_text[:-3]

            parsed = json.loads(clean_text.strip())
            parsed_intent = parsed.get("intent", "web_search")
            summary = parsed.get("summary", "")
            data = parsed.get("data", {})
        except Exception as e:
            logger.error(f"Gemini intent classification error: {e}")
            # Проста евристика при помилці
            lower = text.lower()
            if any(k in lower for k in ["де лежить", "де знаходиться", "где лежит", "де мої"]):
                parsed_intent = "inventory"
                data = {"action": "query", "item_name": text}
            elif any(k in lower for k in ["пробіг", "масло", "мастило", "страховка", "пробег"]):
                parsed_intent = "auto"
                data = {"action": "log", "notes": text}
            elif any(k in lower for k in ["лічильник", "світло", "вода", "газ", "счетчик"]):
                parsed_intent = "utility"
            elif any(k in lower for k in ["крок", "шаг", "лиж", "лыж", "активн", "тренуван", "пробіг пішки"]):
                parsed_intent = "fitness"
                data = {"action": "query_skiing" if ("лиж" in lower or "лыж" in lower) else "query_steps"}
            else:
                parsed_intent = "web_search"

    # --- ДЕЛЕГУВАННЯ ЗА НАМІРОМ ---

    # 1. WEB SEARCH
    if parsed_intent == "web_search":
        search_res = await perform_web_search(text)
        return {
            "intent": "web_search",
            "reply": search_res["answer"],
            "summary": "Знайдено в інтернеті",
            "sources": search_res.get("sources", []),
            "created": None
        }

    # 2. INVENTORY
    elif parsed_intent == "inventory":
        action = data.get("action", "query")
        if action == "query" or not data.get("location"):
            query_str = data.get("item_name") or text
            search_resp = query_location(q=query_str, db=db)
            return {
                "intent": "inventory",
                "reply": search_resp.message,
                "summary": search_resp.message,
                "created": search_resp.items
            }
        else:
            item_name = data.get("item_name", "").strip() or text
            loc = data.get("location", "Вдома")
            item = InventoryItem(
                user_id="default",
                item_name=item_name,
                encrypted_location=loc,
                tags=data.get("tags"),
                dimensions_or_spec=data.get("dimensions_or_spec"),
                updated_at=datetime.utcnow(),
            )
            db.add(item)
            db.commit()
            db.refresh(item)
            msg = f"Збережено: «{item_name}» знаходиться в «{loc}»"
            return {
                "intent": "inventory",
                "reply": msg,
                "summary": msg,
                "created": {"id": item.id, "item_name": item_name, "location": loc}
            }

    # 3. AUTO
    elif parsed_intent == "auto":
        action = data.get("action", "log")
        if action == "status" or any(k in text.lower() for k in ["коли то", "статус", "коли міняти"]):
            status_data = get_auto_status(db=db)
            msg = f"{status_data.service_status_message}\n{status_data.insurance_status_message}"
            return {
                "intent": "auto",
                "reply": msg,
                "summary": "Статус автомобіля",
                "created": status_data
            }
        else:
            log = AutoLog(
                event_type=data.get("event_type", "mileage"),
                current_mileage=data.get("current_mileage"),
                next_service_mileage=data.get("next_service_mileage"),
                insurance_expiry_date=datetime.fromisoformat(data["insurance_expiry_date"]) if data.get("insurance_expiry_date") else None,
                encrypted_notes=data.get("notes") or text,
                created_at=datetime.utcnow()
            )
            db.add(log)
            db.commit()
            db.refresh(log)
            msg = f"Записано в гараж: {log.event_type} ({log.encrypted_notes})"
            return {
                "intent": "auto",
                "reply": msg,
                "summary": msg,
                "created": {"id": log.id, "event_type": log.event_type}
            }

    # 4. UTILITIES
    elif parsed_intent == "utility":
        m_type = data.get("meter_type", "electricity").lower()
        val = float(data.get("reading_value", 0))

        prev_reading = db.query(UtilityReading).filter(
            UtilityReading.meter_type == m_type
        ).order_by(UtilityReading.recorded_at.desc()).first()

        prev_val = prev_reading.reading_value if prev_reading else None
        delta = round(val - prev_val, 2) if prev_val is not None else None

        reading = UtilityReading(
            meter_type=m_type,
            reading_value=val,
            previous_value=prev_val,
            delta=delta,
            recorded_at=datetime.utcnow(),
        )
        db.add(reading)
        db.commit()
        db.refresh(reading)

        delta_str = f" (різниця: +{delta})" if delta is not None else ""
        msg = f"Показники {m_type}: {val}{delta_str}"
        return {
            "intent": "utility",
            "reply": msg,
            "summary": msg,
            "created": {"id": reading.id, "meter_type": m_type, "reading": val, "delta": delta}
        }

    # 5. FITNESS & HEALTH
    elif parsed_intent == "fitness":
        from app.modules.fitness.models import FitnessLog
        from datetime import date
        from sqlalchemy import desc

        lower_t = text.lower()
        action = data.get("action", "")
        if "лиж" in lower_t or "лыж" in lower_t or "спуск" in lower_t or action == "query_skiing":
            ski_logs = db.query(FitnessLog).filter(FitnessLog.workout_type == "skiing").order_by(desc(FitnessLog.date)).limit(5).all()
            if not ski_logs:
                msg = "🎿 Записів про гірськолижні спуски поки немає. Додайте тренування або синхронізуйте з Apple Health!"
            else:
                desc_list = []
                for s in ski_logs:
                    details = s.workout_details or {}
                    descents = details.get("descents", "—")
                    max_speed = details.get("max_speed_kmh", "—")
                    desc_list.append(f"• {s.date}: {s.distance_km} км, спусків: {descents}, макс. швидкість: {max_speed} км/год")
                msg = "🎿 Ваші останні гірськолижні тренування:\n" + "\n".join(desc_list)
            return {
                "intent": "fitness",
                "reply": msg,
                "summary": "Лижні спуски",
                "created": None
            }
        elif any(k in lower_t for k in ["скільки", "сколько", "статистика", "покажи"]) or action == "query_steps" or not data.get("steps"):
            today_log = db.query(FitnessLog).filter(FitnessLog.date == date.today()).first()
            if not today_log:
                msg = "Сьогодні активність ще не синхронізована (0 кроків). Запустіть швидку команду Apple Health!"
            else:
                msg = f"🏃 За сьогодні: {today_log.steps} кроків ({today_log.distance_km} км, {today_log.flights_climbed} поверхів, {today_log.calories} ккал)."
            return {
                "intent": "fitness",
                "reply": msg,
                "summary": "Активність за сьогодні",
                "created": today_log
            }
        else:
            steps = int(data.get("steps") or 0)
            dist = float(data.get("distance_km") or round(steps * 0.00075, 2))
            w_type = data.get("workout_type", "general")
            today = date.today()
            existing = db.query(FitnessLog).filter(FitnessLog.date == today, FitnessLog.workout_type == w_type).first()
            if existing:
                existing.steps = steps if steps > 0 else existing.steps
                existing.distance_km = dist if dist > 0 else existing.distance_km
                db.commit()
                db.refresh(existing)
                saved = existing
            else:
                saved = FitnessLog(
                    date=today,
                    steps=steps,
                    distance_km=dist,
                    workout_type=w_type,
                    created_at=datetime.utcnow()
                )
                db.add(saved)
                db.commit()
                db.refresh(saved)
            msg = f"Записано активність: {saved.steps} кроків ({saved.distance_km} км)"
            return {
                "intent": "fitness",
                "reply": msg,
                "summary": msg,
                "created": {"id": saved.id, "steps": saved.steps}
            }

    # 6. FINANCE / SHOPPING / TASKS / MEDIA (делегуємо стандартному збереженню)
    else:
        # Fallback to standard process router behavior
        from app.routers.process import _save_parsed_actions
        action_dict = [{"domain": parsed_intent, "data": data}]
        created = _save_parsed_actions(action_dict, db)
        return {
            "intent": parsed_intent,
            "reply": summary or "Дію збережено",
            "summary": summary or "Збережено",
            "created": created
        }
