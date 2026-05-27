from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DocumentTypeSample(Base):
    __tablename__ = "document_type_samples"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    document_type_id: Mapped[int] = mapped_column(Integer, ForeignKey("document_types.id"), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    document_type: Mapped["DocumentType"] = relationship("DocumentType", back_populates="samples")


class DocumentType(Base):
    __tablename__ = "document_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    ai_instructions: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    samples: Mapped[list["DocumentTypeSample"]] = relationship(
        "DocumentTypeSample", back_populates="document_type", order_by="DocumentTypeSample.id", cascade="all, delete-orphan"
    )
