from __future__ import annotations

from uuid import UUID

import structlog
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import select

from app.api.v1.deps import DbSession
from app.models.apartment import Apartment
from app.models.room import Room
from app.schemas.room import RoomCreate, RoomGeometry, RoomOut, RoomUpdate

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["rooms"])


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def _compute_metrics(
    geometry: RoomGeometry,
    ceiling_h: float,
) -> dict:
    """Compute derived metrics from the 4-wall room geometry.

    Convention: walls[0] = A (length side), walls[1] = B (width side).
    The room is assumed rectangular so C mirrors A and D mirrors B.
    """
    walls = geometry.walls
    wall_a = walls[0]
    wall_b = walls[1]

    floor_area = wall_a.length * wall_b.length
    perimeter = 2 * (wall_a.length + wall_b.length)

    openings_count = sum(len(w.elements) for w in walls)
    openings_area = sum(
        el.width * el.height
        for w in walls
        for el in w.elements
    )
    net_wall_area = perimeter * ceiling_h - openings_area

    return {
        "floor_area": round(floor_area, 2),
        "perimeter": round(perimeter, 2),
        "net_wall_area": round(net_wall_area, 2),
        "openings_count": openings_count,
    }


async def _get_apartment(apartment_id: UUID, db: DbSession) -> Apartment:
    result = await db.execute(select(Apartment).where(Apartment.id == apartment_id))
    apartment = result.scalar_one_or_none()
    if apartment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Apartment not found")
    return apartment


async def _get_room(room_id: UUID, db: DbSession) -> Room:
    result = await db.execute(select(Room).where(Room.id == room_id))
    room = result.scalar_one_or_none()
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    return room


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post(
    "/apartments/{apt_id}/rooms",
    response_model=RoomOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a room inside an apartment",
)
async def create_room(apt_id: UUID, body: RoomCreate, db: DbSession) -> RoomOut:
    await _get_apartment(apt_id, db)

    metrics = _compute_metrics(body.geometry, body.ceiling_h)

    room = Room(
        apartment_id=apt_id,
        name=body.name,
        ceiling_h=body.ceiling_h,
        geometry=body.geometry.model_dump(),
        **metrics,
    )
    db.add(room)
    await db.flush()
    logger.info("room_created", room_id=str(room.id), apt_id=str(apt_id))
    return RoomOut.model_validate(room)


@router.get(
    "/rooms/{room_id}",
    response_model=RoomOut,
    summary="Get full room details",
)
async def get_room(room_id: UUID, db: DbSession) -> RoomOut:
    room = await _get_room(room_id, db)
    return RoomOut.model_validate(room)


@router.patch(
    "/rooms/{room_id}",
    response_model=RoomOut,
    summary="Partially update a room; recomputes metrics when geometry changes",
)
async def update_room(room_id: UUID, body: RoomUpdate, db: DbSession) -> RoomOut:
    room = await _get_room(room_id, db)

    if body.name is not None:
        room.name = body.name
    if body.surfaces is not None:
        room.surfaces = body.surfaces
    if body.furniture_layout is not None:
        room.furniture_layout = body.furniture_layout

    # Geometry or ceiling height change triggers metric recomputation
    geometry_changed = body.geometry is not None
    ceiling_changed = body.ceiling_h is not None

    if body.ceiling_h is not None:
        room.ceiling_h = body.ceiling_h
    if body.geometry is not None:
        room.geometry = body.geometry.model_dump()

    if geometry_changed or ceiling_changed:
        active_geometry = (
            body.geometry
            if body.geometry is not None
            else RoomGeometry.model_validate(room.geometry)
        )
        active_ceiling = float(room.ceiling_h) if room.ceiling_h is not None else 0.0
        metrics = _compute_metrics(active_geometry, active_ceiling)
        room.floor_area = metrics["floor_area"]
        room.perimeter = metrics["perimeter"]
        room.net_wall_area = metrics["net_wall_area"]
        room.openings_count = metrics["openings_count"]

    await db.flush()
    await db.refresh(room)
    logger.info("room_updated", room_id=str(room_id))
    return RoomOut.model_validate(room)


@router.delete(
    "/rooms/{room_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Delete a room",
)
async def delete_room(room_id: UUID, db: DbSession) -> None:
    room = await _get_room(room_id, db)
    await db.delete(room)
    logger.info("room_deleted", room_id=str(room_id))
