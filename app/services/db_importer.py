"""
Importer and Database Engine Switcher: SQLite <-> PostgreSQL
Enables seamless data import into a PostgreSQL database from the SQLite JSON dump.
"""
import os
import json
import logging
from typing import Dict, Any, List
from sqlalchemy import create_engine, text, MetaData, Table
from app.config import settings
from app.database import Base, init_all_models

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("db_importer")

def import_dump_to_engine(dump_data: Dict[str, List[Dict[str, Any]]], target_engine):
    """Imports rows into tables for the given SQLAlchemy engine."""
    init_all_models()
    Base.metadata.create_all(bind=target_engine)

    with target_engine.connect() as conn:
        # Disable foreign keys temporarily if needed or populate tables in dependency order
        metadata = MetaData()
        metadata.reflect(bind=target_engine)

        for table_name, rows in dump_data.items():
            if not rows:
                continue
            if table_name not in metadata.tables:
                logger.warning(f"Table {table_name} not found in target metadata, skipping.")
                continue

            sa_table = metadata.tables[table_name]
            logger.info(f"Importing {len(rows)} records into table '{table_name}'...")

            try:
                # Clear existing rows or insert
                conn.execute(sa_table.insert(), rows)
                conn.commit()
                logger.info(f"✅ Successfully imported into '{table_name}'")
            except Exception as e:
                conn.rollback()
                logger.error(f"Failed bulk insert into {table_name}: {e}. Retrying row-by-row...")
                success_count = 0
                for r in rows:
                    try:
                        conn.execute(sa_table.insert().values(**r))
                        conn.commit()
                        success_count += 1
                    except Exception as err:
                        conn.rollback()
                logger.info(f"  Row-by-row completed: {success_count}/{len(rows)} rows inserted.")

def run_import_to_pg(pg_url: str, json_file_path: str = r"C:\Users\Administrator\data\sqlite_backup_export.json"):
    """Imports the primary DB from JSON dump into PostgreSQL database."""
    if not os.path.exists(json_file_path):
        raise FileNotFoundError(f"Backup file not found at {json_file_path}")

    logger.info(f"Connecting to target PostgreSQL: {pg_url}")
    pg_engine = create_engine(pg_url)

    with open(json_file_path, "r", encoding="utf-8") as f:
        full_data = json.load(f)

    primary_dump = full_data.get("primary", {})
    if primary_dump:
        logger.info("Importing primary database tables...")
        import_dump_to_engine(primary_dump, pg_engine)
        logger.info("🎉 PostgreSQL Migration for Primary DB completed successfully!")
    else:
        logger.warning("No primary database data found in dump.")

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        run_import_to_pg(sys.argv[1])
    else:
        print("Usage: python db_importer.py postgresql://user:password@localhost:5432/secretary")
