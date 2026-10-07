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
- "title": коротка зрозуміла назва (наприклад: "ChatGPT Plus", "Binance", "Discord", "X (Twitter)", "Gmail Особистий", "Wi-Fi Дім 5G", "Apple ID", "Ryanair", "PayPal", "eBay").
- "category": одна з наступних категорій СУВОРО:
    - "crypto" — криптобіржі, гаманці, трейдинг (Binance, Bybit, KuCoin, OKX, Gate.io, Huobi, TradingView, CoinMarketCap, TabTrader, MetaMask, TrustWallet тощо).
    - "banking" — банки, платіжні системи та картки (PayPal, Приват24, Монобанк, Revolut, Wise, Payoneer, QIWI тощо).
    - "airlines" — авіакомпанії, квитки, готелі та подорожі (Wizz Air, Ryanair, МАУ / Панорама клуб, Booking, Airbnb, Lufthansa тощо).
    - "ai" — нейромережі та ШІ (ChatGPT, Claude, Midjourney, Perplexity, Cursor, Gemini, ElevenLabs тощо).
    - "social" — соцмережі, блоги та месенджери (Discord, X / Twitter, Telegram, Instagram, Facebook, TikTok, Reddit, YouTube, Medium тощо).
    - "email" — поштові скриньки (Gmail, Ukr.net, Yahoo, Outlook, iCloud Mail, ProtonMail).
    - "shopping" — магазини, автоаукціони, маркетплейси (eBay, OLX, Amazon, Rozetka, Copart, IAA Auction, Prom, AliExpress).
    - "work" — робота, IT, хмари та хостинг (GitHub, Dropbox, Яндекс Диск, Google Drive, Notion, Trello, хостинг).
    - "gaming" — комп'ютерні ігри та медіа (Steam, PlayStation, Xbox, Epic Games, Netflix, Spotify).
    - "wifi" — мережі Wi-Fi та роутери (назва SSID у login, пароль у password).
    - "devices" — Apple ID, iCloud, активація iPhone, PIN/PUK, телефони.
    - "other" — важливі нотатки, сейф, документи.
- "login": логін, email, номер телефону або назва мережі SSID (якщо є, інакше null).
- "password": пароль, WPA ключ від Wi-Fi, 16-значний ключ додатку або PIN (якщо є, інакше null).
- "website_url": офіційний URL сайту для швидкого переходу (наприклад: "https://chatgpt.com", "https://binance.com", "https://ryanair.com", "https://paypal.com"). Якщо це Wi-Fi чи пристрій — null.
- "plan_type": якщо це ШІ чи сервіс: "pro" (якщо згадано Plus, Pro, Premium, платний, передплата) або "free" (якщо безкоштовний/тестовий), інакше null.
- "two_factor_note": якщо є згадка про 2FA, Google Authenticator, SMS чи резервні коди — зазнач тут коротко, інакше null.
- "notes": будь-які корисні примітки, дати оплати, суми коштів, коментарі, кодові фрази чи додаткові дані.

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
        import io
        from PIL import Image, ImageOps
        try:
            import pillow_heif
            pillow_heif.register_heif_opener()
        except Exception:
            pass

        # Open and normalize with Pillow (handles HEIC from iPhone, rotates EXIF, converts to RGB)
        try:
            img = Image.open(io.BytesIO(image_bytes))
            img = ImageOps.exif_transpose(img)
            if img.mode != "RGB":
                img = img.convert("RGB")

            # Downscale if max dimension > 2048px (optimal for Gemini Vision OCR and prevents payload limits)
            if max(img.size) > 2048:
                img.thumbnail((2048, 2048), Image.Resampling.LANCZOS)

            out_buf = io.BytesIO()
            img.save(out_buf, format="JPEG", quality=88, optimize=True)
            optimized_bytes = out_buf.getvalue()
        except Exception as e:
            logger.warning(f"Image normalization warning: {e}, using original bytes")
            optimized_bytes = image_bytes

        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        image_part = types.Part.from_bytes(data=optimized_bytes, mime_type="image/jpeg")

        models_to_try = ["gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-3.5-flash-lite"]
        instruction = PARSE_VAULT_PROMPT + "\nУВАЖНО РОЗПІЗНАЙ РУКОПИСНИЙ АБО ДРУКОВАНИЙ ТЕКСТ З ЦЬОГО ЗОБРАЖЕННЯ ТА ПЕРЕТВОРИ НА СПИСОК ПАРОЛІВ."

        for model_name in models_to_try:
            try:
                res = client.models.generate_content(
                    model=model_name,
                    contents=[image_part, "Розпізнай всі логіни, паролі, сайти, Wi-Fi та ключі з цього фото аркуша."],
                    config=types.GenerateContentConfig(
                        system_instruction=instruction,
                        response_mime_type="application/json",
                        temperature=0.1,
                    )
                )
                if res.text:
                    items = _clean_json_response(res.text)
                    if items and len(items) > 0:
                        return items
            except Exception as ex:
                logger.warning(f"Model {model_name} failed vault image parse: {ex}")
                continue

    except Exception as e:
        logger.error(f"Error in parse_image_with_gemini: {e}")

    return []


CATEGORY_NAMES_UK = {
    "crypto": "📈 Криптобіржі та гаманці",
    "banking": "💳 Банки та платежі",
    "airlines": "✈️ Авіакомпанії та подорожі",
    "ai": "🤖 ШІ та нейромережі",
    "social": "🌐 Соцмережі та месенджери",
    "email": "📬 Поштові скриньки",
    "shopping": "🛍️ Шопінг та аукціони",
    "work": "💼 Робота, IT та хмари",
    "gaming": "🎮 Ігри та медіа",
    "wifi": "📶 Мережі Wi-Fi",
    "devices": "📱 Apple ID та пристрої",
    "other": "🔒 Інше та сейф",
}


def classify_vault_item(title: str, notes: Optional[str] = None, website_url: Optional[str] = None, login: Optional[str] = None) -> str:
    """Розумне автоматичне розпізнавання категорії: спочатку пріоритет за назвою, потім за URL та нотатками."""
    title_clean = (title or "").lower().strip()
    notes_clean = (notes or "").lower().strip()
    url_clean = (website_url or "").lower().strip()

    rules = [
        ("devices", ["apple id", "apple", "эпл", "айфон", "iphone", "ipad", "айпад", "macbook", "макбук", "pin", "puk", "активац", "телефон", "imei"]),
        ("crypto", ["binance", "kucoin", "ftx", "huobi", "htx", "gate.io", "gate io", "okx", "okex", "mexc", "bybit", "binbon", "bingx", "hitbtc", "эксмо", "exmo", "tdax", "btc-trade", "yobit", "blocfolio", "blockfolio", "coinlist", "bilaxy", "cryptopia", "crypto.com", "quantfury", "bitrue", "corency", "currency", "bit forex", "fmfw", "bibox", "hoo", "tradingview", "coinmarketcap", "tabtreyder", "tabtrader", "metamask", "trustwallet", "ledger", "trezor", "whitebit", "kuna", "биржа", "токен", "крипт", "usdt", "btc", "dydx"]),
        ("airlines", ["визэир", "wizz", "runair", "ryanair", "мау", "панорама клуб", "lufthansa", "booking", "airbnb", "lot", "turkish", "emirates", "skyup", "pegasus", "авіа", "авиа", "полет", "рейс", "flight", "airline"]),
        ("banking", ["paypal", "пейпал", "пейпел", "приват", "privat", "моно", "mono", "monobank", "revolut", "wise", "payoneer", "qiwi", "киви", "банк", "карта", "счет", "кредит", "пумб", "ощад", "аваль", "sense", "visa", "mastercard"]),
        ("shopping", ["olx", "олх", "ebay", "ебей", "amazon", "амазон", "rozetka", "розетка", "prom", "пром", "copart", "копарт", "iaa", "аукцион", "auction", "алиэкспресс", "aliexpress", "taobao", "auto ria", "авториа"]),
        ("work", ["github", "гитхаб", "gitlab", "dropbox", "дропбокс", "яндекс диск", "yandex disk", "google drive", "гугл диск", "диск", "onedrive", "notion", "ноушен", "trello", "jira", "zoom", "slack", "cpanel", "hosting", "хостинг", "домен", "domain", "digitalocean", "hetzner", "aws"]),
        ("gaming", ["steam", "стим", "playstation", "psn", "плейстейшен", "xbox", "иксбокс", "epic games", "epic", "blizzard", "battlenet", "gog", "netflix", "нетфликс", "spotify", "спотифай", "megogo"]),
        ("social", ["twitter", "твиттер", "твітер", " x ", "x.com", "telegram", "телеграм", "телега", "reddit", "реддит", "tiktok", "тикток", "discord", "дискорд", "facebook", "фейсбук", "instagram", "инстаграм", "інста", "youtube", "ютуб", "medium", "медиум", "linkedin", "whatsapp", "вацап", "viber", "вайбер"]),
        ("email", ["ukr.net", "укр.нет", "укрнет", "gmail", "джимейл", "гмейл", "yahoo", "яхо", "яhoo", "mail.ru", "outlook", "аутлук", "proton", "protonmail", "почт", "пошта"]),
        ("ai", ["chatgpt", "чатгпт", "чат гпт", "openai", "claude", "клод", "midjourney", "миджорней", "perplexity", "перплексити", "gemini", "джемини", "elevenlabs", "cursor", "курсор", "deepseek", "suno", "runway"]),
        ("wifi", ["wifi", "wi-fi", "вайфай", "вай-фай", "роутер", "ssid", "homenet", "router"]),
    ]

    # Step 1: Exact / strong match on Title
    for cat, keywords in rules:
        for kw in keywords:
            if kw in title_clean:
                return cat

    # Step 2: Match on Website URL
    if url_clean:
        for cat, keywords in rules:
            for kw in keywords:
                if kw in url_clean:
                    return cat

    # Step 3: Match on Notes
    if notes_clean:
        for cat, keywords in rules:
            for kw in keywords:
                if kw in notes_clean:
                    return cat

    return "other"




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
