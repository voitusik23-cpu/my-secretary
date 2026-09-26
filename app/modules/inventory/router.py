import difflib
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.database import get_db
from app.auth import verify_secret_key
from app.modules.inventory.models import InventoryItem
from app.modules.inventory.schemas import (
    InventoryItemCreate,
    InventoryItemUpdate,
    InventoryItemResponse,
    InventoryQueryResponse,
)

router = APIRouter(prefix="/inventory", tags=["Inventory"], dependencies=[Depends(verify_secret_key)])


def _to_response(item: InventoryItem) -> InventoryItemResponse:
    return InventoryItemResponse(
        id=item.id,
        user_id=item.user_id,
        item_name=item.item_name,
        location=item.encrypted_location,  # Decrypted transparently by TypeDecorator
        tags=item.tags,
        dimensions_or_spec=item.dimensions_or_spec,
        updated_at=item.updated_at,
    )


@router.post("", response_model=InventoryItemResponse, status_code=status.HTTP_201_CREATED)
def add_or_update_item(payload: InventoryItemCreate, db: Session = Depends(get_db)):
    """
    Додає новий предмет або оновлює локацію вже існуючого за назвою.
    """
    existing = db.query(InventoryItem).filter(
        InventoryItem.item_name.ilike(payload.item_name.strip()),
        InventoryItem.user_id == (payload.user_id or "default")
    ).first()

    if existing:
        existing.encrypted_location = payload.location
        if payload.tags:
            existing.tags = payload.tags
        if payload.dimensions_or_spec:
            existing.dimensions_or_spec = payload.dimensions_or_spec
        existing.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return _to_response(existing)

    item = InventoryItem(
        user_id=payload.user_id or "default",
        item_name=payload.item_name.strip(),
        encrypted_location=payload.location,
        tags=payload.tags,
        dimensions_or_spec=payload.dimensions_or_spec,
        updated_at=datetime.utcnow(),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _to_response(item)


@router.get("", response_model=List[InventoryItemResponse])
def list_inventory(
    db: Session = Depends(get_db),
    tag: Optional[str] = Query(None, description="Фільтр за тегом"),
    limit: int = Query(100, ge=1, le=500),
):
    query = db.query(InventoryItem)
    if tag:
        query = query.filter(InventoryItem.tags.ilike(f"%{tag}%"))
    items = query.order_by(desc(InventoryItem.updated_at)).limit(limit).all()
    return [_to_response(i) for i in items]


@router.get("/where", response_model=InventoryQueryResponse)
def query_location(
    q: str = Query(..., description="Питання або назва речі, наприклад: 'Де мій паспорт?' або 'шуруповерт'"),
    db: Session = Depends(get_db),
):
    """
    Пошук речі з нечітким (fuzzy) пошуком за назвою та тегами.
    """
    clean_q = q.lower()
    for prefix in ["де лежить", "де знаходиться", "де шукати", "де мій", "де моя", "де мої", "где лежит", "где мой", "где моя", "где"]:
        if clean_q.startswith(prefix):
            clean_q = clean_q[len(prefix):].strip(" ?.,!")

    all_items = db.query(InventoryItem).all()
    matched = []

    for item in all_items:
        name_lower = item.item_name.lower()
        tags_lower = (item.tags or "").lower()

        # 1. Пряме або підрядкове входження
        if clean_q in name_lower or name_lower in clean_q or clean_q in tags_lower:
            matched.append((item, 1.0))
            continue

        # 2. Нечітке зіставлення (Fuzzy matching)
        ratio_name = difflib.SequenceMatcher(None, clean_q, name_lower).ratio()
        ratio_tags = difflib.SequenceMatcher(None, clean_q, tags_lower).ratio() if tags_lower else 0.0
        best_ratio = max(ratio_name, ratio_tags)

        if best_ratio >= 0.55:
            matched.append((item, best_ratio))

    matched.sort(key=lambda x: x[1], reverse=True)
    results = [_to_response(item) for item, _ in matched]

    if results:
        top = results[0]
        msg = f"«{top.item_name}» знаходиться тут: {top.location}"
        return InventoryQueryResponse(found=True, query=q, message=msg, items=results)
    else:
        return InventoryQueryResponse(
            found=False,
            query=q,
            message=f"На жаль, інформації про місцезнаходження «{q}» немає в інвентарі.",
            items=[]
        )


@router.get("/{item_id}", response_model=InventoryItemResponse)
def get_inventory_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Річ не знайдена в інвентарі")
    return _to_response(item)


@router.put("/{item_id}", response_model=InventoryItemResponse)
def update_inventory_item(item_id: int, payload: InventoryItemUpdate, db: Session = Depends(get_db)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Річ не знайдена в інвентарі")

    if payload.item_name is not None:
        item.item_name = payload.item_name.strip()
    if payload.location is not None:
        item.encrypted_location = payload.location
    if payload.tags is not None:
        item.tags = payload.tags
    if payload.dimensions_or_spec is not None:
        item.dimensions_or_spec = payload.dimensions_or_spec

    item.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(item)
    return _to_response(item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_inventory_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Річ не знайдена")
    db.delete(item)
    db.commit()
    return None
