"""Add tenant.users.delete permission to existing tenants.

Revision ID: 0006_users_delete_permission
Revises: 0005_password_reset_tokens
Create Date: 2026-05-31
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0006_users_delete_permission"
down_revision: Union[str, None] = "0005_password_reset_tokens"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_NEW_KEY = "tenant.users.delete"
# Roles that get this permission by default (mirrors DEFAULT_ROLE_PERMISSIONS).
_ROLES = ("owner", "admin")


def upgrade() -> None:
    bind = op.get_bind()
    tenant_ids = [r[0] for r in bind.execute(sa.text("SELECT id FROM tenants"))]
    for tid in tenant_ids:
        for role in _ROLES:
            # Skip if already present (idempotent).
            exists = bind.execute(
                sa.text(
                    "SELECT 1 FROM tenant_role_permissions "
                    "WHERE tenant_id=:tid AND role=:role AND permission_key=:key"
                ),
                {"tid": tid, "role": role, "key": _NEW_KEY},
            ).fetchone()
            if not exists:
                bind.execute(
                    sa.text(
                        "INSERT INTO tenant_role_permissions (tenant_id, role, permission_key) "
                        "VALUES (:tid, :role, :key)"
                    ),
                    {"tid": tid, "role": role, "key": _NEW_KEY},
                )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text("DELETE FROM tenant_role_permissions WHERE permission_key = :key"),
        {"key": _NEW_KEY},
    )
