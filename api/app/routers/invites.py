"""Public invite endpoints (no auth required).

`/api/invites/lookup` — POST raw token → returns invite metadata (so the
`/invite/:token` page can show the user's email + tenant before they pick a
password). Always returns 200; the `valid` flag tells the client what to
render. We deliberately do NOT leak whether a token format is "almost right"
— that would help bruteforcing.

`/api/invites/accept` — POST {token, password, display_name?} → creates the
User + AuthIdentity rows, marks the invite consumed, returns a fresh access
token + refresh token so the new user is signed in on the same redirect.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.auth import AuthIdentity, Tenant, User, UserInvite
from app.schemas.auth import TokenPair
from app.schemas.invite import InviteAcceptRequest, InviteLookupRequest, InviteLookupResponse
from app.security import (
    hash_password,
    issue_access_token,
    issue_refresh_token,
    verify_password,
)

router = APIRouter()


def _find_invite_by_raw_token(db: Session, raw: str) -> UserInvite | None:
    """Bcrypt hashes aren't indexable; scan unconsumed invites and verify."""
    if not raw:
        return None
    now = datetime.utcnow()
    candidates = (
        db.query(UserInvite)
        .filter(
            UserInvite.accepted_at.is_(None),
            UserInvite.revoked_at.is_(None),
            UserInvite.expires_at > now,
        )
        .all()
    )
    for inv in candidates:
        if verify_password(raw, inv.token_hash):
            return inv
    return None


@router.post("/lookup", response_model=InviteLookupResponse)
def lookup(body: InviteLookupRequest, db: Session = Depends(get_db)):
    inv = _find_invite_by_raw_token(db, body.token)
    if inv is None:
        return InviteLookupResponse(valid=False, error="Invitation invalid, expired, or already used.")
    tenant = db.get(Tenant, inv.tenant_id)
    return InviteLookupResponse(
        valid=True, email=inv.email, tenant_name=tenant.name if tenant else None, role=inv.role,
    )


@router.post("/accept", response_model=TokenPair)
def accept(body: InviteAcceptRequest, request: Request, db: Session = Depends(get_db)):
    inv = _find_invite_by_raw_token(db, body.token)
    if inv is None:
        raise HTTPException(status_code=400, detail="Invitation invalid, expired, or already used.")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    email = inv.email.strip().lower()
    if db.query(User).filter(User.email == email).first():
        # Race: someone created the user via another path. Revoke this invite.
        inv.revoked_at = datetime.utcnow()
        db.commit()
        raise HTTPException(status_code=409, detail="A user with this email already exists.")

    user = User(
        tenant_id=inv.tenant_id,
        email=email,
        display_name=(body.display_name or email.split("@")[0]).strip(),
        role=inv.role or "member",
        is_active=True,
        is_superadmin=False,
        mfa_required=False,
    )
    db.add(user)
    db.flush()
    db.add(AuthIdentity(
        user_id=user.id,
        provider="password",
        secret=hash_password(body.password),
        is_verified=True,
    ))
    inv.accepted_at = datetime.utcnow()

    # Issue tokens so the new user lands signed-in.
    access, expires_at = issue_access_token(user)
    refresh, _ = issue_refresh_token(
        db, user,
        user_agent=request.headers.get("user-agent"),
        ip=(request.client.host if request.client else None),
    )
    user.last_login_at = datetime.utcnow()
    db.commit()
    return TokenPair(access_token=access, refresh_token=refresh, expires_at=expires_at)
