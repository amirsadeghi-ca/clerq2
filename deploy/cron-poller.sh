#!/usr/bin/env bash
# Fallback CI/CD for a NAT'd box with no self-hosted runner.
# Polls origin/main; if it moved, runs deploy.sh. Install via cron, e.g.:
#
#   */2 * * * * /srv/clerq2/deploy/cron-poller.sh >> /var/log/clerq2-deploy.log 2>&1
#
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

git fetch --quiet origin main
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main)"

if [ "$LOCAL" != "$REMOTE" ]; then
  echo "[$(date -u +%FT%TZ)] origin/main moved $LOCAL -> $REMOTE; deploying"
  exec "$REPO_DIR/deploy/deploy.sh"
fi
