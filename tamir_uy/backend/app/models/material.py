from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Enum, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

MaterialCategory = Enum(
    "boyoq",
    "oboy",
    "dekorativ",
    "laminat",
    "parket",
    "plitka",
    name="material_category",
)

MaterialUnit = Enum(
    "litr",
    "rulon",
    "m2",
    "qop",
    "dona",
    name="material_unit",
)


class Material(Base):
    __tablename__ = "materials"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    store_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("stores.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category: Mapped[str] = mapped_column(MaterialCategory, nullable=False)
    name_uz: Mapped[str] = mapped_column(String(200), nullable=False)
    unit: Mapped[str] = mapped_column(MaterialUnit, nullable=False)
    price_uzs: Mapped[int] = mapped_column(BigInteger, nullable=False)
    color_hex: Mapped[str | None] = mapped_column(
        String(7), nullable=True, comment="7-char hex colour, e.g. #FFFFFF"
    )
    texture_key: Mapped[str | None] = mapped_column(
        String(200), nullable=True, comment="S3 object key for the texture image"
    )
    pbr_roughness: Mapped[float] = mapped_column(
        Numeric(3, 2), nullable=False, default=0.5, comment="0.0 = mirror, 1.0 = matte"
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    store: Mapped["Store"] = relationship(  # noqa: F821
        "Store",
        back_populates="materials",
        lazy="select",
    )

    def __repr__(self) -> str:
        return (
            f"<Material id={self.id} name={self.name_uz!r} category={self.category!r}>"
        )
