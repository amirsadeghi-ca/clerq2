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

echo "[deploy] done. current commit: $(git rev-parse --short HEAD)"
