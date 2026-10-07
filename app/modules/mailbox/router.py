from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from app.database import get_db
from app.auth import verify_secret_key
from app.modules.mailbox.models import MailAccount, MailMessage
from app.modules.mailbox.schemas import (
    MailAccountCreate,
    MailAccountResponse,
    MailMessageResponse,
    MailboxCheckResponse,
    CleanSpamRequest,
    CleanSpamResponse,
    TestConnectionRequest,
)
from app.modules.mailbox.service import (
    resolve_imap_settings,
    test_imap_connection,
    fetch_account_emails,
    fetch_single_email_body,
    delete_emails_imap,
    generate_mail_digest,
)

router = APIRouter(
    prefix="/mailbox",
    tags=["Mailbox & Spam Cleaner"],
    dependencies=[Depends(verify_secret_key)],
)


@router.get("/accounts", response_model=List[MailAccountResponse])
def get_mail_accounts(db: Session = Depends(get_db)):
    """Повертає список усіх підключених поштових скриньок зі статистикою."""
    accounts = db.query(MailAccount).order_by(desc(MailAccount.created_at)).all()
    res = []
    for acc in accounts:
        # Message counts
        total_msgs = db.query(func.count(MailMessage.id)).filter(
            MailMessage.account_id == acc.id, MailMessage.is_deleted == False
        ).scalar() or 0

        spam_msgs = db.query(func.count(MailMessage.id)).filter(
            MailMessage.account_id == acc.id, MailMessage.is_deleted == False, MailMessage.is_spam == True
        ).scalar() or 0

        important_msgs = db.query(func.count(MailMessage.id)).filter(
            MailMessage.account_id == acc.id, MailMessage.is_deleted == False, MailMessage.category == "important"
        ).scalar() or 0

        res.append(MailAccountResponse(
            id=acc.id,
            email=acc.email,
            name=acc.name or acc.email,
            imap_server=acc.imap_server,
            imap_port=acc.imap_port,
            is_active=acc.is_active,
            last_checked_at=acc.last_checked_at,
            created_at=acc.created_at,
            messages_count=total_msgs,
            spam_count=spam_msgs,
            important_count=important_msgs,
        ))
    return res


@router.post("/accounts/test")
def test_account_connection(payload: TestConnectionRequest):
    """Перевіряє зв'язок із поштовим сервером перед збереженням."""
    server, port, use_ssl = resolve_imap_settings(payload.email, payload.imap_server, payload.imap_port)
    res = test_imap_connection(payload.email, payload.password, server, port, use_ssl=payload.use_ssl)
    return res


@router.post("/accounts", response_model=MailAccountResponse, status_code=status.HTTP_201_CREATED)
def add_mail_account(payload: MailAccountCreate, db: Session = Depends(get_db)):
    """Підключає нову поштову скриньку."""
    server, port, use_ssl = resolve_imap_settings(payload.email, payload.imap_server, payload.imap_port)

    clean_pwd = payload.password.strip()
    if "gmail" in server.lower() and len(clean_pwd.replace(" ", "")) == 16:
        clean_pwd = clean_pwd.replace(" ", "")

    # Test login first to give immediate clear feedback
    test_res = test_imap_connection(payload.email, clean_pwd, server, port, use_ssl=use_ssl)
    if not test_res.get("success"):
        raise HTTPException(status_code=400, detail=test_res.get("message"))

    # Check if duplicate
    existing = db.query(MailAccount).filter(MailAccount.email == payload.email.strip().lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Скринька {payload.email} вже підключена!")

    acc = MailAccount(
        email=payload.email.strip().lower(),
        name=payload.name.strip() if payload.name else payload.email.strip(),
        imap_server=server,
        imap_port=port,
        use_ssl=use_ssl,
        password=clean_pwd,
        is_active=True,
    )
    db.add(acc)
    db.commit()
    db.refresh(acc)

    return MailAccountResponse(
        id=acc.id,
        email=acc.email,
        name=acc.name,
        imap_server=acc.imap_server,
        imap_port=acc.imap_port,
        is_active=acc.is_active,
        last_checked_at=acc.last_checked_at,
        created_at=acc.created_at,
        messages_count=0,
        spam_count=0,
        important_count=0,
    )


@router.delete("/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_mail_account(account_id: int, db: Session = Depends(get_db)):
    """Видаляє підключену скриньку."""
    acc = db.query(MailAccount).filter(MailAccount.id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Скриньку не знайдено")
    db.delete(acc)
    db.commit()
    return None


@router.post("/check", response_model=MailboxCheckResponse)
def check_mailboxes(
    account_id: Optional[int] = None, 
    limit: int = Query(150, description="Кількість листів для перевірки"), 
    db: Session = Depends(get_db)
):
    """
    Зчитує пошту з усіх або вибраної скриньки, класифікує спам та важливі повідомлення.
    """
    query = db.query(MailAccount).filter(MailAccount.is_active == True)
    if account_id:
        query = query.filter(MailAccount.id == account_id)

    accounts = query.all()
    if not accounts:
        return MailboxCheckResponse(
            status="empty",
            checked_accounts=0,
            new_messages=0,
            spam_detected=0,
            important_detected=0,
            summary="Немає активних поштових скриньок для перевірки.",
        )

    total_new = 0
    total_spam = 0
    total_important = 0
    top_important_subjects = []

    for acc in accounts:
        # Pre-fetch existing UIDs for this account so we skip already analyzed messages and scan older ones
        existing_uids = set(
            r[0] for r in db.query(MailMessage.message_uid).filter(
                MailMessage.account_id == acc.id
            ).all()
        )
        acc_emails = fetch_account_emails(acc, limit=limit, exclude_uids=existing_uids)
        acc.last_checked_at = datetime.utcnow()

        for em in acc_emails:
            # Check if message UID already exists
            existing_msg = db.query(MailMessage).filter(
                MailMessage.account_id == acc.id,
                MailMessage.message_uid == em["message_uid"],
            ).first()

            if not existing_msg:
                msg = MailMessage(
                    account_id=acc.id,
                    message_uid=em["message_uid"],
                    subject=em["subject"],
                    sender=em["sender"],
                    sender_email=em["sender_email"],
                    recipient=em["recipient"],
                    date=em["date"],
                    snippet=em["snippet"],
                    category=em["category"],
                    is_spam=em["is_spam"],
                    spam_reason=em["spam_reason"],
                    is_deleted=False,
                )
                db.add(msg)
                total_new += 1
                if em["is_spam"]:
                    total_spam += 1
                if em["category"] == "important":
                    total_important += 1
                    if em["subject"] and em["subject"] not in top_important_subjects:
                        top_important_subjects.append(em["subject"])

    db.commit()

    summary_text = generate_mail_digest(
        accounts_count=len(accounts),
        total_new=total_new,
        spam_count=total_spam,
        important_count=total_important,
        important_subjects=top_important_subjects,
    )

    return MailboxCheckResponse(
        status="success",
        checked_accounts=len(accounts),
        new_messages=total_new,
        spam_detected=total_spam,
        important_detected=total_important,
        summary=summary_text,
    )


@router.get("/messages", response_model=List[MailMessageResponse])
def get_mailbox_messages(
    category: Optional[str] = Query("all", description="spam | important | other | all"),
    account_id: Optional[int] = None,
    limit: int = Query(1000, description="Кількість листів для повернення"),
    db: Session = Depends(get_db),
):
    """Повертає список отриманих листів із фільтрацією за категорією або скринькою."""
    query = db.query(MailMessage).filter(MailMessage.is_deleted == False)

    if account_id:
        query = query.filter(MailMessage.account_id == account_id)

    if category == "spam":
        query = query.filter(MailMessage.is_spam == True)
    elif category == "important":
        query = query.filter(MailMessage.category == "important")
    elif category == "other":
        query = query.filter(MailMessage.category == "other", MailMessage.is_spam == False)

    messages = query.order_by(desc(MailMessage.date)).limit(limit).all()

    # Preload account names for quick display
    acc_map = {a.id: a for a in db.query(MailAccount).all()}

    res = []
    for m in messages:
        acc = acc_map.get(m.account_id)
        res.append(MailMessageResponse(
            id=m.id,
            account_id=m.account_id,
            account_name=acc.name if acc else None,
            account_email=acc.email if acc else None,
            message_uid=m.message_uid,
            subject=m.subject or "(Без теми)",
            sender=m.sender or "(Невідомо)",
            sender_email=m.sender_email,
            date=m.date,
            snippet=m.snippet or "",
            category=m.category or "other",
            is_spam=m.is_spam,
            spam_reason=m.spam_reason,
            is_read=m.is_read,
        ))
    return res


@router.post("/clean-spam", response_model=CleanSpamResponse)
def clean_spam_messages(payload: CleanSpamRequest, db: Session = Depends(get_db)):
    """
    В 1 клік видаляє всі або вибрані спам-листи з поштових серверів IMAP та з бази.
    """
    query = db.query(MailMessage).filter(MailMessage.is_deleted == False, MailMessage.is_spam == True)

    if payload.account_id:
        query = query.filter(MailMessage.account_id == payload.account_id)

    if payload.message_ids and len(payload.message_ids) > 0:
        query = query.filter(MailMessage.id.in_(payload.message_ids))

    spam_msgs = query.all()
    if not spam_msgs:
        return CleanSpamResponse(
            status="ok",
            deleted_count=0,
            message="Спам-повідомлень для видалення не знайдено.",
        )

    # Group UIDs by account
    acc_uids_map = {}
    for m in spam_msgs:
        acc_uids_map.setdefault(m.account_id, []).append(m.message_uid)

    total_deleted_server = 0
    accounts = db.query(MailAccount).filter(MailAccount.id.in_(list(acc_uids_map.keys()))).all()
    acc_obj_map = {a.id: a for a in accounts}

    for acc_id, uids in acc_uids_map.items():
        acc = acc_obj_map.get(acc_id)
        if acc:
            del_count = delete_emails_imap(acc, uids)
            total_deleted_server += del_count

    # Mark deleted in local DB
    for m in spam_msgs:
        m.is_deleted = True
    db.commit()

    return CleanSpamResponse(
        status="success",
        deleted_count=len(spam_msgs),
        message=f"🧹 Успішно видалено {len(spam_msgs)} рекламних листів і спаму із сервера!",
    )


@router.get("/messages/{message_id}")
def get_single_message(message_id: int, db: Session = Depends(get_db)):
    """Повертає деталі та повний текст попереднього перегляду листа."""
    msg = db.query(MailMessage).filter(MailMessage.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Лист не знайдено")

    acc = db.query(MailAccount).filter(MailAccount.id == msg.account_id).first()

    # If snippet is empty or short, fetch full text live from IMAP and cache
    body_text = msg.snippet or ""
    if len(body_text.strip()) < 50 and acc:
        try:
            live_body = fetch_single_email_body(acc, msg.message_uid)
            if live_body:
                body_text = live_body
                msg.snippet = live_body[:1000]
                db.commit()
        except Exception:
            pass

    # Build webmail direct link
    webmail_url = None
    if acc:
        server_lower = acc.imap_server.lower()
        if "gmail" in server_lower:
            import urllib.parse
            q = urllib.parse.quote(msg.subject or "")
            webmail_url = f"https://mail.google.com/mail/u/0/#search/{q}"
        elif "ukr.net" in server_lower:
            webmail_url = "https://mail.ukr.net/"
        elif "outlook" in server_lower or "office365" in server_lower:
            webmail_url = "https://outlook.live.com/mail/"
        elif "yahoo" in server_lower:
            webmail_url = "https://mail.yahoo.com/"

    return {
        "id": msg.id,
        "account_id": msg.account_id,
        "account_name": acc.name if acc else None,
        "account_email": acc.email if acc else None,
        "message_uid": msg.message_uid,
        "subject": msg.subject or "(Без теми)",
        "sender": msg.sender or "(Невідомо)",
        "sender_email": msg.sender_email,
        "recipient": msg.recipient,
        "date": msg.date,
        "category": msg.category or "other",
        "is_spam": msg.is_spam,
        "spam_reason": msg.spam_reason,
        "is_read": msg.is_read,
        "body": body_text,
        "webmail_url": webmail_url,
    }


@router.delete("/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_single_message(message_id: int, db: Session = Depends(get_db)):
    """Видаляє один вибраний лист із сервера та бази."""
    msg = db.query(MailMessage).filter(MailMessage.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Лист не знайдено")

    acc = db.query(MailAccount).filter(MailAccount.id == msg.account_id).first()
    if acc:
        delete_emails_imap(acc, [msg.message_uid])

    msg.is_deleted = True
    db.commit()
    return None


@router.get("/summary")
def get_mailbox_summary(db: Session = Depends(get_db)):
    """Повертає загальну статистику та голосовий дайджест."""
    accounts_count = db.query(func.count(MailAccount.id)).filter(MailAccount.is_active == True).scalar() or 0
    total_messages = db.query(func.count(MailMessage.id)).filter(MailMessage.is_deleted == False).scalar() or 0
    spam_messages = db.query(func.count(MailMessage.id)).filter(
        MailMessage.is_deleted == False, MailMessage.is_spam == True
    ).scalar() or 0
    important_messages = db.query(func.count(MailMessage.id)).filter(
        MailMessage.is_deleted == False, MailMessage.category == "important"
    ).scalar() or 0

    top_important = db.query(MailMessage.subject).filter(
        MailMessage.is_deleted == False, MailMessage.category == "important"
    ).order_by(desc(MailMessage.date)).limit(3).all()
    important_subjects = [r[0] for r in top_important if r[0]]

    digest = generate_mail_digest(
        accounts_count=accounts_count,
        total_new=total_messages,
        spam_count=spam_messages,
        important_count=important_messages,
        important_subjects=important_subjects,
    )

    return {
        "accounts_count": accounts_count,
        "total_messages": total_messages,
        "spam_messages": spam_messages,
        "important_messages": important_messages,
        "digest": digest,
    }


@router.post("/messages/{message_id}/whitelist")
def whitelist_message(message_id: int, db: Session = Depends(get_db)):
    """
    Позначає лист як 'не спам', зберігає у важливих та прибирає зі спаму.
    """
    msg = db.query(MailMessage).filter(MailMessage.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Лист не знайдено")

    msg.is_spam = False
    msg.category = "important"
    msg.spam_reason = None
    db.commit()
    db.refresh(msg)
    return {"status": "ok", "message": f"Лист «{msg.subject or 'Без теми'}» збережено як важливий та вилучено зі спаму!"}

