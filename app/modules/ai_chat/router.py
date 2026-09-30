import logging
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc

from app.config import settings
from app.database import get_db
from app.auth import verify_secret_key
from app.modules.ai_chat.models import AIChatMessage
from app.modules.ai_chat.schemas import (
    AIChatRequest,
    AIChatMessageResponse,
    AIChatHistoryResponse,
)

logger = logging.getLogger("my_secretary.ai_chat")

ai_chat_router = APIRouter(
    prefix="/ai-chat",
    tags=["AI Chat & Assistant"],
    dependencies=[Depends(verify_secret_key)],
)

SYSTEM_PROMPT = """Ти — розумний, досвідчений та доброзичливий персональний AI-співрозмовник («Мій Секретар»).
Користувач звертається до тебе за порадами, бесідою або аналізом.
Ти вільно володієш українською та російською мовами (відповідай тією ж мовою, якою запитує користувач).

Твої ключові навички:
1. ⚖️ ПОРІВНЯННЯ РЕЧЕЙ ТА ТЕХНІКИ:
   - Коли користувач просить порівняти інструменти, матеріали, авто, смартфони або техніку — зроби чітке, практичне порівняння.
   - Виділи плюси, мінуси, надійність, ремонтопридатність і що краще обрати для конкретних завдань.
2. 🛒 ПОШУК ДЕ КУПИТИ ТА ЦІНИ:
   - Підказуй, де зазвичай вигідніше купувати в Україні (онлайн: Rozetka, Prom.ua, OLX, Hotline, Епіцентр; офлайн: ринки, будівельні бази, спеціалізовані магазини).
   - Пояснюй різницю між оригіналом і дешевими копіями, як не переплатити.
3. 🛠️ ПРАКТИЧНІ ПОРАДИ ТА БЕСІДА:
   - Відповідай на питання щодо ремонту, будівництва, електрики, авто, бізнесу або повсякденного життя.
   - Спілкуйся легко, конструктивно, підтримуй діалог.
   - Форматуй відповідь зручно: використовуй списки, жирний шрифт для ключових думок та емодзі для наочності.
"""


@ai_chat_router.get("/history", response_model=AIChatHistoryResponse)
def get_chat_history(limit: int = 50, db: Session = Depends(get_db)):
    """Отримати історію повідомлень поточного користувача."""
    messages = (
        db.query(AIChatMessage)
        .order_by(asc(AIChatMessage.created_at))
        .limit(limit)
        .all()
    )
    return AIChatHistoryResponse(messages=messages)


@ai_chat_router.delete("/history")
def clear_chat_history(db: Session = Depends(get_db)):
    """Очистити історію чату (почати новий діалог)."""
    count = db.query(AIChatMessage).delete()
    db.commit()
    return {"status": "ok", "deleted_messages": count}


@ai_chat_router.post("/message", response_model=AIChatMessageResponse)
async def send_chat_message(payload: AIChatRequest, db: Session = Depends(get_db)):
    """Надіслати повідомлення AI-співрозмовнику та отримати відповідь."""
    user_msg_text = payload.message.strip()
    if not user_msg_text:
        raise HTTPException(status_code=400, detail="Повідомлення не може бути порожнім")

    # 1. Save user message to database
    user_msg = AIChatMessage(
        role="user",
        content=user_msg_text,
        created_at=datetime.utcnow()
    )
    db.add(user_msg)
    db.commit()
    db.refresh(user_msg)

    # 2. Load context history (last 8 messages)
    history_records = []
    if payload.include_history:
        history_records = (
            db.query(AIChatMessage)
            .filter(AIChatMessage.id != user_msg.id)
            .order_by(desc(AIChatMessage.created_at))
            .limit(8)
            .all()
        )
        history_records.reverse()

    # 3. Call Gemini
    api_key = settings.GEMINI_API_KEY.strip() if settings.GEMINI_API_KEY else ""
    if not api_key:
        ai_reply_text = "⚠️ Для роботи AI-чату вкажіть GEMINI_API_KEY у файлі налаштувань .env"
    else:
        ai_reply_text = ""
        models_to_try = [settings.AI_MODEL, "gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3.8-flash"]
        models_to_try = list(dict.fromkeys([m for m in models_to_try if m]))

        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=api_key)
            contents = []

            for h in history_records:
                role_val = "user" if h.role == "user" else "model"
                contents.append(types.Content(role=role_val, parts=[types.Part.from_text(text=h.content)]))

            contents.append(types.Content(role="user", parts=[types.Part.from_text(text=user_msg_text)]))

            for model_name in models_to_try:
                try:
                    resp = client.models.generate_content(
                        model=model_name,
                        contents=contents,
                        config=types.GenerateContentConfig(
                            system_instruction=SYSTEM_PROMPT,
                            temperature=0.3,
                        )
                    )
                    if resp and resp.text:
                        ai_reply_text = resp.text.strip()
                        break
                except Exception as m_err:
                    logger.warning(f"AI chat model {model_name} failed: {m_err}. Trying next...")
                    continue

        except Exception as e:
            logger.error(f"GenAI client error in chat: {e}", exc_info=True)
            ai_reply_text = f"Вибачте, виникла тимчасова помилка з'єднання з ШІ: {str(e)}"

        if not ai_reply_text:
            ai_reply_text = "Не вдалося отримати відповідь від ШІ. Будь ласка, спробуйте ще раз через кілька секунд."

    # 4. Save assistant response to database
    ai_msg = AIChatMessage(
        role="assistant",
        content=ai_reply_text,
        created_at=datetime.utcnow()
    )
    db.add(ai_msg)
    db.commit()
    db.refresh(ai_msg)

    return ai_msg
