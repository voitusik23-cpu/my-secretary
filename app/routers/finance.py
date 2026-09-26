from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.database import get_db
from app.auth import verify_secret_key
from app.services.currency import get_usd_uah_rate
from app.models.finance import (
    FinanceRecord,
    FinanceCreate,
    FinanceUpdate,
    FinanceResponse,
    FinanceSummary,
)

router = APIRouter(prefix="/finance", tags=["Finance"], dependencies=[Depends(verify_secret_key)])


def _to_response(record: FinanceRecord, usd_rate: float) -> FinanceResponse:
    amount = float(record.amount)
    curr = (record.currency or "UAH").upper()

    if curr == "UAH":
        amount_uah = amount
        amount_usd = round(amount / usd_rate, 2) if usd_rate > 0 else amount
    elif curr == "USD":
        amount_usd = amount
        amount_uah = round(amount * usd_rate, 2)
    elif curr == "EUR":
        amount_uah = round(amount * (usd_rate * 1.08), 2)  # Approx EUR to UAH
        amount_usd = round(amount * 1.08, 2)
    else:
        amount_uah = amount
        amount_usd = round(amount / usd_rate, 2) if usd_rate > 0 else amount

    resp = FinanceResponse.model_validate(record)
    resp.amount_uah = amount_uah
    resp.amount_usd = amount_usd
    return resp


@router.get("", response_model=List[FinanceResponse])
def get_finance_records(
    db: Session = Depends(get_db),
    type: Optional[str] = Query(None, description="Фільтр: expense або income"),
    category: Optional[str] = Query(None, description="Фільтр за категорією"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    query = db.query(FinanceRecord)
    if type:
        query = query.filter(FinanceRecord.type == type)
    if category:
        query = query.filter(FinanceRecord.category == category)
    records = query.order_by(desc(FinanceRecord.date)).offset(offset).limit(limit).all()

    usd_rate = get_usd_uah_rate()
    return [_to_response(r, usd_rate) for r in records]


@router.get("/rate")
def get_current_rate():
    """
    Повертає актуальний курс USD/UAH від НБУ.
    """
    rate = get_usd_uah_rate()
    return {
        "usd_uah_rate": rate,
        "base_currency": "UAH",
        "target_currency": "USD",
        "source": "Національний банк України (НБУ)"
    }


@router.get("/stats", response_model=FinanceSummary)
def get_finance_stats(db: Session = Depends(get_db)):
    now = datetime.utcnow()
    start_of_today = datetime(now.year, now.month, now.day)
    start_of_month = datetime(now.year, now.month, 1)

    usd_rate = get_usd_uah_rate()

    all_records_month = db.query(FinanceRecord).filter(
        FinanceRecord.date >= start_of_month
    ).all()

    expense_today_uah = 0.0
    income_today_uah = 0.0
    expense_month_uah = 0.0
    income_month_uah = 0.0
    breakdown_uah = {}

    for r in all_records_month:
        amount = float(r.amount)
        curr = (r.currency or "UAH").upper()

        # Convert to UAH for aggregation
        if curr == "UAH":
            val_uah = amount
        elif curr == "USD":
            val_uah = amount * usd_rate
        else:
            val_uah = amount

        is_today = r.date >= start_of_today

        if r.type == "expense":
            expense_month_uah += val_uah
            if is_today:
                expense_today_uah += val_uah
            cat = r.category or "Різне"
            breakdown_uah[cat] = breakdown_uah.get(cat, 0.0) + val_uah
        elif r.type == "income":
            income_month_uah += val_uah
            if is_today:
                income_today_uah += val_uah

    expense_today_usd = round(expense_today_uah / usd_rate, 2) if usd_rate > 0 else 0.0
    income_today_usd = round(income_today_uah / usd_rate, 2) if usd_rate > 0 else 0.0
    expense_month_usd = round(expense_month_uah / usd_rate, 2) if usd_rate > 0 else 0.0
    income_month_usd = round(income_month_uah / usd_rate, 2) if usd_rate > 0 else 0.0

    return FinanceSummary(
        total_expense_today_uah=round(expense_today_uah, 2),
        total_expense_today_usd=expense_today_usd,
        total_income_today_uah=round(income_today_uah, 2),
        total_income_today_usd=income_today_usd,
        total_expense_month_uah=round(expense_month_uah, 2),
        total_expense_month_usd=expense_month_usd,
        total_income_month_uah=round(income_month_uah, 2),
        total_income_month_usd=income_month_usd,
        currency="UAH",
        usd_rate=usd_rate,
        categories_breakdown={k: round(v, 2) for k, v in breakdown_uah.items()},
    )


@router.post("", response_model=FinanceResponse, status_code=status.HTTP_201_CREATED)
def create_finance_record(payload: FinanceCreate, db: Session = Depends(get_db)):
    record = FinanceRecord(
        amount=payload.amount,
        currency=(payload.currency or "UAH").upper(),
        category=payload.category or "Різне",
        type=payload.type or "expense",
        description=payload.description,
        date=payload.date or datetime.utcnow(),
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    usd_rate = get_usd_uah_rate()
    return _to_response(record, usd_rate)


@router.get("/{record_id}", response_model=FinanceResponse)
def get_finance_record(record_id: int, db: Session = Depends(get_db)):
    record = db.query(FinanceRecord).filter(FinanceRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Запис не знайдено")
    usd_rate = get_usd_uah_rate()
    return _to_response(record, usd_rate)


@router.put("/{record_id}", response_model=FinanceResponse)
def update_finance_record(record_id: int, payload: FinanceUpdate, db: Session = Depends(get_db)):
    record = db.query(FinanceRecord).filter(FinanceRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Запис не знайдено")

    update_data = payload.model_dump(exclude_unset=True)
    if "currency" in update_data and update_data["currency"]:
        update_data["currency"] = update_data["currency"].upper()

    for field, val in update_data.items():
        setattr(record, field, val)

    db.commit()
    db.refresh(record)

    usd_rate = get_usd_uah_rate()
    return _to_response(record, usd_rate)


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_finance_record(record_id: int, db: Session = Depends(get_db)):
    record = db.query(FinanceRecord).filter(FinanceRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Запис не знайдено")
    db.delete(record)
    db.commit()
    return None
