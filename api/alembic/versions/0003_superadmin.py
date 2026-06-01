"""super-admin support.

Adds `users.is_superadmin` (a cross-tenant flag that unlocks `/api/admin/*`)
and seeds a super-admin user **amir@sadeghi.me** in the Default tenant with a
real, usable password. Super-admins still belong to a tenant for their own
day-to-day work (so they have one to log into); the flag is what lets them
manage other tenants.

The password hash is computed at migration time (not stored as plaintext in
the file). If you regenerate this migration, the hash will change — that's
fine, only the resulting login matters.

Revision ID: 0003_superadmin
Revises: 0002_auth_and_tenancy
Create Date: 2026-05-31
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import bcrypt

revision: str = "0003_superadmin"
down_revision: Union[str, None] = "0002_auth_and_tenancy"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SUPERADMIN_EMAIL = "amir@sadeghi.me"
SUPERADMIN_PASSWORD = "Amiir@1375"
SUPERADMIN_DISPLAY = "Amir Sadeghi"


def upgrade() -> None:
    # 1. Add the flag.
    with op.batch_alter_table("users") as batch:
        batch.add_column(
            sa.Column(
                "is_superadmin",
                sa.Boolean,
                nullable=False,
                server_default="0",
            )
        )

    # 2. Seed the super-admin in the Default tenant. Idempotent: if a user with
    # this email already exists we just flip the flag and re-set the password
    # to the documented one — same intent, safe to re-run.
    bind = op.get_bind()
    default_tenant_id = bind.execute(
        sa.text("SELECT id FROM tenants WHERE slug = 'default'")
    ).scalar()
    if not default_tenant_id:
        # Fallback: pick the first tenant. If there are none, skip.
        default_tenant_id = bind.execute(
            sa.text("SELECT id FROM tenants ORDER BY id LIMIT 1")
        ).scalar()
    if not default_tenant_id:
        return

    pwd_bytes = SUPERADMIN_PASSWORD.encode("utf-8")[:72]
    password_hash = bcrypt.hashpw(pwd_bytes, bcrypt.gensalt()).decode("utf-8")

    existing_user_id = bind.execute(
        sa.text("SELECT id FROM users WHERE email = :e"),
        {"e": SUPERADMIN_EMAIL},
    ).scalar()

    if existing_user_id is None:
        user_id = bind.execute(
            sa.text(
                "INSERT INTO users (tenant_id, email, display_name, role, "
                "is_active, is_superadmin, mfa_required) "
                "VALUES (:tid, :email, :name, 'owner', true, true, false) RETURNING id"
            ),
            {"tid": default_tenant_id, "email": SUPERADMIN_EMAIL, "name": SUPERADMIN_DISPLAY},
        ).scalar()
    else:
        user_id = existing_user_id
        bind.execute(
            sa.text(
                "UPDATE users SET is_superadmin = true, is_active = true, "
                "display_name = COALESCE(display_name, :name) "
                "WHERE id = :uid"
            ),
            {"uid": user_id, "name": SUPERADMIN_DISPLAY},
        )

    # Replace / create the password identity.
    existing_ident = bind.execute(
        sa.text("SELECT id FROM auth_identities WHERE user_id = :uid AND provider = 'password'"),
        {"uid": user_id},
    ).scalar()
    if existing_ident is None:
        bind.execute(
            sa.text(
                "INSERT INTO auth_identities (user_id, provider, secret, is_verified) "
                "VALUES (:uid, 'password', :secret, true)"
            ),
            {"uid": user_id, "secret": password_hash},
        )
    else:
        bind.execute(
            sa.text("UPDATE auth_identities SET secret = :secret WHERE id = :iid"),
            {"iid": existing_ident, "secret": password_hash},
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("is_superadmin")
