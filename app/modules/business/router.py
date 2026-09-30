import re
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.auth import verify_secret_key
from app.modules.business.models import BusinessTransaction
from app.modules.business.schemas import (
    BusinessTransactionCreate,
    BusinessTransactionResponse,
    BusinessSummaryResponse,
)

business_router = APIRouter(
    prefix="/business",
    tags=["Business & Cashflow"],
    dependencies=[Depends(verify_secret_key)],
)


def format_money(val: float) -> str:
    """Форматування суми: 100000 -> 100 000 ₴"""
    return f"{val:,.0f} ₴".replace(",", " ")


def build_text_report(transactions: List[BusinessTransaction], total_inc: float, total_exp: float, balance: float) -> str:
    """Генерує текстовий звіт для копіювання в Telegram / месенджери."""
    now_str = datetime.now().strftime("%d.%m.%Y %H:%M")
    
    incomes = [t for t in transactions if t.type == "income"]
    expenses = [t for t in transactions if t.type == "expense"]

    lines = [
        f"💼 ФІНАНСОВИЙ ЗВІТ (БІЗНЕС-КАСА)",
        f"📅 Станом на: {now_str}",
        "════════════════════════════",
        f"🟢 НАДХОДЖЕННЯ (+):"
    ]

    if incomes:
        for t in incomes:
            d_str = t.created_at.strftime("%d.%m") if t.created_at else ""
            lines.append(f" • {t.description} — +{format_money(t.amount)} ({d_str})")
    else:
        lines.append(" • (Немає записів)")
    lines.append(f"👉 Разом надходжень: +{format_money(total_inc)}")
    lines.append("")

    lines.append(f"🔴 ВИТРАТИ (-):")
    if expenses:
        for t in expenses:
            d_str = t.created_at.strftime("%d.%m") if t.created_at else ""
            lines.append(f" • {t.description} — -{format_money(t.amount)} ({d_str})")
    else:
        lines.append(" • (Немає записів)")
    lines.append(f"👉 Разом витрат: -{format_money(total_exp)}")
    lines.append("")

    lines.append("════════════════════════════")
    balance_sign = "+" if balance > 0 else ("" if balance == 0 else "-")
    lines.append(f"💰 БАЛАНС / ЗАЛИШОК: {balance_sign}{format_money(abs(balance))}")
    lines.append("════════════════════════════")

    return "\n".join(lines)


@business_router.get("/transactions", response_model=List[BusinessTransactionResponse])
def get_transactions(db: Session = Depends(get_db)):
    """Отримати всі транзакції бізнес-каси."""
    return db.query(BusinessTransaction).order_by(desc(BusinessTransaction.created_at)).all()


@business_router.post("/transactions", response_model=BusinessTransactionResponse, status_code=status.HTTP_201_CREATED)
def create_transaction(payload: BusinessTransactionCreate, db: Session = Depends(get_db)):
    """Додати новий дохід або витрату."""
    tx_type = "income" if payload.type in ("income", "+", "plus", "дохід", "доход") else "expense"
    
    tx = BusinessTransaction(
        type=tx_type,
        amount=abs(float(payload.amount)),
        description=payload.description.strip(),
        category=payload.category.strip() if payload.category else "Загальне",
        notes=payload.notes.strip() if payload.notes else None,
        created_at=payload.created_at or datetime.utcnow(),
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@business_router.delete("/transactions/{tx_id}")
def delete_transaction(tx_id: int, db: Session = Depends(get_db)):
    """Видалити запис з каси."""
    tx = db.query(BusinessTransaction).filter(BusinessTransaction.id == tx_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Запис не знайдено")
    db.delete(tx)
    db.commit()
    return {"status": "ok", "deleted_id": tx_id}


@business_router.get("/summary", response_model=BusinessSummaryResponse)
def get_summary(db: Session = Depends(get_db)):
    """Порахувати баланс та згенерувати текстовий звіт."""
    transactions = db.query(BusinessTransaction).order_by(desc(BusinessTransaction.created_at)).all()
    
    total_income = sum(t.amount for t in transactions if t.type == "income")
    total_expense = sum(t.amount for t in transactions if t.type == "expense")
    balance = total_income - total_expense
    
    text_report = build_text_report(transactions, total_income, total_expense, balance)

    return BusinessSummaryResponse(
        total_income=total_income,
        total_expense=total_expense,
        balance=balance,
        transactions_count=len(transactions),
        text_report=text_report,
    )


def parse_spoken_amount(text: str) -> tuple:
    """
    Визначає суму з тексту або мовних виразів («40 тисяч», «2.5к», «двісті п'ятдесят» тощо).
    Повертає (сума, очищений текст).
    """
    clean_text = text

    clean_text = re.sub(r"\b(півтори|полторы)\s+(тисячі|тысячи|тис|тыс)\b", "1500", clean_text, flags=re.IGNORECASE)
    clean_text = re.sub(r"\b(дві|две)\s+(тисячі|тысячи|тис|тыс)\b", "2000", clean_text, flags=re.IGNORECASE)
    clean_text = re.sub(r"\b(три|три)\s+(тисячі|тысячи|тис|тыс)\b", "3000", clean_text, flags=re.IGNORECASE)
    clean_text = re.sub(r"\b(чотири|четыре)\s+(тисячі|тысячи|тис|тыс)\b", "4000", clean_text, flags=re.IGNORECASE)
    clean_text = re.sub(r"\b(п'ять|пять)\s+(тисяч|тысяч|тис|тыс)\b", "5000", clean_text, flags=re.IGNORECASE)
    clean_text = re.sub(r"\b(десять)\s+(тисяч|тысяч|тис|тыс)\b", "10000", clean_text, flags=re.IGNORECASE)
    clean_text = re.sub(r"\b(двадцять|двадцать)\s+(тисяч|тысяч|тис|тыс)\b", "20000", clean_text, flags=re.IGNORECASE)
    clean_text = re.sub(r"\b(тридцять|тридцать)\s+(тисяч|тысяч|тис|тыс)\b", "30000", clean_text, flags=re.IGNORECASE)
    clean_text = re.sub(r"\b(сорок)\s+(тисяч|тысяч|тис|тыс)\b", "40000", clean_text, flags=re.IGNORECASE)
    clean_text = re.sub(r"\b(п'ятдесят|пятьдесят)\s+(тисяч|тысяч|тис|тыс)\b", "50000", clean_text, flags=re.IGNORECASE)
    clean_text = re.sub(r"\b(сто)\s+(тисяч|тысяч|тис|тыс)\b", "100000", clean_text, flags=re.IGNORECASE)
    clean_text = re.sub(r"\b(двісті|двести)\s+(тисяч|тысяч|тис|тыс)\b", "200000", clean_text, flags=re.IGNORECASE)
    clean_text = re.sub(r"\b(півмільйона|полмиллиона)\b", "500000", clean_text, flags=re.IGNORECASE)
    clean_text = re.sub(r"\b(мільйон|миллион)\b", "1000000", clean_text, flags=re.IGNORECASE)
    clean_text = re.sub(r"\b(тисяча|тысяча)\b", "1000", clean_text, flags=re.IGNORECASE)

    def mult_repl(m):
        base = float(m.group(1).replace(" ", "").replace(",", "."))
        unit = m.group(2).lower()
        if unit.startswith("млн") or "мил" in unit or "міл" in unit:
            return str(int(base * 1_000_000))
        return str(int(base * 1_000))

    clean_text = re.sub(
        r"(\d+[\d\s.,]*\d*|\d+)\s*(тыс[ячи]*|тис[ячі]*|млн[а-я]*|к|k)\b",
        mult_repl,
        clean_text,
        flags=re.IGNORECASE,
    )

    amount_match = re.search(r"(\d+[\d\s.,]*\d*|\d+)", clean_text)
    if not amount_match:
        return None, clean_text

    raw_num = amount_match.group(1).replace(" ", "").replace(",", ".")
    try:
        amount = float(raw_num)
        return amount, clean_text
    except ValueError:
        return None, clean_text


@business_router.post("/quick-parse", response_model=BusinessTransactionResponse)
def quick_parse_text(payload: dict, db: Session = Depends(get_db)):
    """
    Швидкий запис текстом або голосом.
    Підтримує:
    - payload['text']: фраза користувача
    - payload['force_type']: 'expense' або 'income' (якщо натиснуто відповідну кнопку мікрофона)
    """
    text = payload.get("text", "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Текст не може бути порожнім")

    amount, processed_text = parse_spoken_amount(text)
    if amount is None or amount <= 0:
        raise HTTPException(status_code=400, detail="Не вдалося розпізнати суму у висловлюванні")

    lower = processed_text.lower()

    # Determine type: forced or smart detected
    force_type = payload.get("type") or payload.get("force_type")
    if force_type in ("expense", "витрата", "расход", "минус", "-"):
        tx_type = "expense"
    elif force_type in ("income", "дохід", "доход", "плюс", "+"):
        tx_type = "income"
    else:
        is_income = any(w in lower for w in [
            "плюс", "+", "получил", "отримав", "доход", "дохід", "зашло", "приход", "прибуток", "оренда", "аренда"
        ]) and not any(w in lower for w in ["видав", "выдал", "заплатил", "заплатив", "мінус", "-"])
        tx_type = "income" if is_income else "expense"

    # Clean description
    desc = re.sub(r"(\d+[\d\s.,]*\d*|\d+)", "", processed_text)
    desc = desc.replace("+", " ").replace("-", " ")
    for w in [
        "грн", "uah", "гривен", "гривень", "плюс", "мінус", "получил", "отримав", "выдал", "видав",
        "бізнес", "бизнес", "по бізнесу", "по бизнесу", "в касу", "в кассу"
    ]:
        desc = re.sub(rf"\b{re.escape(w)}\b", "", desc, flags=re.IGNORECASE)
    desc = re.sub(r"\s+", " ", desc).strip()
    if not desc:
        desc = "Надходження" if tx_type == "income" else "Витрата"

    desc = desc.capitalize()

    # Smart category detection
    cat = "Загальне"
    if any(k in lower for k in ["зарплат", "зп", "толик", "толіку", "робітникам", "сотрудникам"]):
        cat = "Зарплата"
    elif any(k in lower for k in ["оренд", "аренд"]):
        cat = "Оренда"
    elif any(k in lower for k in ["шайб", "провод", "кабел", "базар", "ринок", "матеріал", "інструмент", "инструмент", "болт"]):
        cat = "Матеріали"
    elif any(k in lower for k in ["подат", "налог"]):
        cat = "Податки"
    elif any(k in lower for k in ["палив", "бензин", "дизел", "газ", "заправ", "сто"]):
        cat = "Авто / Паливо"

    tx = BusinessTransaction(
        type=tx_type,
        amount=amount,
        description=desc,
        category=cat,
        created_at=datetime.utcnow()
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx
