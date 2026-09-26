# Architecture Specification & Development Guardrails
**Мой Секретарь (Secretary AI)**
**Version:** 3.1.0  
**Status:** Mandatory for all AI agents and human contributors

---

## 1. Core Architectural Philosophy

Secretary AI is designed as a **Domain-Driven Modular Monolith**. It balances high developer velocity and token efficiency with strict architectural boundaries, data isolation, and cryptographic security.

### Key Tenets
1. **Isolated Modular Domains:** Every business capability lives in its own self-contained directory (`app/modules/<domain>/`).
2. **Zero Cross-Domain Model Imports:** No module may directly import or query another module's SQLAlchemy models.
3. **Communication via DTOs or Central Router:** Inter-module communication occurs strictly through validated Pydantic schemas (Data Transfer Objects) or through the central `gemini_router.py`.
4. **Token-Conscious File Structure:** No source code file should exceed **250 lines**. Keep logic modular, focused, and readable.
5. **Scoped Agent Modification Rule:** When extending or fixing a feature, agents must **ONLY** open, view, and modify files within that specific domain module folder.

---

## 2. Directory & Domain Structure

```
my-secretary/
├── app/
│   ├── config.py              # Central Pydantic Settings (.env configuration)
│   ├── database.py            # SQLite engine, session factory, Encrypted types
│   ├── auth.py                # Secret key / Bearer authentication dependency
│   ├── main.py                # FastAPI app assembly, static mounting, health check
│   │
│   ├── core/                  # System-wide services (transversal)
│   │   ├── gemini_router.py   # Intent classification & voice dispatching
│   │   ├── web_agent.py       # DuckDuckGo search agent & summarizer
│   │   └── gdrive_backup.py   # Encrypted SQLite snapshots & Google Drive sync
│   │
│   ├── services/              # Cross-cutting foundational utilities
│   │   ├── crypto.py          # Fernet 256-bit symmetric encryption
│   │   ├── currency.py        # UAH/USD exchange rate calculation
│   │   └── ai_parser.py       # Gemini API client wrapper
│   │
│   ├── models/ & routers/     # Step 1 Legacy domains (Finance, Shopping, Tasks, Media)
│   │
│   └── modules/               # Domain-Driven Modules (Steps 2, 3, 4+)
│       ├── inventory/         # "Where is what" home organization
│       │   ├── __init__.py
│       │   ├── models.py      # InventoryItem (SQLAlchemy)
│       │   ├── schemas.py     # Pydantic input/output models
│       │   └── router.py      # APIRouter (/api/v1/inventory)
│       ├── auto/              # Vehicle mileage, maintenance & insurance
│       ├── utilities/         # Meter readings (electricity, gas, water) & tariffs
│       ├── fitness/           # Apple Health sync, steps, workouts, ski logs
│       └── hospitality/       # Dormant booking & guest management engine
│
├── frontend/                  # Responsive PWA (HTML5, Vanilla JS, CSS3, Service Worker)
├── docs/                      # Architectural, remote access, and setup specifications
├── Dockerfile                 # Multi-stage production container
├── docker-compose.yml         # Container orchestration with /data persistence
├── save.sh                    # Automated compile check, DB backup, and Git checkpoint
└── rollback.sh                # Instant one-key restore from previous checkpoint
```

---

## 3. Strict Isolation Rules

### Rule 1: No Cross-Domain Model Imports
```python
# ❌ STRICTLY FORBIDDEN:
from app.modules.fitness.models import FitnessLog
from app.modules.auto.models import AutoLog

# Querying foreign tables directly inside another module:
db.query(FitnessLog).filter(...)
```

```python
# ✅ ALLOWED & MANDATORY:
# Modules communicate via REST APIs, Pydantic schemas (DTOs), or unified intent handlers:
from app.modules.fitness.schemas import FitnessSummaryResponse
```

**Why this rule exists:**
- Prevents database tight coupling and circular dependencies.
- Allows any domain module to be refactored, migrated to PostgreSQL, or extracted into an independent microservice without breaking other modules.
- Protects the database schema integrity across changes.

### Rule 2: Inter-Module Coordination via `gemini_router.py`
When the user gives a natural voice or text command (e.g. *"I ran 5 km and spent 200 UAH on coffee"*), the request is received by `app/core/gemini_router.py`.
- The router categorizes the intent via Gemini LLM.
- The router delegates execution to each domain's router handler or service via standardized DTO parameters.
- No domain module needs to know about the internal workings of another.

---

## 4. Coding Standards & Token Economy

### 250-Line Limit per File
To prevent AI context degradation, hallucination, and excessive token usage:
- Split files when they approach 250 lines.
- Separate database definitions (`models.py`), request/response validation (`schemas.py`), and HTTP endpoints (`router.py`).
- Keep business logic in dedicated helper functions within the module.

### Safe Field Naming in Pydantic (Type Shadowing Trap)
Always alias standard library imports when field names match types:
```python
# ❌ INCORRECT (causes Pydantic V2 typing collision):
from datetime import date
class HealthSchema(BaseModel):
    date: Optional[date] = None  # Collision!

# ✅ CORRECT:
from datetime import date as dt_date
class HealthSchema(BaseModel):
    date: Optional[dt_date] = None
```

### At-Rest Encryption Standard
All sensitive user data (financial notes, physical locations, meter identifiers, vehicle notes) must be encrypted at rest:
- Use `EncryptedText` or `EncryptedString` from `app.database`.
- The encryption key is derived from `ENCRYPTION_KEY` in `.env` using 256-bit Fernet encryption (`app/services/crypto.py`).

---

## 5. Agent Maintenance Protocol

When tasked with modifying, debugging, or adding features:

1. **Scope Check:** Identify which domain the feature belongs to (`app/modules/<domain>/`).
2. **Isolated Work:**
   - ONLY view and edit files within `app/modules/<domain>/`.
   - DO NOT edit `app/modules/<other_domain>/` or legacy Step 1 files (`app/routers/`, `app/models/`).
   - If a new module is added, register its router in `app/main.py` in one minimal surgical edit.
3. **Verification Before Committing:**
   - Run `python -m compileall app/` to verify syntax.
   - Test endpoints via `curl` against `http://localhost:8000/api/v1/health` and the modified module routes.
4. **Git Checkpoint:**
   - Always run `./save.sh "<descriptive commit message>"`.
   - Never run raw `git push` manually, as `./save.sh` creates timestamped backups of `secretary.db` and tag checkpoints.

---

## 6. Health & Observability Contract

Every deployment must expose the unified health endpoint:
- **URL:** `GET /api/v1/health` (and alias `GET /health`)
- **Payload Schema:**
  ```json
  {
    "status": "online",
    "app": "Мой Секретарь",
    "version": "3.1.0",
    "uptime_seconds": 1245.2,
    "database_connected": true,
    "active_modules": [
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
      "system_backup"
    ],
    "features": {
      "gemini_configured": true,
      "secret_key_protection": true,
      "database_encryption": true,
      "hospitality_module": false
    }
  }
  ```
