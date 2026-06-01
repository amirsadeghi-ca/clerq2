"""Execution-engine-v2 models: the durable graph the scheduler walks.

These replace the linear `workflow_run_steps` model. Each step is a row with an
explicit status; edges + per-step dependency counters live in the DB so any
stateless worker can run any ready step. See docs/workflow-engine-rewrite-plan.md.

`workflow_run_steps` / `workflow_run_documents` (the old model in models/run.py)
are kept until the Phase-3 cutover so the legacy engine stays runnable; they are
dropped in a follow-up migration once the routers point at the new engine.
"""
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RunStep(Base):
    """One node execution within a run. Status drives the scheduler:
    pending → ready → running → succeeded|failed|skipped|waiting|cancelled.
    """

    __tablename__ = "run_steps"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    run_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("workflow_runs.id"), nullable=False, index=True
    )
    # Denormalized for tenant-scoped reconciler sweeps without a join.
    tenant_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    node_id: Mapped[str] = mapped_column(String(128), nullable=False)
    node_type: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="pending", server_default="pending"
    )

    attempt: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    max_attempts: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )
    # Live count of unsatisfied incoming edges = the join counter.
    deps_remaining: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    # {upstream_node_id: output}; roots are seeded with {"_run": {...}}.
    inputs: Mapped[dict | None] = mapped_column(JSON)
    output_data: Mapped[dict | None] = mapped_column(JSON)
    config: Mapped[dict | None] = mapped_column(JSON)  # node.data

    error: Mapped[str | None] = mapped_column(Text)
    logs: Mapped[list | None] = mapped_column(JSON)
    # f"{run_id}:{node_id}:{attempt}" — guards side effects against redelivery.
    idempotency_key: Mapped[str | None] = mapped_column(String(128), index=True)

    lease_owner: Mapped[str | None] = mapped_column(String(64))
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime)

    parent_step_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("run_steps.id"), nullable=True
    )
    iteration_index: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    ready_at: Mapped[datetime | None] = mapped_column(DateTime)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)

    @property
    def input_data(self) -> dict | None:
        """Back-compat alias for serializers expecting `input_data`."""
        return self.inputs

    __table_args__ = (
        UniqueConstraint(
            "run_id", "node_id", "attempt", "iteration_index",
            name="uq_run_steps_node_attempt_iter",
        ),
        Index("ix_run_steps_run_status", "run_id", "status"),
        Index("ix_run_steps_status_lease", "status", "lease_expires_at"),
    )


class StepDep(Base):
    """A materialized edge in the run graph (the join graph)."""

    __tablename__ = "step_deps"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    run_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("workflow_runs.id"), nullable=False, index=True
    )
    from_step_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("run_steps.id"), nullable=False, index=True
    )
    to_step_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("run_steps.id"), nullable=False, index=True
    )
    # Which output port the edge leaves from (condition branches: "true"/"false").
    # Empty string = the default single output; never NULL so the UNIQUE holds.
    source_handle: Mapped[str] = mapped_column(
        String(64), nullable=False, default="", server_default=""
    )
    # Parent reached a terminal status.
    satisfied: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    # False once a condition prunes this edge.
    live: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    # run_id / from_step_id / to_step_id already get ix_* indexes via index=True.
    __table_args__ = (
        UniqueConstraint(
            "from_step_id", "to_step_id", "source_handle", name="uq_step_deps_edge"
        ),
    )


class RunEvent(Base):
    """A suspend/timer/wakeup record powering human-in-the-loop + gates."""

    __tablename__ = "run_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    run_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("workflow_runs.id"), nullable=False, index=True
    )
    step_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("run_steps.id"), nullable=True, index=True
    )
    tenant_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    event_type: Mapped[str] = mapped_column(String(64), nullable=False)  # timer|document_added|…
    match_key: Mapped[str | None] = mapped_column(String(255), index=True)  # e.g. case_id
    fire_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)  # timers
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="armed", server_default="armed"
    )  # armed|fired|consumed|cancelled
    payload: Mapped[dict | None] = mapped_column(JSON)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("ix_run_events_status_fire", "status", "fire_at"),
        Index("ix_run_events_type_key_status", "event_type", "match_key", "status"),
    )
