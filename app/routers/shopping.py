from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.database import get_db
from app.auth import verify_secret_key
from app.models.shopping import (
    ShoppingItem,
    ShoppingCreate,
    ShoppingUpdate,
    ShoppingResponse,
    ShoppingBatchCreate,
)

router = APIRouter(prefix="/shopping", tags=["Shopping"], dependencies=[Depends(verify_secret_key)])


@router.get("", response_model=List[ShoppingResponse])
def get_shopping_items(
    db: Session = Depends(get_db),
    is_purchased: Optional[bool] = Query(None, description="Фильтр по статусу покупки"),
    category: Optional[str] = Query(None, description="Фильтр по категории"),
    limit: int = Query(100, ge=1, le=500),
):
    query = db.query(ShoppingItem)
    if is_purchased is not None:
        query = query.filter(ShoppingItem.is_purchased == is_purchased)
    if category:
        query = query.filter(ShoppingItem.category == category)
    # Put unpurchased first, then by created_at desc
    return query.order_by(ShoppingItem.is_purchased.asc(), desc(ShoppingItem.created_at)).limit(limit).all()


@router.post("", response_model=ShoppingResponse, status_code=status.HTTP_201_CREATED)
def create_shopping_item(payload: ShoppingCreate, db: Session = Depends(get_db)):
    item = ShoppingItem(
        item=payload.item,
        category=payload.category or "Продукты",
        quantity=payload.quantity or "1 шт",
        is_purchased=payload.is_purchased or False,
        notes=payload.notes,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.post("/batch", response_model=List[ShoppingResponse], status_code=status.HTTP_201_CREATED)
def create_shopping_batch(payload: ShoppingBatchCreate, db: Session = Depends(get_db)):
    created = []
    for p in payload.items:
        item = ShoppingItem(
            item=p.item,
            category=p.category or "Продукты",
            quantity=p.quantity or "1 шт",
            is_purchased=p.is_purchased or False,
            notes=p.notes,
        )
        db.add(item)
        created.append(item)
    db.commit()
    for item in created:
        db.refresh(item)
    return created


@router.patch("/{item_id}/toggle", response_model=ShoppingResponse)
def toggle_shopping_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(ShoppingItem).filter(ShoppingItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Товар не найден")
    item.is_purchased = not item.is_purchased
    db.commit()
    db.refresh(item)
    return item


@router.put("/{item_id}", response_model=ShoppingResponse)
def update_shopping_item(item_id: int, payload: ShoppingUpdate, db: Session = Depends(get_db)):
    item = db.query(ShoppingItem).filter(ShoppingItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Товар не найден")

    update_data = payload.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(item, field, val)

    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shopping_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(ShoppingItem).filter(ShoppingItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Товар не найден")
    db.delete(item)
    db.commit()
    return None


@router.post("/clear-completed", status_code=status.HTTP_200_OK)
def clear_completed_shopping_items(db: Session = Depends(get_db)):
    deleted_count = db.query(ShoppingItem).filter(ShoppingItem.is_purchased == True).delete()
    db.commit()
    return {"status": "success", "deleted_count": deleted_count}
