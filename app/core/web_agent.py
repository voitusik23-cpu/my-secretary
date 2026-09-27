import logging
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status
from app.config import settings
from app.auth import verify_secret_key

from datetime import datetime

logger = logging.getLogger("my_secretary.web_agent")

router = APIRouter(prefix="/agent", tags=["Web Agent"], dependencies=[Depends(verify_secret_key)])


class WebAgentQueryRequest(BaseModel):
    query: str = Field(..., description="Запитання для пошуку в інтернеті")


class WebSource(BaseModel):
    title: Optional[str] = None
    url: str


class WebAgentQueryResponse(BaseModel):
    query: str
    answer: str
    sources: List[WebSource] = []


async def fetch_weather_context(query: str) -> Optional[str]:
    """Якщо запит стосується погоди, отримує точні метеодані для міста через Open-Meteo."""
    lower = query.lower()
    if not any(k in lower for k in ["погод", "температур", "дощ", "дожд", "градус", "прогноз", "вітер", "ветер"]):
        return None

    city_name, lat, lon = "Одеса", 46.48, 30.73
    if "київ" in lower or "киев" in lower:
        city_name, lat, lon = "Київ", 50.45, 30.52
    elif "львів" in lower or "львов" in lower:
        city_name, lat, lon = "Львів", 49.84, 24.03
    elif "харків" in lower or "харьков" in lower:
        city_name, lat, lon = "Харків", 49.99, 36.23
    elif "дніпр" in lower or "днепр" in lower:
        city_name, lat, lon = "Дніпро", 48.46, 35.04
    elif "одес" in lower:
        city_name, lat, lon = "Одеса", 46.48, 30.73

    try:
        import httpx
        url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current_weather=true&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto"
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                cw = data.get("current_weather", {})
                daily = data.get("daily", {})
                t_now = cw.get("temperature")
                w_spd = cw.get("windspeed")
                t_max0 = daily.get("temperature_2m_max", [None])[0]
                t_min0 = daily.get("temperature_2m_min", [None])[0]
                t_max1 = daily.get("temperature_2m_max", [None])[1] if len(daily.get("temperature_2m_max", [])) > 1 else None
                t_min1 = daily.get("temperature_2m_min", [None])[1] if len(daily.get("temperature_2m_min", [])) > 1 else None
                return (
                    f"РЕАЛЬНІ ТОЧНІ МЕТЕОДАНІ ДЛЯ МІСТА {city_name.upper()} НА СЬОГОДНІ ТА ЗАВТРА:\n"
                    f"• Зараз температура: {t_now}°C, вітер {w_spd} км/год.\n"
                    f"• Сьогодні вдень максимум: {t_max0}°C, вночі мінімум: {t_min0}°C.\n"
                    f"• Завтра вдень максимум: {t_max1}°C, вночі мінімум: {t_min1}°C."
                )
    except Exception as e:
        logger.info(f"Open-Meteo fetch failed: {e}")
    return None


async def perform_web_search(query: str) -> Dict[str, Any]:
    """
    Виконує живий пошук в Google через Gemini Search Grounding з точною датою та метеоданими.
    """
    api_key = settings.GEMINI_API_KEY.strip() if settings.GEMINI_API_KEY else ""
    if not api_key:
        return {
            "query": query,
            "answer": "⚠️ Для використання веб-агента додайте GEMINI_API_KEY у файл .env",
            "sources": []
        }

    now = datetime.now()
    months_ua = ["", "січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"]
    months_ru = ["", "января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"]
    weekdays_ru = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"]
    date_context = f"{now.day} {months_ru[now.month]} {now.year} года ({now.day} {months_ua[now.month]} {now.year} року), {weekdays_ru[now.weekday()]}"

    weather_data = await fetch_weather_context(query)
    effective_query = query
    if weather_data:
        effective_query = f"{query}\n\n[Метеозведення в реальному часі]:\n{weather_data}"

    system_instruction = (
        f"Ти — персональний інтелектуальний web-асистент Секретаря. "
        f"СЬОГОДНІШНЯ ТОЧНА ДАТА: {date_context}. "
        f"Коли запитують про «сьогодні», «завтра», «зараз» — відповідай виключно для поточної дати ({now.day} {months_ru[now.month]} {now.year}). "
        f"Ніколи не використовуй застарілі дати з минулих місяців (як-от травень). "
        f"Відповідай мовою запиту (українською або російською). "
        f"Виділяй головні факти, цифри та рекомендації."
    )

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=settings.AI_MODEL,
            contents=effective_query,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
                system_instruction=system_instruction,
                temperature=0.2,
            )
        )

        answer_text = response.text or "Не вдалося отримати текст відповіді."
        sources = []

        # Витягуємо джерела з grounding metadata (якщо є)
        try:
            candidate = response.candidates[0] if response.candidates else None
            if candidate and hasattr(candidate, "grounding_metadata") and candidate.grounding_metadata:
                gm = candidate.grounding_metadata
                if hasattr(gm, "grounding_chunks") and gm.grounding_chunks:
                    for chunk in gm.grounding_chunks:
                        if hasattr(chunk, "web") and chunk.web:
                            web_info = chunk.web
                            sources.append(WebSource(
                                title=getattr(web_info, "title", None) or "Джерело",
                                url=getattr(web_info, "uri", "")
                            ))
        except Exception as e:
            logger.debug(f"Error parsing grounding metadata: {e}")

        # Видалення дублікатів посилань
        unique_sources = []
        seen_urls = set()
        for s in sources:
            if s.url and s.url not in seen_urls:
                seen_urls.add(s.url)
                unique_sources.append(s)

        return {
            "query": query,
            "answer": answer_text,
            "sources": [s.model_dump() for s in unique_sources]
        }

    except Exception as e:
        logger.warning(f"Web agent search tool failed, falling back to direct synthesis: {e}")
        try:
            from google import genai
            from google.genai import types
            client = genai.Client(api_key=api_key)
            resp = client.models.generate_content(
                model=settings.AI_MODEL,
                contents=effective_query,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    temperature=0.2,
                )
            )
            return {
                "query": query,
                "answer": resp.text or "Не вдалося згенерувати відповідь.",
                "sources": []
            }
        except Exception as inner_e:
            return {
                "query": query,
                "answer": f"Помилка виконання пошуку: {str(e)}",
                "sources": []
            }


@router.post("/ask", response_model=WebAgentQueryResponse)
async def ask_web_agent(payload: WebAgentQueryRequest):
    """
    Ендпоінт для запитань, що потребують живого веб-пошуку (курси, погода, інструкції тощо).
    """
    res = await perform_web_search(payload.query.strip())
    return WebAgentQueryResponse(
        query=res["query"],
        answer=res["answer"],
        sources=[WebSource(**s) for s in res.get("sources", [])]
    )
