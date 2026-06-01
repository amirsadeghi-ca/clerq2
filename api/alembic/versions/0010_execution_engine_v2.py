"""execution engine v2: run_steps, step_deps, run_events + workflow_runs columns

Additive only. The legacy workflow_run_steps / workflow_run_documents tables are
intentionally NOT dropped here — they are removed in a later migration after the
Phase-3 router cutover so the old engine stays runnable during the transition.

Revision ID: 0010_execution_engine_v2
Revises: 0009_cases
Create Date: 2026-06-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010_execution_engine_v2"
down_revision: Union[str, None] = "0009_cases"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- workflow_runs: additive execution columns ---
    op.add_column("workflow_runs", sa.Column("definition_snapshot", sa.JSON(), nullable=True))
    op.add_column("workflow_runs", sa.Column("result", sa.JSON(), nullable=True))
    op.add_column(
        "workflow_runs",
        sa.Column("fail_policy", sa.String(16), nullable=False, server_default="fail_run"),
    )

    # --- run_steps (replaces workflow_run_steps) ---
    op.create_table(
        "run_steps",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("run_id", sa.BigInteger(), sa.ForeignKey("workflow_runs.id"), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("node_id", sa.String(128), nullable=False),
        sa.Column("node_type", sa.String(64), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("attempt", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("deps_remaining", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("inputs", sa.JSON(), nullable=True),
        sa.Column("output_data", sa.JSON(), nullable=True),
        sa.Column("config", sa.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("logs", sa.JSON(), nullable=True),
        sa.Column("idempotency_key", sa.String(128), nullable=True),
        sa.Column("lease_owner", sa.String(64), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(), nullable=True),
        sa.Column("parent_step_id", sa.BigInteger(), sa.ForeignKey("run_steps.id"), nullable=True),
        sa.Column("iteration_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("ready_at", sa.DateTime(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint(
            "run_id", "node_id", "attempt", "iteration_index",
            name="uq_run_steps_node_attempt_iter",
        ),
    )
    op.create_index("ix_run_steps_run_id", "run_steps", ["run_id"])
    op.create_index("ix_run_steps_tenant_id", "run_steps", ["tenant_id"])
    op.create_index("ix_run_steps_idempotency_key", "run_steps", ["idempotency_key"])
    op.create_index("ix_run_steps_run_status", "run_steps", ["run_id", "status"])
    op.create_index("ix_run_steps_status_lease", "run_steps", ["status", "lease_expires_at"])

    # --- step_deps (materialized edges = join graph) ---
    op.create_table(
        "step_deps",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("run_id", sa.BigInteger(), sa.ForeignKey("workflow_runs.id"), nullable=False),
        sa.Column("from_step_id", sa.BigInteger(), sa.ForeignKey("run_steps.id"), nullable=False),
        sa.Column("to_step_id", sa.BigInteger(), sa.ForeignKey("run_steps.id"), nullable=False),
        sa.Column("source_handle", sa.String(64), nullable=False, server_default=""),
        sa.Column("satisfied", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("live", sa.Boolean(), nullable=False, server_default="true"),
        sa.UniqueConstraint(
            "from_step_id", "to_step_id", "source_handle", name="uq_step_deps_edge"
        ),
    )
    op.create_index("ix_step_deps_run_id", "step_deps", ["run_id"])
    op.create_index("ix_step_deps_from_step_id", "step_deps", ["from_step_id"])
    op.create_index("ix_step_deps_to_step_id", "step_deps", ["to_step_id"])

    # --- run_events (suspend/timer/wakeup) ---
    op.create_table(
        "run_events",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("run_id", sa.BigInteger(), sa.ForeignKey("workflow_runs.id"), nullable=False),
        sa.Column("step_id", sa.BigInteger(), sa.ForeignKey("run_steps.id"), nullable=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("match_key", sa.String(255), nullable=True),
        sa.Column("fire_at", sa.DateTime(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="armed"),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_run_events_run_id", "run_events", ["run_id"])
    op.create_index("ix_run_events_step_id", "run_events", ["step_id"])
    op.create_index("ix_run_events_tenant_id", "run_events", ["tenant_id"])
    op.create_index("ix_run_events_match_key", "run_events", ["match_key"])
    op.create_index("ix_run_events_fire_at", "run_events", ["fire_at"])
    op.create_index("ix_run_events_status_fire", "run_events", ["status", "fire_at"])
    op.create_index(
        "ix_run_events_type_key_status", "run_events", ["event_type", "match_key", "status"]
    )


def downgrade() -> None:
    op.drop_table("run_events")
    op.drop_table("step_deps")
    op.drop_table("run_steps")
    op.drop_column("workflow_runs", "fail_policy")
    op.drop_column("workflow_runs", "result")
    op.drop_column("workflow_runs", "definition_snapshot")
