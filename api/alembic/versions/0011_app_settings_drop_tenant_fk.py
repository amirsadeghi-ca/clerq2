"""app_settings: drop FK on tenant_id so tenant_id=0 sentinel works in Postgres.

The system_settings module uses tenant_id=0 as a reserved sentinel for
app-wide configuration (Resend keys, inbound domain, etc.). In SQLite FK
enforcement is off by default, so this worked silently. In Postgres the FK
constraint "app_settings_new_tenant_id_fkey" rejects 0 (not in tenants).

Fix: drop the constraint. tenant_id=0 is intentionally not a real tenant row.

Revision ID: 0011_app_settings_drop_tenant_fk
Revises: 0010_execution_engine_v2
Create Date: 2026-06-01
"""

from alembic import op

revision = "0011_app_settings_drop_tenant_fk"
down_revision = "0010_execution_engine_v2"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("app_settings", schema=None) as batch_op:
        batch_op.drop_constraint("app_settings_new_tenant_id_fkey", type_="foreignkey")


def downgrade():
    with op.batch_alter_table("app_settings", schema=None) as batch_op:
        batch_op.create_foreign_key(
            "app_settings_new_tenant_id_fkey",
            "tenants",
            ["tenant_id"],
            ["id"],
        )
