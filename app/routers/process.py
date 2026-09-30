from datetime import datetime
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.database import get_db
from app.auth import verify_secret_key
from app.services.ai_parser import parse_with_gemini
from app.models.finance import FinanceRecord, FinanceResponse
from app.models.shopping import ShoppingItem, ShoppingResponse
from app.models.tasks import Task, TaskResponse
from app.models.media_notes import MediaNote, MediaNoteResponse
from app.services.currency import get_usd_uah_rate

router = APIRouter(prefix="", tags=["Process & Feed"], dependencies=[Depends(verify_secret_key)])


class ProcessTextRequest(BaseModel):
    text: str = Field(..., description="Голосовая расшифровка или текст команды")
    current_tab: Optional[str] = Field(None, description="Поточна активна вкладка користувача")


async def _save_parsed_actions(actions: List[Dict[str, Any]], db: Session) -> Dict[str, List[Any]]:
    """Зберігає вилучені AI дії у відповідні таблиці БД."""
    created_items: Dict[str, List[Any]] = {k: [] for k in ["finance", "shopping", "tasks", "media_notes", "auto", "health_vitals", "movies", "music", "business"]}

    for action in actions:
        domain = action.get("domain")
        data = action.get("data", {})
        if not data:
            continue

        try:
            if domain == "finance":
                amount = float(data.get("amount", 0))
                if amount > 0:
                    rec = FinanceRecord(amount=amount, currency=(data.get("currency") or "UAH").upper(), category=data.get("category", "Різне"), type=data.get("type", "expense"), description=data.get("description"), date=datetime.utcnow())
                    db.add(rec); db.flush()
                    created_items["finance"].append(FinanceResponse.model_validate(rec).model_dump())

            elif domain == "shopping":
                item_name = data.get("item", "").strip()
                if item_name:
                    item = ShoppingItem(item=item_name, category=data.get("category", "Продукты"), quantity=data.get("quantity", "1 шт"), is_purchased=False, notes=data.get("notes"))
                    db.add(item); db.flush()
                    created_items["shopping"].append(ShoppingResponse.model_validate(item).model_dump())

            elif domain == "tasks":
                title = data.get("title", "").strip()
                if title:
                    due_date = None
                    if data.get("due_date"):
                        try: due_date = datetime.fromisoformat(data["due_date"].replace("Z", "+00:00"))
                        except Exception: due_date = None
                    task = Task(title=title, description=data.get("description"), due_date=due_date, priority=data.get("priority", "medium"), category=data.get("category", "Роботи"), is_completed=False)
                    db.add(task); db.flush()
                    created_items["tasks"].append(TaskResponse.model_validate(task).model_dump())

            elif domain == "media_notes":
                title = data.get("title", "").strip()
                if title:
                    note = MediaNote(title=title, type=data.get("type", "note"), url=data.get("url"), author_creator=data.get("author_creator"), comment=data.get("comment"), status=data.get("status", "to_review"), rating=data.get("rating"))
                    db.add(note); db.flush()
                    created_items["media_notes"].append(MediaNoteResponse.model_validate(note).model_dump())

            elif domain == "auto":
                from app.modules.auto.models import AutoLog
                ml = data.get("current_mileage") or data.get("mileage")
                if isinstance(ml, str):
                    m_d = re.search(r'\d+', ml.replace(" ", "").replace(",", ""))
                    ml = int(m_d.group(0)) if m_d else None
                ev = data.get("event_type", "mileage")
                nt = data.get("notes") or data.get("description") or f"Пробіг: {ml} км"
                log = AutoLog(event_type=ev, current_mileage=ml, encrypted_notes=nt, created_at=datetime.utcnow())
                db.add(log); db.flush()
                created_items["auto"].append({"id": log.id, "mileage": ml, "event_type": ev, "notes": nt})

            elif domain == "health_vitals":
                from app.modules.health_vitals.models import BloodPressureLog
                from app.modules.health_vitals.service import infer_time_of_day
                s_v, d_v = int(data.get("systolic", 0)), int(data.get("diastolic", 0))
                if s_v > 0 and d_v > 0:
                    p_v = int(data.get("pulse")) if data.get("pulse") else None
                    rec_dt = datetime.utcnow()
                    b_log = BloodPressureLog(recorded_at=rec_dt, systolic=s_v, diastolic=d_v, pulse=p_v, time_of_day=data.get("time_of_day") or infer_time_of_day(rec_dt), medications_taken=data.get("medications_taken"), encrypted_notes=data.get("notes"), created_at=rec_dt)
                    db.add(b_log); db.flush()
                    created_items["health_vitals"].append({"id": b_log.id, "reading": f"{s_v}/{d_v}"})

            elif domain == "movies":
                from app.modules.movies.service import process_voice_movie
                m_res = await process_voice_movie(data, db)
                if m_res:
                    created_items["movies"].append(m_res)

            elif domain == "music":
                from app.modules.music.service import parse_and_import_shazam
                q_text = data.get("title") or data.get("query") or data.get("url") or data.get("text") or ""
                if q_text:
                    if data.get("artist") and data.get("title"):
                        q_text = f"{data['artist']} - {data['title']}"
                    pl = data.get("playlist") or "Shazam"
                    m_track = await parse_and_import_shazam(q_text, playlist=pl, db=db)
                    if m_track and isinstance(m_track, dict) and m_track.get("id"):
                        created_items["music"].append(m_track)

            elif domain == "business":
                from app.modules.business.models import BusinessTransaction
                from app.modules.business.schemas import BusinessTransactionResponse
                amt = float(data.get("amount", 0))
                if amt > 0:
                    b_type = data.get("type", "expense")
                    desc = data.get("description") or "Витрата по бізнесу"
                    cat = data.get("category", "Матеріали")
                    b_tx = BusinessTransaction(
                        type=b_type,
                        amount=amt,
                        description=desc,
                        category=cat,
                        notes=data.get("notes"),
                        created_at=datetime.utcnow(),
                    )
                    db.add(b_tx)
                    db.flush()
                    created_items["business"].append(BusinessTransactionResponse.model_validate(b_tx).model_dump())

        except Exception as e:
            continue

    db.commit()
    try:
        from app.core.undo_service import record_action
        for dom in ["shopping", "finance", "tasks", "media_notes", "auto", "health_vitals", "movies", "music", "business"]:
            its = created_items.get(dom, [])
            if its:
                ids = [it["id"] for it in its if "id" in it]
                if ids: record_action(dom, ids, f"{dom}: {len(ids)} записів")
    except Exception:
        pass
    return created_items


@router.post("/process", status_code=status.HTTP_200_OK)
async def process_text_input(payload: ProcessTextRequest, db: Session = Depends(get_db)):
    """Аналізує текст через Gemini AI та розподіляє по категоріях."""
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Текст запроса не может быть пустым")

    lower = text.lower()
    if any(k in lower for k in ["отмени последнее", "отменить последнее", "удали то что", "скасуй останнє", "відміни останнє"]):
        from app.core.undo_service import undo_last_action
        u_res = undo_last_action(db)
        return {"status": u_res.get("status", "success"), "summary": u_res.get("message", "Дію скасовано"), "transcription": text, "actions_count": 0, "created": {}}

    parsed = await parse_with_gemini(text=text, current_tab=payload.current_tab)
    actions = parsed.get("actions", [])
    created = await _save_parsed_actions(actions, db)

    return {
        "status": "success",
        "summary": parsed.get("summary", "Запись обработана"),
        "transcription": parsed.get("transcription", text),
        "actions_count": len(actions),
        "created": created,
    }


@router.post("/process/audio", status_code=status.HTTP_200_OK)
async def process_audio_input(
    audio: UploadFile = File(..., description="Аудіофайл"),
    text: Optional[str] = Form(None),
    current_tab: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """Приймає аудіозапис, розпізнає та зберігає дії."""
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Файл аудио пустой")

    mime_type = audio.content_type or "audio/webm"
    parsed = await parse_with_gemini(text=text, audio_bytes=audio_bytes, mime_type=mime_type, current_tab=current_tab)

    transcription = parsed.get("transcription", "")
    lower_tr = transcription.lower()
    if any(k in lower_tr for k in ["отмени последнее", "отменить последнее", "удали то что", "скасуй останнє", "відміни останнє"]):
        from app.core.undo_service import undo_last_action
        u_res = undo_last_action(db)
        return {"status": u_res.get("status", "success"), "summary": u_res.get("message", "Дію скасовано"), "transcription": transcription, "actions_count": 0, "created": {}}

    actions = parsed.get("actions", [])
    created = await _save_parsed_actions(actions, db)
    summary = parsed.get("summary", "Голосовая заметка сохранена")
    resp_status = "success" if (actions or transcription) else "warning"

    return {
        "status": resp_status,
        "summary": summary,
        "transcription": transcription,
        "actions_count": len(actions),
        "created": created,
    }


@router.get("/feed", status_code=status.HTTP_200_OK)
def get_unified_feed(db: Session = Depends(get_db), limit: int = 40):
    """Повертає єдину стрічку останніх дій у хронологічному порядку."""
    feed = []

    # 1. Finance
    usd_rate = get_usd_uah_rate()
    fin_records = db.query(FinanceRecord).order_by(desc(FinanceRecord.date)).limit(limit // 2).all()
    for f in fin_records:
        curr = (f.currency or "UAH").upper()
        sign = '-' if f.type == 'expense' else '+'
        if curr == "UAH":
            usd_equiv = round(f.amount / usd_rate, 2) if usd_rate > 0 else 0
            title_text = f"{sign}{f.amount} ₴ (~${usd_equiv}) • {f.category}"
        elif curr == "USD":
            uah_equiv = round(f.amount * usd_rate, 2)
            title_text = f"{sign}${f.amount} (~{uah_equiv} ₴) • {f.category}"
        else:
            title_text = f"{sign}{f.amount} {curr} • {f.category}"

        feed.append({
            "domain": "finance",
            "id": f.id,
            "title": title_text,
            "subtitle": f.description or f"Операція: {f.type}",
            "created_at": f.date.isoformat(),
            "badge": f.category,
            "is_positive": f.type == "income",
        })

    # 2. Shopping
    shop_items = db.query(ShoppingItem).order_by(desc(ShoppingItem.created_at)).limit(limit // 2).all()
    for s in shop_items:
        feed.append({
            "domain": "shopping",
            "id": s.id,
            "title": f"{s.item} ({s.quantity})",
            "subtitle": s.notes or f"Категория: {s.category}",
            "created_at": s.created_at.isoformat(),
            "badge": s.category,
            "is_completed": s.is_purchased,
        })

    # 3. Tasks
    task_items = db.query(Task).order_by(desc(Task.created_at)).limit(limit // 2).all()
    for t in task_items:
        feed.append({
            "domain": "tasks",
            "id": t.id,
            "title": t.title,
            "subtitle": t.description or (f"Срок: {t.due_date.strftime('%d.%m %H:%M')}" if t.due_date else "Без срока"),
            "created_at": t.created_at.isoformat(),
            "badge": f"Приоритет: {t.priority}",
            "is_completed": t.is_completed,
        })

    # 4. Media
    media_items = db.query(MediaNote).order_by(desc(MediaNote.created_at)).limit(limit // 2).all()
    for m in media_items:
        feed.append({
            "domain": "media_notes",
            "id": m.id,
            "title": f"[{m.type}] {m.title}",
            "subtitle": m.author_creator or m.comment or "Без описания",
            "created_at": m.created_at.isoformat(),
            "badge": m.status,
            "url": m.url,
        })

    # Сортировка по дате добавления (новые сверху)
    feed.sort(key=lambda x: x["created_at"], reverse=True)
    return feed[:limit]
