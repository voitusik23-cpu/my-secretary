from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict


class BusinessTransactionCreate(BaseModel):
    type: str  # "income" або "expense"
    amount: float
    description: str
    category: Optional[str] = "Загальне"
    notes: Optional[str] = None
    created_at: Optional[datetime] = None


class BusinessTransactionResponse(BaseModel):
    id: int
    type: str
    amount: float
    description: str
    category: Optional[str] = "Загальне"
    notes: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BusinessSummaryResponse(BaseModel):
    total_income: float
    total_expense: float
    balance: float
    transactions_count: int
    text_report: str
