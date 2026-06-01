"""Alembic environment.

We pull the target metadata from the app's SQLAlchemy Base and the database URL
from app.config.settings (which already reads .env). All migrations run with
SQLite-compatible `render_as_batch=True` so ALTER TABLE works on SQLite.
"""
from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.config import settings
from app.database import Base

# Import every model module so Base.metadata is fully populated for autogenerate.
# Adding a new model? Import it here.
from app.models import (  # noqa: F401
    workflow,
    workflow_version,
    document,
    document_type,
    run,
    run_step,
    policy,
    reference_list,
    setting,
    mail,
    case,
)
from app.models import auth  # noqa: F401  — added in the auth phase

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        render_as_batch=True,
        compare_type=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
