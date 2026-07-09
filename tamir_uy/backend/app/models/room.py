from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Room(Base):
    """
    A single room inside an apartment.

    geometry  – list of wall segments, e.g.:
                [{"x1": 0, "y1": 0, "x2": 300, "y2": 0, "thickness": 15}]

    surfaces  – mapping of surface codes to material UUIDs, e.g.:
                {"A": "<uuid>", "B": "<uuid>", "floor": "<uuid>", "ceiling": "<uuid>"}

    furniture_layout – list of placed furniture items, e.g.:
                [{"furniture_id": "<uuid>", "x": 120, "y": 80, "rotation": 90}]
    """

    __tablename__ = "rooms"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    apartment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("apartments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    # --- Geometry & physical dimensions ----------------------------------- #
    ceiling_h: Mapped[float | None] = mapped_column(
        Numeric(4, 2), nullable=True, comment="Ceiling height in metres"
    )
    geometry: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, comment="Wall segments array"
    )
    surfaces: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, comment="Surface-to-material mapping"
    )
    furniture_layout: Mapped[list | None] = mapped_column(
        JSONB, nullable=True, comment="Placed furniture items"
    )

    # --- Computed / cached areas ------------------------------------------ #
    floor_area: Mapped[float | None] = mapped_column(
        Numeric(8, 2), nullable=True, comment="Floor area in m²"
    )
    net_wall_area: Mapped[float | None] = mapped_column(
        Numeric(8, 2), nullable=True, comment="Net paintable wall area in m²"
    )
    perimeter: Mapped[float | None] = mapped_column(
        Numeric(8, 2), nullable=True, comment="Room perimeter in metres"
    )
    openings_count: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False, comment="Number of doors + windows"
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    apartment: Mapped["Apartment"] = relationship(  # noqa: F821
        "Apartment",
        back_populates="rooms",
        lazy="select",
    )
    estimates: Mapped[list["Estimate"]] = relationship(  # noqa: F821
        "Estimate",
        back_populates="room",
        cascade="all, delete-orphan",
        lazy="select",
    )
    leads: Mapped[list["Lead"]] = relationship(  # noqa: F821
        "Lead",
        back_populates="room",
        lazy="select",
    )

    def __repr__(self) -> str:
        return f"<Room id={self.id} name={self.name!r}>"
