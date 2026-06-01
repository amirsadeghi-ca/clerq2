"""add cases, case_aliases, case_documents; add case_id to workflow_runs and mail_messages

Revision ID: 0009_cases
Revises: 0008_runs_nullable_fks
Create Date: 2026-06-01
"""
from typing import Sequence, Union
from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op

revision: str = "0009_cases"
down_revision: Union[str, None] = "0008_runs_nullable_fks"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Create new tables ---
    op.create_table(
        "cases",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(512), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="'open'"),
        sa.Column("target_kind", sa.String(16), nullable=True),
        sa.Column("policy_id", sa.Integer(), nullable=True),
        sa.Column("workflow_id", sa.Integer(), sa.ForeignKey("workflows.id"), nullable=True),
        sa.Column("contact_email", sa.String(255), nullable=True),
        sa.Column("contact_name", sa.String(255), nullable=True),
        sa.Column("external_ref", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("last_activity_at", sa.DateTime(), nullable=True),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_cases_tenant_id", "cases", ["tenant_id"])
    op.create_index("ix_cases_external_ref", "cases", ["external_ref"])

    op.create_table(
        "case_aliases",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("case_id", sa.Integer(), sa.ForeignKey("cases.id"), nullable=False),
        sa.Column("alias_type", sa.String(32), nullable=False),
        sa.Column("alias_value", sa.String(512), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "alias_type", "alias_value", name="uq_case_aliases_tenant_type_value"),
    )
    op.create_index("ix_case_aliases_tenant_id", "case_aliases", ["tenant_id"])

    op.create_table(
        "case_documents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("case_id", sa.Integer(), sa.ForeignKey("cases.id"), nullable=False),
        sa.Column("document_id", sa.Integer(), sa.ForeignKey("documents.id"), nullable=False),
        sa.Column("document_type_id", sa.Integer(), nullable=True),
        sa.Column("source", sa.String(32), nullable=False, server_default="'validate'"),
        sa.Column("superseded_by_id", sa.Integer(), sa.ForeignKey("case_documents.id"), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("added_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_case_documents_tenant_id", "case_documents", ["tenant_id"])
    op.create_index("ix_case_documents_case_id", "case_documents", ["case_id"])

    # --- Add case_id to workflow_runs ---
    with op.batch_alter_table("workflow_runs") as batch:
        batch.add_column(sa.Column("case_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_workflow_runs_case_id", "cases", ["case_id"], ["id"])
        batch.create_index("ix_workflow_runs_case_id", ["case_id"])

    # --- Add case_id to mail_messages ---
    with op.batch_alter_table("mail_messages") as batch:
        batch.add_column(sa.Column("case_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_mail_messages_case_id", "cases", ["case_id"], ["id"])
        batch.create_index("ix_mail_messages_case_id", ["case_id"])

    # --- Backfill: wrap every existing run in a case ---
    bind = op.get_bind()
    runs = bind.execute(sa.text(
        "SELECT id, tenant_id, source, policy_id, workflow_id, sender_email, name, created_at "
        "FROM workflow_runs ORDER BY created_at ASC"
    )).fetchall()

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Group mail runs by (tenant_id, policy_id, workflow_id, sender_email) -> list of run ids
    mail_groups: dict = {}
    non_mail_runs = []
    for row in runs:
        run_id, tenant_id, source, policy_id, workflow_id, sender_email, name, created_at = row
        if source == "mail" and sender_email:
            key = (tenant_id, policy_id or -1, workflow_id or -1, sender_email.lower())
            if key not in mail_groups:
                mail_groups[key] = []
            mail_groups[key].append((run_id, tenant_id, policy_id, workflow_id, sender_email, name, created_at))
        else:
            non_mail_runs.append((run_id, tenant_id, source, policy_id, workflow_id, name, created_at))

    run_to_case: dict = {}

    # Create one case per mail group
    for key, group_runs in mail_groups.items():
        tenant_id, _, _, _ = key[0], key[1], key[2], key[3]
        first = group_runs[0]
        last = group_runs[-1]
        r_tenant_id = first[1]
        r_policy_id = first[2]
        r_workflow_id = first[3]
        r_sender_email = first[4]
        r_name = first[5]
        r_last_activity = last[6]
        target_kind = "policy" if r_policy_id else ("workflow" if r_workflow_id else None)
        result = bind.execute(sa.text(
            "INSERT INTO cases (tenant_id, name, status, target_kind, policy_id, workflow_id, "
            "contact_email, created_at, updated_at, last_activity_at) "
            "VALUES (:tid, :name, 'open', :kind, :pid, :wid, :email, :now, :now, :last) RETURNING id"
        ), {
            "tid": r_tenant_id, "name": r_name, "kind": target_kind,
            "pid": r_policy_id, "wid": r_workflow_id, "email": r_sender_email,
            "now": now, "last": r_last_activity or now,
        })
        case_id = result.scalar()
        for run_row in group_runs:
            run_to_case[run_row[0]] = case_id

    # Create one case per non-mail run
    for run_id, tenant_id, source, policy_id, workflow_id, name, created_at in non_mail_runs:
        target_kind = "policy" if policy_id else ("workflow" if workflow_id else None)
        result = bind.execute(sa.text(
            "INSERT INTO cases (tenant_id, name, status, target_kind, policy_id, workflow_id, "
            "created_at, updated_at, last_activity_at) "
            "VALUES (:tid, :name, 'open', :kind, :pid, :wid, :now, :now, :last) RETURNING id"
        ), {
            "tid": tenant_id, "name": name, "kind": target_kind,
            "pid": policy_id, "wid": workflow_id,
            "now": now, "last": created_at or now,
        })
        case_id = result.scalar()
        run_to_case[run_id] = case_id

    # Update workflow_runs.case_id
    for run_id, case_id in run_to_case.items():
        bind.execute(sa.text("UPDATE workflow_runs SET case_id = :cid WHERE id = :rid"),
                     {"cid": case_id, "rid": run_id})

    # Backfill mail_messages.case_id via run_id -> run.case_id
    msgs = bind.execute(sa.text("SELECT id, run_id FROM mail_messages WHERE run_id IS NOT NULL")).fetchall()
    for msg_id, run_id in msgs:
        case_id = run_to_case.get(run_id)
        if case_id:
            bind.execute(sa.text("UPDATE mail_messages SET case_id = :cid WHERE id = :mid"),
                         {"cid": case_id, "mid": msg_id})

    # Seed case_documents from workflow_run_documents (dedup by case+document)
    wrd_rows = bind.execute(sa.text(
        "SELECT wrd.document_id, wr.case_id, wr.tenant_id, wr.source, wrd.position "
        "FROM workflow_run_documents wrd "
        "JOIN workflow_runs wr ON wr.id = wrd.run_id "
        "WHERE wr.case_id IS NOT NULL "
        "ORDER BY wr.created_at ASC"
    )).fetchall()
    seen: set = set()
    pos_counter: dict = {}
    for doc_id, case_id, tenant_id, source, _ in wrd_rows:
        key = (case_id, doc_id)
        if key in seen:
            continue
        seen.add(key)
        pos = pos_counter.get(case_id, 0)
        pos_counter[case_id] = pos + 1
        src = source or "validate"
        bind.execute(sa.text(
            "INSERT INTO case_documents (tenant_id, case_id, document_id, source, position, added_at) "
            "VALUES (:tid, :cid, :did, :src, :pos, :now)"
        ), {"tid": tenant_id, "cid": case_id, "did": doc_id, "src": src, "pos": pos, "now": now})


def downgrade() -> None:
    with op.batch_alter_table("mail_messages") as batch:
        batch.drop_index("ix_mail_messages_case_id")
        batch.drop_constraint("fk_mail_messages_case_id", type_="foreignkey")
        batch.drop_column("case_id")

    with op.batch_alter_table("workflow_runs") as batch:
        batch.drop_index("ix_workflow_runs_case_id")
        batch.drop_constraint("fk_workflow_runs_case_id", type_="foreignkey")
        batch.drop_column("case_id")

    op.drop_table("case_documents")
    op.drop_table("case_aliases")
    op.drop_table("cases")
