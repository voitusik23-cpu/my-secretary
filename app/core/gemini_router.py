import json
import re
import logging
from datetime import datetime, date
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.config import settings
from app.database import get_db
from app.auth import verify_secret_key
from app.core.web_agent import perform_web_search
from app.core.undo_service import record_action, undo_last_action
from app.core.telegram_bot import send_delegated_list
from app.modules.delegation.models import FamilyContact
from app.modules.inventory.models import InventoryItem
from app.modules.auto.models import AutoLog
from app.modules.utilities.models import UtilityReading
from app.modules.fitness.models import FitnessLog
from app.modules.auto.router import get_auto_status
from app.modules.inventory.router import query_location

logger = logging.getLogger("my_secretary.gemini_router")

router = APIRouter(tags=["Gemini Extended Router"], dependencies=[Depends(verify_secret_key)])

EXTENDED_CLASSIFICATION_INSTRUCTION = """Ти — інтелектуальний персональний асистент Секретаря.
Визнач намір (intent) користувача та витягни структуровані дані.

Доступні наміри (intents):
1. "undo" — скасування останньої дії ("відміни останнє", "отмени последнее", "удали то что только что записал", "скасуй").
2. "delegation" — відправити список покупок/завдань сім'ї ("відправ покупки дружині", "скинь задачу доньці"). recipient: wife/daughter/ім'я, domain: "shopping"|"tasks".
3. "finance" — витрати/доходи (сума, категорія, валюта: UAH/USD/EUR).
4. "shopping" — список покупок (item, category, quantity).
5. "tasks" — завдання і нагадування (title, due_date, priority).
6. "media_notes" — фільми, книги, замітки (title, type, comment).
7. "inventory" — пошук або збереження речей ("де паспорт", "поклав ключі в тумбочку"). action: "query"|"add", item_name, location.
8. "auto" — авто ("запиши пробіг 120000", "заміна масла", "коли ТО"). action: "status"|"log", event_type, current_mileage, notes.
9. "utility" — показники лічильників ("світло 1234", "вода 45", "газ 780"). meter_type, reading_value.
10. "fitness" — спорт/активність ("скільки кроків", "лижні спуски", "запиши 10000 кроків"). action: "query_steps"|"query_skiing"|"log", steps, distance_km.
11. "web_search" — пошук в інтернеті, факти, погода, курс валют.

Поточна дата: {current_time}.
Формат відповіді СУВОРО JSON:
{{"intent": "...", "summary": "Коротке резюме", "data": {{ ... }}}}
Без markdown.
"""


class ProcessRequest(BaseModel):
    text: str = Field(..., description="Текст запиту або розпізнаного голосу")


@router.post("/gemini/process")
async def process_intent(payload: ProcessRequest, db: Session = Depends(get_db)):
    """Головний інтелектуальний диспетчер намірів користувача."""
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Текст запиту не може бути порожнім")

    lower = text.lower()
    # Швидка евристика для Undo без звернення до LLM
    if any(k in lower for k in ["отмени последнее", "отменить последнее", "удали то что", "скасуй останнє", "відміни останнє"]):
        return undo_last_action(db)

    api_key = settings.GEMINI_API_KEY.strip() if settings.GEMINI_API_KEY else ""
    parsed_intent = "web_search"
    summary, data = "Запит оброблено", {}

    if api_key:
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=api_key)
            prompt = EXTENDED_CLASSIFICATION_INSTRUCTION.format(current_time=datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"))
            res = client.models.generate_content(
                model=settings.AI_MODEL,
                contents=text,
                config=types.GenerateContentConfig(system_instruction=prompt, response_mime_type="application/json", temperature=0.1)
            )
            raw = (res.text or "").strip()
            if "```" in raw:
                m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw)
                if m: raw = m.group(1).strip()
            parsed = json.loads(raw)
            parsed_intent = parsed.get("intent", "web_search")
            summary = parsed.get("summary", "")
            data = parsed.get("data", {})
        except Exception as e:
            logger.warning(f"Intent routing AI fallback: {e}")
            if any(k in lower for k in ["відправ", "отправь", "скинь", "поділись", "поделись"]) and any(k in lower for k in ["дружин", "жен", "доньк", "дочк", "telegram"]):
                parsed_intent = "delegation"
                data = {"domain": "shopping" if "покуп" in lower else "tasks", "recipient": "wife" if any(k in lower for k in ["дружин", "жен"]) else "daughter"}
            elif any(k in lower for k in ["де лежить", "де знаходиться", "где лежит"]):
                parsed_intent, data = "inventory", {"action": "query", "item_name": text}
            elif any(k in lower for k in ["пробіг", "масло", "страховка", "пробег"]):
                parsed_intent, data = "auto", {"action": "log", "notes": text}
            elif any(k in lower for k in ["лічильник", "світло", "вода", "газ"]):
                parsed_intent = "utility"
            elif any(k in lower for k in ["крок", "шаг", "лиж", "лыж"]):
                parsed_intent, data = "fitness", {"action": "query_skiing" if ("лиж" in lower or "лыж" in lower) else "query_steps"}
            else:
                parsed_intent = "web_search"

    # 1. UNDO
    if parsed_intent == "undo":
        return undo_last_action(db)

    # 2. DELEGATION (Telegram Family Share)
    if parsed_intent == "delegation":
        recipient = (data.get("recipient") or "").lower()
        contact = None
        if recipient:
            contact = db.query(FamilyContact).filter(
                (FamilyContact.relationship.ilike(f"%{recipient}%")) |
                (FamilyContact.name.ilike(f"%{recipient}%"))
            ).first()
        if not contact:
            contact = db.query(FamilyContact).first()

        if not contact:
            return {"intent": "delegation", "reply": "Не знайдено жодного контакту сім'ї. Додайте дружину або доньку в налаштуваннях!", "summary": "Контакт не знайдено"}

        del_res = await send_delegated_list(db=db, contact=contact, domain=data.get("domain", "shopping"))
        msg = f"✅ Список успішно надіслано {contact.name} в Telegram!" if del_res.get("sent") else f"⚠️ Не вдалося відправити: {del_res.get('message')}"
        return {"intent": "delegation", "reply": msg, "summary": msg, "created": del_res}

    # 3. WEB SEARCH
    if parsed_intent == "web_search":
        s_res = await perform_web_search(text)
        return {"intent": "web_search", "reply": s_res["answer"], "summary": "Знайдено в інтернеті", "sources": s_res.get("sources", []), "created": None}

    # 4. INVENTORY
    if parsed_intent == "inventory":
        if data.get("action") == "query" or not data.get("location"):
            s_resp = query_location(q=data.get("item_name") or text, db=db)
            return {"intent": "inventory", "reply": s_resp.message, "summary": s_resp.message, "created": s_resp.items}
        item_name, loc = data.get("item_name", "").strip() or text, data.get("location", "Вдома")
        item = InventoryItem(user_id="default", item_name=item_name, encrypted_location=loc, updated_at=datetime.utcnow())
        db.add(item); db.commit(); db.refresh(item)
        record_action("inventory", [item.id], f"Речі: {item_name}")
        msg = f"Збережено: «{item_name}» знаходиться в «{loc}»"
        return {"intent": "inventory", "reply": msg, "summary": msg, "created": {"id": item.id, "item_name": item_name}}

    # 5. AUTO
    if parsed_intent == "auto":
        if data.get("action") == "status" or any(k in lower for k in ["коли то", "статус авто", "коли міняти"]):
            st = get_auto_status(db=db)
            msg = f"{st.service_status_message}\n{st.insurance_status_message}"
            return {"intent": "auto", "reply": msg, "summary": "Статус автомобіля", "created": st}
        log = AutoLog(event_type=data.get("event_type", "mileage"), current_mileage=data.get("current_mileage"), encrypted_notes=data.get("notes") or text, created_at=datetime.utcnow())
        db.add(log); db.commit(); db.refresh(log)
        record_action("auto", [log.id], f"Авто: {log.event_type}")
        msg = f"Записано в гараж: {log.event_type}"
        return {"intent": "auto", "reply": msg, "summary": msg, "created": {"id": log.id}}

    # 6. UTILITY
    if parsed_intent == "utility":
        m_type, val = data.get("meter_type", "electricity").lower(), float(data.get("reading_value", 0))
        prev = db.query(UtilityReading).filter(UtilityReading.meter_type == m_type).order_by(UtilityReading.recorded_at.desc()).first()
        delta = round(val - prev.reading_value, 2) if (prev and prev.reading_value is not None) else None
        rd = UtilityReading(meter_type=m_type, reading_value=val, previous_value=prev.reading_value if prev else None, delta=delta, recorded_at=datetime.utcnow())
        db.add(rd); db.commit(); db.refresh(rd)
        record_action("utility", [rd.id], f"Показник: {m_type} {val}")
        msg = f"Показники {m_type}: {val}" + (f" (+{delta})" if delta is not None else "")
        return {"intent": "utility", "reply": msg, "summary": msg, "created": {"id": rd.id, "reading": val}}

    # 7. FITNESS
    if parsed_intent == "fitness":
        action = data.get("action", "")
        if "лиж" in lower or "лыж" in lower or action == "query_skiing":
            skis = db.query(FitnessLog).filter(FitnessLog.workout_type == "skiing").order_by(desc(FitnessLog.date)).limit(5).all()
            msg = "🎿 Ваші лижні спуски:\n" + "\n".join([f"• {s.date}: {s.distance_km} км" for s in skis]) if skis else "🎿 Записів про лижні спуски поки немає."
            return {"intent": "fitness", "reply": msg, "summary": "Лижні спуски", "created": None}
        if any(k in lower for k in ["скільки", "сколько", "статистика"]) or not data.get("steps"):
            t_log = db.query(FitnessLog).filter(FitnessLog.date == date.today()).first()
            msg = f"🏃 За сьогодні: {t_log.steps} кроків ({t_log.distance_km} км)" if t_log else "Сьогодні активність ще не синхронізована (0 кроків)."
            return {"intent": "fitness", "reply": msg, "summary": "Активність", "created": t_log}
        steps = int(data.get("steps") or 0)
        dist = float(data.get("distance_km") or round(steps * 0.00075, 2))
        f_log = FitnessLog(date=date.today(), steps=steps, distance_km=dist, workout_type=data.get("workout_type", "general"), created_at=datetime.utcnow())
        db.add(f_log); db.commit(); db.refresh(f_log)
        record_action("fitness", [f_log.id], f"Фітнес: {steps} кроків")
        msg = f"Записано активність: {steps} кроків"
        return {"intent": "fitness", "reply": msg, "summary": msg, "created": {"id": f_log.id}}

    # 8. STANDARD ROUTER (Finance, Shopping, Tasks, Media)
    from app.routers.process import _save_parsed_actions
    created = _save_parsed_actions([{"domain": parsed_intent, "data": data}], db)
    return {"intent": parsed_intent, "reply": summary or "Дію збережено", "summary": summary or "Збережено", "created": created}
