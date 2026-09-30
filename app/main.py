import os
import time
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import text
from app.config import settings
from app.database import init_db
from app.services.crypto import get_fernet
from app.routers import (
    process_router,
    finance_router,
    shopping_router,
    tasks_router,
    media_notes_router,
)
from app.modules.inventory import inventory_router, InventoryItem
from app.modules.auto import auto_router, AutoLog
from app.modules.utilities import utilities_router, UtilityReading
from app.modules.fitness import fitness_router, FitnessLog
from app.modules.hospitality import hospitality_router, Booking
from app.modules.delegation import delegation_router, FamilyContact
from app.modules.translator import translator_router
from app.modules.health_vitals import health_vitals_router, BloodPressureLog
from app.modules.movies import movies_router
from app.modules.users import users_router, User, UserSettings
from app.modules.plants import plants_router, Plant
from app.modules.recipes import recipes_router, Recipe
from app.modules.music import music_router, MusicTrack, MusicPlaylist
from app.modules.business import business_router, BusinessTransaction
from app.modules.ai_chat import ai_chat_router
from app.modules.mailbox import mailbox_router
from app.core import web_agent_router, gemini_router, system_router, start_nightly_backup_task
from app.core.undo_service import router as undo_router
from app.database import Base, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables on startup
    init_db()
    Base.metadata.create_all(bind=engine)

    # Purge any orphaned or mismatched audio cache on startup
    try:
        from app.database import SessionLocal
        from app.modules.music.service import clean_orphan_cache
        with SessionLocal() as db:
            purged = clean_orphan_cache(db)
            if purged > 0:
                print(f"[Music] Purged {purged} invalid/orphan cache files on startup")
    except Exception as e:
        print(f"[Music] Startup cache cleaning warning: {e}")

    # Start background Google Drive nightly backup task
    backup_task = asyncio.create_task(start_nightly_backup_task())
    try:
        yield
    finally:
        backup_task.cancel()


START_TIME = time.time()


app = FastAPI(
    title="Мой Секретарь (My Secretary)",
    description="Автономный персональный AI-секретарь на FastAPI и Google Gemini",
    version="3.7.4",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routers
api_v1 = FastAPI()
api_v1.include_router(process_router)
api_v1.include_router(finance_router)
api_v1.include_router(shopping_router)
api_v1.include_router(tasks_router)
api_v1.include_router(media_notes_router)

# Step 2 Modules
api_v1.include_router(inventory_router)
api_v1.include_router(auto_router)
api_v1.include_router(utilities_router)
api_v1.include_router(web_agent_router)
api_v1.include_router(gemini_router)

# Step 3 Modules
api_v1.include_router(fitness_router)
api_v1.include_router(system_router)

# Step 5 & 6 Modules (Delegation, Translator, Undo, Health Vitals)
api_v1.include_router(delegation_router)
api_v1.include_router(translator_router)
api_v1.include_router(undo_router)
api_v1.include_router(health_vitals_router)
api_v1.include_router(movies_router)
api_v1.include_router(users_router)
api_v1.include_router(plants_router)
api_v1.include_router(recipes_router)
api_v1.include_router(music_router)
api_v1.include_router(business_router)
api_v1.include_router(ai_chat_router)
api_v1.include_router(mailbox_router)


# Dormant Hospitality Module (Feature-flagged)
if settings.ENABLE_HOSPITALITY:
    api_v1.include_router(hospitality_router)

# Healthcheck endpoint (database status, active modules, uptime)
def get_system_health():
    """
    Комплексна перевірка працездатності: статус бази даних, список активних модулів, uptime.
    """
    db_connected = False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_connected = True
    except Exception:
        db_connected = False

    active_modules = [
        "finance",
        "shopping",
        "tasks",
        "media_notes",
        "inventory",
        "auto",
        "utilities",
        "fitness",
        "web_agent",
        "gemini_router",
        "system_backup",
        "delegation",
        "translator",
        "undo",
        "health_vitals",
        "movies",
        "users",
        "plants",
        "recipes",
        "music",
    ]
    if settings.ENABLE_HOSPITALITY:
        active_modules.append("hospitality")

    uptime = round(time.time() - START_TIME, 1)
    status_code = "online" if db_connected else "degraded"

    return {
        "status": status_code,
        "app": "Мой Секретарь",
        "version": app.version,
        "uptime_seconds": uptime,
        "database_connected": db_connected,
        "active_modules": active_modules,
        "features": {
            "gemini_configured": bool(settings.GEMINI_API_KEY),
            "secret_key_protection": bool(settings.SECRET_KEY),
            "database_encryption": get_fernet() is not None,
            "hospitality_module": settings.ENABLE_HOSPITALITY,
            "nightly_gdrive_backup": True,
            "telegram_bot_configured": bool(settings.TELEGRAM_BOT_TOKEN),
        },
    }


def get_version_info():
    """Повертає точну версію бота, системні дані та дату/час останньої збірки."""
    build_time = "30.09.2026 16:25"
    git_hash = "latest"
    try:
        import subprocess
        out = subprocess.check_output(
            ["git", "log", "-1", "--format=%cd|%h", "--date=format:%d.%m.%Y %H:%M"],
            cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        ).decode("utf-8").strip()
        if "|" in out:
            build_time, git_hash = out.split("|", 1)
    except Exception:
        pass

    return {
        "status": "online",
        "app_name": "Мой Секретарь",
        "bot_version": app.version,
        "client_version": app.version,
        "build_date_time": build_time,
        "build_hash": git_hash,
        "uptime_seconds": round(time.time() - START_TIME, 1),
    }


# Register healthcheck and version on API v1 and root app
api_v1.add_api_route("/health", get_system_health, methods=["GET"], tags=["System & Health"])
app.add_api_route("/health", get_system_health, methods=["GET"], tags=["System & Health"])
api_v1.add_api_route("/system/version", get_version_info, methods=["GET"], tags=["System & Health"])
app.add_api_route("/system/version", get_version_info, methods=["GET"], tags=["System & Health"])

app.mount("/api/v1", api_v1)
app.mount("/api", api_v1)


# Static files and frontend PWA mount
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/static", StaticFiles(directory=frontend_dir), name="static")

    @app.api_route("/", methods=["GET", "HEAD"])
    async def serve_index(request: Request):
        proto = request.headers.get("x-forwarded-proto", request.url.scheme).lower()
        host = request.headers.get("host", "").split(":")[0]
        if proto == "http" and host not in ["localhost", "127.0.0.1"]:
            tunnel_file = r"C:\Users\Administrator\logs\current_tunnel_url.txt"
            if os.path.exists(tunnel_file):
                try:
                    with open(tunnel_file, "r", encoding="utf-8") as tf:
                        tunnel_url = tf.read().strip()
                        if tunnel_url.startswith("https://"):
                            return RedirectResponse(f"{tunnel_url}/?key={settings.SECRET_KEY}", status_code=307)
                except Exception:
                    pass

        return FileResponse(
            os.path.join(frontend_dir, "index.html"),
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
        )

    @app.api_route("/manifest.json", methods=["GET", "HEAD"])
    async def serve_manifest():
        return FileResponse(
            os.path.join(frontend_dir, "manifest.json"),
            headers={"Cache-Control": "no-cache, must-revalidate"}
        )

    @app.api_route("/sw.js", methods=["GET", "HEAD"])
    async def serve_sw():
        return FileResponse(
            os.path.join(frontend_dir, "sw.js"),
            media_type="application/javascript",
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
        )

    @app.api_route("/apple-touch-icon.png", methods=["GET", "HEAD"])
    @app.api_route("/apple-touch-icon-120x120.png", methods=["GET", "HEAD"])
    @app.api_route("/apple-touch-icon-precomposed.png", methods=["GET", "HEAD"])
    async def serve_apple_touch_icon():
        return FileResponse(os.path.join(frontend_dir, "icons", "icon.svg"), media_type="image/svg+xml")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
