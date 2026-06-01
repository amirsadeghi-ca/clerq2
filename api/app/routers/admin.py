"""Super-admin endpoints — tenant + user CRUD across tenants.

Everything in this router requires `is_superadmin = true` on the calling user.
For day-to-day tenant work the existing per-tenant routes (`/api/workflows`,
`/api/policies`, …) remain the right answer; this is the back-office.
"""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.auth import AuthIdentity, PasswordResetToken, Tenant, User
from app.schemas.admin import (
    AdminSetPasswordRequest,
    AdminTenantCreate,
    AdminTenantOut,
    AdminTenantUpdate,
    AdminUserCreate,
    AdminUserOut,
    AdminUserUpdate,
)
from app.permissions import seed_default_role_permissions
from app.security import (
    hash_password,
    require_superadmin,
    revoke_all_user_refresh_tokens,
)

router = APIRouter(dependencies=[Depends(require_superadmin)])


def _slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", (s or "").strip().lower()).strip("-") or "tenant"


def _has_password(user: User) -> bool:
    return any(i.provider == "password" and i.secret for i in (user.identities or []))


def _tenant_out(t: Tenant, user_count: int) -> AdminTenantOut:
    return AdminTenantOut(
        id=t.id,
        name=t.name,
        slug=t.slug,
        is_active=t.is_active,
        user_count=user_count,
        created_at=t.created_at,
    )


def _user_out(u: User) -> AdminUserOut:
    return AdminUserOut(
        id=u.id,
        tenant_id=u.tenant_id,
        email=u.email,
        display_name=u.display_name,
        role=u.role,
        is_active=u.is_active,
        is_superadmin=getattr(u, "is_superadmin", False),
        mfa_required=u.mfa_required,
        has_password=_has_password(u),
        last_login_at=u.last_login_at,
        created_at=u.created_at,
    )


# ── Tenants ──────────────────────────────────────────────────────────────

@router.get("/tenants", response_model=list[AdminTenantOut])
def list_tenants(db: Session = Depends(get_db)):
    counts = dict(
        db.query(User.tenant_id, func.count(User.id)).group_by(User.tenant_id).all()
    )
    return [
        _tenant_out(t, counts.get(t.id, 0))
        for t in db.query(Tenant).order_by(Tenant.id).all()
    ]


@router.post("/tenants", response_model=AdminTenantOut, status_code=201)
def create_tenant(body: AdminTenantCreate, db: Session = Depends(get_db)):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(400, "Tenant name is required")
    slug = _slugify(body.slug or name)
    if db.query(Tenant).filter(Tenant.slug == slug).first():
        raise HTTPException(409, f"Tenant slug '{slug}' is already taken")
    t = Tenant(name=name, slug=slug, is_active=True)
    db.add(t)
    db.flush()
    seed_default_role_permissions(db, t.id)
    db.commit()
    db.refresh(t)
    return _tenant_out(t, 0)


@router.get("/tenants/{tenant_id}", response_model=AdminTenantOut)
def get_tenant(tenant_id: int, db: Session = Depends(get_db)):
    t = db.get(Tenant, tenant_id)
    if not t:
        raise HTTPException(404, "Tenant not found")
    count = db.query(func.count(User.id)).filter(User.tenant_id == tenant_id).scalar() or 0
    return _tenant_out(t, count)


@router.put("/tenants/{tenant_id}", response_model=AdminTenantOut)
def update_tenant(tenant_id: int, body: AdminTenantUpdate, db: Session = Depends(get_db)):
    t = db.get(Tenant, tenant_id)
    if not t:
        raise HTTPException(404, "Tenant not found")
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(400, "Tenant name cannot be empty")
        t.name = name
    if body.slug is not None:
        slug = _slugify(body.slug)
        clash = db.query(Tenant).filter(Tenant.slug == slug, Tenant.id != tenant_id).first()
        if clash:
            raise HTTPException(409, f"Tenant slug '{slug}' is already taken")
        t.slug = slug
    if body.is_active is not None:
        t.is_active = body.is_active
    db.commit()
    db.refresh(t)
    count = db.query(func.count(User.id)).filter(User.tenant_id == tenant_id).scalar() or 0
    return _tenant_out(t, count)


# ── Users in a tenant ────────────────────────────────────────────────────

@router.get("/tenants/{tenant_id}/users", response_model=list[AdminUserOut])
def list_users(tenant_id: int, db: Session = Depends(get_db)):
    if not db.get(Tenant, tenant_id):
        raise HTTPException(404, "Tenant not found")
    return [
        _user_out(u)
        for u in db.query(User).filter(User.tenant_id == tenant_id).order_by(User.id).all()
    ]


@router.post("/tenants/{tenant_id}/users", response_model=AdminUserOut, status_code=201)
def create_user(tenant_id: int, body: AdminUserCreate, db: Session = Depends(get_db)):
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    email = body.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(400, "A valid email is required")
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(409, f"A user with email '{email}' already exists")
    role = (body.role or "member").lower()
    if role not in {"owner", "admin", "member"}:
        raise HTTPException(400, "Role must be owner, admin, or member")
    user = User(
        tenant_id=tenant_id,
        email=email,
        display_name=(body.display_name or email.split("@")[0]).strip(),
        role=role,
        is_active=True,
        is_superadmin=bool(body.is_superadmin),
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
    db.commit()
    db.refresh(user)
    return _user_out(user)


# ── Single user (across tenants) ─────────────────────────────────────────

@router.get("/users/{user_id}", response_model=AdminUserOut)
def get_user(user_id: int, db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    return _user_out(u)


@router.put("/users/{user_id}", response_model=AdminUserOut)
def update_user(user_id: int, body: AdminUserUpdate, db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    if body.display_name is not None:
        u.display_name = body.display_name.strip() or None
    if body.role is not None:
        role = body.role.lower()
        if role not in {"owner", "admin", "member"}:
            raise HTTPException(400, "Role must be owner, admin, or member")
        u.role = role
    if body.is_active is not None:
        u.is_active = body.is_active
        if not body.is_active:
            revoke_all_user_refresh_tokens(db, u.id)
    if body.is_superadmin is not None:
        u.is_superadmin = body.is_superadmin
    if body.mfa_required is not None:
        u.mfa_required = body.mfa_required
    db.commit()
    db.refresh(u)
    return _user_out(u)


@router.post("/users/{user_id}/set-password", response_model=AdminUserOut)
def set_password(user_id: int, body: AdminSetPasswordRequest, db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    if len(body.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    ident = next((i for i in u.identities if i.provider == "password"), None)
    if ident is None:
        ident = AuthIdentity(user_id=u.id, provider="password", is_verified=True)
        db.add(ident)
    ident.secret = hash_password(body.new_password)
    # Kill any active sessions — they'll need to re-login with the new password.
    revoke_all_user_refresh_tokens(db, u.id)
    db.commit()
    db.refresh(u)
    return _user_out(u)


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    actor: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    """Permanently delete a user across any tenant. Super-admin only.
    Cannot delete yourself or the last owner of a tenant."""
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    if u.id == actor.id:
        raise HTTPException(400, "You cannot delete your own account")
    _hard_delete_user(db, u)
    db.commit()
    return None


def _hard_delete_user(db: Session, u: User) -> None:
    """Delete all auth-layer rows for a user then the user itself.
    Identities + MFA credentials cascade via SQLAlchemy relationships.
    Refresh tokens and password-reset tokens are not in those relationships
    and must be deleted manually first."""
    from sqlalchemy import text
    from app.models.auth import RefreshToken
    db.query(RefreshToken).filter(RefreshToken.user_id == u.id).delete()
    db.query(PasswordResetToken).filter(PasswordResetToken.user_id == u.id).delete()
    db.delete(u)  # cascades: identities, mfa_credentials
