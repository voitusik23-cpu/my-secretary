"""
Migration Tool: SQLite -> PostgreSQL / Universal DB Exporter & Importer
Exports all SQLite data, users, and multi-tenant DBs, or loads into a PostgreSQL instance.
"""
import os
import json
import sqlite3
import logging
from typing import Dict, Any, List

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("migration")

BASE_DIR = r"C:\Users\Administrator"
DB_PATH = os.path.join(BASE_DIR, "secretary.db")
USERS_DIR = os.path.join(BASE_DIR, "data", "users")
BACKUP_FILE = os.path.join(BASE_DIR, "data", "sqlite_backup_export.json")

def export_sqlite_to_json(output_path: str = BACKUP_FILE) -> str:
    """Exports primary database and all user databases to a JSON archive."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    full_data: Dict[str, Any] = {"primary": {}, "users": {}}

    # Export primary DB
    if os.path.exists(DB_PATH):
        logger.info(f"Exporting primary DB: {DB_PATH}")
        full_data["primary"] = dump_sqlite_tables(DB_PATH)

    # Export users DBs
    if os.path.exists(USERS_DIR):
        for fname in os.listdir(USERS_DIR):
            if fname.endswith(".db"):
                user_id = fname.replace("secretary_", "").replace(".db", "")
                user_db_path = os.path.join(USERS_DIR, fname)
                logger.info(f"Exporting tenant DB for user {user_id}: {user_db_path}")
                full_data["users"][user_id] = dump_sqlite_tables(user_db_path)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(full_data, f, ensure_ascii=False, indent=2, default=str)

    logger.info(f"✅ Full export saved to: {output_path}")
    return output_path

def dump_sqlite_tables(sqlite_file: str) -> Dict[str, List[Dict[str, Any]]]:
    conn = sqlite3.connect(sqlite_file)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    tables = [r[0] for r in cursor.fetchall()]

    db_dump = {}
    for table in tables:
        cursor.execute(f"SELECT * FROM [{table}]")
        rows = [dict(row) for row in cursor.fetchall()]
        db_dump[table] = rows
        logger.info(f"  Table {table}: {len(rows)} records")

    conn.close()
    return db_dump

if __name__ == "__main__":
    export_sqlite_to_json()
