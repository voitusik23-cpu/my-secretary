from typing import Generator
from sqlalchemy import create_engine, String, Text
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from sqlalchemy.types import TypeDecorator
from app.config import settings
from app.services.crypto import encrypt_str, decrypt_str

# Configure SQLite engine
connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=False
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


class EncryptedString(TypeDecorator):
    """
    SQLAlchemy TypeDecorator that encrypts strings upon writing to SQLite
    and decrypts them upon reading.
    """
    impl = String
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return encrypt_str(str(value))

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return decrypt_str(value)


class EncryptedText(TypeDecorator):
    """
    SQLAlchemy TypeDecorator that encrypts multi-line text upon writing
    and decrypts upon reading.
    """
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return encrypt_str(str(value))

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return decrypt_str(value)


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency yielding a database session per request.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """
    Creates all database tables.
    """
    # Import models here so that they are registered on Base.metadata
    from app.models.finance import FinanceRecord
    from app.models.shopping import ShoppingItem
    from app.models.tasks import Task
    from app.models.media_notes import MediaNote

    Base.metadata.create_all(bind=engine)
