#!/usr/bin/env bash
# Run the smoke test suite against a disposable test database.
#
# Usage (from repo root):
#   bash scripts/run-smoke-tests.sh            # all smoke tests
#   bash scripts/run-smoke-tests.sh -k auth    # filter by keyword
#   bash scripts/run-smoke-tests.sh -v         # verbose
#
# The interpret_test database is created automatically if it does not exist.
# Requires the postgres and redis containers to be running:
#   docker compose up -d postgres redis

set -euo pipefail
COMPOSE="docker compose"
DB_URL="postgresql+psycopg://interpret:interpret@postgres:5432/interpret_test"

echo "[smoke] ensuring interpret_test database exists..."
$COMPOSE exec -T postgres \
  psql -U interpret -d interpret \
  -c "CREATE DATABASE interpret_test" 2>/dev/null \
  || echo "[smoke] interpret_test already exists — ok"

echo "[smoke] running tests..."
$COMPOSE run --rm \
  -e "DATABASE_URL=${DB_URL}" \
  --entrypoint pytest \
  api tests/smoke/ "$@"
