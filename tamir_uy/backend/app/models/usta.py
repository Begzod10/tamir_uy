from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Enum, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# ---------------------------------------------------------------------------
# Enum
# ---------------------------------------------------------------------------

UstaCategory = Enum(
    "elektrik",
    "santexnik",
    "malyar",
    "oboy",
    "laminat",
    "brigada",
    name="usta_category",
)


class Usta(Base):
    """Craftsman / contractor profile."""

    __tablename__ = "ustalar"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(UstaCategory, nullable=False, index=True)
    district: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    telegram: Mapped[str | None] = mapped_column(String(100), nullable=True)
    rating: Mapped[float] = mapped_column(
        Numeric(3, 2),
        nullable=False,
        default=0,
        comment="Aggregate rating 0.00–5.00",
    )
    jobs_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, comment="Number of completed jobs"
    )
    price_min: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True, comment="Minimum daily/job price in UZS"
    )
    price_max: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True, comment="Maximum daily/job price in UZS"
    )
    verified: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, comment="Admin-verified profile"
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    leads: Mapped[list["Lead"]] = relationship(  # noqa: F821
        "Lead",
        back_populates="usta",
        cascade="all, delete-orphan",
        lazy="select",
    )

    def __repr__(self) -> str:
        return (
            f"<Usta id={self.id} name={self.name!r} "
            f"category={self.category!r} verified={self.verified}>"
        )
