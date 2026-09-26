import os
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Gemini AI API Key
    GEMINI_API_KEY: str = ""

    # Secret password/token to protect endpoints (PWA + Apple Shortcuts)
    SECRET_KEY: str = ""

    # 32-byte Fernet key for database at-rest encryption
    ENCRYPTION_KEY: str = ""

    # Database connection URL
    DATABASE_URL: str = "sqlite:///./secretary.db"

    # Server configuration
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = False

    # Currency settings (Ukraine: UAH with USD recalculation)
    DEFAULT_CURRENCY: str = "UAH"
    USD_UAH_RATE: float = 44.8

    # AI Model preference
    AI_MODEL: str = "gemini-3.8-flash"

    # Step 3: Dormant Hospitality Module flag
    ENABLE_HOSPITALITY: bool = False

    # Step 3: Google Drive Backup
    GDRIVE_BACKUP_FOLDER: str = "Secretary_AI_Backups"
    GDRIVE_SERVICE_ACCOUNT_JSON: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()
