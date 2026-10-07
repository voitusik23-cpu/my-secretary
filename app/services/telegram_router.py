"""
Telegram Webhook Router — обробка вхідних повідомлень від бота.
Безпека:
- Перевірка X-Telegram-Bot-Api-Secret-Token (якщо налаштовано TELEGRAM_WEBHOOK_SECRET)
- Захист ендпоінтів конфігурації через verify_secret_key
- Безпечна прив'язка через одноразові коди
"""
import hmac
import random
import logging
import sqlite3
from datetime import datetime, timedelta
from fastapi import APIRouter, Request, Response, Depends, HTTPException, status
from app.config import settings
from app.auth import verify_secret_key
from app.services.telegram_service import send_message, send_task_reminder

logger = logging.getLogger("secretary.telegram_router")

telegram_router = APIRouter(prefix="/telegram", tags=["Telegram"])

WELCOME_TEXT = (
    "👋 Привіт! Я <b>MySecretaryOdessa</b> — ваш особистий секретар.\n\n"
    "Тепер вам будуть приходити нагадування про важливі справи прямо сюди!\n\n"
    "📋 /tasks — подивитись активні завдання\n"
    "❓ /help — допомога\n\n"
    "Гарного дня! 🌟"
)


import secrets

def get_tg_db():
    """Повертає з'єднання з головною БД та гарантує наявність потрібних таблиць."""
    conn = sqlite3.connect("secretary.db")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS telegram_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id TEXT UNIQUE NOT NULL,
            phone TEXT,
            username TEXT,
            first_name TEXT,
            linked_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS telegram_link_codes (
            code TEXT PRIMARY KEY,
            phone TEXT NOT NULL,
            attempts INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL
        )
    """)
    conn.commit()
    return conn


def save_telegram_user(chat_id: str, phone: str, first_name: str = "", username: str = ""):
    """Зберегти або оновити прив'язку Telegram chat_id -> номер телефону."""
    conn = get_tg_db()
    try:
        conn.execute(
            """INSERT INTO telegram_users (chat_id, phone, first_name, username, linked_at)
               VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT(chat_id) DO UPDATE SET
                 phone=excluded.phone,
                 first_name=excluded.first_name,
                 username=excluded.username,
                 linked_at=CURRENT_TIMESTAMP""",
            (str(chat_id), phone.strip(), first_name, username),
        )
        conn.commit()
        logger.info(f"Telegram user successfully linked: chat_id={chat_id} phone={phone}")
    except Exception as e:
        logger.error(f"save_telegram_user error: {e}")
    finally:
        conn.close()


def verify_and_consume_code(code: str) -> str | None:
    """Перевіряє одноразовий код підтвердження та повертає прив'язаний телефон."""
    conn = get_tg_db()
    try:
        now_iso = datetime.utcnow().isoformat()
        row = conn.execute(
            "SELECT phone FROM telegram_link_codes WHERE code=? AND expires_at > ?",
            (code.strip(), now_iso)
        ).fetchone()
        if row:
            phone = row[0]
            # Видаляємо використаний код
            conn.execute("DELETE FROM telegram_link_codes WHERE code=?", (code.strip(),))
            conn.commit()
            return phone
        return None
    except Exception as e:
        logger.error(f"verify_and_consume_code error: {e}")
        return None
    finally:
        conn.close()


@telegram_router.post("/webhook")
async def telegram_webhook(request: Request):
    """
    Приймає updates від Telegram Bot API.
    Захищено перевіркою X-Telegram-Bot-Api-Secret-Token.
    """
    expected_secret = settings.TELEGRAM_WEBHOOK_SECRET.strip() if settings.TELEGRAM_WEBHOOK_SECRET else ""
    if expected_secret:
        received_secret = request.headers.get("x-telegram-bot-api-secret-token", "")
        if not hmac.compare_digest(received_secret, expected_secret):
            logger.warning("Rejected Telegram webhook update: invalid secret token header")
            return Response(status_code=status.HTTP_403_FORBIDDEN)

    try:
        data = await request.json()
    except Exception:
        return Response(status_code=200)

    message = data.get("message", {})
    callback = data.get("callback_query", {})

    if message:
        chat_id = str(message.get("chat", {}).get("id", ""))
        text = (message.get("text") or "").strip()
        first_name = message.get("from", {}).get("first_name", "")
        username = message.get("from", {}).get("username", "")

        if text.startswith("/start"):
            parts = text.split(maxsplit=1)
            arg = parts[1].strip() if len(parts) > 1 else ""

            if arg:
                # Перевіряємо чи це одноразовий код авторизації
                verified_phone = verify_and_consume_code(arg)
                if verified_phone:
                    save_telegram_user(chat_id, verified_phone, first_name, username)
                    await send_message(chat_id,
                        f"✅ Чудово, <b>{first_name or 'друже'}</b>!\n\n"
                        f"Ваш Telegram успішно прив'язано до номера <b>{verified_phone}</b>.\n"
                        f"Тепер нагадування про завдання будуть приходити сюди! 🔔\n\n"
                        + WELCOME_TEXT
                    )
                else:
                    await send_message(chat_id,
                        "⚠️ <b>Код недійсний або закінчився його термін дії.</b>\n\n"
                        "Будь ласка, згенеруйте новий код у додатку (розділ Налаштування)."
                    )
            else:
                await send_message(chat_id, WELCOME_TEXT)

        elif text.startswith("/tasks"):
            await send_message(chat_id,
                "📋 Щоб переглянути завдання — відкрийте додаток за вашим захищеним посиланням."
            )

        elif text.startswith("/help"):
            await send_message(chat_id,
                "❓ <b>Допомога</b>\n\n"
                "🔔 Нагадування приходять автоматично коли настає час\n"
                "📋 /tasks — активні завдання\n"
                "🔗 Щоб прив'язати акаунт: відкрийте додаток → Налаштування → Отримати код підключення"
            )

    if callback:
        chat_id = str(callback.get("from", {}).get("id", ""))
        cb_data = callback.get("data", "")
        if cb_data == "done_task":
            await send_message(chat_id, "✅ Справу відмічено як виконану.")
        elif cb_data == "snooze_1h":
            await send_message(chat_id, "⏰ Нагадаю ще раз через годину!")

    return Response(status_code=200)


@telegram_router.post("/generate-link-code")
async def generate_link_code(request: Request, _: bool = Depends(verify_secret_key)):
    """
    Генерує безпечний одноразовий 6-значний код для зв'язку Telegram з телефоном.
    Діє 15 хвилин. Доступ захищено verify_secret_key.
    """
    body = await request.json()
    phone = body.get("phone", "").strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Phone is required")

    # Cryptographically secure 6-digit random code
    code = f"{secrets.randbelow(900000) + 100000}"
    expires_at = (datetime.utcnow() + timedelta(minutes=15)).isoformat()

    conn = get_tg_db()
    try:
        conn.execute("INSERT OR REPLACE INTO telegram_link_codes (code, phone, expires_at) VALUES (?, ?, ?)",
                     (code, phone, expires_at))
        conn.commit()
    finally:
        conn.close()

    bot_username = "MySecretaryOdessaBot"
    return {
        "code": code,
        "expires_in_minutes": 15,
        "deep_link": f"https://t.me/{bot_username}?start={code}"
    }


@telegram_router.post("/setup-webhook")
async def setup_webhook(request: Request, _: bool = Depends(verify_secret_key)):
    """
    Зареєструвати webhook у Telegram.
    СТРОГО ЗАХИЩЕНО через verify_secret_key.
    """
    from app.services.telegram_service import set_webhook
    body = await request.json()
    webhook_url = body.get("webhook_url", "")
    if not webhook_url:
        raise HTTPException(status_code=400, detail="webhook_url required")

    secret_token = settings.TELEGRAM_WEBHOOK_SECRET.strip() if settings.TELEGRAM_WEBHOOK_SECRET else None
    result = await set_webhook(webhook_url, secret_token=secret_token)
    return result


@telegram_router.get("/webhook-info")
async def webhook_info(_: bool = Depends(verify_secret_key)):
    """Перевірка статусу вебхука (лише для авторизованого адміністратора)."""
    from app.services.telegram_service import get_webhook_info
    return await get_webhook_info()
