import os
import io
import json
import logging
import asyncio
from datetime import datetime, time, timedelta
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.config import settings
from app.auth import verify_secret_key
from app.services.crypto import get_fernet

logger = logging.getLogger("my_secretary.gdrive_backup")

router = APIRouter(prefix="/system", tags=["System & Cloud Backup"], dependencies=[Depends(verify_secret_key)])

BACKUP_STAGING_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "backups",
    "gdrive_staged"
)
STATUS_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "backups",
    "last_backup_status.json"
)

# Global status cache
_last_backup_cache: Dict[str, Any] = {
    "last_backup_time": None,
    "filename": None,
    "size_kb": 0,
    "encrypted": False,
    "gdrive_synced": False,
    "status": "ready",
    "message": "Резервне копіювання готове до запуску."
}


def _load_status_from_disk():
    global _last_backup_cache
    if os.path.exists(STATUS_FILE):
        try:
            with open(STATUS_FILE, "r", encoding="utf-8") as f:
                _last_backup_cache.update(json.load(f))
        except Exception as e:
            logger.warning(f"Could not load backup status file: {e}")


def _save_status_to_disk():
    try:
        os.makedirs(os.path.dirname(STATUS_FILE), exist_ok=True)
        with open(STATUS_FILE, "w", encoding="utf-8") as f:
            json.dump(_last_backup_cache, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Failed to save backup status: {e}")


def create_encrypted_db_backup() -> tuple[str, str, int, bool]:
    """
    Створює зашифрований знімок поточної бази даних SQLite.
    Повертає (file_path, filename, size_bytes, is_encrypted).
    """
    os.makedirs(BACKUP_STAGING_DIR, exist_ok=True)
    db_path = settings.DATABASE_URL.replace("sqlite:///", "")
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"Database file not found at: {db_path}")

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    fernet = get_fernet()

    with open(db_path, "rb") as f:
        db_bytes = f.read()

    if fernet:
        encrypted_bytes = fernet.encrypt(db_bytes)
        filename = f"secretary_backup_{timestamp}.sqlite.enc"
        file_path = os.path.join(BACKUP_STAGING_DIR, filename)
        with open(file_path, "wb") as f:
            f.write(encrypted_bytes)
        is_encrypted = True
    else:
        filename = f"secretary_backup_{timestamp}.sqlite"
        file_path = os.path.join(BACKUP_STAGING_DIR, filename)
        with open(file_path, "wb") as f:
            f.write(db_bytes)
        is_encrypted = False

    size = os.path.getsize(file_path)
    return file_path, filename, size, is_encrypted


def upload_file_to_google_drive(file_path: str, filename: str) -> Dict[str, Any]:
    """
    Вивантажує зашифрований архів бази у сховище Google Drive (папка Secretary_AI_Backups).
    Підтримує Service Account JSON або повертає детальну інструкцію при відсутності облікових даних.
    """
    creds_source = settings.GDRIVE_SERVICE_ACCOUNT_JSON.strip()
    creds_path = None

    if creds_source and os.path.exists(creds_source):
        creds_path = creds_source
    elif os.path.exists("service_account.json"):
        creds_path = "service_account.json"

    if not creds_path and not (creds_source.startswith("{") and "client_email" in creds_source):
        return {
            "synced": False,
            "reason": "missing_credentials",
            "message": "Архів зашифровано та збережено локально. Для хмарної синхронізації з Google Drive (5TB) додайте файл service_account.json або параметр GDRIVE_SERVICE_ACCOUNT_JSON в .env"
        }

    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload

        SCOPES = ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/drive"]

        if creds_path:
            creds = service_account.Credentials.from_service_account_file(creds_path, scopes=SCOPES)
        else:
            creds_info = json.loads(creds_source)
            creds = service_account.Credentials.from_service_account_info(creds_info, scopes=SCOPES)

        drive_service = build("drive", "v3", credentials=creds)

        # Знаходимо або створюємо папку для резервних копій
        folder_name = settings.GDRIVE_BACKUP_FOLDER
        query = f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
        response = drive_service.files().list(q=query, spaces="drive", fields="files(id, name)").execute()
        files = response.get("files", [])

        if files:
            folder_id = files[0]["id"]
        else:
            folder_metadata = {
                "name": folder_name,
                "mimeType": "application/vnd.google-apps.folder"
            }
            folder = drive_service.files().create(body=folder_metadata, fields="id").execute()
            folder_id = folder.get("id")

        # Вивантажуємо файл
        media = MediaFileUpload(file_path, mimetype="application/octet-stream", resumable=True)
        file_metadata = {
            "name": filename,
            "parents": [folder_id]
        }
        uploaded = drive_service.files().create(
            body=file_metadata,
            media_body=media,
            fields="id, name, webViewLink, size"
        ).execute()

        return {
            "synced": True,
            "drive_file_id": uploaded.get("id"),
            "file_name": uploaded.get("name"),
            "view_link": uploaded.get("webViewLink"),
            "message": f"Зашифрований архів успішно вивантажено на Google Drive у папку «{folder_name}»"
        }
    except Exception as e:
        logger.error(f"Google Drive upload error: {e}")
        return {
            "synced": False,
            "reason": "upload_failed",
            "error": str(e),
            "message": f"Помилка завантаження на Google Drive: {str(e)}"
        }


def perform_full_backup() -> Dict[str, Any]:
    """
    Виконує повний цикл резервного копіювання: шифрування + локальне збереження + вивантаження на Drive.
    """
    global _last_backup_cache
    try:
        file_path, filename, size_bytes, is_encrypted = create_encrypted_db_backup()
        drive_res = upload_file_to_google_drive(file_path, filename)

        _last_backup_cache = {
            "last_backup_time": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
            "filename": filename,
            "size_kb": round(size_bytes / 1024, 2),
            "encrypted": is_encrypted,
            "gdrive_synced": drive_res.get("synced", False),
            "status": "success" if drive_res.get("synced") else "staged_locally",
            "message": drive_res.get("message", "Створено резервну копію"),
            "drive_details": drive_res
        }
        _save_status_to_disk()
        return _last_backup_cache
    except Exception as e:
        logger.error(f"Backup failed: {e}")
        _last_backup_cache["status"] = "error"
        _last_backup_cache["message"] = f"Помилка створення бекапу: {str(e)}"
        _save_status_to_disk()
        return _last_backup_cache


# Initial load
_load_status_from_disk()


# --- Background Scheduler ---
async def start_nightly_backup_task():
    """
    Фоновий планувальник (Scheduler): щоночі о 03:00 автоматично створює та вивантажує бекап.
    """
    logger.info("Background nightly backup scheduler initialized (runs daily at 03:00 UTC).")
    while True:
        try:
            now = datetime.utcnow()
            # Розрахунок часу до наступних 03:00
            target = datetime(now.year, now.month, now.day, 3, 0, 0)
            if now >= target:
                target += timedelta(days=1)
            seconds_until = (target - now).total_seconds()

            logger.info(f"Next nightly backup scheduled in {int(seconds_until)} seconds.")
            await asyncio.sleep(seconds_until)

            logger.info("Executing scheduled nightly backup...")
            perform_full_backup()
        except asyncio.CancelledError:
            logger.info("Nightly backup task cancelled.")
            break
        except Exception as e:
            logger.error(f"Error in nightly backup task: {e}")
            await asyncio.sleep(3600)  # Wait an hour before retrying if error


# --- API Endpoints ---
@router.post("/backup")
def trigger_system_backup():
    """
    Ендпоінт для миттєвого ручного запуску шифрованого бекапу та синхронізації з Google Drive (5TB).
    """
    res = perform_full_backup()
    return res


@router.get("/backup/status")
def get_backup_status():
    """
    Повертає статус останнього резервного копіювання, розмір архіву та статус підключення Google Drive.
    """
    _load_status_from_disk()
    return _last_backup_cache


@router.get("/features")
def get_system_features():
    """
    Повертає конфігурацію функціональних прапорців (Feature Flags) для фронтенду PWA.
    """
    return {
        "enable_hospitality": settings.ENABLE_HOSPITALITY,
        "default_currency": settings.DEFAULT_CURRENCY,
        "usd_rate": settings.USD_UAH_RATE,
        "ai_model": settings.AI_MODEL,
        "gdrive_folder": settings.GDRIVE_BACKUP_FOLDER,
    }
