from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class DraftRoomCreate(BaseModel):
    state: dict = {}


class DraftRoomUpdate(BaseModel):
    state: dict


class DraftRoomOut(BaseModel):
    id: UUID
    state: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
