import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
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


app = FastAPI(
    title="Мой Секретарь (My Secretary)",
    description="Автономный персональный AI-секретарь на FastAPI и Google Gemini",
    version="3.0.0",
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

app.mount("/api/v1", api_v1)
app.mount("/api", api_v1)


@app.get("/health")
def health_check():
    """
    Проверка работоспособности системы и статуса конфигурации.
    """
    has_gemini = bool(settings.GEMINI_API_KEY)
    has_secret = bool(settings.SECRET_KEY)
    has_encryption = get_fernet() is not None

    return {
        "status": "online",
        "app": "Мой Секретарь",
        "version": app.version,
        "features": {
            "gemini_configured": has_gemini,
            "secret_key_protection": has_secret,
            "database_encryption": has_encryption,
        }
    }


# Static files and frontend PWA mount
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/static", StaticFiles(directory=frontend_dir), name="static")

    @app.get("/")
    async def serve_index():
        return FileResponse(os.path.join(frontend_dir, "index.html"))

    @app.get("/manifest.json")
    async def serve_manifest():
        return FileResponse(os.path.join(frontend_dir, "manifest.json"))

    @app.get("/sw.js")
    async def serve_sw():
        return FileResponse(os.path.join(frontend_dir, "sw.js"), media_type="application/javascript")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
