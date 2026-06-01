"""Global (non-tenant) settings.

Stored in `app_settings` under the reserved `tenant_id=0` row (the AppSetting
model documents this reservation). These are app-wide integration secrets —
e.g. the Resend API key and inbound webhook secret — that a super-admin manages
from the admin Integrations UI. Each resolver falls back to the corresponding
environment variable (`app.config.settings`) so existing env-only deploys keep
working until an admin overrides a value in the UI.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.config import settings as env_settings
from app.database import SessionLocal
from app.models.setting import AppSetting

SYSTEM_TENANT_ID = 0

# Keys persisted under tenant_id=0.
RESEND_API_KEY = "resend_api_key"
RESEND_INBOUND_WEBHOOK_SECRET = "resend_inbound_webhook_secret"
MAIL_INBOUND_DOMAIN = "mail_inbound_domain"
INVITE_FROM_ADDRESS = "invite_from_address"
INVITE_FROM_NAME = "invite_from_name"


def get_system(db: Session, key: str, fallback: str = "") -> str:
    row = db.get(AppSetting, (SYSTEM_TENANT_ID, key))
    if row and row.value != "":
        return row.value
    return fallback


def set_system(db: Session, key: str, value: str) -> None:
    row = db.get(AppSetting, (SYSTEM_TENANT_ID, key))
    if row:
        row.value = value
    else:
        db.add(AppSetting(tenant_id=SYSTEM_TENANT_ID, key=key, value=value))
    db.commit()


# ── Typed resolvers (DB → env fallback). Pass an open Session, or omit to open
#    a short-lived one (handy from the mailer, which often has no request db). ──

def _resolve(key: str, env_fallback: str, db: Session | None) -> str:
    if db is not None:
        return get_system(db, key, env_fallback)
    with SessionLocal() as own:
        return get_system(own, key, env_fallback)


def resend_api_key(db: Session | None = None) -> str:
    return _resolve(RESEND_API_KEY, env_settings.resend_api_key, db)


def resend_inbound_webhook_secret(db: Session | None = None) -> str:
    return _resolve(RESEND_INBOUND_WEBHOOK_SECRET, env_settings.resend_inbound_webhook_secret, db)


def mail_inbound_domain(db: Session | None = None) -> str:
    return _resolve(MAIL_INBOUND_DOMAIN, env_settings.mail_inbound_domain, db)


def invite_from_address(db: Session | None = None) -> str:
    return _resolve(INVITE_FROM_ADDRESS, env_settings.invite_from_address, db)


def invite_from_name(db: Session | None = None) -> str:
    return _resolve(INVITE_FROM_NAME, env_settings.invite_from_name, db)
