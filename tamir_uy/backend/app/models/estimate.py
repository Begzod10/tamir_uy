from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Estimate(Base):
    """
    Immutable cost-estimate snapshot for a room.

    Once written, rows are never updated — a new Estimate is created each time
    the user recalculates.  This preserves a full history for the user and
    the usta.

    lines – ordered list of estimate line items, e.g.:
    [
        {
            "material_id": "<uuid>",
            "name_uz": "Bayramix Classic",
            "category": "boyoq",
            "unit": "litr",
            "qty": 12.5,
            "price_uzs": 45000,
            "subtotal_uzs": 562500
        },
        ...
    ]
    """

    __tablename__ = "estimates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    room_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("rooms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    lines: Mapped[list] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        comment="Ordered list of estimate line items",
    )
    total_uzs: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=0,
        comment="Sum of all line subtotals in UZS",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    room: Mapped["Room"] = relationship(  # noqa: F821
        "Room",
        back_populates="estimates",
        lazy="select",
    )

    def __repr__(self) -> str:
        return (
            f"<Estimate id={self.id} room_id={self.room_id} "
            f"total_uzs={self.total_uzs}>"
        )
