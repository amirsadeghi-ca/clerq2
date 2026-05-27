from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class WorkflowVersion(Base):
    __tablename__ = "workflow_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    workflow_id: Mapped[int] = mapped_column(Integer, ForeignKey("workflows.id"), nullable=False)
    version_num: Mapped[int] = mapped_column(Integer, nullable=False)
    definition: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    workflow: Mapped["Workflow"] = relationship("Workflow", back_populates="versions")  # noqa: F821
