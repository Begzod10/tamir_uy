from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DraftRoom(Base):
    """Wizard progress snapshot — created on first visit, deleted when real room is saved."""

    __tablename__ = "draft_rooms"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    state: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        comment="Full wizard state: ceilingHeight, geometry, wizardStep, designState",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
