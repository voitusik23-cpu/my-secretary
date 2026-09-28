"""
Movies module API endpoints: Search, Watchlist management.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.auth import verify_secret_key
from app.models.media_notes import MediaNote, MediaNoteResponse
from app.modules.movies.service import search_movie_ai

router = APIRouter(
    prefix="/movies",
    tags=["Movies"],
    dependencies=[Depends(verify_secret_key)],
)


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
    """Шукає фільм/серіал через AI з посиланнями на Kinogo, Rezka, торренти та стрімінги."""
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Назва фільму не може бути порожньою")
    data = await search_movie_ai(title)
    return {"status": "success", "data": data}


@router.post("/watchlist", status_code=201)
def add_to_watchlist(payload: WatchlistAddRequest, db: Session = Depends(get_db)):
    """Зберігає фільм/серіал у список перегляду (media_notes)."""
    comment_parts = []
    if payload.original_title: comment_parts.append(f"Оригінал: {payload.original_title}")
    if payload.year: comment_parts.append(f"Рік: {payload.year}")
    if payload.rating_imdb: comment_parts.append(f"IMDb: {payload.rating_imdb}")
    if payload.comment: comment_parts.append(payload.comment)

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
def get_watchlist(type: Optional[str] = None, db: Session = Depends(get_db)):
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
