#!/usr/bin/env bash
# Container entrypoint: run Alembic migrations once, then exec the long-running
# process. Running migrations here (instead of inside FastAPI's startup hook)
# means uvicorn's --reload restarts never re-fire them, and the worker stays
# out of the migration's way.
set -euo pipefail

cd /app

# Rebrand (Clerq2 → Interpret) renamed the SQLite file clerq.db → interpret.db.
# If a pre-rebrand database is still on the shared volume and the new-named file
# does not exist yet, migrate it in place (main file + WAL/SHM sidecars) so no
# data is lost on the first deploy after the rename. Idempotent afterwards.
if [ -f /app/data/clerq.db ] && [ ! -f /app/data/interpret.db ]; then
  echo "[entrypoint] migrating clerq.db → interpret.db (rebrand)"
  mv /app/data/clerq.db /app/data/interpret.db
  [ -f /app/data/clerq.db-wal ] && mv /app/data/clerq.db-wal /app/data/interpret.db-wal || true
  [ -f /app/data/clerq.db-shm ] && mv /app/data/clerq.db-shm /app/data/interpret.db-shm || true
fi

echo "[entrypoint] running migrations…"
python -m app.migrate_cli
echo "[entrypoint] migrations done."

exec "$@"
