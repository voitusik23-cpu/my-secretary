import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import verify_secret_key

logger = logging.getLogger("my_secretary.undo_service")

# In-memory storage for the last performed action
_last_action: Optional[Dict[str, Any]] = None


def record_action(domain: str, ids: List[int], summary: str) -> None:
    """Фіксує останню виконану дію для можливості відкату (Undo)."""
    global _last_action
    if not ids:
        return
    _last_action = {
        "domain": domain,
        "ids": ids,
        "summary": summary,
        "timestamp": datetime.utcnow().isoformat(),
    }
    logger.info(f"Recorded last action for undo: domain={domain}, ids={ids}, summary={summary}")


def get_last_action() -> Optional[Dict[str, Any]]:
    """Повертає інформацію про останню записану дію."""
    return _last_action


def undo_last_action(db: Session) -> Dict[str, Any]:
    """
    Відкочує (видаляє) записи, створені останньою командою.
    """
    global _last_action
    if not _last_action or not _last_action.get("ids"):
        return {
            "status": "warning",
            "message": "Немає дій для скасування або дія вже була скасована.",
            "undone": None
        }

    domain = _last_action["domain"]
    ids = _last_action["ids"]
    summary = _last_action["summary"]
    deleted_count = 0

    try:
        if domain == "shopping":
            from app.models.shopping import ShoppingItem
            deleted_count = db.query(ShoppingItem).filter(ShoppingItem.id.in_(ids)).delete(synchronize_session=False)

        elif domain == "finance":
            from app.models.finance import FinanceRecord
            deleted_count = db.query(FinanceRecord).filter(FinanceRecord.id.in_(ids)).delete(synchronize_session=False)

        elif domain == "tasks":
            from app.models.tasks import Task
            deleted_count = db.query(Task).filter(Task.id.in_(ids)).delete(synchronize_session=False)

        elif domain == "media_notes":
            from app.models.media_notes import MediaNote
            deleted_count = db.query(MediaNote).filter(MediaNote.id.in_(ids)).delete(synchronize_session=False)

        elif domain == "inventory":
            from app.modules.inventory.models import InventoryItem
            deleted_count = db.query(InventoryItem).filter(InventoryItem.id.in_(ids)).delete(synchronize_session=False)

        elif domain == "auto":
            from app.modules.auto.models import AutoLog
            deleted_count = db.query(AutoLog).filter(AutoLog.id.in_(ids)).delete(synchronize_session=False)

        elif domain == "utility" or domain == "utilities":
            from app.modules.utilities.models import UtilityReading
            deleted_count = db.query(UtilityReading).filter(UtilityReading.id.in_(ids)).delete(synchronize_session=False)

        elif domain == "fitness":
            from app.modules.fitness.models import FitnessLog
            deleted_count = db.query(FitnessLog).filter(FitnessLog.id.in_(ids)).delete(synchronize_session=False)

        elif domain == "health_vitals":
            from app.modules.health_vitals.models import BloodPressureLog
            deleted_count = db.query(BloodPressureLog).filter(BloodPressureLog.id.in_(ids)).delete(synchronize_session=False)

        elif domain == "music":
            from app.modules.music.models import MusicTrack
            deleted_count = db.query(MusicTrack).filter(MusicTrack.id.in_(ids)).delete(synchronize_session=False)

        elif domain == "business":
            from app.modules.business.models import BusinessTransaction
            deleted_count = db.query(BusinessTransaction).filter(BusinessTransaction.id.in_(ids)).delete(synchronize_session=False)

        db.commit()
        cleared_action = _last_action
        _last_action = None

        msg = f"Успішно скасовано: «{summary}» (видалено записів: {deleted_count})"
        logger.info(msg)
        return {
            "status": "success",
            "message": msg,
            "undone": cleared_action
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Failed to undo action: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Помилка скасування дії: {str(e)}"
        )


router = APIRouter(prefix="/system", tags=["System & Undo"], dependencies=[Depends(verify_secret_key)])


@router.post("/undo")
def trigger_undo(db: Session = Depends(get_db)):
    """
    Ендпоінт для миттєвого відкату останньої створеної дії (Undo).
    """
    return undo_last_action(db)


@router.get("/undo/status")
def get_undo_status():
    """
    Повертає інформацію про останню дію, яку можна відкотити.
    """
    last = get_last_action()
    return {
        "can_undo": last is not None,
        "last_action": last
    }
