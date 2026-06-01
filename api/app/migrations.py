"""Run Alembic migrations programmatically on app startup.

Logic:
  1. If the DB already has app tables (e.g. `workflows`) but no `alembic_version`
     table, this is a pre-Alembic deployment — stamp the baseline as applied
     without re-running it, so data is preserved.
  2. Then run `alembic upgrade head` to apply any pending migrations.

This is the single source of truth for schema evolution. Never edit production
SQLite by hand and never call `Base.metadata.create_all` in production —
always go through a migration revision.
"""
from __future__ import annotations

import os
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from app.database import engine

BASELINE_REVISION = "0001_baseline"


def _alembic_cfg() -> Config:
    # alembic.ini lives at /app/alembic.ini in the container, and at api/alembic.ini in dev.
    here = Path(__file__).resolve().parent.parent  # /app inside container
    ini = here / "alembic.ini"
    cfg = Config(str(ini))
    cfg.set_main_option("script_location", str(here / "alembic"))
    return cfg


def run_migrations() -> None:
    cfg = _alembic_cfg()
    insp = inspect(engine)
    tables = set(insp.get_table_names())

    pre_alembic_db = ("workflows" in tables) and ("alembic_version" not in tables)
    if pre_alembic_db:
        # Existing data — stamp baseline so the schema is "caught up" without DDL.
        command.stamp(cfg, BASELINE_REVISION)

    command.upgrade(cfg, "head")
