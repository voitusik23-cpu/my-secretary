from app.routers.finance import router as finance_router
from app.routers.shopping import router as shopping_router
from app.routers.tasks import router as tasks_router
from app.routers.media_notes import router as media_notes_router
from app.routers.process import router as process_router

__all__ = [
    "finance_router",
    "shopping_router",
    "tasks_router",
    "media_notes_router",
    "process_router",
]
