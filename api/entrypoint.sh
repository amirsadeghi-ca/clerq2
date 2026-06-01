#!/usr/bin/env bash
# Container entrypoint: run Alembic migrations once, then exec the long-running
# process. Running migrations here (instead of inside FastAPI's startup hook)
# means uvicorn's --reload restarts never re-fire them, and the worker stays
# out of the migration's way.
set -euo pipefail

cd /app

echo "[entrypoint] running migrations…"
python -m app.migrate_cli
echo "[entrypoint] migrations done."

exec "$@"
