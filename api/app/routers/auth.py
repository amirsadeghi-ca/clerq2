"""Auth endpoints.

POST   /api/auth/login           email + password  → access + refresh
POST   /api/auth/refresh         refresh token     → new access + refresh (rotated)
POST   /api/auth/logout          revokes the presented refresh token
POST   /api/auth/logout-all      revokes every refresh token for the current user
GET    /api/auth/me              current user + tenant
POST   /api/auth/change-password current password + new password

MFA and SSO live in this same router as later additions; the foundation is in
place (`mfa_required` on User, `AuthIdentity` is multi-provider). The login
endpoint already accepts an optional `mfa_code` field — today it's ignored, but
the contract won't change when TOTP lands.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.auth import AuthIdentity, Tenant, User
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    MeResponse,
    RefreshRequest,
    TenantOut,
    TokenPair,
    UpdateMeRequest,
    UserOut,
)
from app.security import (
    get_current_user,
    hash_password,
    issue_access_token,
    issue_refresh_token,
    revoke_all_user_refresh_tokens,
    verify_and_consume_refresh_token,
    verify_password,
)
from app.totp import decrypt_totp_secret, verify_totp_code

router = APIRouter()


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        tenant_id=user.tenant_id,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        is_active=user.is_active,
        is_superadmin=getattr(user, "is_superadmin", False),
        mfa_required=user.mfa_required,
        mfa_enrolled=any(c.is_confirmed for c in (user.mfa_credentials or [])),
    )


def _password_identity(user: User) -> AuthIdentity | None:
    for ident in user.identities:
        if ident.provider == "password":
            return ident
    return None


def _issue_pair(db: Session, user: User, request: Request) -> TokenPair:
    access, expires_at = issue_access_token(user)
    refresh, _ = issue_refresh_token(
        db,
        user,
        user_agent=request.headers.get("user-agent"),
        ip=(request.client.host if request.client else None),
    )
    user.last_login_at = datetime.utcnow()
    db.commit()
    return TokenPair(
        access_token=access,
        refresh_token=refresh,
        token_type="bearer",
        expires_at=expires_at,
    )


@router.post("/login", response_model=TokenPair)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    # Email is unique per-tenant in the schema, but for now we only support one
    # password identity per email globally. Lookup is by email; collisions across
    # tenants will be resolved once we add a tenant-picker step at the UI.
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    ident = _password_identity(user)
    if not ident or not verify_password(body.password, ident.secret):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # MFA verification.
    confirmed_creds = [c for c in (user.mfa_credentials or []) if c.is_confirmed]
    if user.mfa_required and confirmed_creds:
        if not body.mfa_code:
            raise HTTPException(status_code=401, detail="MFA code required")

        code = body.mfa_code.strip().replace("-", "").replace(" ", "")
        verified = False

        # 1. Try TOTP codes first.
        totp_cred = next((c for c in confirmed_creds if c.type == "totp"), None)
        if totp_cred:
            secret = decrypt_totp_secret(totp_cred.secret)
            if verify_totp_code(secret, code):
                from datetime import datetime, timezone as _tz
                totp_cred.last_used_at = datetime.now(_tz.utc)
                verified = True

        # 2. Try recovery codes (any confirmed TOTP credential holds the list).
        if not verified and totp_cred and totp_cred.recovery_codes_json:
            from app.routers.mfa import _verify_and_consume_recovery_code
            # Recovery codes are formatted XXXXX-XXXXX; normalise.
            raw = body.mfa_code.strip().upper().replace("-", "").replace(" ", "")
            # Re-insert dash for storage format used at hash time.
            if len(raw) == 10:
                candidate = raw[:5] + "-" + raw[5:]
            else:
                candidate = body.mfa_code.strip().upper()
            matched, updated_hashes = _verify_and_consume_recovery_code(
                totp_cred.recovery_codes_json, candidate
            )
            if matched:
                totp_cred.recovery_codes_json = updated_hashes
                verified = True

        if not verified:
            raise HTTPException(status_code=401, detail="Invalid MFA code")

    return _issue_pair(db, user, request)


@router.post("/refresh", response_model=TokenPair)
def refresh(body: RefreshRequest, request: Request, db: Session = Depends(get_db)):
    user = verify_and_consume_refresh_token(db, body.refresh_token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
    return _issue_pair(db, user, request)


@router.post("/logout", status_code=204)
def logout(body: RefreshRequest, db: Session = Depends(get_db)):
    # Best-effort: revoke the presented token if it matches one. Don't leak
    # information about token validity to unauthenticated callers.
    verify_and_consume_refresh_token(db, body.refresh_token)
    db.commit()
    return None


@router.post("/logout-all", status_code=204)
def logout_all(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    revoke_all_user_refresh_tokens(db, user.id)
    db.commit()
    return None


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tenant = db.get(Tenant, user.tenant_id)
    if not tenant:
        raise HTTPException(status_code=500, detail="Tenant missing for user")
    return MeResponse(user=_user_out(user), tenant=TenantOut.model_validate(tenant))


@router.patch("/me", response_model=MeResponse)
def update_me(
    body: UpdateMeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Self-service profile updates. Today only `display_name`; future-extensible."""
    if body.display_name is not None:
        name = body.display_name.strip()
        user.display_name = name or None
    db.commit()
    db.refresh(user)
    tenant = db.get(Tenant, user.tenant_id)
    if not tenant:
        raise HTTPException(status_code=500, detail="Tenant missing for user")
    return MeResponse(user=_user_out(user), tenant=TenantOut.model_validate(tenant))


@router.post("/change-password", status_code=204)
def change_password(
    body: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ident = _password_identity(user)
    if not ident or not verify_password(body.current_password, ident.secret):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    ident.secret = hash_password(body.new_password)
    # Force every other session to re-login.
    revoke_all_user_refresh_tokens(db, user.id)
    db.commit()
    return None
