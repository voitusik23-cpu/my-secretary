from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, Text
from app.database import Base


class BusinessTransaction(Base):
    """
    Таблиця бізнес-каси: доходи та витрати, баланс на руках.
    """
    __tablename__ = "business_transactions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    type = Column(String(20), nullable=False, index=True)  # "income" (прихід / плюс) або "expense" (витрата / мінус)
    amount = Column(Float, nullable=False)
    description = Column(String(255), nullable=False)
    category = Column(String(100), default="Загальне", nullable=True)  # Оренда, Зарплата, Податки, Закупівля тощо
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
