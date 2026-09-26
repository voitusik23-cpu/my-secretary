from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime
from app.database import Base, EncryptedText


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(String(50), default="default", index=True, nullable=False)
    item_name = Column(String(255), nullable=False, index=True)
    encrypted_location = Column(EncryptedText, nullable=False)
    tags = Column(String(255), nullable=True)
    dimensions_or_spec = Column(String(255), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
