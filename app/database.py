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


import os
import re
from typing import Generator, Optional, Dict
from fastapi import Request

_USER_SESSIONMAKERS: Dict[str, sessionmaker] = {}


def init_all_models():
    """Import all models so that Base.metadata has every table registered."""
    try:
        from app.models.finance import FinanceRecord
        from app.models.shopping import ShoppingItem
        from app.models.tasks import Task
        from app.models.media_notes import MediaNote
        from app.modules.auto.models import AutoLog
        from app.modules.delegation.models import FamilyContact
        from app.modules.fitness.models import FitnessLog
        from app.modules.health_vitals.models import BloodPressureLog
        from app.modules.hospitality.models import Booking
        from app.modules.inventory.models import InventoryItem
        from app.modules.music.models import MusicTrack, MusicPlaylist
        from app.modules.plants.models import Plant
        from app.modules.recipes.models import Recipe
        from app.modules.users.models import User, UserSettings
        from app.modules.utilities.models import UtilityReading
        from app.modules.business.models import BusinessTransaction
    except Exception as e:
        import logging
        logging.getLogger("my_secretary.db").warning(f"Model registration warning: {e}")


def get_user_sessionmaker(username: Optional[str] = None) -> sessionmaker:
    """
    Returns the sessionmaker for the given user.
    If no user specified, or admin/owner/default, returns the default SessionLocal (secretary.db).
    For named users (e.g. 'anna', 'guest'), returns or creates a separate isolated SQLite database.
    """
    if not username:
        return SessionLocal

    clean_user = re.sub(r"[^a-zA-Z0-9_-]", "", username.strip().lower())
    if not clean_user or clean_user in ("admin", "owner", "default"):
        return SessionLocal

    if clean_user in _USER_SESSIONMAKERS:
        return _USER_SESSIONMAKERS[clean_user]

    os.makedirs("data/users", exist_ok=True)
    db_path = os.path.abspath(f"data/users/secretary_{clean_user}.db")
    user_db_url = f"sqlite:///{db_path}"
    user_engine = create_engine(
        user_db_url,
        connect_args={"check_same_thread": False},
        echo=False
    )
    init_all_models()
    Base.metadata.create_all(bind=user_engine)

    sm = sessionmaker(autocommit=False, autoflush=False, bind=user_engine)
    _USER_SESSIONMAKERS[clean_user] = sm
    return sm


def get_db(request: Request = None) -> Generator[Session, None, None]:
    """
    FastAPI dependency yielding a database session per request.
    Automatically isolates user databases based on header 'X-Secretary-User'
    or query parameter '?user=...'. Defaults to the owner's primary database.
    """
    username = None
    if request:
        username = request.headers.get("x-secretary-user")
        if not username:
            username = request.query_params.get("user")

    sm = get_user_sessionmaker(username)
    db = sm()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """
    Creates all database tables on default engine.
    """
    init_all_models()
    Base.metadata.create_all(bind=engine)

