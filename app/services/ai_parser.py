import os
import json
import re
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from app.config import settings

logger = logging.getLogger("my_secretary.ai_parser")

SYSTEM_INSTRUCTION = """Ти — інтелектуальний персональний AI-секретар («Мій Секретар»).
Користувач з України. Ти вільно розумієш українську та російську мови.

Твоє завдання — проаналізувати вхідний текст або аудіо та виділити конкретні дії в одну або декілька з 4 категорій:
1. "finance" — витрати або доходи (купив каву, оплата таксі, зарплата, підписка тощо).
   - ВАЛЮТА ЗА ЗАМОВЧУВАННЯМ: "UAH" (гривня).
   - Якщо названо долари ($, usd, баксів, доларів), став currency="USD".
   - Якщо названо євро (€, євро, eur), став currency="EUR".
   - type: "expense" (витрата) або "income" (дохід).
2. "shopping" — товари в список покупок (продукти, побутова хімія, аптека тощо).
3. "tasks" — завдання, справи, нагадування (подзвонити, надіслати звіт, записатися до лікаря).
4. "media_notes" — фільми, серіали, книги, статті, подкасти або замітки.

Поточна дата і час: {current_time}.

Формат відповіді СУВОРО JSON наступної структури:
{{
  "summary": "Коротке приємне резюме про те, що було записано (наприклад: 'Записав витрату 85 ₴ на каву та додав молоко у покупки')",
  "transcription": "Текст сказаного (якщо це був аудіозапис)",
  "actions": [
    {{
      "domain": "finance",
      "data": {{
        "amount": 85.0,
        "currency": "UAH",
        "category": "Кафе",
        "type": "expense",
        "description": "Капучино"
      }}
    }},
    {{
      "domain": "shopping",
      "data": {{
        "item": "Молоко 2.5%",
        "category": "Продукти",
        "quantity": "1 шт",
        "notes": null
      }}
    }},
    {{
      "domain": "tasks",
      "data": {{
        "title": "Подзвонити в клініку",
        "description": "Записатися до лікаря",
        "due_date": "2026-09-27T14:00:00",
        "priority": "medium",
        "category": "Здоров'я"
      }}
    }},
    {{
      "domain": "media_notes",
      "data": {{
        "title": "Інтерстеллар",
        "type": "movie",
        "author_creator": "Крістофер Нолан",
        "comment": "Подивитися на вихідних",
        "status": "to_watch",
        "rating": null
      }}
    }}
  ]
}}

Правила:
- Якщо користувач назвав кілька речей одразу (наприклад: "Купив каву за 75 грн і запиши купити хліб та масло"), сформуй окремі дії у масиві "actions".
- Категорії фінансів: Продукти, Кафе, Транспорт, Підписки, Дім, Здоров'я, Зарплата, Переказ тощо.
- Для tasks: due_date обчислюй відносно поточної дати у форматі ISO (YYYY-MM-DDTHH:MM:SS), пріоритети: "low", "medium", "high".
- Поверни ТІЛЬКИ валідний JSON без додаткового тексту чи markdown-блоків ```json.
"""


def _heuristic_fallback(text: str) -> Dict[str, Any]:
    """
    Резервний евристичний парсер з підтримкою гривні та долара.
    """
    actions = []
    lower = text.lower()
    summary_parts = []

    # 1. Пошук фінансів
    price_match = re.search(r'(\d+[\.,]?\d*)\s*(грн|грив[еньяі]*|uah|usd|\$|дол|бакс[а-я]*|євро|евро|eur)?', lower)
    finance_keywords = ["купив", "купил", "витратив", "потратил", "заплатив", "заплатил", "чек", "коштувало", "стоило", "грн", "uah", "$", "usd"]
    
    if any(k in lower for k in finance_keywords) and price_match:
        try:
            amount = float(price_match.group(1).replace(",", "."))
            curr_str = (price_match.group(2) or "").lower()
            currency = "UAH"
            if any(k in curr_str for k in ["$", "usd", "дол", "бакс"]):
                currency = "USD"
            elif any(k in curr_str for k in ["євро", "евро", "eur"]):
                currency = "EUR"

            desc = text
            cat = "Різне"
            if any(k in lower for k in ["кава", "кофе", "обід", "обед", "вечеря", "ужин", "кафе", "ресторан"]):
                cat = "Кафе"
            elif any(k in lower for k in ["таксі", "такси", "метро", "бензин", "пальне", "автобус", "проїзд"]):
                cat = "Транспорт"
            elif any(k in lower for k in ["продукти", "магазин", "сільпо", "атб", "фора", "ноreading"]):
                cat = "Продукти"

            actions.append({
                "domain": "finance",
                "data": {
                    "amount": amount,
                    "currency": currency,
                    "category": cat,
                    "type": "expense",
                    "description": desc
                }
            })
            symbol = "₴" if currency == "UAH" else ("$" if currency == "USD" else "€")
            summary_parts.append(f"витрата {amount} {symbol} ({cat})")
        except Exception:
            pass

    # 2. Пошук покупок
    shopping_keywords = ["купи", "купити", "купить", "список покупок", "взяти в магазині", "взять в магазине"]
    if any(k in lower for k in shopping_keywords):
        cleaned = re.sub(r'^(треба|потрібно|нужно|надо|купи|купити|купить|додай у покупки|добавь в покупки|в список покупок:?)\s*', '', text, flags=re.IGNORECASE)
        items = re.split(r'[,іи]\s+', cleaned)
        for item_name in items:
            item_name = item_name.strip()
            if item_name and not re.search(r'\d+\s*(грн|uah|\$)', item_name):
                actions.append({
                    "domain": "shopping",
                    "data": {
                        "item": item_name.capitalize(),
                        "category": "Продукти",
                        "quantity": "1 шт"
                    }
                })
                summary_parts.append(f"покупка «{item_name}»")

    # 3. Пошук завдань
    task_keywords = ["нагадай", "напомни", "завдання", "задача", "зробити", "сделать", "подзвонити", "позвонить", "відправити", "отправить"]
    if any(k in lower for k in task_keywords):
        title = re.sub(r'^(нагадай|напомни|завдання|задача|не забудь|треба|надо)\s*', '', text, flags=re.IGNORECASE).strip()
        actions.append({
            "domain": "tasks",
            "data": {
                "title": title.capitalize() if title else text,
                "description": None,
                "priority": "medium",
                "category": "Особисте"
            }
        })
        summary_parts.append(f"завдання «{title[:30]}»")

    # 4. Якщо нічого не підійшло — зберігаємо як замітку
    if not actions:
        actions.append({
            "domain": "media_notes",
            "data": {
                "title": text[:60],
                "type": "note",
                "comment": text,
                "status": "to_review"
            }
        })
        summary_parts.append("замітка")

    return {
        "summary": "Збережено: " + ", ".join(summary_parts),
        "transcription": text,
        "actions": actions
    }


async def parse_with_gemini(text: Optional[str] = None, audio_bytes: Optional[bytes] = None, mime_type: str = "audio/webm") -> Dict[str, Any]:
    api_key = settings.GEMINI_API_KEY.strip() if settings.GEMINI_API_KEY else ""

    if not api_key:
        logger.info("GEMINI_API_KEY not configured. Using local fallback parser.")
        return _heuristic_fallback(text or "Голосова замітка")

    prompt = SYSTEM_INSTRUCTION.format(current_time=datetime.now().strftime("%Y-%m-%d %H:%M:%S"))

    try:
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=api_key)
            contents = []

            if audio_bytes:
                contents.append(types.Part.from_bytes(data=audio_bytes, mime_type=mime_type))
            if text:
                contents.append(text)

            response = client.models.generate_content(
                model=settings.AI_MODEL,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=prompt,
                    response_mime_type="application/json",
                    temperature=0.1,
                )
            )
            raw_text = response.text
        except ImportError:
            import google.generativeai as legacy_genai

            legacy_genai.configure(api_key=api_key)
            model = legacy_genai.GenerativeModel(
                model_name=settings.AI_MODEL,
                system_instruction=prompt,
                generation_config={"response_mime_type": "application/json", "temperature": 0.1}
            )

            parts = []
            if audio_bytes:
                parts.append({"mime_type": mime_type, "data": audio_bytes})
            if text:
                parts.append(text)

            res = model.generate_content(parts)
            raw_text = res.text

        clean_json = raw_text.strip()
        if clean_json.startswith("```json"):
            clean_json = clean_json[7:]
        if clean_json.endswith("```"):
            clean_json = clean_json[:-3]
        clean_json = clean_json.strip()

        return json.loads(clean_json)

    except Exception as e:
        logger.error(f"Gemini parse failed: {e}. Falling back to heuristic.", exc_info=True)
        fallback = _heuristic_fallback(text or "Аудіозапис")
        return fallback
