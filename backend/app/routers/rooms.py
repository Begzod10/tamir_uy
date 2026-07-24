from __future__ import annotations

from uuid import UUID

import structlog
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import select

from app.api.v1.deps import CurrentUser, DbSession
from app.models.apartment import Apartment
from app.models.room import Room
from app.schemas.room import RoomCreate, RoomGeometry, RoomOut, RoomUpdate
from app.services.room_geometry import compute_metrics as _compute_metrics_impl
from app.services.room_geometry import shoelace as _shoelace

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["rooms"])


# ---------------------------------------------------------------------------
# Geometry helpers (thin wrappers — logic lives in app.services.room_geometry)
# ---------------------------------------------------------------------------

def _compute_metrics(geometry: RoomGeometry, ceiling_h: float) -> dict:
    return _compute_metrics_impl(geometry, ceiling_h)


async def _get_owned_apartment(apartment_id: UUID, user_id: object, db: DbSession) -> Apartment:
    result = await db.execute(
        select(Apartment).where(Apartment.id == apartment_id, Apartment.user_id == user_id)
    )
    apartment = result.scalar_one_or_none()
    if apartment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Apartment not found")
    return apartment


async def _get_owned_room(room_id: UUID, user_id: object, db: DbSession) -> Room:
    result = await db.execute(
        select(Room)
        .join(Apartment, Room.apartment_id == Apartment.id)
        .where(Room.id == room_id, Apartment.user_id == user_id, Room.deleted == False)
    )
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
async def create_room(apt_id: UUID, body: RoomCreate, db: DbSession, current_user: CurrentUser) -> RoomOut:
    await _get_owned_apartment(apt_id, current_user.id, db)

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
    "/apartments/{apt_id}/rooms",
    response_model=list[RoomOut],
    summary="List all rooms of an apartment with full details",
)
async def list_rooms(apt_id: UUID, db: DbSession, current_user: CurrentUser) -> list[RoomOut]:
    await _get_owned_apartment(apt_id, current_user.id, db)
    result = await db.execute(
        select(Room)
        # updated_at shifts on every edit, which would reshuffle the top-view
        # layout — order by id for a stable (if arbitrary) room order.
        .where(Room.apartment_id == apt_id, Room.deleted == False)
        .order_by(Room.id)
    )
    return [RoomOut.model_validate(r) for r in result.scalars().all()]


@router.get(
    "/rooms/{room_id}",
    response_model=RoomOut,
    summary="Get full room details",
)
async def get_room(room_id: UUID, db: DbSession, current_user: CurrentUser) -> RoomOut:
    room = await _get_owned_room(room_id, current_user.id, db)
    return RoomOut.model_validate(room)


@router.patch(
    "/rooms/{room_id}",
    response_model=RoomOut,
    summary="Partially update a room; recomputes metrics when geometry changes",
)
async def update_room(room_id: UUID, body: RoomUpdate, db: DbSession, current_user: CurrentUser) -> RoomOut:
    room = await _get_owned_room(room_id, current_user.id, db)

    if body.name is not None:
        room.name = body.name
    if body.surfaces is not None:
        room.surfaces = body.surfaces
    if body.furniture_layout is not None:
        room.furniture_layout = body.furniture_layout
    if body.state is not None:
        room.state = body.state

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
    summary="Delete a room (soft delete)",
)
async def delete_room(room_id: UUID, db: DbSession, current_user: CurrentUser) -> Response:
    room = await _get_owned_room(room_id, current_user.id, db)
    room.deleted = True
    await db.flush()
    logger.info("room_deleted", room_id=str(room_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
