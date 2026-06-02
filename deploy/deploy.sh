#!/usr/bin/env bash
# Idempotent redeploy for the NAT'd home server.
#   - fast-forwards the checkout to origin/main
#   - rebuilds the app images
#   - brings the stack up with the production overlay (adds cloudflared,
#     removes host port publishing)
#
# Safe to run by hand, from cron, or from a GitHub Actions self-hosted runner.
#
# Assumes it lives at <repo>/deploy/deploy.sh and the repo root is one level up.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

echo "[deploy] repo: $REPO_DIR"

# 1. Sync to origin/main (hard reset — server is a deploy target, not a workspace).
git fetch --quiet origin main
git reset --hard origin/main

# 2. Build only the app images (cloudflared/redis are pulled).
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml build api worker frontend

# 3. Recreate. --force-recreate is required because the Celery worker caches
#    task modules at startup and does not hot-reload.
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d --force-recreate

# 4. Prune dangling images so the disk doesn't fill on a home box.
docker image prune -f >/dev/null 2>&1 || true

# 5. Smoke tests — run against a disposable test DB; failures are logged but
#    do NOT abort the deploy (the app is already up; we want to know the result).
COMPOSE_PROD="docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml"
DB_URL="postgresql+psycopg://interpret:interpret@postgres:5432/interpret_test"

echo "[deploy] ensuring interpret_test database exists..."
$COMPOSE_PROD exec -T postgres \
  psql -U interpret -d interpret \
  -c "CREATE DATABASE interpret_test" 2>/dev/null \
  || true   # already exists

echo "[deploy] running smoke tests..."
if $COMPOSE_PROD run --rm \
    -e "DATABASE_URL=${DB_URL}" \
    --entrypoint pytest \
    api tests/smoke/ -q --tb=short 2>&1 | tee -a "$HOME/clerq2-deploy.log"; then
  echo "[deploy] smoke tests PASSED"
else
  echo "[deploy] smoke tests FAILED — deployment is live but degraded, check $HOME/clerq2-deploy.log" >&2
fi

echo "[deploy] done. current commit: $(git rev-parse --short HEAD)"
