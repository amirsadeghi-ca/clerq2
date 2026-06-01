from datetime import datetime
from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AppSetting(Base):
    """Tenant-scoped key/value settings.

    Composite PK on (tenant_id, key) so e.g. each tenant has its own
    OPENROUTER_API_KEY. There is also a special tenant_id=0 reservation for
    truly global settings, but nothing uses it yet.
    """

    __tablename__ = "app_settings"

    tenant_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
