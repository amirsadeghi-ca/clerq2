"""Password hashing + JWT helpers + the FastAPI auth dependencies.

Tokens
------
- **Access token** — short-lived (30 min by default), JWT signed with HS256.
  Claims: sub=user_id, tid=tenant_id, role, exp, iat, typ="access".
- **Refresh token** — opaque random string (32 bytes URL-safe). We store its
  bcrypt hash in `refresh_tokens` and hand the raw string back to the client.
  Long-lived (30 days). Revocable per-row.

Dependencies
------------
- `get_current_user` — extracts `Authorization: Bearer <jwt>` and resolves
  the user. Raises 401 on missing/invalid/expired token.
- `get_current_tenant_id` — convenience; returns user.tenant_id.
- `require_role("admin")` — factory for role-gated routes.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.auth import RefreshToken, User

bearer_scheme = HTTPBearer(auto_error=False)


# --- passwords ----------------------------------------------------------------
# bcrypt has a 72-byte input limit. We pre-truncate to be explicit (passlib used
# to do this silently; the bcrypt 4.x package rejects > 72 bytes).

def _bcrypt_bytes(plain: str) -> bytes:
    return plain.encode("utf-8")[:72]


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(_bcrypt_bytes(plain), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(_bcrypt_bytes(plain), hashed.encode("utf-8"))
    except Exception:
        return False


# --- access tokens ------------------------------------------------------------

def issue_access_token(user: User) -> tuple[str, datetime]:
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=settings.access_token_minutes)
    payload = {
        "sub": str(user.id),
        "tid": user.tenant_id,
        "role": user.role,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
        "typ": "access",
    }
    token = jwt.encode(payload, settings.effective_jwt_secret, algorithm=settings.jwt_algorithm)
    return token, expires_at


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.effective_jwt_secret, algorithms=[settings.jwt_algorithm])


# --- refresh tokens -----------------------------------------------------------

def issue_refresh_token(
    db: Session, user: User, *, user_agent: str | None = None, ip: str | None = None
) -> tuple[str, RefreshToken]:
    raw = secrets.token_urlsafe(48)
    token_hash = hash_password(raw)
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_days)
    row = RefreshToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
        user_agent=(user_agent or "")[:512] or None,
        ip_address=(ip or "")[:64] or None,
    )
    db.add(row)
    db.flush()
    return raw, row


def verify_and_consume_refresh_token(db: Session, raw: str) -> User | None:
    """Rotate-on-refresh: find the matching row, mark it revoked, return the
    user so a fresh pair can be issued. Returns None on any failure."""
    if not raw:
        return None
    # Bcrypt hashes aren't directly indexable — scan unrevoked rows. With server-
    # side hygiene (revoke old, expire stale) this stays small in practice.
    now = datetime.now(timezone.utc)
    rows = (
        db.query(RefreshToken)
        .filter(RefreshToken.revoked_at.is_(None), RefreshToken.expires_at > now)
        .all()
    )
    for row in rows:
        if verify_password(raw, row.token_hash):
            row.revoked_at = now
            user = db.get(User, row.user_id)
            if not user or not user.is_active:
                return None
            db.flush()
            return user
    return None


def revoke_all_user_refresh_tokens(db: Session, user_id: int) -> None:
    now = datetime.now(timezone.utc)
    db.query(RefreshToken).filter(
        RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None)
    ).update({"revoked_at": now})


# --- FastAPI dependencies -----------------------------------------------------

def _credentials_exception(detail: str = "Not authenticated") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
    db: Session = Depends(get_db),
) -> User:
    token: str | None = None
    if credentials and credentials.scheme.lower() == "bearer":
        token = credentials.credentials
    # SSE EventSource can't set headers; allow ?access_token=… as a fallback for those routes.
    if not token:
        token = request.query_params.get("access_token")
    if not token:
        raise _credentials_exception()

    try:
        payload = decode_access_token(token)
    except jwt.ExpiredSignatureError:
        raise _credentials_exception("Token expired")
    except jwt.InvalidTokenError:
        raise _credentials_exception("Invalid token")

    if payload.get("typ") != "access":
        raise _credentials_exception("Wrong token type")

    user_id_str = payload.get("sub")
    try:
        user_id = int(user_id_str) if user_id_str is not None else None
    except (TypeError, ValueError):
        raise _credentials_exception("Invalid subject")
    if user_id is None:
        raise _credentials_exception()

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise _credentials_exception("User inactive")
    return user


def get_current_tenant_id(user: Annotated[User, Depends(get_current_user)]) -> int:
    return user.tenant_id


def require_role(*roles: str):
    allowed = {r.lower() for r in roles}

    def _dep(user: Annotated[User, Depends(get_current_user)]) -> User:
        if user.role.lower() not in allowed:
            raise HTTPException(status_code=403, detail="Forbidden — insufficient role")
        return user

    return _dep


def require_superadmin(user: Annotated[User, Depends(get_current_user)]) -> User:
    if not getattr(user, "is_superadmin", False):
        raise HTTPException(status_code=403, detail="Forbidden — super-admin only")
    return user
