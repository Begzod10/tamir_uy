from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class WallElement(BaseModel):
    type: Literal["eshik", "deraza", "balkon"]
    width: float = Field(ge=0.3, le=5.0)
    height: float = Field(ge=0.3, le=3.5)
    sill_height: float = Field(default=0.0, ge=0.0, le=2.5)
    # Relative position along the wall: 0.0 = start, 1.0 = end
    position: float = Field(default=0.5, ge=0.0, le=1.0)


class Wall(BaseModel):
    id: str
    length: float = Field(gt=0.5, lt=25.0)
    elements: list[WallElement] = []


class RoomGeometry(BaseModel):
    # Expects 4 walls; convention: index 0 = A, 1 = B, 2 = C, 3 = D
    walls: list[Wall] = Field(min_length=4, max_length=4)


class RoomCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    ceiling_h: float = Field(ge=1.8, le=6.0)
    geometry: RoomGeometry

    @model_validator(mode="after")
    def check_element_heights(self) -> "RoomCreate":
        for wall in self.geometry.walls:
            for el in wall.elements:
                if el.height + el.sill_height > self.ceiling_h + 0.01:
                    raise ValueError(
                        "Eshik/deraza balandligi shift balandligidan oshib ketmoqda"
                    )
        return self


class RoomUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    ceiling_h: float | None = Field(default=None, ge=1.8, le=6.0)
    geometry: RoomGeometry | None = None
    surfaces: dict | None = None
    furniture_layout: list | None = None
    state: dict | None = None


class RoomOut(BaseModel):
    id: UUID
    apartment_id: UUID
    name: str
    ceiling_h: float | None
    geometry: dict | None
    surfaces: dict | None
    furniture_layout: list | None
    state: dict | None
    floor_area: float | None
    net_wall_area: float | None
    perimeter: float | None
    openings_count: int
    updated_at: datetime

    model_config = {"from_attributes": True}
