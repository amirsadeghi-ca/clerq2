from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _add_column_if_missing(conn, table: str, column: str, definition: str) -> None:
    """SQLite-safe ALTER TABLE ADD COLUMN — silently skips if column already exists."""
    try:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))
        conn.commit()
    except Exception:
        pass  # column already exists


def run_migrations() -> None:
    """Add new columns to pre-existing tables without dropping data."""
    with engine.connect() as conn:
        _add_column_if_missing(conn, "workflows", "is_archived", "BOOLEAN NOT NULL DEFAULT 0")
        _add_column_if_missing(conn, "workflows", "current_version_num", "INTEGER NOT NULL DEFAULT 0")
        _add_column_if_missing(conn, "workflows", "is_favorite", "BOOLEAN NOT NULL DEFAULT 0")
        _add_column_if_missing(conn, "workflow_runs", "version_id", "INTEGER REFERENCES workflow_versions(id)")
        _add_column_if_missing(conn, "workflow_runs", "version_num", "INTEGER")
        _add_column_if_missing(conn, "workflow_run_steps", "logs", "TEXT")
        _add_column_if_missing(conn, "policies", "current_version_num", "INTEGER NOT NULL DEFAULT 0")
        _add_column_if_missing(conn, "policy_rules", "accept_criteria", "TEXT")
        _add_column_if_missing(conn, "policy_rules", "fail_criteria", "TEXT")
        _add_column_if_missing(conn, "policy_rules", "scope", "TEXT NOT NULL DEFAULT 'per_document'")
        _add_column_if_missing(conn, "workflow_runs", "name", "TEXT")
        _add_column_if_missing(conn, "workflow_runs", "source", "TEXT")
        _add_column_if_missing(conn, "workflow_runs", "policy_id", "INTEGER")
        _add_column_if_missing(conn, "policies",      "email_inbox_enabled", "BOOLEAN NOT NULL DEFAULT 0")
        _add_column_if_missing(conn, "policies",      "email_address",       "TEXT")
        _add_column_if_missing(conn, "workflows",     "email_inbox_enabled", "BOOLEAN NOT NULL DEFAULT 0")
        _add_column_if_missing(conn, "workflows",     "email_address",       "TEXT")
        _add_column_if_missing(conn, "workflow_runs", "sender_email",        "TEXT")
        _add_column_if_missing(conn, "policies", "email_reply_mode",  "TEXT NOT NULL DEFAULT 'always'")
        _add_column_if_missing(conn, "policies", "email_pass_message", "TEXT")
        _add_column_if_missing(conn, "policies", "email_fail_message", "TEXT")


def create_tables() -> None:
    from app.models import workflow, document, run, workflow_version, document_type, policy, setting, mail  # noqa: F401
    from app.models.policy import PolicyVersion  # noqa: F401
    from app.models.run import WorkflowRunDocument  # noqa: F401
    Base.metadata.create_all(bind=engine)
