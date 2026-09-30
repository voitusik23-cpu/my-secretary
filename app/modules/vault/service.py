import json
import re
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from app.config import settings

logger = logging.getLogger("my_secretary.vault.service")

PARSE_VAULT_PROMPT = """Ти — аналітичний помічник для захищеного менеджера паролів та сейфу («Склерозник»).
Твоє завдання — проаналізувати вхідний текст або зображення (фото аркуша з паролями, записки, таблиці чи старого блокнота) та виділити ВСІ облікові записи й доступи.

Для кожного знайденого запису сформуй об'єкт з полями:
- "title": коротка зрозуміла назва (наприклад: "ChatGPT Plus", "Binance", "Discord", "X (Twitter)", "Gmail Особистий", "Wi-Fi Дім 5G", "Apple ID").
- "category": одна з наступних категорій СУВОРО:
    - "ai" — нейромережі та ШІ (ChatGPT, Claude, Midjourney, Perplexity, Cursor, Gemini, ElevenLabs тощо).
    - "social" — соцмережі та месенджери (Discord, X / Twitter, Telegram, Instagram, Facebook, TikTok, LinkedIn, YouTube).
    - "email" — поштові скриньки (Gmail, Ukr.net, Yahoo, Outlook, iCloud Mail, ProtonMail).
    - "crypto" — криптобіржі та гаманці (Binance, Bybit, OKX, WhiteBIT, TrustWallet, MetaMask тощо).
    - "wifi" — мережі Wi-Fi та роутери (назва мережі SSID записується в login, а пароль у password).
    - "devices" — Apple ID, активація iPhone, PIN-коди SIM/телефону, PUK, серійні номери.
    - "other" — інші сайти, магазини, кабінети, банківські кодові слова, замітки.
- "login": логін, email, номер телефону або назва мережі SSID (якщо є, інакше null).
- "password": пароль, WPA ключ від Wi-Fi, 16-значний ключ додатку або PIN (якщо є, інакше null).
- "website_url": офіційний URL сайту для швидкого переходу (наприклад: "https://chatgpt.com", "https://discord.com", "https://x.com", "https://binance.com", "https://mail.google.com"). Якщо це Wi-Fi чи пристрій — null.
- "plan_type": якщо це ШІ чи сервіс: "pro" (якщо згадано Plus, Pro, Premium, платний, передплата) або "free" (якщо безкоштовний/тестовий), інакше null.
- "two_factor_note": якщо є згадка про 2FA, Google Authenticator, SMS чи резервні коди — зазнач тут коротко, інакше null.
- "notes": будь-які корисні примітки, дати оплати, коментарі, кодові фрази чи додаткові дані.

Відповідь СУВОРО у форматі JSON списку:
[
  {
    "title": "...",
    "category": "...",
    "login": "...",
    "password": "...",
    "website_url": "...",
    "plan_type": null,
    "two_factor_note": null,
    "notes": "..."
  }
]
Без markdown-блоків і без зайвого тексту.
"""


def _clean_json_response(raw_text: str) -> List[Dict[str, Any]]:
    """Вичищає JSON з відповіді моделі."""
    clean = raw_text.strip()
    if "```" in clean:
        m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", clean)
        if m:
            clean = m.group(1).strip()

    try:
        data = json.loads(clean)
        if isinstance(data, list):
            return data
        elif isinstance(data, dict):
            # If wrapped in an object like {"items": [...]}
            for v in data.values():
                if isinstance(v, list):
                    return v
            return [data]
        return []
    except Exception as e:
        logger.warning(f"Failed to parse JSON from AI response: {e}\nRaw: {raw_text[:300]}")
        return []


async def parse_text_with_gemini(raw_text: str) -> List[Dict[str, Any]]:
    """Парсить неструктурований текст, CSV або список паролів за допомогою Gemini."""
    if not settings.GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY not set for vault text parser")
        return []

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        models_to_try = [settings.AI_MODEL, "gemini-3.1-flash-lite", "gemini-3.5-flash-lite"]

        for model_name in models_to_try:
            try:
                res = client.models.generate_content(
                    model=model_name,
                    contents=[raw_text],
                    config=types.GenerateContentConfig(
                        system_instruction=PARSE_VAULT_PROMPT,
                        response_mime_type="application/json",
                        temperature=0.1,
                    )
                )
                if res.text:
                    items = _clean_json_response(res.text)
                    if items:
                        return items
            except Exception as ex:
                logger.warning(f"Model {model_name} failed vault parse: {ex}")
                continue

    except Exception as e:
        logger.error(f"Error in parse_text_with_gemini: {e}")

    return []


async def parse_image_with_gemini(image_bytes: bytes, mime_type: str = "image/jpeg") -> List[Dict[str, Any]]:
    """
    Зчитує фото аркуша паперу, блокнота або записки з паролями за допомогою Gemini Vision OCR
    та автоматично перетворює в структуровані облікові записи.
    """
    if not settings.GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY not set for vault image parser")
        return []

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        actual_mime = "image/jpeg"
        if "png" in mime_type.lower():
            actual_mime = "image/png"
        elif "webp" in mime_type.lower():
            actual_mime = "image/webp"

        image_part = types.Part.from_bytes(data=image_bytes, mime_type=actual_mime)
        models_to_try = [settings.AI_MODEL, "gemini-3.1-flash-lite", "gemini-3.5-flash-lite"]

        instruction = PARSE_VAULT_PROMPT + "\nУВАЖНО РОЗПІЗНАЙ РУКОПИСНИЙ АБО ДРУКОВАНИЙ ТЕКСТ З ЦЬОГО ЗОБРАЖЕННЯ ТА ПЕРЕТВОРИ НА СПИСОК ПАРОЛІВ."

        for model_name in models_to_try:
            try:
                res = client.models.generate_content(
                    model=model_name,
                    contents=[image_part, "Розпізнай всі логіни, паролі, сайти, Wi-Fi та ключі з цього фото."],
                    config=types.GenerateContentConfig(
                        system_instruction=instruction,
                        response_mime_type="application/json",
                        temperature=0.1,
                    )
                )
                if res.text:
                    items = _clean_json_response(res.text)
                    if items:
                        return items
            except Exception as ex:
                logger.warning(f"Model {model_name} failed vault image parse: {ex}")
                continue

    except Exception as e:
        logger.error(f"Error in parse_image_with_gemini: {e}")

    return []


CATEGORY_NAMES_UK = {
    "ai": "🤖 ШІ та нейромережі",
    "social": "🌐 Соцмережі та месенджери",
    "email": "📬 Поштові скриньки",
    "crypto": "📈 Криптобіржі та гаманці",
    "wifi": "📶 Мережі Wi-Fi",
    "devices": "📱 Apple ID та пристрої",
    "other": "📝 Інші сервіси та коди",
}


def format_export_text(items: list, category_filter: Optional[str] = None) -> str:
    """Форматує записи Склерозника у гарний структурований текстовий список для друку чи пересилки."""
    if not items:
        return "У «Склерознику» немає збережених записів."

    grouped: Dict[str, list] = {}
    for it in items:
        cat = getattr(it, "category", "other") or "other"
        grouped.setdefault(cat, []).append(it)

    lines = [
        "=========================================",
        "🔐 СКЛЕРОЗНИК — РЕЗЕРВНИЙ СПИСОК ДОСТУПІВ",
        f"📅 Сформовано: {datetime.now().strftime('%d.%m.%Y %H:%M')}",
        "=========================================",
        ""
    ]

    for cat_key, cat_items in grouped.items():
        if category_filter and category_filter != "all" and cat_key != category_filter:
            continue

        cat_title = CATEGORY_NAMES_UK.get(cat_key, cat_key.upper())
        lines.append(f"--- {cat_title} ({len(cat_items)}) ---")
        for idx, item in enumerate(cat_items, start=1):
            title = getattr(item, "title", "")
            login = getattr(item, "login", "") or "—"
            pwd = getattr(item, "password", "") or "—"
            url = getattr(item, "website_url", "")
            plan = getattr(item, "plan_type", "")
            two_fa = getattr(item, "two_factor_note", "")
            notes = getattr(item, "notes", "")

            plan_str = f" [{plan.upper()}]" if plan else ""
            lines.append(f"{idx}. {title}{plan_str}")
            if cat_key == "wifi":
                lines.append(f"   Мережа (SSID): {login}")
                lines.append(f"   Пароль: {pwd}")
            else:
                lines.append(f"   Логін / Email: {login}")
                lines.append(f"   Пароль: {pwd}")

            if url:
                lines.append(f"   Сайт: {url}")
            if two_fa:
                lines.append(f"   2FA / Безпека: {two_fa}")
            if notes:
                lines.append(f"   Примітка: {notes}")
            lines.append("")

    lines.append("=========================================")
    lines.append("🔒 Усі дані зашифровані в системі Секретаря.")
    lines.append("=========================================")

    return "\n".join(lines)
