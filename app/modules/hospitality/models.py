from datetime import datetime, date
from sqlalchemy import Column, Integer, String, Float, DateTime, Date
from app.database import Base, EncryptedText


class Booking(Base):
    """
    Модель бронювання апартаментів/житла (модуль Hospitality).
    Включає гостя, дати заїзду/виїзду, авто-розрахунок днів, суми, передоплати та залишку.
    """
    __tablename__ = "hospitality_bookings"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    guest_name = Column(String(150), nullable=False, index=True)
    check_in_date = Column(Date, nullable=False, index=True)
    check_out_date = Column(Date, nullable=False, index=True)
    apartment_unit = Column(String(100), default="Apartment #1", nullable=False)
    
    daily_rate = Column(Float, nullable=False, default=0.0)
    total_days = Column(Integer, nullable=False, default=1)
    total_amount = Column(Float, nullable=False, default=0.0)
    prepayment = Column(Float, default=0.0, nullable=False)
    remaining_balance = Column(Float, nullable=False, default=0.0)
    
    # status: active | completed | cancelled
    status = Column(String(30), default="active", nullable=False)
    
    # Зашифровані примітки щодо гостей або заселення
    encrypted_notes = Column(EncryptedText, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
