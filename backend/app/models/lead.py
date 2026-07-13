from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# ---------------------------------------------------------------------------
# Enum
# ---------------------------------------------------------------------------

LeadStatus = Enum(
    "new",
    "viewed",
    "contacted",
    "closed",
    name="lead_status",
)


class Lead(Base):
    """
    Intent record created when a user contacts an Usta.

    smeta_snapshot – a JSON snapshot of the estimate lines at the moment the
                     lead was created, so historical records remain consistent
                     even if prices change later.
    """

    __tablename__ = "leads"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    usta_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ustalar.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    room_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("rooms.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    smeta_snapshot: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        comment="Immutable snapshot of the estimate at lead creation time",
    )
    status: Mapped[str] = mapped_column(
        LeadStatus,
        nullable=False,
        default="new",
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    usta: Mapped["Usta"] = relationship(  # noqa: F821
        "Usta",
        back_populates="leads",
        lazy="select",
    )
    user: Mapped["User"] = relationship(  # noqa: F821
        "User",
        back_populates="leads",
        lazy="select",
    )
    room: Mapped["Room | None"] = relationship(  # noqa: F821
        "Room",
        back_populates="leads",
        lazy="select",
    )

    def __repr__(self) -> str:
        return (
            f"<Lead id={self.id} status={self.status!r} "
            f"usta_id={self.usta_id} user_id={self.user_id}>"
        )
