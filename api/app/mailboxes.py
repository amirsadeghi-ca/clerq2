"""Helpers for inbound mailbox addresses (policy-N / custom local parts).

The inbound resolver (`routers/mail.py`) matches on the stored `email_address`,
so a mailbox local part can be anything — it just has to be valid and globally
unique across BOTH policies and workflows (resolution is global, no tenant
filter). The domain is fixed by `MAIL_INBOUND_DOMAIN` so Resend can receive.
"""
from __future__ import annotations

import re

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.policy import Policy
from app.models.workflow import Workflow

# A conservative local-part: lowercase letters/digits with . _ - in the middle.
_VALID = re.compile(r"^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$")


def slugify_local_part(name: str | None, fallback: str) -> str:
    """Turn a policy/workflow name into a local part, e.g.
    'Residential Mortgage' → 'residential-mortgage'. Falls back when empty."""
    s = re.sub(r"[^a-z0-9]+", "-", (name or "").strip().lower())
    s = re.sub(r"-{2,}", "-", s).strip("-")[:64].strip("-")
    return s or fallback


def normalize_local_part(s: str | None) -> str:
    return (s or "").strip().lower()


def validate_local_part(s: str) -> str | None:
    """Return an error message, or None if valid."""
    if not s:
        return "Address cannot be empty."
    if len(s) > 64:
        return "Address is too long (max 64 characters)."
    if not _VALID.match(s):
        return "Use lowercase letters, digits, dots, hyphens or underscores."
    return None


def address_in_use(
    db: Session,
    address: str,
    *,
    exclude_policy_id: int | None = None,
    exclude_workflow_id: int | None = None,
) -> bool:
    addr = address.lower()
    pq = db.query(Policy.id).filter(func.lower(Policy.email_address) == addr)
    if exclude_policy_id is not None:
        pq = pq.filter(Policy.id != exclude_policy_id)
    if pq.first():
        return True
    wq = db.query(Workflow.id).filter(func.lower(Workflow.email_address) == addr)
    if exclude_workflow_id is not None:
        wq = wq.filter(Workflow.id != exclude_workflow_id)
    return wq.first() is not None


def unique_local_part(
    db: Session,
    base: str,
    domain: str,
    *,
    exclude_policy_id: int | None = None,
    exclude_workflow_id: int | None = None,
) -> str:
    """Return `base`, or `base-2`, `base-3`, … until the full address is free."""
    candidate = base
    n = 1
    while address_in_use(
        db, f"{candidate}@{domain}",
        exclude_policy_id=exclude_policy_id, exclude_workflow_id=exclude_workflow_id,
    ):
        n += 1
        candidate = f"{base}-{n}"
    return candidate
