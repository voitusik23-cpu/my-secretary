from datetime import datetime
from typing import Optional, List, Dict
from sqlalchemy import Column, Integer, Float, String, DateTime
from pydantic import BaseModel, Field, ConfigDict
from app.database import Base, EncryptedText, EncryptedString


class FinanceRecord(Base):
    __tablename__ = "finance_records"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    amount = Column(Float, nullable=False)
    currency = Column(String(10), default="UAH", nullable=False)  # UAH, USD, EUR
    category = Column(EncryptedString(100), default="Різне", index=True)
    type = Column(String(20), default="expense", index=True)  # "expense" or "income"
    description = Column(EncryptedText, nullable=True)
    date = Column(DateTime, default=datetime.utcnow, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class FinanceBase(BaseModel):
    amount: float = Field(..., gt=0, description="Сума операції")
    currency: str = Field(default="UAH", description="Валюта (UAH, USD, EUR)")
    category: str = Field(default="Різне", description="Категорія (Їжа, Транспорт, Кафе, Зарплата тощо)")
    type: str = Field(default="expense", description="Тип: 'expense' (витрата) або 'income' (дохід)")
    description: Optional[str] = Field(default=None, description="Коментар або деталі")
    date: Optional[datetime] = Field(default_factory=datetime.utcnow, description="Дата операції")


class FinanceCreate(FinanceBase):
    pass


class FinanceUpdate(BaseModel):
    amount: Optional[float] = None
    currency: Optional[str] = None
    category: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    date: Optional[datetime] = None


class FinanceResponse(FinanceBase):
    id: int
    created_at: datetime
    amount_usd: Optional[float] = None  # Calculated equivalent in USD
    amount_uah: Optional[float] = None  # Calculated equivalent in UAH

    model_config = ConfigDict(from_attributes=True)


class FinanceSummary(BaseModel):
    total_expense_today_uah: float
    total_expense_today_usd: float
    total_income_today_uah: float
    total_income_today_usd: float
    total_expense_month_uah: float
    total_expense_month_usd: float
    total_income_month_uah: float
    total_income_month_usd: float
    currency: str = "UAH"
    usd_rate: float
    categories_breakdown: Dict[str, float]
