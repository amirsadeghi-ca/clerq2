from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

# Postgres-only since the execution-engine-v2 rewrite (SQLite was dropped, D1).
# A single Postgres code path lets the scheduler use FOR UPDATE SKIP LOCKED and
# advisory locks with no dialect fallback. `pool_pre_ping` recycles connections
# dropped across a Postgres restart; the pool is sized for the api threads plus
# the Celery worker concurrency.
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
