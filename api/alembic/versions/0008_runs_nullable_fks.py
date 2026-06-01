"""make workflow_runs.workflow_id and document_id nullable

Legacy DBs (built by the old pre-Alembic create_tables and stamped at the
baseline without running its DDL) kept these columns NOT NULL, even though the
baseline and the ORM model both declare them nullable. Policy-backed runs
(validate + mail) insert workflow_id=None / document_id=None and so fail with
"NOT NULL constraint failed" on those DBs. This forward migration aligns the
schema. On a fresh/correct DB the columns are already nullable, so the batch
rebuild is effectively a no-op.

Revision ID: 0008_runs_nullable_fks
Revises: 0007_mail_external_id
Create Date: 2026-06-01

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008_runs_nullable_fks"
down_revision: Union[str, None] = "0007_mail_external_id"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("workflow_runs") as batch:
        batch.alter_column("workflow_id", existing_type=sa.Integer(), nullable=True)
        batch.alter_column("document_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    # Forward-only: re-imposing NOT NULL would break policy-backed runs.
    pass
