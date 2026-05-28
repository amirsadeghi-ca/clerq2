from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


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
    workflow_id: Mapped[int] = mapped_column(Integer, ForeignKey("workflows.id"), nullable=False)
    document_id: Mapped[int] = mapped_column(Integer, ForeignKey("documents.id"), nullable=False)
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

    steps: Mapped[list["WorkflowRunStep"]] = relationship(
        "WorkflowRunStep", back_populates="run", order_by="WorkflowRunStep.id"
    )
    run_documents: Mapped[list["WorkflowRunDocument"]] = relationship(
        "WorkflowRunDocument", back_populates="run", order_by="WorkflowRunDocument.position"
    )

    @property
    def document_ids(self) -> list[int]:
        return [rd.document_id for rd in (self.run_documents or [])]


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

    run: Mapped["WorkflowRun"] = relationship("WorkflowRun", back_populates="steps")
