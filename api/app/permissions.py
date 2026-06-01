"""Permission registry + role-based access control.

**Design.** Permission keys are namespaced strings declared in this file
(`Permission.*`). They are the *only* canonical names — they never live as
free-text in routes. To gate a route by a permission, use the FastAPI
dependency `require_permission(Permission.SOMETHING)`.

**Storage.** The mapping `(role) → {permissions}` is stored **per tenant** in
`tenant_role_permissions` (composite PK `(tenant_id, role, permission_key)`)
so each tenant can later customize who-can-do-what without code changes. When
a tenant is created the helper `seed_default_role_permissions(...)` writes
the defaults below.

**Super-admins** (`User.is_superadmin`) bypass these checks — they always
have every permission.

**Adding a permission.** Add a `Permission.X = "x.y.z"` entry, list it in
`ALL_PERMISSIONS` (label + category, for the UI), and update
`DEFAULT_ROLE_PERMISSIONS` so each role gets its default. Then write a small
migration that seeds the new entry into every existing tenant's role map.
"""
from __future__ import annotations

from typing import Iterable

from fastapi import Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.auth import User
from app.security import get_current_user


class Permission:
    # Tenant-level user management
    TENANT_USERS_INVITE = "tenant.users.invite"
    TENANT_USERS_REMOVE = "tenant.users.remove"
    TENANT_USERS_UPDATE_ROLE = "tenant.users.update_role"
    TENANT_USERS_SET_PASSWORD = "tenant.users.set_password"
    TENANT_USERS_READ = "tenant.users.read"

    # Tenant settings + permission matrix
    TENANT_SETTINGS_UPDATE = "tenant.settings.update"
    TENANT_PERMISSIONS_MANAGE = "tenant.permissions.manage"


ALL_PERMISSIONS: list[dict] = [
    {"key": Permission.TENANT_USERS_READ,         "label": "View users",            "category": "Users"},
    {"key": Permission.TENANT_USERS_INVITE,       "label": "Invite users",          "category": "Users"},
    {"key": Permission.TENANT_USERS_REMOVE,       "label": "Remove users",          "category": "Users"},
    {"key": Permission.TENANT_USERS_UPDATE_ROLE,  "label": "Change user role",      "category": "Users"},
    {"key": Permission.TENANT_USERS_SET_PASSWORD, "label": "Reset user password",   "category": "Users"},
    {"key": Permission.TENANT_SETTINGS_UPDATE,    "label": "Update tenant settings","category": "Tenant"},
    {"key": Permission.TENANT_PERMISSIONS_MANAGE, "label": "Manage role permissions","category": "Tenant"},
]

ALL_PERMISSION_KEYS: set[str] = {p["key"] for p in ALL_PERMISSIONS}


def _users_only() -> set[str]:
    return {
        Permission.TENANT_USERS_READ,
        Permission.TENANT_USERS_INVITE,
        Permission.TENANT_USERS_REMOVE,
        Permission.TENANT_USERS_UPDATE_ROLE,
        Permission.TENANT_USERS_SET_PASSWORD,
    }


# What a freshly-seeded tenant gets. Owners get everything; admins manage
# *members* but can't touch other admins/owners (that rule is enforced
# at the API layer, not via permission strings); members get nothing.
DEFAULT_ROLE_PERMISSIONS: dict[str, set[str]] = {
    "owner": set(ALL_PERMISSION_KEYS),
    "admin": _users_only(),
    "member": set(),
}


PROTECTED_ROLES = {"owner", "admin"}  # admins can't add/remove/change users in these


def seed_default_role_permissions(db: Session, tenant_id: int) -> None:
    """Write the default role→permission rows for a tenant. Idempotent: skips
    rows that already exist (so it's safe to call from a tenant-create path
    even if an admin manually pre-seeded the table)."""
    existing = {
        (r[0], r[1])
        for r in db.execute(
            text(
                "SELECT role, permission_key FROM tenant_role_permissions "
                "WHERE tenant_id = :tid"
            ),
            {"tid": tenant_id},
        )
    }
    for role, perms in DEFAULT_ROLE_PERMISSIONS.items():
        for key in perms:
            if (role, key) in existing:
                continue
            db.execute(
                text(
                    "INSERT INTO tenant_role_permissions (tenant_id, role, permission_key) "
                    "VALUES (:tid, :role, :key)"
                ),
                {"tid": tenant_id, "role": role, "key": key},
            )


# ── Checks ─────────────────────────────────────────────────────────────────

def get_permissions_for(db: Session, user: User, *, tenant_id: int | None = None) -> set[str]:
    """Return the set of permission keys the user effectively holds in the
    given tenant (defaults to the user's home tenant). Super-admins get
    every declared permission."""
    if getattr(user, "is_superadmin", False):
        return set(ALL_PERMISSION_KEYS)
    tid = tenant_id if tenant_id is not None else user.tenant_id
    if tid != user.tenant_id:
        # Non-super users can never act on a tenant that isn't theirs.
        return set()
    rows = db.execute(
        text(
            "SELECT permission_key FROM tenant_role_permissions "
            "WHERE tenant_id = :tid AND role = :role"
        ),
        {"tid": tid, "role": user.role},
    ).all()
    return {r[0] for r in rows}


def user_has_permission(
    db: Session, user: User, permission_key: str, *, tenant_id: int | None = None
) -> bool:
    return permission_key in get_permissions_for(db, user, tenant_id=tenant_id)


def require_permission(*keys: str):
    """FastAPI dependency factory: require ALL listed permissions in the
    user's home tenant. (For permissions on a *different* tenant — e.g. the
    super-admin endpoints — use `require_superadmin` instead.)"""
    needed: tuple[str, ...] = tuple(keys)
    if not needed:
        raise ValueError("require_permission() called with no permission keys")

    def _dep(
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        held = get_permissions_for(db, user)
        if not all(k in held for k in needed):
            missing = [k for k in needed if k not in held]
            raise HTTPException(status_code=403, detail=f"Missing permission(s): {', '.join(missing)}")
        return user

    return _dep


def can_act_on_target_role(actor: User, target_role: str) -> bool:
    """Authority rule beyond permission keys: even an `admin` who holds
    `tenant.users.remove` cannot remove another admin/owner. Owners can.
    Super-admins always can."""
    if getattr(actor, "is_superadmin", False):
        return True
    actor_role = (actor.role or "").lower()
    target = (target_role or "").lower()
    if actor_role == "owner":
        return True
    if actor_role == "admin":
        return target not in PROTECTED_ROLES
    return False
