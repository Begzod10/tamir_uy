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
    # Minimum 3 walls.  Legacy rectangular rooms use exactly 4 walls
    # (index 0=A, 1=B, 2=C, 3=D).  N-wall polygon rooms may have more.
    walls: list[Wall] = Field(min_length=3)
    # Ordered polygon vertices in the floor plane (metres, counter-clockwise).
    # For legacy 4-wall rooms, auto-populated from walls[0].length × walls[1].length
    # by _normalize_polygon so callers don't need to supply them.
    vertices: list[tuple[float, float]] | None = None

    @model_validator(mode="after")
    def _normalize_polygon(self) -> "RoomGeometry":
        """Auto-compute rectangular vertices for legacy 4-wall rooms."""
        if self.vertices is None and len(self.walls) == 4:
            a = self.walls[0].length
            b = self.walls[1].length
            self.vertices = [(0.0, 0.0), (a, 0.0), (a, b), (0.0, b)]
        return self


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
