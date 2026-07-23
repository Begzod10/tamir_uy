"""AI feature endpoints.

POST /rooms/{room_id}/ai-build  — room-builder agent (Phase A)
POST /rooms/{room_id}/smeta/ask — smeta explainer assistant (Phase B)
"""
from __future__ import annotations

import uuid
from typing import Any

import structlog
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import CurrentUser, DbSession
from app.config import settings
from app.models.apartment import Apartment
from app.models.furniture import Furniture
from app.models.material import Material
from app.models.norm import Norm
from app.models.room import Room
from app.schemas.estimate import EstimateResponse
from app.services.ai_builder import RoomDraft, run_ai_builder
from app.services.smeta import compute_estimate

log = structlog.get_logger(__name__)
router = APIRouter(tags=["ai"])


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

async def _get_owned_room(room_id: uuid.UUID, user_id: Any, db: DbSession) -> Room:
    result = await db.execute(
        select(Room)
        .join(Apartment, Room.apartment_id == Apartment.id)
        .where(Room.id == room_id, Apartment.user_id == user_id, Room.deleted == False)
    )
    room = result.scalar_one_or_none()
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    return room


async def _load_all_materials(db: DbSession) -> dict[str, list[dict]]:
    """Return {category: [{id, name_uz, unit, price_uzs, color_hex}]} for all active materials."""
    result = await db.execute(
        select(Material).where(Material.is_active.is_(True))
    )
    by_cat: dict[str, list[dict]] = {}
    for m in result.scalars().all():
        entry = {
            "id": str(m.id),
            "name_uz": m.name_uz,
            "category": m.category,
            "unit": m.unit,
            "price_uzs": m.price_uzs,
            "color_hex": m.color_hex,
        }
        by_cat.setdefault(m.category, []).append(entry)
    return by_cat


async def _load_all_furniture(db: DbSession) -> list[dict]:
    """Return [{id, name_uz, category, footprint_w, footprint_d}] for all active furniture."""
    result = await db.execute(
        select(Furniture).where(Furniture.is_active.is_(True))
    )
    return [
        {
            "id": str(f.id),
            "name_uz": f.name_uz,
            "category": f.category,
            "footprint_w": float(f.footprint_w) if f.footprint_w else None,
            "footprint_d": float(f.footprint_d) if f.footprint_d else None,
            "price_uzs": f.price_uzs,
        }
        for f in result.scalars().all()
    ]


async def _load_norms(db: DbSession) -> dict[str, Any]:
    result = await db.execute(select(Norm))
    return {n.material_key: n for n in result.scalars().all()}


# ---------------------------------------------------------------------------
# Phase A — Room-builder agent
# ---------------------------------------------------------------------------

class AiBuildRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)


@router.post(
    "/rooms/{room_id}/ai-build",
    summary="AI bilan xona qurish (SSE stream)",
    response_class=StreamingResponse,
)
async def ai_build(
    room_id: uuid.UUID,
    body: AiBuildRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> StreamingResponse:
    if not settings.AI_FEATURES_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI xususiyatlari hozircha yoqilmagan.",
        )

    room = await _get_owned_room(room_id, current_user.id, db)
    materials_by_cat = await _load_all_materials(db)
    furniture_list = await _load_all_furniture(db)
    norms_map = await _load_norms(db)

    room_state: dict = {
        "id": str(room.id),
        "name": room.name,
        "ceiling_h": room.ceiling_h,
        "geometry": room.geometry,
        "surfaces": room.surfaces or {},
        "furniture_layout": room.furniture_layout or [],
    }

    # Prepare flat material map for smeta (material_id -> Material ORM)
    material_ids = {
        uuid.UUID(m["id"])
        for mats in materials_by_cat.values()
        for m in mats
    }
    mat_result = await db.execute(
        select(Material)
        .options(selectinload(Material.store))
        .where(Material.id.in_(material_ids))
    )
    materials_map = {str(m.id): m for m in mat_result.scalars().all()}

    async def estimate_fn(draft: RoomDraft) -> dict:
        """Apply draft to room copy, run compute_estimate, return serialisable dict."""
        import dataclasses, copy

        patched_room = copy.copy(room)

        # Apply geometry patches
        if draft.ceiling_h is not None:
            patched_room.ceiling_h = draft.ceiling_h
        if draft.wall_lengths and patched_room.geometry:
            geom = dict(patched_room.geometry)
            walls = [dict(w) for w in geom.get("walls", [])]
            for w in walls:
                if w.get("id") in draft.wall_lengths:
                    w["length"] = draft.wall_lengths[w["id"]]
            geom["walls"] = walls
            patched_room.geometry = geom

        # Apply surface patches
        if draft.surfaces:
            patched_surfaces = dict(patched_room.surfaces or {})
            patched_surfaces.update(draft.surfaces)
            patched_room.surfaces = patched_surfaces

        # Apply furniture patches
        if draft.furniture:
            patched_room.furniture_layout = list(patched_room.furniture_layout or []) + draft.furniture

        computed = compute_estimate(patched_room, materials_map, norms_map)
        return {
            "total_uzs": computed.total_uzs,
            "total_min": computed.total_min,
            "total_max": computed.total_max,
            "lines": [dataclasses.asdict(ln) for ln in computed.lines],
        }

    async def _stream():
        async for chunk in run_ai_builder(
            user_id=str(current_user.id),
            prompt=body.prompt,
            room_state=room_state,
            materials_by_category=materials_by_cat,
            furniture_list=furniture_list,
            estimate_fn=estimate_fn,
        ):
            yield chunk

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Phase B — Smeta explainer assistant
# ---------------------------------------------------------------------------

class SmetaAskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)


class SmetaAskResponse(BaseModel):
    answer_uz: str
    related_line_ids: list[str] = []


@router.post(
    "/rooms/{room_id}/smeta/ask",
    response_model=SmetaAskResponse,
    summary="Smeta bo'yicha savol berish (Haiku)",
)
async def smeta_ask(
    room_id: uuid.UUID,
    body: SmetaAskRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> SmetaAskResponse:
    if not settings.AI_FEATURES_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI xususiyatlari hozircha yoqilmagan.",
        )

    from app.services.llm import BudgetExceededError, call_llm
    import dataclasses

    room = await _get_owned_room(room_id, current_user.id, db)
    materials_map_full: dict[str, Material] = {}

    surfaces = room.surfaces or {}
    surface_mat_ids = [v for v in surfaces.values() if v]
    if surface_mat_ids:
        mat_uuids = [uuid.UUID(mid) for mid in surface_mat_ids if mid]
        mat_result = await db.execute(
            select(Material)
            .options(selectinload(Material.store))
            .where(Material.id.in_(mat_uuids))
        )
        materials_map_full = {str(m.id): m for m in mat_result.scalars().all()}

    norms_map = await _load_norms(db)
    computed = compute_estimate(room, materials_map_full, norms_map)

    # Build a compact estimate summary for the context
    lines_summary = "\n".join(
        f"- {ln.label}: {ln.qty:.2f} {ln.unit} × {ln.unit_price_uzs:,} = {ln.subtotal_uzs:,} UZS"
        for ln in computed.lines[:30]
    )
    estimate_context = (
        f"Jami: {computed.total_uzs:,} UZS\n"
        f"Min: {computed.total_min:,} UZS | Max: {computed.total_max:,} UZS\n\n"
        f"Smeta satrlari:\n{lines_summary}"
    )

    # Find cheaper alternatives (same category, lower price)
    cheaper_context = ""
    if computed.lines:
        all_mats = await _load_all_materials(db)
        categories_used = {m.category for m in materials_map_full.values()}
        cheaper_options: list[str] = []
        for cat in categories_used:
            cat_mats = all_mats.get(cat, [])
            prices_used = {
                m.price_uzs
                for m in materials_map_full.values()
                if m.category == cat
            }
            min_used_price = min(prices_used) if prices_used else 0
            cheaper = [
                f"  • {m['name_uz']}: {m['price_uzs']:,} UZS/{m['unit']}"
                for m in cat_mats
                if m["price_uzs"] < min_used_price * 0.9
            ][:3]
            if cheaper:
                cheaper_options.append(f"{cat}:\n" + "\n".join(cheaper))
        if cheaper_options:
            cheaper_context = "\n\nArzonroq alternativlar:\n" + "\n".join(cheaper_options)

    system = (
        "Siz UyTamir ilovasi uchun smeta yordamchisisiz. "
        "Faqat quyidagi haqiqiy smeta ma'lumotlari asosida O'zbek tilida javob bering. "
        "Narxlarni HECH QACHON o'zingiz hisoblang yoki taxmin qilmang — "
        "faqat berilgan raqamlardan foydalaning.\n\n"
        f"SMETA:\n{estimate_context}{cheaper_context}"
    )

    try:
        response = await call_llm(
            model=settings.AI_MODEL_EXPLAINER,
            system=system,
            messages=[{"role": "user", "content": body.question}],
            max_tokens=1024,
            user_id=str(current_user.id),
            model_type="explainer",
        )
    except BudgetExceededError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc))

    text_blocks = [b for b in response.content if b.type == "text"]
    answer = text_blocks[0].text if text_blocks else "Javob topilmadi."

    # Try to find which estimate line labels are referenced in the answer
    related: list[str] = []
    for i, ln in enumerate(computed.lines):
        if ln.label.lower() in answer.lower():
            related.append(str(i))

    return SmetaAskResponse(answer_uz=answer, related_line_ids=related)
