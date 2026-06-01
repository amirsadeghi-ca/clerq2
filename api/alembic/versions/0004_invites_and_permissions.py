"""user invites + per-tenant role permissions.

Revision ID: 0004_invites_and_permissions
Revises: 0003_superadmin
Create Date: 2026-05-31
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0004_invites_and_permissions"
down_revision: Union[str, None] = "0003_superadmin"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Mirror of app.permissions.DEFAULT_ROLE_PERMISSIONS so migrations are
# self-contained (don't import app code from here — keeps history stable).
_USERS = [
    "tenant.users.read",
    "tenant.users.invite",
    "tenant.users.remove",
    "tenant.users.update_role",
    "tenant.users.set_password",
]
_TENANT = [
    "tenant.settings.update",
    "tenant.permissions.manage",
]
_DEFAULT_ROLE_PERMS = {
    "owner": _USERS + _TENANT,
    "admin": _USERS,
    "member": [],
}


def upgrade() -> None:
    op.create_table(
        "tenant_role_permissions",
        sa.Column("tenant_id", sa.Integer, sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("permission_key", sa.String(128), nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("tenant_id", "role", "permission_key", name="pk_tenant_role_permissions"),
    )

    op.create_table(
        "user_invites",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("tenant_id", sa.Integer, sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("role", sa.String(32), nullable=False, server_default="member"),
        sa.Column("invited_by_user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("token_hash", sa.String(255), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime, nullable=False),
        sa.Column("accepted_at", sa.DateTime),
        sa.Column("revoked_at", sa.DateTime),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # Seed defaults for every existing tenant.
    bind = op.get_bind()
    tenant_ids = [r[0] for r in bind.execute(sa.text("SELECT id FROM tenants"))]
    for tid in tenant_ids:
        for role, keys in _DEFAULT_ROLE_PERMS.items():
            for key in keys:
                bind.execute(
                    sa.text(
                        "INSERT INTO tenant_role_permissions (tenant_id, role, permission_key) "
                        "VALUES (:tid, :role, :key)"
                    ),
                    {"tid": tid, "role": role, "key": key},
                )


def downgrade() -> None:
    op.drop_table("user_invites")
    op.drop_table("tenant_role_permissions")
