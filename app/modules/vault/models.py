from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Boolean
from app.database import Base, EncryptedString, EncryptedText


class VaultItem(Base):
    """
    Захищений запис у «Склерознику» (паролі, логіни, Wi-Fi, біржі, ШІ).
    Усі чутливі поля шифруються 256-бітним алгоритмом AES/Fernet.
    """
    __tablename__ = "vault_items"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_phone = Column(String(50), default="admin", index=True, nullable=False)
    
    title = Column(EncryptedString(255), nullable=False)  # "ChatGPT Plus", "Binance", "Gmail Особистий", "Wi-Fi Офіс"
    category = Column(String(50), default="other", index=True)  # "ai", "social", "email", "crypto", "wifi", "devices", "other"
    
    login = Column(EncryptedString(255), nullable=True)  # email, username, SSID
    password = Column(EncryptedString(500), nullable=True)  # пароль, 16-значний ключ додатку, WPA ключ
    website_url = Column(String(500), nullable=True)  # https://chatgpt.com, https://discord.com
    
    plan_type = Column(String(50), nullable=True)  # "pro", "free", "standard", null
    two_factor_note = Column(EncryptedString(255), nullable=True)  # "Google Authenticator", "SMS на +380...", "Seed-фраза"
    notes = Column(EncryptedText, nullable=True)  # додаткові коментарі, дати оплати, PIN-коди
    
    is_favorite = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
