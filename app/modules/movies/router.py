"""
Movies module: AI-powered movie/series search using Gemini.
Searches movie info (description, cast, rating, where to watch) via LLM.
Saves watchlist to media_notes table (type=movie|series).
"""
import json
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.config import settings
from app.database import get_db
from app.auth import verify_secret_key
from app.models.media_notes import MediaNote, MediaNoteResponse

logger = logging.getLogger("my_secretary.movies")

router = APIRouter(
    prefix="/movies",
    tags=["Movies"],
    dependencies=[Depends(verify_secret_key)],
)

MOVIE_SEARCH_PROMPT = """Ти — кіноексперт-асистент. Шукаєш інформацію про фільм або серіал.
Назва: "{title}"

Поверни СТРОГО JSON (без markdown, без коментарів):
{{
  "found": true,
  "title": "Офіційна назва",
  "original_title": "Original Title",
  "year": 1984,
  "type": "movie",
  "genre": ["Бойовик", "Фантастика"],
  "director": "Джеймс Кемерон",
  "cast": ["Арнольд Шварценеггер", "Лінда Гамільтон"],
  "rating_imdb": 8.1,
  "rating_kinopoisk": 8.3,
  "duration_min": 107,
  "country": "США",
  "description": "Докладний опис 3-4 речення українською.",
  "review": "Короткий відгук + чому варто дивитись, 2-3 речення українською.",
  "where_to_watch": [
    {{"platform": "Netflix", "available": true, "url": "https://netflix.com"}},
    {{"platform": "Megogo", "available": true, "url": "https://megogo.net"}},
    {{"platform": "Kinopoisk", "available": true, "url": "https://hd.kinopoisk.ru"}},
    {{"platform": "YouTube", "available": false, "url": null}}
  ],
  "trailer_search": "https://www.youtube.com/results?search_query=Terminator+1984+trailer",
  "poster_search": "https://www.google.com/search?q=Terminator+1984+poster&tbm=isch"
}}

Якщо фільм не знайдено: {{"found": false, "title": "{title}", "description": "Фільм не знайдено"}}.
НЕ вигадуй URL стрімінгових платформ — вказуй лише головні сторінки платформ.
"""


class MovieSearchRequest(BaseModel):
    title: str


class WatchlistAddRequest(BaseModel):
    title: str
    original_title: Optional[str] = None
    year: Optional[int] = None
    type: str = "movie"
    rating_imdb: Optional[float] = None
    comment: Optional[str] = None
    url: Optional[str] = None


@router.post("/search")
async def search_movie(payload: MovieSearchRequest):
    """Шукає інформацію про фільм/серіал через Gemini AI."""
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Назва фільму не може бути порожньою")

    api_key = settings.GEMINI_API_KEY.strip() if settings.GEMINI_API_KEY else ""
    if not api_key:
        raise HTTPException(status_code=503, detail="Gemini AI не налаштований")

    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        prompt = MOVIE_SEARCH_PROMPT.format(title=title)
        res = client.models.generate_content(
            model=settings.AI_MODEL,
            contents=prompt,
        )
        raw = res.text.strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = "\n".join(raw.split("\n")[1:])
            raw = raw.rstrip("`").strip()

        data = json.loads(raw)
        return {"status": "success", "data": data}

    except json.JSONDecodeError as e:
        logger.warning(f"Movie search JSON parse error: {e}, raw: {raw[:200]}")
        raise HTTPException(status_code=500, detail="Помилка парсингу відповіді AI")
    except Exception as e:
        logger.error(f"Movie search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/watchlist", status_code=201)
def add_to_watchlist(payload: WatchlistAddRequest, db: Session = Depends(get_db)):
    """Зберігає фільм/серіал у список перегляду (media_notes)."""
    comment_parts = []
    if payload.original_title:
        comment_parts.append(f"Оригінал: {payload.original_title}")
    if payload.year:
        comment_parts.append(f"Рік: {payload.year}")
    if payload.rating_imdb:
        comment_parts.append(f"IMDb: {payload.rating_imdb}")
    if payload.comment:
        comment_parts.append(payload.comment)

    note = MediaNote(
        title=payload.title,
        type=payload.type or "movie",
        url=payload.url,
        author_creator=None,
        comment=" | ".join(comment_parts) if comment_parts else None,
        status="to_watch",
        rating=None,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return {"status": "saved", "id": note.id, "title": note.title}


@router.get("/watchlist", response_model=List[MediaNoteResponse])
def get_watchlist(
    type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Повертає список фільмів/серіалів (з media_notes де type=movie|series)."""
    query = db.query(MediaNote).filter(MediaNote.type.in_(["movie", "series"]))
    if type:
        query = query.filter(MediaNote.type == type)
    return query.order_by(desc(MediaNote.created_at)).limit(200).all()


@router.delete("/watchlist/{note_id}", status_code=204)
def delete_from_watchlist(note_id: int, db: Session = Depends(get_db)):
    """Видаляє запис зі списку перегляду."""
    note = db.query(MediaNote).filter(
        MediaNote.id == note_id,
        MediaNote.type.in_(["movie", "series"])
    ).first()
    if not note:
        raise HTTPException(status_code=404, detail="Запис не знайдено")
    db.delete(note)
    db.commit()
    return None
