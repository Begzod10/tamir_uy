from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.room import RoomOut


class ApartmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    address: str | None = Field(default=None, max_length=500)
    developer: str | None = Field(default=None, max_length=200)


class ApartmentOut(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    address: str | None
    developer: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ApartmentWithRooms(ApartmentOut):
    rooms: list[RoomOut] = []
