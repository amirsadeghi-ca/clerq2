"""baseline — captures the schema as it existed before Alembic was introduced.

For existing deployments (DB built by create_all + ad-hoc ALTERs in
database.run_migrations) this revision is **stamped, not run** — see
app.migrations.run_migrations(). For fresh installs it builds the full schema.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-05-31
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001_baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "workflows",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("definition", sa.JSON, nullable=False),
        sa.Column("is_archived", sa.Boolean, nullable=False, server_default="0"),
        sa.Column("is_favorite", sa.Boolean, nullable=False, server_default="0"),
        sa.Column("email_inbox_enabled", sa.Boolean, nullable=False, server_default="0"),
        sa.Column("email_address", sa.Text),
        sa.Column("current_version_num", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "workflow_versions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("workflow_id", sa.Integer, sa.ForeignKey("workflows.id"), nullable=False),
        sa.Column("version_num", sa.Integer, nullable=False),
        sa.Column("definition", sa.JSON, nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "documents",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("file_path", sa.String(1024), nullable=False),
        sa.Column("mime_type", sa.String(128)),
        sa.Column("size_bytes", sa.Integer),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "document_types",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("ai_instructions", sa.Text),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "document_type_samples",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("document_type_id", sa.Integer, sa.ForeignKey("document_types.id"), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("file_path", sa.String(1024), nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "reference_lists",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("items", sa.JSON, nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "policies",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("brief", sa.Text, nullable=False, server_default=""),
        sa.Column("email_inbox_enabled", sa.Boolean, nullable=False, server_default="0"),
        sa.Column("email_address", sa.Text),
        sa.Column("email_reply_mode", sa.Text, nullable=False, server_default="always"),
        sa.Column("email_pass_message", sa.Text),
        sa.Column("email_fail_message", sa.Text),
        sa.Column("current_version_num", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "policy_rules",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("policy_id", sa.Integer, sa.ForeignKey("policies.id"), nullable=False),
        sa.Column("position", sa.Integer, nullable=False, server_default="0"),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("requirement", sa.String(32), nullable=False, server_default="required"),
        sa.Column("scope", sa.String(32), nullable=False, server_default="per_document"),
        sa.Column("accept_criteria", sa.Text),
        sa.Column("fail_criteria", sa.Text),
        sa.Column("ai_instructions", sa.Text),
        sa.Column("document_type_id", sa.Integer, sa.ForeignKey("document_types.id")),
        sa.Column("confidence_threshold", sa.Float, nullable=False, server_default="0.75"),
        sa.Column("reference_list_id", sa.Integer, sa.ForeignKey("reference_lists.id")),
        sa.Column("reference_direction", sa.String(16), nullable=False, server_default="in"),
        sa.Column("reference_match", sa.String(16), nullable=False, server_default="smart"),
    )

    op.create_table(
        "policy_versions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("policy_id", sa.Integer, sa.ForeignKey("policies.id"), nullable=False),
        sa.Column("version_num", sa.Integer, nullable=False),
        sa.Column("snapshot", sa.JSON, nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "workflow_runs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("workflow_id", sa.Integer, sa.ForeignKey("workflows.id"), nullable=True),
        sa.Column("document_id", sa.Integer, sa.ForeignKey("documents.id"), nullable=True),
        sa.Column("version_id", sa.Integer, sa.ForeignKey("workflow_versions.id"), nullable=True),
        sa.Column("version_num", sa.Integer),
        sa.Column("name", sa.String(512)),
        sa.Column("source", sa.String(64)),
        sa.Column("policy_id", sa.Integer),
        sa.Column("sender_email", sa.String(255)),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("started_at", sa.DateTime),
        sa.Column("completed_at", sa.DateTime),
        sa.Column("error", sa.Text),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("review", sa.JSON),
    )

    op.create_table(
        "workflow_run_steps",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("run_id", sa.Integer, sa.ForeignKey("workflow_runs.id"), nullable=False),
        sa.Column("node_id", sa.String(128), nullable=False),
        sa.Column("node_type", sa.String(64), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("input_data", sa.JSON),
        sa.Column("output_data", sa.JSON),
        sa.Column("error", sa.Text),
        sa.Column("started_at", sa.DateTime),
        sa.Column("completed_at", sa.DateTime),
        sa.Column("logs", sa.JSON),
    )

    op.create_table(
        "workflow_run_documents",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("run_id", sa.Integer, sa.ForeignKey("workflow_runs.id"), nullable=False),
        sa.Column("document_id", sa.Integer, sa.ForeignKey("documents.id"), nullable=False),
        sa.Column("position", sa.Integer, nullable=False, server_default="0"),
    )

    op.create_table(
        "mail_messages",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("run_id", sa.Integer, sa.ForeignKey("workflow_runs.id"), nullable=True),
        sa.Column("document_id", sa.Integer, sa.ForeignKey("documents.id"), nullable=True),
        sa.Column("direction", sa.Text, nullable=False),
        sa.Column("from_addr", sa.Text, nullable=False),
        sa.Column("to_addr", sa.Text, nullable=False),
        sa.Column("subject", sa.Text),
        sa.Column("body", sa.Text),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(128), primary_key=True),
        sa.Column("value", sa.Text, nullable=False, server_default=""),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )


def downgrade() -> None:
    # Baseline has no meaningful downgrade.
    for t in [
        "app_settings",
        "mail_messages",
        "workflow_run_documents",
        "workflow_run_steps",
        "workflow_runs",
        "policy_versions",
        "policy_rules",
        "policies",
        "reference_lists",
        "document_type_samples",
        "document_types",
        "documents",
        "workflow_versions",
        "workflows",
    ]:
        op.drop_table(t)
