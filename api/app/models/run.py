from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
# Registers RunStep in the mapper registry for the WorkflowRun.steps relationship.
from app.models.run_step import RunStep  # noqa: F401


class WorkflowRunDocument(Base):
    __tablename__ = "workflow_run_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_id: Mapped[int] = mapped_column(Integer, ForeignKey("workflow_runs.id"), nullable=False)
    document_id: Mapped[int] = mapped_column(Integer, ForeignKey("documents.id"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    run: Mapped["WorkflowRun"] = relationship("WorkflowRun", back_populates="run_documents")


class WorkflowRun(Base):
    __tablename__ = "workflow_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    workflow_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("workflows.id"), nullable=True)
    document_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("documents.id"), nullable=True)
    version_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("workflow_versions.id"), nullable=True)
    version_num: Mapped[int | None] = mapped_column(Integer, nullable=True)
    name: Mapped[str | None] = mapped_column(String(512), nullable=True)
    source: Mapped[str | None] = mapped_column(String(64), nullable=True)
    policy_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sender_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    # Phase 6 — light human review on the report. Null until a reviewer touches it.
    # Shape:
    #   {
    #     "state": "draft" | "finalized",
    #     "annotations": { "<rule_name>": {
    #         "note": str|null,
    #         "override": { "status": str, "reason": str } | null,
    #         "updated_at": ISO, "updated_by": str|null
    #     } },
    #     "history": [ { "action": str, "rule_name": str|null,
    #                    "details": dict, "at": ISO, "by": str|null } ],
    #     "finalized_at": ISO|null, "finalized_by": str|null,
    #     "effective_overall": "pass"|"fail"|"needs_review"  # recomputed from overrides
    #   }
    review: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    case_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("cases.id"), nullable=True, index=True)

    # Execution-engine-v2 (additive). The scheduler runs against the snapshot,
    # `result` is the canonical run output (verdict) cases.py reads, and
    # `fail_policy` chooses run-fail behaviour (D5 default: fail_run).
    definition_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    fail_policy: Mapped[str] = mapped_column(String(16), nullable=False, server_default="fail_run")

    # Engine-v2: steps live in `run_steps`. viewonly — the scheduler manages
    # their lifecycle directly, not through this relationship.
    steps: Mapped[list["RunStep"]] = relationship(
        "RunStep", order_by="RunStep.id", viewonly=True, foreign_keys="RunStep.run_id"
    )
    run_documents: Mapped[list["WorkflowRunDocument"]] = relationship(
        "WorkflowRunDocument", back_populates="run", order_by="WorkflowRunDocument.position"
    )
    case: Mapped["Case | None"] = relationship("Case", back_populates="runs", foreign_keys="[WorkflowRun.case_id]")

    @property
    def document_ids(self) -> list[int]:
        # Derived from the run seed (run_steps.inputs._run.documents) — the old
        # workflow_run_documents join is no longer populated by the engine.
        for s in (self.steps or []):
            seed = (s.inputs or {}).get("_run") if isinstance(s.inputs, dict) else None
            if isinstance(seed, dict) and isinstance(seed.get("documents"), list):
                return [d.get("id") for d in seed["documents"] if d.get("id") is not None]
        return []


class WorkflowRunStep(Base):
    __tablename__ = "workflow_run_steps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_id: Mapped[int] = mapped_column(Integer, ForeignKey("workflow_runs.id"), nullable=False)
    node_id: Mapped[str] = mapped_column(String(128), nullable=False)
    node_type: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    input_data: Mapped[dict | None] = mapped_column(JSON)
    output_data: Mapped[dict | None] = mapped_column(JSON)
    error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    logs: Mapped[list | None] = mapped_column(JSON)
    # NOTE: legacy table, no longer written by the engine (kept for migration
    # history). The WorkflowRun.steps relationship now points at RunStep.
