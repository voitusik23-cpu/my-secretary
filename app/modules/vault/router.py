from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.auth import verify_secret_key
from app.modules.vault.models import VaultItem
from app.modules.vault.schemas import (
    VaultItemCreate,
    VaultItemUpdate,
    VaultItemResponse,
    BulkSaveRequest,
    AITextParseRequest,
    ExportResponse,
)
from app.modules.vault.service import (
    parse_text_with_gemini,
    parse_image_with_gemini,
    format_export_text,
)

router = APIRouter(
    prefix="/vault",
    tags=["Vault / Склерозник"],
    dependencies=[Depends(verify_secret_key)],
)


def _get_user_phone(request: Request) -> str:
    """Визначає телефон / ідентифікатор користувача для ізоляції даних."""
    return (
        request.headers.get("x-secretary-user")
        or request.query_params.get("user")
        or "admin"
    )


def _get_vault_query(db: Session, request: Request):
    """
    Повертає базовий запит до VaultItem.
    Враховує всі записи адміна та поточного користувача,
    щоб паролі ніколи не зникали при вході за номером телефону або зміні сесії.
    """
    user = _get_user_phone(request)
    if user == "admin" or not user:
        return db.query(VaultItem)
    return db.query(VaultItem).filter(
        (VaultItem.user_phone == user) | (VaultItem.user_phone == "admin")
    )


@router.get("/items", response_model=List[VaultItemResponse])
def get_vault_items(
    request: Request,
    category: Optional[str] = Query(None, description="ai | social | email | crypto | wifi | devices | other"),
    q: Optional[str] = Query(None, description="Пошуковий запит"),
    db: Session = Depends(get_db),
):
    """Повертає всі збережені облікові записи користувача з можливістю пошуку та фільтрації."""
    query = _get_vault_query(db, request)

    if category and category != "all":
        query = query.filter(VaultItem.category == category)

    items = query.order_by(desc(VaultItem.is_favorite), desc(VaultItem.updated_at)).all()

    # Search filter in-memory because fields are AES-encrypted
    if q and q.strip():
        term = q.strip().lower()
        items = [
            it for it in items
            if term in (it.title or "").lower()
            or term in (it.login or "").lower()
            or term in (it.notes or "").lower()
            or term in (it.website_url or "").lower()
        ]

    return items


@router.get("/items/{item_id}", response_model=VaultItemResponse)
def get_single_vault_item(item_id: int, request: Request, db: Session = Depends(get_db)):
    """Повертає один запис за ID."""
    item = _get_vault_query(db, request).filter(VaultItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Запис не знайдено")
    return item


@router.post("/items", response_model=VaultItemResponse, status_code=status.HTTP_201_CREATED)
def create_vault_item(payload: VaultItemCreate, request: Request, db: Session = Depends(get_db)):
    """Створює новий запис у Склерознику."""
    user = _get_user_phone(request)
    item = VaultItem(
        user_phone=user,
        title=payload.title.strip(),
        category=payload.category or "other",
        login=payload.login.strip() if payload.login else None,
        password=payload.password.strip() if payload.password else None,
        website_url=payload.website_url.strip() if payload.website_url else None,
        plan_type=payload.plan_type.strip().lower() if payload.plan_type else None,
        two_factor_note=payload.two_factor_note.strip() if payload.two_factor_note else None,
        notes=payload.notes.strip() if payload.notes else None,
        is_favorite=payload.is_favorite,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/items/{item_id}", response_model=VaultItemResponse)
def update_vault_item(item_id: int, payload: VaultItemUpdate, request: Request, db: Session = Depends(get_db)):
    """Оновлює існуючий запис у Склерознику."""
    item = _get_vault_query(db, request).filter(VaultItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Запис не знайдено")

    update_data = payload.model_dump(exclude_unset=True)
    for key, val in update_data.items():
        if isinstance(val, str):
            setattr(item, key, val.strip())
        else:
            setattr(item, key, val)

    db.commit()
    db.refresh(item)
    return item


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vault_item(item_id: int, request: Request, db: Session = Depends(get_db)):
    """Видаляє запис зі Склерозника."""
    item = _get_vault_query(db, request).filter(VaultItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Запис не знайдено")

    db.delete(item)
    db.commit()
    return None


@router.post("/ai-parse-text")
async def ai_parse_vault_text(payload: AITextParseRequest):
    """
    Аналізує масив довільного тексту (таблиці, старі замітки, CSV)
    за допомогою Gemini та повертає структурований список для попереднього перегляду.
    """
    items = await parse_text_with_gemini(payload.text)
    return {
        "status": "ok",
        "count": len(items),
        "items": items,
    }


@router.post("/ai-parse-image")
async def ai_parse_vault_image(
    request: Request,
    image: Optional[UploadFile] = File(None),
    file: Optional[UploadFile] = File(None),
    photo: Optional[UploadFile] = File(None),
):
    """
    Приймає фото блокнота або аркуша з паролями, зчитує через Gemini Vision OCR
    і повертає структуровані облікові записи для перевірки користувачем перед збереженням.
    """
    upload = image or file or photo
    if not upload:
        try:
            form = await request.form()
            for key in ["image", "file", "photo", "upload", "img"]:
                val = form.get(key)
                if val is not None and hasattr(val, "read"):
                    upload = val
                    break
        except Exception:
            pass

    image_bytes = None
    mime = "image/jpeg"
    if upload:
        image_bytes = await upload.read()
        mime = upload.content_type or "image/jpeg"
    else:
        try:
            body = await request.body()
            if body:
                if body.startswith(b"{"):
                    import json, base64
                    j = json.loads(body.decode("utf-8"))
                    b64 = j.get("image") or j.get("image_base64") or j.get("data")
                    if b64:
                        if "," in b64:
                            b64 = b64.split(",", 1)[1]
                        image_bytes = base64.b64decode(b64)
                        mime = j.get("mime_type", "image/jpeg")
                elif body.startswith(b"\xff\xd8") or body.startswith(b"\x89PNG") or b"ftyp" in body[:20]:
                    image_bytes = body
                    mime = "image/jpeg"
        except Exception:
            pass

    if not image_bytes:
        raise HTTPException(status_code=400, detail="Файл зображення не знайдено у запиті")

    items = await parse_image_with_gemini(image_bytes, mime_type=mime)
    return {
        "status": "ok",
        "count": len(items),
        "items": items,
    }


@router.post("/bulk-save", status_code=status.HTTP_201_CREATED)
def bulk_save_vault_items(payload: BulkSaveRequest, request: Request, db: Session = Depends(get_db)):
    """Зберігає пачку перевірених та відредагованих користувачем записів у базу даних."""
    user = _get_user_phone(request)
    created_items = []

    for it in payload.items:
        clean_title = (it.title or "").strip()
        if not clean_title:
            continue

        item = VaultItem(
            user_phone=user,
            title=clean_title,
            category=it.category or "other",
            login=it.login.strip() if it.login else None,
            password=it.password.strip() if it.password else None,
            website_url=it.website_url.strip() if it.website_url else None,
            plan_type=it.plan_type.strip().lower() if it.plan_type else None,
            two_factor_note=it.two_factor_note.strip() if it.two_factor_note else None,
            notes=it.notes.strip() if it.notes else None,
            is_favorite=it.is_favorite,
        )
        db.add(item)
        created_items.append(item)

    db.commit()
    return {
        "status": "ok",
        "saved_count": len(created_items),
        "message": f"Успішно збережено {len(created_items)} записів у Склерозник!",
    }


@router.get("/export", response_model=ExportResponse)
def export_vault_list(
    request: Request,
    category: Optional[str] = Query(None, description="Категорія для експорту або all"),
    db: Session = Depends(get_db),
):
    """Генерує текстовий файл/звіт для друку або копіювання до буфера обміну."""
    query = _get_vault_query(db, request)

    if category and category != "all":
        query = query.filter(VaultItem.category == category)

    items = query.order_by(VaultItem.category, VaultItem.title).all()
    text_content = format_export_text(items, category_filter=category)

    return ExportResponse(
        category=category or "all",
        count=len(items),
        text_content=text_content,
    )


@router.post("/recategorize")
def recategorize_vault_items(request: Request, db: Session = Depends(get_db)):
    """Автоматично перерозподіляє всі записи користувача за новими категоріями."""
    from app.modules.vault.service import classify_vault_item
    items = _get_vault_query(db, request).all()
    updated_count = 0
    for it in items:
        new_cat = classify_vault_item(it.title, it.notes, it.website_url, it.login)
        if new_cat and new_cat != it.category:
            it.category = new_cat
            updated_count += 1
    if updated_count > 0:
        db.commit()
    return {
        "status": "ok",
        "updated_count": updated_count,
        "total_items": len(items),
        "message": f"Розсортовано {updated_count} записів за новими категоріями!",
    }

