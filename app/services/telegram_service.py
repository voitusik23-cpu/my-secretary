"""
Telegram Bot Service — MySecretaryOdessaBot
Відправка нагадувань і обробка команд від користувачів.
"""
import logging
import httpx
from typing import Optional
from app.config import settings

logger = logging.getLogger("secretary.telegram")

TELEGRAM_API = "https://api.telegram.org/bot{token}/{method}"


async def tg_request(method: str, payload: dict) -> dict:
    """Виконати запит до Telegram Bot API."""
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        return {"ok": False, "error": "No token"}
    url = TELEGRAM_API.format(token=token, method=method)
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(url, json=payload)
            return r.json()
    except Exception as e:
        logger.error(f"Telegram request failed: {e}")
        return {"ok": False, "error": str(e)}


async def send_message(chat_id: str, text: str, reply_markup: Optional[dict] = None) -> dict:
    """Надіслати текстове повідомлення."""
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
    return await tg_request("sendMessage", payload)


async def send_task_reminder(chat_id: str, task_title: str, due_date: Optional[str], category: str = "", priority: str = "medium") -> dict:
    """Надіслати нагадування про завдання з кнопками дії."""
    prio_icon = {"high": "🔥", "medium": "⚡", "low": "☕"}.get(priority, "⚡")
    cat_icon = {
        "Здоров'я": "❤️", "Роботи": "🔨", "Документи": "📄",
        "Фінанси": "💳", "Сім'я": "👨‍👩‍👧", "Авто": "🚗",
        "Покупки": "🛍️", "Особисте": "👤",
    }.get(category, "📌")

    due_str = ""
    if due_date:
        from datetime import datetime
        try:
            dt = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
            due_str = f"\n⏰ <b>Дедлайн:</b> {dt.strftime('%d.%m.%Y о %H:%M')}"
        except Exception:
            due_str = f"\n⏰ {due_date}"

    text = (
        f"🔔 <b>Нагадування!</b>\n\n"
        f"{cat_icon} <b>{task_title}</b>{due_str}\n"
        f"{prio_icon} Пріоритет: {priority}\n\n"
        f"Час не забути про цю справу! 💪"
    )

    markup = {
        "inline_keyboard": [[
            {"text": "✅ Виконано", "callback_data": f"done_task"},
            {"text": "⏰ Нагадати через 1 год", "callback_data": f"snooze_1h"},
        ]]
    }

    return await send_message(chat_id, text, markup)


async def set_webhook(webhook_url: str, secret_token: Optional[str] = None) -> dict:
    """Зареєструвати webhook URL у Telegram з підтримкою secret_token."""
    payload = {
        "url": webhook_url,
        "allowed_updates": ["message", "callback_query"],
        "drop_pending_updates": True,
    }
    if secret_token:
        payload["secret_token"] = secret_token
    return await tg_request("setWebhook", payload)


async def delete_webhook() -> dict:
    return await tg_request("deleteWebhook", {"drop_pending_updates": True})


async def get_webhook_info() -> dict:
    return await tg_request("getWebhookInfo", {})
