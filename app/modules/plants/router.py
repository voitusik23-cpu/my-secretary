from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import verify_secret_key
from app.modules.plants.models import Plant
from app.modules.plants.schemas import PlantCreate, PlantUpdate, PlantResponse

plants_router = APIRouter(
    prefix="/api/v1/plants",
    tags=["Plant Care (Квіти та сад)"],
    dependencies=[Depends(verify_secret_key)],
)


def _enrich_plant(plant: Plant) -> PlantResponse:
    next_water = plant.last_watered_at + timedelta(days=plant.watering_interval_days)
    now = datetime.utcnow()
    needs_water = now >= next_water
    delta_days = (next_water.date() - now.date()).days

    return PlantResponse(
        id=plant.id,
        name=plant.name,
        room=plant.room,
        watering_interval_days=plant.watering_interval_days,
        spraying_interval_days=plant.spraying_interval_days,
        notes=plant.notes,
        last_watered_at=plant.last_watered_at,
        last_sprayed_at=plant.last_sprayed_at,
        user_id=plant.user_id,
        created_at=plant.created_at,
        next_watering_at=next_water,
        needs_watering_now=needs_water,
        days_until_next_watering=delta_days,
    )


@plants_router.get("", response_model=List[PlantResponse])
def get_plants(
    only_needs_water: bool = Query(False, description="Показати тільки ті, що час полити"),
    user_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Список усіх рослин із розрахунком черги поливу."""
    query = db.query(Plant)
    if user_id:
        query = query.filter((Plant.user_id == user_id) | (Plant.user_id == "default"))
    
    plants = query.order_by(Plant.room.asc(), Plant.name.asc()).all()
    enriched = [_enrich_plant(p) for p in plants]

    if only_needs_water:
        enriched = [p for p in enriched if p.needs_watering_now]

    return enriched


@plants_router.post("", response_model=PlantResponse, status_code=status.HTTP_201_CREATED)
def create_plant(payload: PlantCreate, db: Session = Depends(get_db)):
    """Додати нову рослину до домашнього каталогу."""
    plant = Plant(
        name=payload.name.strip(),
        room=payload.room.strip() if payload.room else "Кімната",
        watering_interval_days=payload.watering_interval_days,
        spraying_interval_days=payload.spraying_interval_days,
        notes=payload.notes,
        last_watered_at=payload.last_watered_at or datetime.utcnow(),
        user_id=payload.user_id or "default",
    )
    db.add(plant)
    db.commit()
    db.refresh(plant)
    return _enrich_plant(plant)


@plants_router.post("/{plant_id}/water", response_model=PlantResponse)
def water_plant(plant_id: int, db: Session = Depends(get_db)):
    """Відмітити рослину як политу прямо зараз."""
    plant = db.query(Plant).filter(Plant.id == plant_id).first()
    if not plant:
        raise HTTPException(status_code=404, detail="Рослину не знайдено")
    plant.last_watered_at = datetime.utcnow()
    db.commit()
    db.refresh(plant)
    return _enrich_plant(plant)


@plants_router.delete("/{plant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plant(plant_id: int, db: Session = Depends(get_db)):
    """Видалити рослину з каталогу."""
    plant = db.query(Plant).filter(Plant.id == plant_id).first()
    if not plant:
        raise HTTPException(status_code=404, detail="Рослину не знайдено")
    db.delete(plant)
    db.commit()
    return None
