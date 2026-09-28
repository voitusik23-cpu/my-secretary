from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime
from app.database import Base, EncryptedString, EncryptedText


class Recipe(Base):
    """
    Модель рецепта кулінарної книги сім'ї.
    """
    __tablename__ = "recipes"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(EncryptedString(200), nullable=False)
    category = Column(String(50), default="Вечеря", index=True)  # Сніданок, Обід, Вечеря, Десерт, Салат
    description = Column(EncryptedText, nullable=True)
    ingredients_json = Column(EncryptedText, default="[]", nullable=False)
    instructions = Column(EncryptedText, nullable=True)
    prep_time_minutes = Column(Integer, default=30)
    servings = Column(Integer, default=2)
    user_id = Column(String(50), default="default", index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
