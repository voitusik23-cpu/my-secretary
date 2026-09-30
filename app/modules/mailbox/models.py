from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database import Base, EncryptedString


class MailAccount(Base):
    """
    Підключена поштова скринька користувача для моніторингу та очищення спаму.
    """
    __tablename__ = "mail_accounts"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    email = Column(EncryptedString(255), nullable=False)
    name = Column(EncryptedString(255), nullable=True)  # "Gmail Особистий", "Ukr.net Робота"
    imap_server = Column(String(255), nullable=False, default="imap.gmail.com")
    imap_port = Column(Integer, nullable=False, default=993)
    use_ssl = Column(Boolean, nullable=False, default=True)
    password = Column(EncryptedString(255), nullable=False)  # App Password або пароль IMAP
    is_active = Column(Boolean, default=True, index=True)
    last_checked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    messages = relationship("MailMessage", back_populates="account", cascade="all, delete-orphan")


class MailMessage(Base):
    """
    Листи, отримані та проаналізовані AI-секретарем.
    """
    __tablename__ = "mail_messages"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("mail_accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    message_uid = Column(String(100), nullable=False, index=True)  # IMAP UID
    subject = Column(EncryptedString(500), nullable=True)
    sender = Column(EncryptedString(255), nullable=True)
    sender_email = Column(String(255), nullable=True, index=True)
    recipient = Column(EncryptedString(255), nullable=True)
    date = Column(DateTime, nullable=True, index=True)
    snippet = Column(EncryptedString(1000), nullable=True)
    category = Column(String(50), default="other", index=True)  # "spam", "important", "other"
    is_spam = Column(Boolean, default=False, index=True)
    spam_reason = Column(String(255), nullable=True)  # "Рекламна розсилка", "Пропозиція кредиту", "Казино", etc.
    is_read = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    account = relationship("MailAccount", back_populates="messages")
