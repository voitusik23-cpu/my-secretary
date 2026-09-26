import os
import time
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
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
from app.core import web_agent_router, gemini_router, system_router, start_nightly_backup_task
from app.database import Base, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables on startup
    init_db()
    Base.metadata.create_all(bind=engine)

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
    version="3.1.0",
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
        },
    }


# Register healthcheck on API v1 and root app
api_v1.add_api_route("/health", get_system_health, methods=["GET"], tags=["System & Health"])
app.add_api_route("/health", get_system_health, methods=["GET"], tags=["System & Health"])

app.mount("/api/v1", api_v1)
app.mount("/api", api_v1)


# Static files and frontend PWA mount
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/static", StaticFiles(directory=frontend_dir), name="static")

    @app.api_route("/", methods=["GET", "HEAD"])
    async def serve_index():
        return FileResponse(os.path.join(frontend_dir, "index.html"))

    @app.api_route("/manifest.json", methods=["GET", "HEAD"])
    async def serve_manifest():
        return FileResponse(os.path.join(frontend_dir, "manifest.json"))

    @app.api_route("/sw.js", methods=["GET", "HEAD"])
    async def serve_sw():
        return FileResponse(os.path.join(frontend_dir, "sw.js"), media_type="application/javascript")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
