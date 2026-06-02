"""Health and readiness endpoints.

GET /api/health          — simple liveness probe (no deps)
GET /api/health/readiness — deep check: DB, Redis, OpenRouter, email, secret key
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app import system_settings
from app.config import settings
from app.database import get_db
from app.models.setting import AppSetting

router = APIRouter()


@router.get("")
def health():
    return {"status": "ok"}


@router.get("/readiness")
def readiness(db: Session = Depends(get_db)):
    checks: dict[str, dict] = {}

    # ── 1. Database ──────────────────────────────────────────────────────────
    try:
        db.execute(text("SELECT 1"))
        checks["database"] = {"ok": True}
    except Exception:
        checks["database"] = {"ok": False, "reason": "Cannot reach database"}

    # ── 2. Redis ─────────────────────────────────────────────────────────────
    try:
        import redis as _redis
        r = _redis.Redis.from_url(settings.redis_url, socket_connect_timeout=2)
        r.ping()
        r.close()
        checks["redis"] = {"ok": True}
    except Exception:
        checks["redis"] = {"ok": False, "reason": "Cannot reach Redis — background jobs will not run"}

    # ── 3. OpenRouter (AI validation) ────────────────────────────────────────
    # Check env var first; fall back to any tenant's DB-stored key.
    or_key = settings.openrouter_api_key
    if not or_key:
        row = db.execute(
            select(AppSetting).where(
                AppSetting.key == "openrouter_api_key",
                AppSetting.value != "",
            ).limit(1)
        ).scalar_one_or_none()
        if row:
            or_key = row.value

    checks["openrouter"] = {
        "ok": bool(or_key),
        **({"reason": "OpenRouter API key not set — AI validation will fail"} if not or_key else {}),
    }

    # ── 4. Email / Resend (warning only — app works without it) ─────────────
    resend_key = system_settings.resend_api_key(db)
    checks["email"] = {
        "ok": bool(resend_key),
        "warning_only": True,
        **({"reason": "Resend API key not configured — email delivery disabled"} if not resend_key else {}),
    }

    # ── 5. Secret key sanity ──────────────────────────────────────────────────
    if settings.secret_key == "change-me-in-production":
        checks["secret_key"] = {
            "ok": False,
            "reason": "SECRET_KEY is the default — change it before production use",
        }
    else:
        checks["secret_key"] = {"ok": True}

    # overall = all hard failures resolved (email is warning-only)
    hard_fail = [k for k, v in checks.items() if not v["ok"] and not v.get("warning_only")]
    return {"ok": len(hard_fail) == 0, "checks": checks}
