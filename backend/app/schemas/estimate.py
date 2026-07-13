from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class EstimateLine(BaseModel):
    label: str
    formula: str
    quantity: float
    unit: str
    unit_price: int
    total_uzs: int
    is_approximate: bool = False
    store_id: UUID | None = None
    category: str = ""


class EstimateResponse(BaseModel):
    id: UUID
    room_id: UUID
    lines: list[EstimateLine]
    total_uzs: int
    total_min: int
    total_max: int
    created_at: datetime
    has_electrical: bool
