import logging
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status
from app.config import settings
from app.auth import verify_secret_key

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


async def perform_web_search(query: str) -> Dict[str, Any]:
    """
    Виконує живий пошук в Google через Gemini Search Grounding.
    """
    api_key = settings.GEMINI_API_KEY.strip() if settings.GEMINI_API_KEY else ""
    if not api_key:
        return {
            "query": query,
            "answer": "⚠️ Для використання веб-агента додайте GEMINI_API_KEY у файл .env",
            "sources": []
        }

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=settings.AI_MODEL,
            contents=query,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
                system_instruction=(
                    "Ти — персональний інтелектуальний web-асистент Секретаря. "
                    "Використовуй пошук в Google для надання точної, структурованої та актуальної відповіді. "
                    "Відповідай мовою запиту (українською або російською). "
                    "Виділяй головні факти, цифри та рекомендації."
                ),
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
        logger.error(f"Web agent search error: {e}", exc_info=True)
        # Резервна спроба через стандартну генерацію без тула пошуку, якщо виникла помилка інструменту
        try:
            from google import genai
            client = genai.Client(api_key=api_key)
            resp = client.models.generate_content(
                model=settings.AI_MODEL,
                contents=f"Дай відповідь на запитання: {query}"
            )
            return {
                "query": query,
                "answer": f"{resp.text}\n\n*(Примітка: відповідь сформована на основі знань моделі, живий пошук тимчасово недоступний: {str(e)[:60]})*",
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
