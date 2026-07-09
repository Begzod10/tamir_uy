from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Furniture(Base):
    __tablename__ = "furniture"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    store_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("stores.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Nullable — built-in/generic items have no associated store",
    )
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name_uz: Mapped[str] = mapped_column(String(200), nullable=False)
    price_uzs: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True,
        comment="Retail price in UZS; null for generic catalogue items",
    )
    glb_key: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
        comment="S3 key for the .glb 3-D model file",
    )
    footprint_w: Mapped[float | None] = mapped_column(
        Numeric(5, 2),
        nullable=True,
        comment="Footprint width in centimetres",
    )
    footprint_d: Mapped[float | None] = mapped_column(
        Numeric(5, 2),
        nullable=True,
        comment="Footprint depth in centimetres",
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    store: Mapped["Store | None"] = relationship(  # noqa: F821
        "Store",
        back_populates="furniture_items",
        lazy="select",
    )

    def __repr__(self) -> str:
        return f"<Furniture id={self.id} name={self.name_uz!r} category={self.category!r}>"
