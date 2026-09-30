import json
import re
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from app.config import settings

logger = logging.getLogger("my_secretary.ai_parser")

SYSTEM_INSTRUCTION = """Ти — інтелектуальний персональний AI-секретар («Мій Секретар»).
Користувач з України. Ти вільно розумієш українську та російську мови.

Твоє завдання — проаналізувати вхідний текст або аудіо та виділити ВСІ зазначені дії у відповідні категорії.
ВАЖЛИВО: Одне повідомлення може містити ОДНОЧАСНО кілька дій з РІЗНИХ категорій! Ніколи не втрачай і не пропускай жодну частину!

Категорії дій:
1. "finance" — особисті витрати або доходи (УВАГА: якщо користувач говорить «бізнес», «бизнес», «по бізнесу», «в касу», «на фірму» — це категорія 9 "business", а НЕ "finance"!).
   - type: "expense" (витрата) або "income" (дохід). Оплата робітникам/майстрам («заплатив за роботу плиточника», «оплатив майстра», «віддав за ремонт») — це ЗАВЖДИ ВИТРАТА ("expense")!
   - "income" — ТІЛЬКИ коли гроші отримав користувач («зарплата», «мені заплатили», «аванс», «дохід»).
   - category: «Ремонт», «Послуги», «Продукти», «Авто» тощо. ВАЛЮТА: "UAH", "USD", "EUR".

2. "shopping" — товари у список покупок («купити молоко, хліб, скотч»). (УВАГА: якщо сказано «бізнес купив провода 250» або «по бізнесу шайбочки 250» — це категорія 9 "business", а не покупки!) item: назва, category: "Продукти", quantity: "1 шт".

3. "tasks" — РОБОТИ, справи, ремонт, прибирання, дзвінки («постелити плитку», «прибрати територію», «помити машину»). title: назва, priority: "medium", category: "Роботи".

4. "auto" — АВТОМОБІЛЬ, ГАРАЖ, пробіг, ТО («пробіг 120000», «поміняв масло»). current_mileage: число, event_type: "mileage".

5. "media_notes" — **СКЛЕРОЗНИК**: швидкі замітки, паролі, коди («склерозник: ...»), якщо це не покупки, не роботи, не авто, не тиск і не фільми.
   - title: назва, type: "note", comment: текст.

6. "health_vitals" — ТИСК ТА ПУЛЬС («тиск 130 на 80 пульс 72», «159 на 90 пульс 60»).
   - systolic: верхній тиск (число), diastolic: нижній тиск (число), pulse: пульс (число або null).

7. "movies" — ФІЛЬМИ ТА СЕРІАЛИ («фільм Скеля», «подивитися фільм 17 миттєвостей весни», «знайти фільм Термінатор», «кіно Дюна», «серіал Друзі»).
   - title: назва фільму або серіалу (без слів "фільм", "подивитися", "знайти"), type: "movie"|"series".

8. "music" — МУЗИКА, ПІСНІ, ТРЕКИ, ШАЗАМ («слухати Linkin Park Numb», «пісня Океан Ельзи Обійми», «включи трек Queen Bohemian Rhapsody», «шазам The Weeknd Blinding Lights», «додай в плейлист пісню...»).
   - title: назва пісні (без слів "пісня", "включи", "слухати"), artist: виконавець (якщо відомо, інакше null), playlist: "Всі треки" (або "В авто 🚗" якщо згадано авто/дорогу).

9. "business" — БІЗНЕС ТА КАСА (КЛЮЧОВЕ СЛОВО: «бізнес», «бизнес», «по бізнесу», «по бизнесу», «в касу», «в кассу», «бізнес каса», «на фірму»):
   - БУДЬ-ЯКА фраза з цими ключовими словами — ЗАВЖДИ записується у цей розділ (НЕ у "finance", НЕ у "shopping")!
   - В одній фразі користувач може продиктувати ОДРАЗУ КІЛЬКА операцій!
     Наприклад: «бізнес приход аренда 300 расход провода 500» -> створює ДВІ окремі дії у "business":
       1) type: "income", amount: 300, description: "Аренда", category: "Оренда"
       2) type: "expense", amount: 500, description: "Провода", category: "Матеріали"
   - Визначення type:
     - "expense" (витрата): слова «купив», «купил», «витрата», «расход», «видав», «выдал», «заплатив», «оплатив», товари/матеріали (шайбочки, провода, інструменти тощо) із сумою.
     - "income" (дохід): слова «приход», «прихід», «доход», «дохід», «отримав», «получил», «оренда», «аренда», «плюс», «зайшло».
   - amount: число (сума).
   - description: короткий опис операції.
   - category: "Матеріали", "Зарплата", "Оренда", "Податки", "Авто / Паливо", "Загальне".

Приклади:
- «бізнес приход аренда 300 расход провода 500» -> business: Аренда (+300), business: Провода (-500)
- «бізнес купив провода 250» -> business: Провода (-250)
- «бізнес шайбочки на базарі 250» -> business: Шайбочки на базарі (-250)
- «по бізнесу видав зарплату Толіку 40 тисяч» -> business: Зарплата Толіку (-40000)
Поточна дата і час: {current_time}.


Формат відповіді СУВОРО JSON:
{{
  "summary": "Коротке резюме (наприклад: 'Додано 4 товари в покупки та 4 роботи в список справ')",
  "transcription": "Текст сказаного (якщо було аудіо)",
  "actions": [
    {{"domain": "shopping", "data": {{"item": "Хліб", "category": "Продукти", "quantity": "1 шт", "notes": null}}}},
    {{"domain": "tasks", "data": {{"title": "Постелити плитку", "priority": "medium", "category": "Роботи"}}}}
  ]
}}
Поверни ТІЛЬКИ валідний JSON без markdown."""


def detect_audio_mime(audio_bytes: bytes, fallback_mime: str = "audio/webm") -> str:
    """Визначає точний MIME-тип аудіо за сигнатурою байтів."""
    if len(audio_bytes) >= 12:
        if audio_bytes[4:8] == b"ftyp": return "audio/mp4"
        if audio_bytes[:4] == b"RIFF" and audio_bytes[8:12] == b"WAVE": return "audio/wav"
        if audio_bytes[:4] == b"\x1a\x45\xdf\xa3": return "audio/webm"
        if audio_bytes[:4] == b"OggS": return "audio/ogg"
        if audio_bytes[:3] == b"ID3" or (audio_bytes[0] == 0xff and (audio_bytes[1] & 0xe0) == 0xe0): return "audio/mp3"
    return (fallback_mime.split(";")[0].strip() if fallback_mime else "audio/webm") or "audio/webm"


def _heuristic_fallback(text: str) -> Dict[str, Any]:
    """Резервний евристичний парсер на випадок збою AI з підтримкою змішаних запитів."""
    actions = []
    lower = text.lower()
    summary_parts = []

    # 0. Бізнес та каса (business) — за ключовим словом
    if any(k in lower for k in ["бізнес", "бизнес", "по бізнесу", "по бизнесу", "в касу", "в кассу"]):
        try:
            from app.modules.business.router import parse_spoken_amount
            clean_biz = re.sub(r'^(?:по\s+)?(?:бізнесу|бизнесу|бізнес|бизнес|в\s+касу|в\s+кассу):?\s*', '', text, flags=re.IGNORECASE).strip()
            parts = re.split(r'(?=(?:приход|прихід|доход|дохід|расход|витрата|купил|купив|видав|выдал|получил|отримав)\b)', clean_biz, flags=re.IGNORECASE)
            parts = [p.strip(' ,;') for p in parts if p.strip(' ,;')]
            if not parts:
                parts = [clean_biz]
            
            biz_actions = []
            for p in parts:
                amt, p_clean = parse_spoken_amount(p)
                if not amt:
                    continue
                p_low = p_clean.lower()
                is_inc = any(k in p_low for k in ['приход', 'прихід', 'доход', 'дохід', 'получил', 'отримав', 'оренда', 'аренда', 'плюс', '+']) and not any(k in p_low for k in ['видав', 'выдал', 'расход', 'витрата', 'купил', 'купив', 'заплатил', 'мінус', '-'])
                tx_type = 'income' if is_inc else 'expense'

                desc = re.sub(r'(\d+[\d\s.,]*\d*|\d+)', '', p_clean)
                desc = desc.replace('+', ' ').replace('-', ' ')
                for w in ['грн', 'uah', 'гривен', 'гривень', 'плюс', 'мінус', 'приход', 'прихід', 'доход', 'дохід', 'расход', 'витрата', 'получил', 'отримав', 'выдал', 'видав', 'купил', 'купив']:
                    desc = re.sub(rf'\b{re.escape(w)}\b', '', desc, flags=re.IGNORECASE)
                desc = re.sub(r'\s+', ' ', desc).strip()
                if not desc:
                    desc = 'Надходження' if tx_type == 'income' else 'Витрата'
                desc = desc.capitalize()

                cat = 'Загальне'
                if any(k in p_low for k in ['зарплат', 'зп', 'толик', 'толіку', 'робітникам', 'сотрудникам']): cat = 'Зарплата'
                elif any(k in p_low for k in ['оренд', 'аренд']): cat = 'Оренда'
                elif any(k in p_low for k in ['шайб', 'провод', 'кабел', 'базар', 'ринок', 'матеріал', 'інструмент', 'болт', 'гайк']): cat = 'Матеріали'
                elif any(k in p_low for k in ['подат', 'налог']): cat = 'Податки'
                elif any(k in p_low for k in ['палив', 'бензин', 'дизел', 'газ', 'заправ', 'сто']): cat = 'Авто / Паливо'

                biz_actions.append({"domain": "business", "data": {"type": tx_type, "amount": amt, "description": desc, "category": cat}})
                sign = "+" if tx_type == "income" else "-"
                summary_parts.append(f"{desc} ({sign}{int(amt)} ₴)")

            if biz_actions:
                return {
                    "summary": "Бізнес-каса: " + ", ".join(summary_parts),
                    "transcription": text,
                    "actions": biz_actions
                }
        except Exception as e:
            logger.warning(f"Business heuristic error: {e}")

    # 1. Авто / Пробіг машини
    if any(k in lower for k in ["пробіг", "пробег", "одометр"]):
        m_dig = re.search(r'(\d+[\s\d]*)\s*(?:км|тыс|тис)?', lower)
        if m_dig:
            try:
                ml = int(m_dig.group(1).replace(" ", ""))
                if any(t in lower for t in ["тыс", "тис"]) and ml < 1000:
                    ml *= 1000
                actions.append({"domain": "auto", "data": {"current_mileage": ml, "event_type": "mileage", "notes": text}})
                summary_parts.append(f"пробіг авто {ml} км")
            except Exception:
                pass

    # 2. Склерозник
    if "склерозник" in lower:
        cl_note = re.sub(r'^(?:склерозник:?|запиши(?:\s+в|\s+у)?\s+склерозник:?|в\s+склерозник:?|склерозник\s+запис:?)\s*', '', text, flags=re.IGNORECASE).strip()
        actions.append({"domain": "media_notes", "data": {"title": (cl_note or text)[:40], "type": "note", "comment": cl_note or text, "status": "to_review"}})
        summary_parts.append(f"склерозник «{(cl_note or text)[:30]}»")

    # 3. Фінанси
    price_match = re.search(r'(\d+[\.,]?\d*)\s*(грн|грив[еньяі]*|uah|usd|\$|дол|бакс[а-я]*|євро|евро|eur)?', lower)
    finance_kw = ["купив", "купил", "витратив", "потратил", "заплатив", "заплатил", "оплатив", "оплатил", "віддав", "отдал", "чек", "коштувало", "стоило"]
    if any(k in lower for k in finance_kw) and price_match:
        try:
            amount = float(price_match.group(1).replace(",", "."))
            curr_str = (price_match.group(2) or "").lower()
            currency = "USD" if any(k in curr_str for k in ["$", "usd", "дол", "бакс"]) else ("EUR" if any(k in curr_str for k in ["євро", "евро", "eur"]) else "UAH")
            cat = "Ремонт" if any(k in lower for k in ["плиточн", "плитк", "майстр", "мастер", "ремонт", "стройка"]) else ("Кафе" if any(k in lower for k in ["кава", "кофе", "обід", "обед"]) else ("Транспорт" if any(k in lower for k in ["таксі", "такси", "метро", "бензин"]) else "Різне"))
            actions.append({
                "domain": "finance",
                "data": {"amount": amount, "currency": currency, "category": cat, "type": "expense", "description": text}
            })
            symbol = "₴" if currency == "UAH" else ("$" if currency == "USD" else "€")
            summary_parts.append(f"витрата {amount} {symbol}")
        except Exception:
            pass

    # 4. Тиск та пульс (health_vitals)
    bp_m = re.search(r'(\d{2,3})\s*(?:на|/)\s*(\d{2,3})(?:\s*(?:пульс|серце)?\s*(\d{2,3}))?', lower)
    if bp_m and (any(k in lower for k in ["тиск", "давлен", "пульс"]) or ("на" in lower and int(bp_m.group(1)) > 75)):
        try:
            s_v, d_v = int(bp_m.group(1)), int(bp_m.group(2))
            p_v = int(bp_m.group(3)) if bp_m.group(3) else None
            actions.append({"domain": "health_vitals", "data": {"systolic": s_v, "diastolic": d_v, "pulse": p_v, "notes": text}})
            summary_parts.append(f"тиск {s_v}/{d_v}" + (f" пульс {p_v}" if p_v else ""))
        except Exception:
            pass

    # 5. Фільми та серіали (movies)
    if any(k in lower for k in ["фільм", "фильм", "кіно", "кино", "серіал", "сериал", "нетфлікс", "нетфликс", "netflix"]):
        m_t = re.sub(r'^(?:подивитися|посмотреть|глянути|знайти|найти|додай|добавь|запиши)?\s*(?:на\s+(?:нетфлікс|нетфликс|netflix)\s+)?(?:фільм|фильм|кіно|кино|серіал|сериал)?\s*(?:на\s+(?:нетфлікс|нетфликс|netflix))?:?\s*', '', text, flags=re.IGNORECASE).strip(" '\"«»")
        m_t = re.sub(r'^(?:про|о)\s+', '', m_t, flags=re.IGNORECASE).strip(" '\"«»")
        if m_t:
            m_type = "series" if any(s in lower for s in ["серіал", "сериал"]) else "movie"
            return {"summary": f"Знайдено фільм «{m_t}»", "transcription": text, "actions": [{"domain": "movies", "data": {"title": m_t, "type": m_type}}]}

    # 2. Розбиття на частини для змішаного введення (покупки та роботи)
    work_triggers = ["зробити", "сделать", "постелити", "постелить", "прибрати", "убрать", "помити", "помыть", "хімчистк", "химчистк", "плитк", "ремонт", "подзвонити", "позвонить", "нагадай", "напомни"]
    shop_triggers = ["купити", "купить", "купи", "покупки", "покупка", "список покупок", "взяти"]

    # Розбиваємо за комами, крапками з комою або союзами
    tokens = re.split(r"[,;]|\s+(?:та|і|и|and)\s+", text)
    in_work_mode = False
    in_shop_mode = False

    for raw_tok in tokens:
        tok = raw_tok.strip()
        if not tok:
            continue
        tok_low = tok.lower()

        # Визначаємо зміну контексту
        if any(w in tok_low for w in ["зробити", "сделать", "роботи", "работы", "завдання", "задачи"]):
            in_work_mode = True
            in_shop_mode = False
            tok_clean = re.sub(r'^(?:зробити|сделать|роботи|работы|завдання|задачи):?\s*', '', tok, flags=re.IGNORECASE).strip()
            if tok_clean:
                actions.append({"domain": "tasks", "data": {"title": tok_clean.capitalize(), "priority": "medium", "category": "Роботи"}})
                summary_parts.append(f"робота «{tok_clean}»")
            continue

        if any(s in tok_low for s in ["купити", "купить", "купи", "покупки"]):
            in_shop_mode = True
            in_work_mode = False
            tok_clean = re.sub(r'^(?:купити|купить|купи|покупки|додай у покупки|добавь в покупки):?\s*', '', tok, flags=re.IGNORECASE).strip()
            if tok_clean:
                actions.append({"domain": "shopping", "data": {"item": tok_clean.capitalize(), "category": "Продукти", "quantity": "1 шт"}})
                summary_parts.append(f"покупка «{tok_clean}»")
            continue

        # Якщо токен явно містить дію роботи
        if any(w in tok_low for w in work_triggers) or in_work_mode:
            actions.append({"domain": "tasks", "data": {"title": tok.capitalize(), "priority": "medium", "category": "Роботи"}})
            summary_parts.append(f"робота «{tok}»")
        elif in_shop_mode or any(s in tok_low for s in shop_triggers):
            tok_clean = re.sub(r'^(?:купити|купить|купи|треба|потрібно|надо|нужно)\s*', '', tok, flags=re.IGNORECASE).strip()
            if tok_clean:
                actions.append({"domain": "shopping", "data": {"item": tok_clean.capitalize(), "category": "Продукти", "quantity": "1 шт"}})
                summary_parts.append(f"покупка «{tok_clean}»")

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

    models_to_try = list(dict.fromkeys([m for m in [settings.AI_MODEL, "gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3.8-flash"] if m]))

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
