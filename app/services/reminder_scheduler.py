"""
Планувальник Telegram-нагадувань + авто-реєстрація webhook.
Кожну хвилину перевіряє tasks у всіх БД і надсилає нагадування.
Також стежить за зміною tunnel URL і автоматично оновлює Telegram webhook.
"""
import asyncio
import logging
import os
import sqlite3
from datetime import datetime, timezone

logger = logging.getLogger("secretary.reminder_scheduler")

TUNNEL_FILE = r"C:\Users\Administrator\logs\current_tunnel_url.txt"
_last_registered_webhook: str = ""


async def _auto_register_webhook():
    """Якщо tunnel URL змінився — автоматично перереєструвати Telegram webhook."""
    global _last_registered_webhook
    from app.services.telegram_service import set_webhook, get_webhook_info
    from app.config import settings

    if not settings.TELEGRAM_BOT_TOKEN:
        return

    try:
        # Читаємо поточний URL тунелю
        if not os.path.exists(TUNNEL_FILE):
            return
        with open(TUNNEL_FILE, "r", encoding="utf-8") as f:
            tunnel_url = f.read().strip()
        if not tunnel_url.startswith("https://"):
            return

        new_webhook = f"{tunnel_url}/api/v1/telegram/webhook"

        # Перевіряємо поточно зареєстрований webhook у Telegram
        if _last_registered_webhook == new_webhook:
            return  # Нічого не змінилось

        info = await get_webhook_info()
        current = info.get("result", {}).get("url", "")

        if current != new_webhook:
            secret_token = settings.TELEGRAM_WEBHOOK_SECRET.strip() if settings.TELEGRAM_WEBHOOK_SECRET else None
            result = await set_webhook(new_webhook, secret_token=secret_token)
            if result.get("ok"):
                _last_registered_webhook = new_webhook
                logger.info(f"✅ Telegram webhook auto-updated: {new_webhook}")
            else:
                logger.warning(f"Failed to update webhook: {result}")
        else:
            _last_registered_webhook = new_webhook  # sync local cache
    except Exception as e:
        logger.error(f"_auto_register_webhook error: {e}")


def _get_all_db_paths() -> list[str]:
    """Повертає шлях до головної БД та всіх user-БД."""
    paths = ["secretary.db"]
    user_dir = "data/users"
    if os.path.isdir(user_dir):
        for f in os.listdir(user_dir):
            if f.endswith(".db"):
                paths.append(os.path.join(user_dir, f))
    return paths


def _get_phone_from_db_path(db_path: str) -> str | None:
    """Витягує номер телефону з імені файлу user-БД."""
    basename = os.path.basename(db_path)
    if basename == "secretary.db":
        return None
    # secretary_380671234567.db → 380671234567
    name = basename.replace("secretary_", "").replace(".db", "")
    return name if name else None


def _get_tg_chat_id(phone: str | None) -> str | None:
    """Шукає Telegram chat_id за номером телефону у головній БД."""
    if not phone:
        return None
    try:
        conn = sqlite3.connect("secretary.db")
        clean = phone.strip().lstrip("+").replace(" ", "")
        row = conn.execute(
            "SELECT chat_id FROM telegram_users WHERE phone=? OR phone=? LIMIT 1",
            (clean, "+" + clean),
        ).fetchone()
        conn.close()
        return row[0] if row else None
    except Exception as e:
        logger.error(f"get_tg_chat_id error: {e}")
        return None


async def _check_and_send_reminders():
    """Перевіряє всі БД і надсилає Telegram-нагадування для завдань з remind_at <= зараз."""
    from app.services.telegram_service import send_task_reminder

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    for db_path in _get_all_db_paths():
        phone = _get_phone_from_db_path(db_path)
        chat_id = _get_tg_chat_id(phone)

        if not chat_id:
            continue  # Користувач не прив'язав Telegram

        try:
            conn = sqlite3.connect(db_path)
            # Перевіряємо чи є колонка remind_at
            cols = [r[1] for r in conn.execute("PRAGMA table_info(tasks)").fetchall()]
            if "remind_at" not in cols:
                conn.close()
                continue

            due_tasks = conn.execute(
                """SELECT id, title, due_date, category, priority
                   FROM tasks
                   WHERE remind_at IS NOT NULL
                     AND remind_at <= ?
                     AND (reminder_sent = 0 OR reminder_sent IS NULL)
                     AND is_completed = 0""",
                (now_iso,),
            ).fetchall()

            for task_id, title, due_date, category, priority in due_tasks:
                logger.info(f"Sending reminder for task {task_id} to chat_id {chat_id}")
                result = await send_task_reminder(
                    chat_id=chat_id,
                    task_title=title,
                    due_date=due_date,
                    category=category or "",
                    priority=priority or "medium",
                )
                if result.get("ok"):
                    conn.execute(
                        "UPDATE tasks SET reminder_sent=1 WHERE id=?", (task_id,)
                    )
                    conn.commit()
                    logger.info(f"Reminder sent for task {task_id}")
                else:
                    logger.warning(f"Failed to send reminder: {result}")

            conn.close()
        except Exception as e:
            logger.error(f"Reminder check error for {db_path}: {e}")


async def start_reminder_scheduler():
    """Запускає нескінченний цикл перевірки нагадувань кожну хвилину.
    Також автоматично оновлює Telegram webhook якщо tunnel URL змінився."""
    logger.info("Reminder scheduler started — checking every 60 seconds")
    # Check webhook immediately on startup
    await _auto_register_webhook()
    while True:
        try:
            await _check_and_send_reminders()
            await _auto_register_webhook()  # re-registers if tunnel URL changed
        except Exception as e:
            logger.error(f"Scheduler iteration error: {e}")
        await asyncio.sleep(60)
