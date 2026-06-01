"""add mail_messages.external_id for inbound idempotency

Revision ID: 0007_mail_external_id
Revises: 0006_users_delete_permission
Create Date: 2026-05-31

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007_mail_external_id"
down_revision: Union[str, None] = "0006_users_delete_permission"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("mail_messages") as batch:
        batch.add_column(sa.Column("external_id", sa.Text(), nullable=True))
        batch.create_index("ix_mail_messages_external_id", ["external_id"])


def downgrade() -> None:
    with op.batch_alter_table("mail_messages") as batch:
        batch.drop_index("ix_mail_messages_external_id")
        batch.drop_column("external_id")
