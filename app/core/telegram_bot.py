import logging
from typing import Dict, Any, List, Optional
import httpx
from sqlalchemy.orm import Session

from app.config import settings

logger = logging.getLogger("my_secretary.telegram_bot")

TELEGRAM_API_BASE = "https://api.telegram.org"


async def send_telegram_message(
    chat_id: str,
    text: str,
    parse_mode: str = "HTML"
) -> Dict[str, Any]:
    """
    Відправляє повідомлення у Telegram користувачу або члену сім'ї.
    При відсутності токена безпечно імітує успішну відправку.
    """
    token = settings.TELEGRAM_BOT_TOKEN.strip() if settings.TELEGRAM_BOT_TOKEN else ""
    if not token:
        logger.info(f"[SIMULATED TELEGRAM] To: {chat_id} | Message:\n{text}")
        return {
            "ok": True,
            "simulated": True,
            "result": {
                "message_id": 1001,
                "text": text
            }
        }

    url = f"{TELEGRAM_API_BASE}/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
        "disable_web_page_preview": True,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload)
            data = resp.json()
            if not data.get("ok"):
                logger.error(f"Telegram API error: {data}")
            return data
    except Exception as e:
        logger.error(f"Failed to send Telegram message to {chat_id}: {e}")
        return {"ok": False, "error": str(e), "simulated": False}


async def send_delegated_list(
    db: Session,
    contact: Any,
    domain: str = "shopping",
    custom_message: Optional[str] = None
) -> Dict[str, Any]:
    """
    Форматує та відправляє список покупок або завдань обраному члену сім'ї.
    """
    chat_id = contact.telegram_chat_id
    if not chat_id:
        return {
            "status": "error",
            "message": f"У контакта «{contact.name}» не вказано Telegram Chat ID або username.",
            "sent": False
        }

    lines = []
    if custom_message:
        lines.append(f"💬 <i>{custom_message}</i>\n")

    if domain == "shopping":
        from app.models.shopping import ShoppingItem
        items = db.query(ShoppingItem).filter(ShoppingItem.is_purchased.is_(False)).all()
        if not items:
            lines.append("🛒 <b>Список покупок порожній!</b> Усе вже куплено 🎉")
        else:
            lines.append("🛒 <b>Список покупок:</b>\n")
            for idx, it in enumerate(items, 1):
                qty = f" ({it.quantity})" if it.quantity else ""
                lines.append(f"{idx}. ▫️ <b>{it.item}</b>{qty}")

    elif domain == "tasks":
        from app.models.tasks import Task
        tasks = db.query(Task).filter(Task.is_completed.is_(False)).limit(15).all()
        if not tasks:
            lines.append("✅ <b>Активних завдань немає!</b>")
        else:
            lines.append("📋 <b>Список актуальних справ:</b>\n")
            for idx, t in enumerate(tasks, 1):
                due = f" <i>(до {t.due_date.strftime('%d.%m %H:%M')})</i>" if t.due_date else ""
                lines.append(f"{idx}. ▫️ <b>{t.title}</b>{due}")

    lines.append("\n🤖 <i>Надіслано через «Мій Секретар»</i>")
    message_text = "\n".join(lines)

    tg_res = await send_telegram_message(chat_id=chat_id, text=message_text)
    is_ok = tg_res.get("ok", False)
    simulated = tg_res.get("simulated", False)
    msg_id = tg_res.get("result", {}).get("message_id") if is_ok else None

    return {
        "status": "success" if is_ok else "failed",
        "contact_name": contact.name,
        "message_sent": message_text,
        "telegram_message_id": msg_id,
        "simulated": simulated,
        "sent": is_ok
    }


async def process_telegram_webhook_update(update: Dict[str, Any], db: Session) -> Dict[str, Any]:
    """
    Обробляє вхідне повідомлення від члена сім'ї через Telegram Webhook.
    """
    msg = update.get("message") or update.get("edited_message")
    if not msg:
        return {"status": "ignored", "reason": "no_message"}

    chat_id = str(msg.get("chat", {}).get("id"))
    username = msg.get("from", {}).get("username")

    from app.modules.delegation.models import FamilyContact
    contact = db.query(FamilyContact).filter(
        (FamilyContact.telegram_chat_id == chat_id) |
        (FamilyContact.telegram_chat_id == f"@{username}" if username else False)
    ).first()

    if not contact or not contact.can_add_items:
        await send_telegram_message(
            chat_id=chat_id,
            text="🔒 <b>Доступ обмежено.</b> Ваш акаунт ще не додано до списку довірених контактів у «Моєму Секретарі»."
        )
        return {"status": "unauthorized", "chat_id": chat_id}

    text = msg.get("text", "").strip()
    if not text:
        await send_telegram_message(
            chat_id=chat_id,
            text=f"Привіт, {contact.name}! Надішліть текстом те, що потрібно додати (наприклад: «Купи хліб та банани»)."
        )
        return {"status": "empty_text"}

    from app.services.ai_parser import parse_with_gemini
    parsed = await parse_with_gemini(text=text)
    actions = parsed.get("actions", [])

    # Додаємо мітку автора до кожного товару або завдання
    author_tag = f"[від {contact.name}]"
    for action in actions:
        domain = action.get("domain")
        data = action.get("data", {})
        if domain == "shopping" and "item" in data:
            data["item"] = f"{data['item']} {author_tag}"
        elif domain == "tasks" and "title" in data:
            data["title"] = f"{data['title']} {author_tag}"

    from app.routers.process import _save_parsed_actions
    created = _save_parsed_actions(actions, db)
    summary = parsed.get("summary", "Запис додано")

    reply_text = f"✅ <b>Дякую, {contact.name}!</b>\n{summary}\nЗапис зʼявився у Секретаря."
    await send_telegram_message(chat_id=chat_id, text=reply_text)

    return {
        "status": "success",
        "contact": contact.name,
        "summary": summary,
        "created": created
    }
