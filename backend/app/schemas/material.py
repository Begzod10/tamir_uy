from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel


class MaterialOut(BaseModel):
    id: UUID
    store_id: UUID
    category: str
    name_uz: str
    unit: str
    price_uzs: int
    color_hex: str | None
    texture_key: str | None
    pbr_roughness: float

    model_config = {"from_attributes": True}


class PaginatedMaterials(BaseModel):
    items: list[MaterialOut]
    total: int
    page: int
    per_page: int
