from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Store(Base):
    __tablename__ = "stores"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    district: Mapped[str | None] = mapped_column(String(100), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    telegram: Mapped[str | None] = mapped_column(String(100), nullable=True)
    logo_color: Mapped[str | None] = mapped_column(
        String(7), nullable=True, comment="Hex colour code, e.g. #FF5733"
    )
    partner_tier: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="standard",
        comment="standard | gold | platinum",
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    materials: Mapped[list["Material"]] = relationship(  # noqa: F821
        "Material",
        back_populates="store",
        cascade="all, delete-orphan",
        lazy="select",
    )
    furniture_items: Mapped[list["Furniture"]] = relationship(  # noqa: F821
        "Furniture",
        back_populates="store",
        cascade="all, delete-orphan",
        lazy="select",
    )

    def __repr__(self) -> str:
        return f"<Store id={self.id} name={self.name!r} tier={self.partner_tier!r}>"
