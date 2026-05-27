from datetime import datetime
from sqlalchemy import JSON, Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Workflow(Base):
    __tablename__ = "workflows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    definition: Mapped[dict] = mapped_column(JSON, nullable=False, default=lambda: {"nodes": [], "edges": []})
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_favorite: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    email_inbox_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    email_address: Mapped[str | None] = mapped_column(Text)
    current_version_num: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    versions: Mapped[list["WorkflowVersion"]] = relationship(  # noqa: F821
        "WorkflowVersion", back_populates="workflow", order_by="WorkflowVersion.version_num"
    )
