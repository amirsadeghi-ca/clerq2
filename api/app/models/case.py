from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Case(Base):
    __tablename__ = "cases"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    name: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # status values: open|awaiting_applicant|under_review|closed_accepted|closed_rejected
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="open")
    target_kind: Mapped[str | None] = mapped_column(String(16), nullable=True)
    policy_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    workflow_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("workflows.id"), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    external_ref: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
    last_activity_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    runs = relationship("WorkflowRun", back_populates="case")
    mail_messages = relationship("MailMessage", back_populates="case")
    documents = relationship("CaseDocument", back_populates="case", cascade="all, delete-orphan")
    aliases = relationship("CaseAlias", back_populates="case", cascade="all, delete-orphan")


class CaseAlias(Base):
    __tablename__ = "case_aliases"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    case_id: Mapped[int] = mapped_column(Integer, ForeignKey("cases.id"), nullable=False)
    alias_type: Mapped[str] = mapped_column(String(32), nullable=False)
    alias_value: Mapped[str] = mapped_column(String(512), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    case = relationship("Case", back_populates="aliases")

    __table_args__ = (
        UniqueConstraint("tenant_id", "alias_type", "alias_value", name="uq_case_aliases_tenant_type_value"),
    )


class CaseDocument(Base):
    __tablename__ = "case_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    case_id: Mapped[int] = mapped_column(Integer, ForeignKey("cases.id"), nullable=False)
    document_id: Mapped[int] = mapped_column(Integer, ForeignKey("documents.id"), nullable=False)
    document_type_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="validate")
    superseded_by_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("case_documents.id"), nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    added_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    case = relationship("Case", back_populates="documents")
    document = relationship("Document")
