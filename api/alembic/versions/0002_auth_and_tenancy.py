"""auth tables + tenant_id on every resource table.

Strategy for live data preservation:
  1. Create auth tables (tenants, users, auth_identities, refresh_tokens,
     mfa_credentials).
  2. Insert a "Default" tenant + a single bootstrap "admin" user with NO usable
     password — the operator MUST run `python -m app.cli set-password` (or use
     the INTERPRET_BOOTSTRAP_PASSWORD env var, see app/migrations.py docs) before
     anyone can log in. We refuse to invent a default password and bake it into
     a migration.
  3. Add `tenant_id` (nullable) to every resource table, set every existing row
     to the Default tenant's id, then make `tenant_id` NOT NULL.

If the database is fresh, step 2 still seeds a Default tenant so first-run
deployments have something to provision against.

Revision ID: 0002_auth_and_tenancy
Revises: 0001_baseline
Create Date: 2026-05-31
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002_auth_and_tenancy"
down_revision: Union[str, None] = "0001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Resource tables that need tenant_id. (Child tables — workflow_versions,
# policy_rules, policy_versions, workflow_run_steps, workflow_run_documents,
# document_type_samples — inherit isolation via their parent FK.)
# Resource tables that simply gain a non-PK tenant_id column.
RESOURCE_TABLES = [
    "workflows",
    "documents",
    "workflow_runs",
    "document_types",
    "reference_lists",
    "policies",
    "mail_messages",
]
# app_settings is special: its primary key changes from `key` to (tenant_id, key).


def upgrade() -> None:
    # 1. Auth tables -------------------------------------------------------
    op.create_table(
        "tenants",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(64), nullable=False, unique=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("tenant_id", sa.Integer, sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(255)),
        sa.Column("role", sa.String(32), nullable=False, server_default="member"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="1"),
        sa.Column("mfa_required", sa.Boolean, nullable=False, server_default="0"),
        sa.Column("last_login_at", sa.DateTime),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "email", name="uq_users_tenant_email"),
    )

    op.create_table(
        "auth_identities",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("subject", sa.String(255)),
        sa.Column("secret", sa.Text),
        sa.Column("metadata_json", sa.JSON),
        sa.Column("is_verified", sa.Boolean, nullable=False, server_default="1"),
        sa.Column("last_used_at", sa.DateTime),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint("provider", "subject", name="uq_authidentity_provider_subject"),
    )

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("token_hash", sa.String(255), nullable=False, unique=True),
        sa.Column("issued_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime, nullable=False),
        sa.Column("revoked_at", sa.DateTime),
        sa.Column("user_agent", sa.String(512)),
        sa.Column("ip_address", sa.String(64)),
    )

    op.create_table(
        "mfa_credentials",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("type", sa.String(32), nullable=False),
        sa.Column("label", sa.String(255)),
        sa.Column("secret", sa.Text),
        sa.Column("recovery_codes_json", sa.JSON),
        sa.Column("is_confirmed", sa.Boolean, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("last_used_at", sa.DateTime),
    )

    # 2. Seed the Default tenant + bootstrap admin (no usable password yet).
    bind = op.get_bind()
    default_tenant_id = bind.execute(
        sa.text(
            "INSERT INTO tenants (name, slug, is_active) "
            "VALUES ('Default', 'default', 1)"
        )
    ).lastrowid
    bind.execute(
        sa.text(
            "INSERT INTO users (tenant_id, email, display_name, role, is_active, mfa_required) "
            "VALUES (:tid, 'admin@interpret.local', 'Administrator', 'owner', 1, 0)"
        ),
        {"tid": default_tenant_id},
    )

    # 3. Add tenant_id to every resource table and backfill to the Default tenant.
    # SQLite batch mode requires every constraint be named, so we don't let
    # `sa.ForeignKey` synthesize one. The FK is created in a second batch_alter
    # step with an explicit name; this also keeps batch mode happy.
    for table in RESOURCE_TABLES:
        with op.batch_alter_table(table) as batch:
            batch.add_column(
                sa.Column("tenant_id", sa.Integer, nullable=True, index=True)
            )
        bind.execute(
            sa.text(f"UPDATE {table} SET tenant_id = :tid WHERE tenant_id IS NULL"),
            {"tid": default_tenant_id},
        )
        with op.batch_alter_table(table) as batch:
            batch.alter_column("tenant_id", existing_type=sa.Integer, nullable=False)
            batch.create_foreign_key(
                f"fk_{table}_tenant_id", "tenants", ["tenant_id"], ["id"]
            )

    # 4. app_settings: rebuild with composite PK (tenant_id, key). Backfill each
    # existing row into the Default tenant.
    op.create_table(
        "app_settings_new",
        sa.Column("tenant_id", sa.Integer, sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("key", sa.String(128), nullable=False),
        sa.Column("value", sa.Text, nullable=False, server_default=""),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("tenant_id", "key", name="pk_app_settings"),
    )
    bind.execute(
        sa.text(
            "INSERT INTO app_settings_new (tenant_id, key, value, updated_at) "
            "SELECT :tid, key, value, updated_at FROM app_settings"
        ),
        {"tid": default_tenant_id},
    )
    op.drop_table("app_settings")
    op.rename_table("app_settings_new", "app_settings")


def downgrade() -> None:
    for table in RESOURCE_TABLES:
        with op.batch_alter_table(table) as batch:
            batch.drop_column("tenant_id")
    op.drop_table("mfa_credentials")
    op.drop_table("refresh_tokens")
    op.drop_table("auth_identities")
    op.drop_table("users")
    op.drop_table("tenants")
