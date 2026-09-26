from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.database import get_db
from app.auth import verify_secret_key
from app.models.media_notes import (
    MediaNote,
    MediaNoteCreate,
    MediaNoteUpdate,
    MediaNoteResponse,
)

router = APIRouter(prefix="/media_notes", tags=["MediaNotes"], dependencies=[Depends(verify_secret_key)])


@router.get("", response_model=List[MediaNoteResponse])
def get_media_notes(
    db: Session = Depends(get_db),
    type: Optional[str] = Query(None, description="Фильтр: movie, series, book, podcast, article, note"),
    status: Optional[str] = Query(None, description="Фильтр: to_watch, to_read, completed, in_progress, to_review"),
    limit: int = Query(100, ge=1, le=500),
):
    query = db.query(MediaNote)
    if type:
        query = query.filter(MediaNote.type == type)
    if status:
        query = query.filter(MediaNote.status == status)
    return query.order_by(desc(MediaNote.created_at)).limit(limit).all()


@router.post("", response_model=MediaNoteResponse, status_code=status.HTTP_201_CREATED)
def create_media_note(payload: MediaNoteCreate, db: Session = Depends(get_db)):
    note = MediaNote(
        title=payload.title,
        type=payload.type or "note",
        url=payload.url,
        author_creator=payload.author_creator,
        comment=payload.comment,
        status=payload.status or "to_review",
        rating=payload.rating,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.patch("/{note_id}/toggle", response_model=MediaNoteResponse)
def toggle_media_note(note_id: int, db: Session = Depends(get_db)):
    note = db.query(MediaNote).filter(MediaNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Заметка не найдена")

    if note.status == "completed":
        note.status = "to_review"
    else:
        note.status = "completed"

    db.commit()
    db.refresh(note)
    return note


@router.put("/{note_id}", response_model=MediaNoteResponse)
def update_media_note(note_id: int, payload: MediaNoteUpdate, db: Session = Depends(get_db)):
    note = db.query(MediaNote).filter(MediaNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Заметка не найдена")

    update_data = payload.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(note, field, val)

    db.commit()
    db.refresh(note)
    return note


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_media_note(note_id: int, db: Session = Depends(get_db)):
    note = db.query(MediaNote).filter(MediaNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Заметка не найдена")
    db.delete(note)
    db.commit()
    return None
