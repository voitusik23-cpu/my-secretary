from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.database import get_db
from app.auth import verify_secret_key
from app.models.tasks import (
    Task,
    TaskCreate,
    TaskUpdate,
    TaskResponse,
)

router = APIRouter(prefix="/tasks", tags=["Tasks"], dependencies=[Depends(verify_secret_key)])


@router.get("", response_model=List[TaskResponse])
def get_tasks(
    db: Session = Depends(get_db),
    is_completed: Optional[bool] = Query(None, description="Фильтр по статусу выполнения"),
    priority: Optional[str] = Query(None, description="Фильтр по приоритету (low, medium, high)"),
    category: Optional[str] = Query(None, description="Фильтр по категории"),
    limit: int = Query(100, ge=1, le=500),
):
    query = db.query(Task)
    if is_completed is not None:
        query = query.filter(Task.is_completed == is_completed)
    if priority:
        query = query.filter(Task.priority == priority)
    if category:
        query = query.filter(Task.category == category)
    # Uncompleted first, then by due_date or created_at
    return query.order_by(Task.is_completed.asc(), Task.due_date.asc().nullslast(), desc(Task.created_at)).limit(limit).all()


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(payload: TaskCreate, db: Session = Depends(get_db)):
    task = Task(
        title=payload.title,
        description=payload.description,
        due_date=payload.due_date,
        priority=payload.priority or "medium",
        is_completed=payload.is_completed or False,
        category=payload.category or "Личное",
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.patch("/{task_id}/toggle", response_model=TaskResponse)
def toggle_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    task.is_completed = not task.is_completed
    task.completed_at = datetime.utcnow() if task.is_completed else None

    db.commit()
    db.refresh(task)
    return task


@router.put("/{task_id}", response_model=TaskResponse)
def update_task(task_id: int, payload: TaskUpdate, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    update_data = payload.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(task, field, val)

    if payload.is_completed is not None:
        task.completed_at = datetime.utcnow() if task.is_completed else None

    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    db.delete(task)
    db.commit()
    return None
