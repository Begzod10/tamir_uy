from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class WallElement(BaseModel):
    type: Literal["eshik", "deraza", "balkon"]
    width: float
    height: float
    sill_height: float = 0.0
    # Relative position along the wall: 0.0 = start, 1.0 = end
    position: float = Field(default=0.5, ge=0.0, le=1.0)


class Wall(BaseModel):
    id: str
    length: float = Field(gt=0)
    elements: list[WallElement] = []


class RoomGeometry(BaseModel):
    # Expects 4 walls; convention: index 0 = A, 1 = B, 2 = C, 3 = D
    walls: list[Wall] = Field(min_length=4, max_length=4)


class RoomCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    ceiling_h: float = Field(gt=0)
    geometry: RoomGeometry


class RoomUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    ceiling_h: float | None = Field(default=None, gt=0)
    geometry: RoomGeometry | None = None
    surfaces: dict | None = None
    furniture_layout: list | None = None


class RoomOut(BaseModel):
    id: UUID
    apartment_id: UUID
    name: str
    ceiling_h: float | None
    geometry: dict | None
    surfaces: dict | None
    furniture_layout: list | None
    floor_area: float | None
    net_wall_area: float | None
    perimeter: float | None
    openings_count: int
    updated_at: datetime

    model_config = {"from_attributes": True}
