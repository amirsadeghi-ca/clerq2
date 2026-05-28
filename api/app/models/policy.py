from datetime import datetime
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.database import Base


class PolicyVersion(Base):
    __tablename__ = "policy_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    policy_id: Mapped[int] = mapped_column(Integer, ForeignKey("policies.id"), nullable=False)
    version_num: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    policy: Mapped["Policy"] = relationship("Policy", back_populates="versions")


class PolicyRule(Base):
    __tablename__ = "policy_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    policy_id: Mapped[int] = mapped_column(Integer, ForeignKey("policies.id"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    requirement: Mapped[str] = mapped_column(String(32), nullable=False, default="required")
    # "per_document" → checked against each document individually (default)
    # "cross_set"    → evaluated once over the whole document set (cross-document consistency)
    scope: Mapped[str] = mapped_column(String(32), nullable=False, default="per_document", server_default="'per_document'")
    accept_criteria: Mapped[str | None] = mapped_column(Text)
    fail_criteria: Mapped[str | None] = mapped_column(Text)
    ai_instructions: Mapped[str | None] = mapped_column(Text)
    document_type_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("document_types.id"))
    confidence_threshold: Mapped[float] = mapped_column(Float, nullable=False, default=0.75)

    policy: Mapped["Policy"] = relationship("Policy", back_populates="rules")
    document_type: Mapped["DocumentType | None"] = relationship("DocumentType")  # type: ignore[name-defined]


class Policy(Base):
    __tablename__ = "policies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    brief: Mapped[str] = mapped_column(Text, nullable=False, default="")
    email_inbox_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    email_address: Mapped[str | None] = mapped_column(Text)
    email_reply_mode: Mapped[str] = mapped_column(Text, nullable=False, default="always", server_default="'always'")
    email_pass_message: Mapped[str | None] = mapped_column(Text)
    email_fail_message: Mapped[str | None] = mapped_column(Text)
    current_version_num: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    rules: Mapped[list["PolicyRule"]] = relationship(
        "PolicyRule", back_populates="policy", order_by="PolicyRule.position", cascade="all, delete-orphan"
    )
    versions: Mapped[list["PolicyVersion"]] = relationship(
        "PolicyVersion", back_populates="policy", cascade="all, delete-orphan"
    )
