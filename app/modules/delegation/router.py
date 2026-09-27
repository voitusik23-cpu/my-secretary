import logging
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import verify_secret_key
from app.config import settings
from app.modules.delegation.models import FamilyContact
from app.modules.delegation.schemas import (
    FamilyContactCreate,
    FamilyContactUpdate,
    FamilyContactResponse,
    DelegationSendRequest,
    DelegationSendResponse,
)
from app.core.telegram_bot import send_delegated_list, process_telegram_webhook_update

logger = logging.getLogger("my_secretary.delegation_router")

router = APIRouter(prefix="/delegation", tags=["Family Delegation"])


# --- Contact Management (Protected by secret key) ---
@router.get("/contacts", response_model=List[FamilyContactResponse], dependencies=[Depends(verify_secret_key)])
def list_family_contacts(db: Session = Depends(get_db)):
    """Повертає список зареєстрованих контактів сім'ї."""
    return db.query(FamilyContact).order_by(FamilyContact.id.asc()).all()


@router.post("/contacts", response_model=FamilyContactResponse, dependencies=[Depends(verify_secret_key)])
def create_family_contact(payload: FamilyContactCreate, db: Session = Depends(get_db)):
    """Додає нового члена сім'ї для делегування через Telegram."""
    contact = FamilyContact(
        name=payload.name.strip(),
        relationship=payload.relationship.strip().lower(),
        telegram_chat_id=payload.telegram_chat_id.strip() if payload.telegram_chat_id else None,
        phone=payload.phone.strip() if payload.phone else None,
        can_add_items=payload.can_add_items,
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


@router.put("/contacts/{contact_id}", response_model=FamilyContactResponse, dependencies=[Depends(verify_secret_key)])
def update_family_contact(contact_id: int, payload: FamilyContactUpdate, db: Session = Depends(get_db)):
    """Оновлює контактні дані або права доступу члена сім'ї."""
    contact = db.query(FamilyContact).filter(FamilyContact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Контакт не знайдено")

    update_data = payload.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(contact, field, val)

    db.commit()
    db.refresh(contact)
    return contact


@router.delete("/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(verify_secret_key)])
def delete_family_contact(contact_id: int, db: Session = Depends(get_db)):
    """Видаляє контакт зі списку."""
    contact = db.query(FamilyContact).filter(FamilyContact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Контакт не знайдено")
    db.delete(contact)
    db.commit()
    return None


# --- Outgoing Delegation ---
@router.post("/send", response_model=DelegationSendResponse, dependencies=[Depends(verify_secret_key)])
async def send_to_contact(payload: DelegationSendRequest, db: Session = Depends(get_db)):
    """
    Форматує та відправляє список покупок або завдань вибраному контакту в Telegram.
    """
    contact = None
    if payload.contact_id:
        contact = db.query(FamilyContact).filter(FamilyContact.id == payload.contact_id).first()
    elif payload.relationship:
        rel = payload.relationship.strip().lower()
        contact = db.query(FamilyContact).filter(
            (FamilyContact.relationship == rel) | (FamilyContact.name.ilike(f"%{rel}%"))
        ).first()

    if not contact:
        raise HTTPException(status_code=404, detail="Контакт для делегування не знайдено")

    res = await send_delegated_list(
        db=db,
        contact=contact,
        domain=payload.domain,
        custom_message=payload.custom_message
    )

    if not res.get("sent"):
        raise HTTPException(status_code=400, detail=res.get("message", "Не вдалося відправити повідомлення"))

    return DelegationSendResponse(
        status="success",
        contact_name=contact.name,
        message_sent=res.get("message_sent", ""),
        telegram_message_id=res.get("telegram_message_id"),
        simulated=res.get("simulated", False)
    )


# --- Incoming Telegram Webhook ---
@router.post("/telegram-webhook")
async def telegram_webhook(
    update: Dict[str, Any],
    db: Session = Depends(get_db),
    x_telegram_bot_api_secret_token: Optional[str] = Header(None)
):
    """
    Вхідний вебхук для Telegram бота: приймає повідомлення від членів сім'ї та додає їх у списки.
    """
    secret = settings.TELEGRAM_WEBHOOK_SECRET.strip() if settings.TELEGRAM_WEBHOOK_SECRET else ""
    if secret and x_telegram_bot_api_secret_token != secret:
        raise HTTPException(status_code=403, detail="Invalid Telegram webhook secret")

    return await process_telegram_webhook_update(update=update, db=db)
