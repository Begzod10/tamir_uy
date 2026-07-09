from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel


class FurnitureOut(BaseModel):
    id: UUID
    store_id: UUID | None
    category: str
    name_uz: str
    price_uzs: int | None
    glb_key: str | None
    footprint_w: float | None
    footprint_d: float | None

    model_config = {"from_attributes": True}


class PaginatedFurniture(BaseModel):
    items: list[FurnitureOut]
    total: int
    page: int
    per_page: int


class StoreOut(BaseModel):
    id: UUID
    name: str
    district: str | None
    phone: str | None
    telegram: str | None
    logo_color: str | None
    partner_tier: str

    model_config = {"from_attributes": True}
