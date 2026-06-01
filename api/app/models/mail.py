from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MailMessage(Base):
    __tablename__ = "mail_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    run_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("workflow_runs.id"), nullable=True)
    document_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("documents.id"), nullable=True)
    direction: Mapped[str] = mapped_column(Text, nullable=False)  # 'inbound' | 'outbound'
    external_id: Mapped[str | None] = mapped_column(Text, index=True)  # provider msg id (Resend email_id) for idempotency
    from_addr: Mapped[str] = mapped_column(Text, nullable=False)
    to_addr: Mapped[str] = mapped_column(Text, nullable=False)
    subject: Mapped[str | None] = mapped_column(Text)
    body: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
