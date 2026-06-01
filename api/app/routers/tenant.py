"""Tenant-scoped self-administration endpoints.

For tenant owners/admins to manage their own tenant (without needing
super-admin). Gated by the permission keys in `app.permissions.Permission`,
which live in `tenant_role_permissions`. Super-admins also pass these
checks (the permission helper returns all keys for them).

Compared to `/api/admin/*`:
  * `/api/admin/*` requires `is_superadmin = true` and operates across tenants.
  * `/api/tenant/*` requires a specific permission key and is always scoped
    to the caller's home tenant.

Routes:
  GET    /api/tenant                                   → current tenant + caller's permissions
  GET    /api/tenant/permissions                       → declared permissions registry (for UI)
  GET    /api/tenant/role-permissions                  → role → [permission_key] for this tenant
  PUT    /api/tenant/role-permissions/{role}           → replace permissions for a role
                                                         (requires tenant.permissions.manage)
  GET    /api/tenant/users                             → list users (read perm)
  PUT    /api/tenant/users/{id}                        → update display_name / role / is_active (perm-gated)
  POST   /api/tenant/users/{id}/set-password           → admin-set password (perm-gated)

  POST   /api/tenant/invites                           → invite a user (invite perm)
  GET    /api/tenant/invites                           → list pending invites (read perm)
  POST   /api/tenant/invites/{id}/revoke               → revoke (invite perm)
  POST   /api/tenant/invites/{id}/resend               → resend the same link via email
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.mailer import send_email
from app.models.auth import AuthIdentity, Tenant, User, UserInvite
from app.permissions import (
    ALL_PERMISSIONS,
    Permission,
    can_act_on_target_role,
    get_permissions_for,
    require_permission,
)
from app.schemas.admin import AdminUserOut, AdminUserUpdate, AdminSetPasswordRequest
from app.schemas.invite import InviteCreate, InviteOut
from app.security import (
    get_current_user,
    hash_password,
    revoke_all_user_refresh_tokens,
)

log = logging.getLogger("clerq2.tenant")
router = APIRouter()


# ── Helpers ──────────────────────────────────────────────────────────────

def _has_password(u: User) -> bool:
    return any(i.provider == "password" and i.secret for i in (u.identities or []))


def _user_out(u: User) -> AdminUserOut:
    return AdminUserOut(
        id=u.id, tenant_id=u.tenant_id, email=u.email,
        display_name=u.display_name, role=u.role,
        is_active=u.is_active, is_superadmin=getattr(u, "is_superadmin", False),
        mfa_required=u.mfa_required, has_password=_has_password(u),
        last_login_at=u.last_login_at, created_at=u.created_at,
    )


def _invite_out(inv: UserInvite, raw_token: str | None = None) -> InviteOut:
    url = None
    if raw_token:
        base = settings.app_base_url.rstrip("/")
        url = f"{base}/invite/{raw_token}"
    return InviteOut(
        id=inv.id, tenant_id=inv.tenant_id, email=inv.email, role=inv.role,
        invited_by_user_id=inv.invited_by_user_id,
        expires_at=inv.expires_at, accepted_at=inv.accepted_at, revoked_at=inv.revoked_at,
        created_at=inv.created_at, invite_url=url,
    )


def _send_invite_email(*, to: str, tenant_name: str, inviter_name: str, link: str) -> None:
    subject = f"You're invited to join {tenant_name} on Clerq2"
    html = f"""\
<!doctype html>
<html><body style="font-family: -apple-system, system-ui, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 560px; margin: 24px auto; padding: 0 16px;">
  <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600;">You're invited to {tenant_name}</h2>
  <p>{inviter_name} has invited you to join <b>{tenant_name}</b> on Clerq2.</p>
  <p>Click the button below to set your password and sign in. The link expires in {settings.invite_expiry_days} days and can only be used once.</p>
  <p style="margin: 24px 0;">
    <a href="{link}" style="display: inline-block; background: #4f46e5; color: white; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 500;">Accept invitation</a>
  </p>
  <p style="font-size: 12px; color: #666;">If the button doesn't work, paste this link into your browser:<br><span style="word-break: break-all;">{link}</span></p>
</body></html>"""
    text = (
        f"{inviter_name} has invited you to join {tenant_name} on Clerq2.\n\n"
        f"Open this link to set your password and sign in:\n{link}\n\n"
        f"The link expires in {settings.invite_expiry_days} days and can only be used once."
    )
    result = send_email(to=to, subject=subject, html=html, text=text)
    if not result.ok:
        log.error("invite email to %s failed: %s", to, result.error)


# ── Self ──────────────────────────────────────────────────────────────────

@router.get("")
def get_tenant_info(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tenant = db.get(Tenant, user.tenant_id)
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    return {
        "tenant": {"id": tenant.id, "name": tenant.name, "slug": tenant.slug, "is_active": tenant.is_active},
        "my_permissions": sorted(get_permissions_for(db, user)),
    }


@router.get("/permissions")
def list_permissions():
    """The static permission registry, for the UI's role-editor."""
    return {"permissions": ALL_PERMISSIONS}


# ── Role permissions (this tenant) ───────────────────────────────────────

@router.get("/role-permissions")
def get_role_permissions(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """role → list[permission_key]"""
    from sqlalchemy import text
    rows = db.execute(
        text("SELECT role, permission_key FROM tenant_role_permissions WHERE tenant_id = :tid"),
        {"tid": user.tenant_id},
    ).all()
    out: dict[str, list[str]] = {"owner": [], "admin": [], "member": []}
    for role, key in rows:
        out.setdefault(role, []).append(key)
    for r in out:
        out[r].sort()
    return out


@router.put("/role-permissions/{role}")
def update_role_permissions(
    role: str,
    body: dict,
    user: Annotated[User, Depends(require_permission(Permission.TENANT_PERMISSIONS_MANAGE))],
    db: Session = Depends(get_db),
):
    """Replace the permission set for `role` in this tenant.

    Body: `{"permission_keys": ["...", ...]}`. Even an owner can't remove
    `tenant.permissions.manage` from `owner` (we'd lose recovery). All other
    permissions are freely editable.
    """
    from sqlalchemy import text
    role = (role or "").lower()
    if role not in {"owner", "admin", "member"}:
        raise HTTPException(400, "Unknown role")
    incoming = {str(k) for k in (body.get("permission_keys") or [])}
    from app.permissions import ALL_PERMISSION_KEYS
    bad = incoming - ALL_PERMISSION_KEYS
    if bad:
        raise HTTPException(400, f"Unknown permission(s): {', '.join(sorted(bad))}")
    if role == "owner":
        incoming.add(Permission.TENANT_PERMISSIONS_MANAGE)

    db.execute(
        text("DELETE FROM tenant_role_permissions WHERE tenant_id = :tid AND role = :role"),
        {"tid": user.tenant_id, "role": role},
    )
    for key in incoming:
        db.execute(
            text(
                "INSERT INTO tenant_role_permissions (tenant_id, role, permission_key) "
                "VALUES (:tid, :role, :key)"
            ),
            {"tid": user.tenant_id, "role": role, "key": key},
        )
    db.commit()
    return {"role": role, "permission_keys": sorted(incoming)}


# ── Users (this tenant) ──────────────────────────────────────────────────

@router.get("/users", response_model=list[AdminUserOut])
def list_users(
    user: Annotated[User, Depends(require_permission(Permission.TENANT_USERS_READ))],
    db: Session = Depends(get_db),
):
    return [
        _user_out(u)
        for u in db.query(User).filter(User.tenant_id == user.tenant_id).order_by(User.id).all()
    ]


@router.put("/users/{user_id}", response_model=AdminUserOut)
def update_user(
    user_id: int,
    body: AdminUserUpdate,
    actor: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
):
    """Update a user's display name, role, active flag, or MFA-required.

    Permission keys required vary by field:
      * `display_name`, `mfa_required` → `tenant.users.read`
      * `role` → `tenant.users.update_role`
      * `is_active=false` → `tenant.users.remove`
      * `is_active=true`  → `tenant.users.update_role`

    Authority rule: an `admin` cannot touch another `admin` / `owner`.
    """
    target = db.get(User, user_id)
    if not target or target.tenant_id != actor.tenant_id:
        raise HTTPException(404, "User not found")
    if not can_act_on_target_role(actor, target.role):
        raise HTTPException(403, "You can't modify a user with this role")

    held = get_permissions_for(db, actor)

    if body.display_name is not None:
        if Permission.TENANT_USERS_READ not in held:
            raise HTTPException(403, "Missing permission tenant.users.read")
        target.display_name = body.display_name.strip() or None

    if body.role is not None:
        if Permission.TENANT_USERS_UPDATE_ROLE not in held:
            raise HTTPException(403, "Missing permission tenant.users.update_role")
        new_role = body.role.lower()
        if new_role not in {"owner", "admin", "member"}:
            raise HTTPException(400, "Role must be owner, admin, or member")
        # Authority: can't promote to a role you can't act on.
        if not can_act_on_target_role(actor, new_role):
            raise HTTPException(403, "You can't assign that role")
        target.role = new_role

    if body.is_active is not None:
        if body.is_active is False and Permission.TENANT_USERS_REMOVE not in held:
            raise HTTPException(403, "Missing permission tenant.users.remove")
        if body.is_active is True and Permission.TENANT_USERS_UPDATE_ROLE not in held:
            raise HTTPException(403, "Missing permission tenant.users.update_role")
        target.is_active = body.is_active
        if not body.is_active:
            revoke_all_user_refresh_tokens(db, target.id)

    if body.mfa_required is not None:
        target.mfa_required = body.mfa_required

    # is_superadmin can only be flipped by an actual super-admin.
    if body.is_superadmin is not None and getattr(actor, "is_superadmin", False):
        target.is_superadmin = body.is_superadmin

    db.commit()
    db.refresh(target)
    return _user_out(target)


@router.post("/users/{user_id}/set-password", response_model=AdminUserOut)
def set_password(
    user_id: int,
    body: AdminSetPasswordRequest,
    actor: Annotated[User, Depends(require_permission(Permission.TENANT_USERS_SET_PASSWORD))],
    db: Session = Depends(get_db),
):
    target = db.get(User, user_id)
    if not target or target.tenant_id != actor.tenant_id:
        raise HTTPException(404, "User not found")
    if not can_act_on_target_role(actor, target.role):
        raise HTTPException(403, "You can't reset the password of a user with this role")
    if len(body.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    ident = next((i for i in target.identities if i.provider == "password"), None)
    if ident is None:
        ident = AuthIdentity(user_id=target.id, provider="password", is_verified=True)
        db.add(ident)
    ident.secret = hash_password(body.new_password)
    revoke_all_user_refresh_tokens(db, target.id)
    db.commit()
    db.refresh(target)
    return _user_out(target)


# ── Invites (this tenant) ────────────────────────────────────────────────

@router.post("/invites", response_model=InviteOut, status_code=201)
def create_invite(
    body: InviteCreate,
    actor: Annotated[User, Depends(require_permission(Permission.TENANT_USERS_INVITE))],
    db: Session = Depends(get_db),
):
    email = body.email.strip().lower()
    if "@" not in email:
        raise HTTPException(400, "A valid email is required")
    role = (body.role or "member").lower()
    if role not in {"owner", "admin", "member"}:
        raise HTTPException(400, "Role must be owner, admin, or member")
    # Authority: an admin can only invite at member level.
    if not can_act_on_target_role(actor, role):
        raise HTTPException(403, "You can't invite someone at that role")

    # If the email is already an active user, fail.
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(409, "A user with this email already exists")

    # Revoke any prior pending invites to the same email in this tenant.
    now = datetime.utcnow()
    db.query(UserInvite).filter(
        UserInvite.tenant_id == actor.tenant_id,
        UserInvite.email == email,
        UserInvite.accepted_at.is_(None),
        UserInvite.revoked_at.is_(None),
    ).update({"revoked_at": now})

    raw_token = secrets.token_urlsafe(32)
    inv = UserInvite(
        tenant_id=actor.tenant_id,
        email=email,
        role=role,
        invited_by_user_id=actor.id,
        token_hash=hash_password(raw_token),
        expires_at=now + timedelta(days=settings.invite_expiry_days),
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)

    tenant = db.get(Tenant, actor.tenant_id)
    base = settings.app_base_url.rstrip("/")
    link = f"{base}/invite/{raw_token}"
    _send_invite_email(
        to=email,
        tenant_name=tenant.name if tenant else "Clerq2",
        inviter_name=actor.display_name or actor.email,
        link=link,
    )
    return _invite_out(inv, raw_token=raw_token)


@router.get("/invites", response_model=list[InviteOut])
def list_invites(
    actor: Annotated[User, Depends(require_permission(Permission.TENANT_USERS_READ))],
    include_consumed: bool = False,
    db: Session = Depends(get_db),
):
    q = db.query(UserInvite).filter(UserInvite.tenant_id == actor.tenant_id)
    if not include_consumed:
        q = q.filter(UserInvite.accepted_at.is_(None), UserInvite.revoked_at.is_(None))
    return [_invite_out(inv) for inv in q.order_by(UserInvite.id.desc()).all()]


@router.post("/invites/{invite_id}/revoke", response_model=InviteOut)
def revoke_invite(
    invite_id: int,
    actor: Annotated[User, Depends(require_permission(Permission.TENANT_USERS_INVITE))],
    db: Session = Depends(get_db),
):
    inv = db.get(UserInvite, invite_id)
    if not inv or inv.tenant_id != actor.tenant_id:
        raise HTTPException(404, "Invite not found")
    if inv.accepted_at:
        raise HTTPException(400, "Invite is already accepted")
    if inv.revoked_at is None:
        inv.revoked_at = datetime.utcnow()
        db.commit()
    db.refresh(inv)
    return _invite_out(inv)


@router.post("/invites/{invite_id}/resend", response_model=InviteOut)
def resend_invite(
    invite_id: int,
    actor: Annotated[User, Depends(require_permission(Permission.TENANT_USERS_INVITE))],
    db: Session = Depends(get_db),
):
    """Rotate the token (so the previous link is invalidated) and email again."""
    inv = db.get(UserInvite, invite_id)
    if not inv or inv.tenant_id != actor.tenant_id:
        raise HTTPException(404, "Invite not found")
    if inv.accepted_at:
        raise HTTPException(400, "Invite is already accepted")

    raw_token = secrets.token_urlsafe(32)
    inv.token_hash = hash_password(raw_token)
    inv.expires_at = datetime.utcnow() + timedelta(days=settings.invite_expiry_days)
    inv.revoked_at = None
    db.commit()
    db.refresh(inv)

    tenant = db.get(Tenant, actor.tenant_id)
    base = settings.app_base_url.rstrip("/")
    link = f"{base}/invite/{raw_token}"
    _send_invite_email(
        to=inv.email,
        tenant_name=tenant.name if tenant else "Clerq2",
        inviter_name=actor.display_name or actor.email,
        link=link,
    )
    return _invite_out(inv, raw_token=raw_token)
