import json
import re
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from app.config import settings

logger = logging.getLogger("my_secretary.ai_parser")

SYSTEM_INSTRUCTION = """Ти — інтелектуальний персональний AI-секретар («Мій Секретар»).
Користувач з України. Ти вільно розумієш українську та російську мови.

Твоє завдання — проаналізувати вхідний текст або аудіо та виділити дії в одну або декілька категорій:
1. "finance" — витрати або доходи (купив каву, таксі, зарплата тощо).
   - ВАЛЮТА: "UAH" за замовчуванням, "USD" якщо долари, "EUR" якщо євро.
   - type: "expense" (витрата) або "income" (дохід).
2. "shopping" — товари в список покупок (продукти, побутова хімія, аптека тощо).
   - БУДЬ-ЯКІ фрази: «купи...», «купити...», «купить...», «додай у покупки...», «добавь в покупки...», «список покупок...», «треба взяти...» — це СУВОРО категорія "shopping" (НЕ media_notes і НЕ tasks)!
   - Кожен товар записуй як окремий елемент у масив actions: domain="shopping", item="Назва", category="Продукти" (або Дім/Аптека), quantity="1 шт" (або названа).
3. "tasks" — завдання, справи, нагадування (подзвонити, надіслати, зробити).
   - priority: "low", "medium", "high". due_date у форматі ISO YYYY-MM-DDTHH:MM:SS відносно поточної дати.
4. "media_notes" — ТІЛЬКИ фільми, серіали, книги, статті або загальні замітки, які НЕ стосуються покупок, завдань чи фінансів.

Поточна дата і час: {current_time}.

Формат відповіді СУВОРО JSON:
{{
  "summary": "Коротке резюме (наприклад: 'Додав хліб та молоко до списку покупок')",
  "transcription": "Текст сказаного (якщо було аудіо)",
  "actions": [
    {{"domain": "shopping", "data": {{"item": "Хліб", "category": "Продукти", "quantity": "1 шт", "notes": null}}}}
  ]
}}
Поверни ТІЛЬКИ валідний JSON без markdown."""


def detect_audio_mime(audio_bytes: bytes, fallback_mime: str = "audio/webm") -> str:
    """Визначає точний MIME-тип аудіо за сигнатурою байтів."""
    if len(audio_bytes) >= 12:
        if audio_bytes[4:8] == b"ftyp":
            return "audio/mp4"
        if audio_bytes[:4] == b"RIFF" and audio_bytes[8:12] == b"WAVE":
            return "audio/wav"
        if audio_bytes[:4] == b"\x1a\x45\xdf\xa3":
            return "audio/webm"
        if audio_bytes[:4] == b"OggS":
            return "audio/ogg"
        if audio_bytes[:3] == b"ID3" or (audio_bytes[0] == 0xff and (audio_bytes[1] & 0xe0) == 0xe0):
            return "audio/mp3"

    base_mime = fallback_mime.split(";")[0].strip() if fallback_mime else "audio/webm"
    return base_mime or "audio/webm"


def _heuristic_fallback(text: str) -> Dict[str, Any]:
    """Резервний евристичний парсер на випадок збою AI."""
    actions = []
    lower = text.lower()
    summary_parts = []

    # 1. Фінанси
    price_match = re.search(r'(\d+[\.,]?\d*)\s*(грн|грив[еньяі]*|uah|usd|\$|дол|бакс[а-я]*|євро|евро|eur)?', lower)
    finance_kw = ["купив", "купил", "витратив", "потратил", "заплатив", "заплатил", "чек", "коштувало", "стоило", "грн", "uah", "$", "usd"]
    if any(k in lower for k in finance_kw) and price_match:
        try:
            amount = float(price_match.group(1).replace(",", "."))
            curr_str = (price_match.group(2) or "").lower()
            currency = "USD" if any(k in curr_str for k in ["$", "usd", "дол", "бакс"]) else ("EUR" if any(k in curr_str for k in ["євро", "евро", "eur"]) else "UAH")
            cat = "Кафе" if any(k in lower for k in ["кава", "кофе", "обід", "обед", "вечеря", "ужин", "кафе", "ресторан"]) else ("Транспорт" if any(k in lower for k in ["таксі", "такси", "метро", "бензин", "пальне", "автобус"]) else ("Продукти" if any(k in lower for k in ["продукти", "магазин", "сільпо", "атб", "фора"]) else "Різне"))
            actions.append({
                "domain": "finance",
                "data": {"amount": amount, "currency": currency, "category": cat, "type": "expense", "description": text}
            })
            symbol = "₴" if currency == "UAH" else ("$" if currency == "USD" else "€")
            summary_parts.append(f"витрата {amount} {symbol} ({cat})")
        except Exception:
            pass

    # 2. Покупки
    shop_kw = ["купити", "купить", "купи", "покупки", "покупка", "покупок", "в магазині", "в магазине", "додай", "добав", "список покупок"]
    if any(k in lower for k in shop_kw) and not (actions and any(a["domain"] == "finance" for a in actions)):
        cleaned = re.sub(
            r"^(?:запиши(?:\s+у|\s+в)?\s+покупки|дода(?:й|йте)(?:\s+у|\s+в)?\s+покупки|добав(?:ь|ьте)?(?:\s+у|\s+в)?\s+покупки|в\s+список\s+покупок:?|список\s+покупок:?|треба\s+купити|потрібно\s+купити|надо\s+купить|нужно\s+купить|купи(?:ти|ть)?(?:\s+мені|\s+мне)?|треба|потрібно|нужно|надо|запиши)\s*",
            "",
            text,
            flags=re.IGNORECASE
        ).strip()
        parts = re.split(r"[,;]|\s+(?:та|і|и|and)\s+", cleaned)
        for item_name in parts:
            item_name = item_name.strip()
            if item_name and not re.search(r'\d+\s*(грн|uah|\$|€)', item_name.lower()):
                actions.append({
                    "domain": "shopping",
                    "data": {"item": item_name.capitalize(), "category": "Продукти", "quantity": "1 шт"}
                })
                summary_parts.append(f"покупка «{item_name.capitalize()}»")

    # 3. Завдання
    task_kw = ["нагадай", "напомни", "завдання", "задача", "зробити", "сделать", "подзвонити", "позвонить", "відправити", "отправить"]
    if any(k in lower for k in task_kw) and not actions:
        title = re.sub(r'^(?:нагадай|напомни|завдання|задача|не забудь|треба|надо)\s*', '', text, flags=re.IGNORECASE).strip()
        actions.append({
            "domain": "tasks",
            "data": {"title": title.capitalize() if title else text, "description": None, "priority": "medium", "category": "Особисте"}
        })
        summary_parts.append(f"завдання «{(title or text)[:30]}»")

    # 4. Якщо нічого іншого не підійшло
    if not actions:
        actions.append({
            "domain": "media_notes",
            "data": {"title": text[:60], "type": "note", "comment": text, "status": "to_review"}
        })
        summary_parts.append("замітка")

    return {
        "summary": "Збережено: " + ", ".join(summary_parts),
        "transcription": text,
        "actions": actions
    }


async def parse_with_gemini(text: Optional[str] = None, audio_bytes: Optional[bytes] = None, mime_type: str = "audio/webm") -> Dict[str, Any]:
    """Аналізує текст або аудіо з автоматичним перемиканням моделей (failover)."""
    api_key = settings.GEMINI_API_KEY.strip() if settings.GEMINI_API_KEY else ""
    if not api_key:
        logger.info("GEMINI_API_KEY missing. Using fallback parser.")
        return _heuristic_fallback(text or "Голосова замітка")

    prompt = SYSTEM_INSTRUCTION.format(current_time=datetime.now().strftime("%Y-%m-%d %H:%M:%S"))

    candidate_models = [settings.AI_MODEL, "gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3.8-flash"]
    models_to_try = []
    for m in candidate_models:
        if m and m not in models_to_try:
            models_to_try.append(m)

    last_error = None

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        contents = []

        if audio_bytes:
            actual_mime = detect_audio_mime(audio_bytes, mime_type)
            contents.append(types.Part.from_bytes(data=audio_bytes, mime_type=actual_mime))
        if text:
            contents.append(text)

        for model_name in models_to_try:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=prompt,
                        response_mime_type="application/json",
                        temperature=0.1,
                    )
                )
                raw_text = response.text or ""
                clean_json = raw_text.strip()
                if "```" in clean_json:
                    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", clean_json)
                    if m:
                        clean_json = m.group(1).strip()

                return json.loads(clean_json)

            except Exception as model_err:
                last_error = model_err
                logger.warning(f"Model {model_name} failed: {model_err}. Trying fallback model...")
                continue

    except ImportError:
        logger.error("google-genai SDK not installed.")

    logger.error(f"All Gemini models failed: {last_error}.")
    if text:
        return _heuristic_fallback(text)

    return {
        "summary": "Не вдалося обробити аудіо через навантаження AI. Будь ласка, повторіть ще раз.",
        "transcription": "",
        "actions": []
    }
