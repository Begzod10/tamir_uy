from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class UstaOut(BaseModel):
    id: UUID
    name: str
    category: str
    district: str | None
    phone: str
    telegram: str | None
    rating: float
    jobs_count: int
    price_min: int | None
    price_max: int | None
    verified: bool

    model_config = {"from_attributes": True}


class LeadCreate(BaseModel):
    usta_id: UUID
    room_id: UUID | None = None
    message: str | None = None


class LeadOut(BaseModel):
    id: UUID
    usta_id: UUID
    user_id: UUID
    room_id: UUID | None
    smeta_snapshot: dict | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}
