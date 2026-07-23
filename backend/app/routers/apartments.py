from __future__ import annotations

from uuid import UUID

import structlog
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import CurrentUser, DbSession
from app.models.apartment import Apartment
from app.models.room import Room
from app.schemas.apartment import ApartmentCreate, ApartmentOut, ApartmentWithRooms

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/apartments", tags=["apartments"])


@router.get(
    "",
    response_model=list[ApartmentWithRooms],
    summary="List all apartments with their rooms",
)
async def list_apartments(db: DbSession, current_user: CurrentUser) -> list[ApartmentWithRooms]:
    result = await db.execute(
        select(Apartment)
        .where(Apartment.user_id == current_user.id)
        .options(selectinload(Apartment.rooms))
        .order_by(Apartment.created_at.desc())
    )
    apartments = result.scalars().all()
    # Filter out deleted rooms from each apartment's rooms list
    for apt in apartments:
        if apt.rooms:
            apt.rooms = [r for r in apt.rooms if not r.deleted]
    return [ApartmentWithRooms.model_validate(a) for a in apartments]


@router.post(
    "",
    response_model=ApartmentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new apartment",
)
async def create_apartment(body: ApartmentCreate, db: DbSession, current_user: CurrentUser) -> ApartmentOut:
    apartment = Apartment(
        user_id=current_user.id,
        name=body.name,
        address=body.address,
        developer=body.developer,
    )
    db.add(apartment)
    await db.flush()
    logger.info("apartment_created", apartment_id=str(apartment.id))
    return ApartmentOut.model_validate(apartment)


@router.get(
    "/{apartment_id}",
    response_model=ApartmentWithRooms,
    summary="Get apartment with rooms list",
)
async def get_apartment(apartment_id: UUID, db: DbSession, current_user: CurrentUser) -> ApartmentWithRooms:
    result = await db.execute(
        select(Apartment)
        .where(Apartment.id == apartment_id, Apartment.user_id == current_user.id)
        .options(selectinload(Apartment.rooms))
    )
    apartment = result.scalar_one_or_none()
    if apartment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Apartment not found")
    # Filter out deleted rooms
    if apartment.rooms:
        apartment.rooms = [r for r in apartment.rooms if not r.deleted]
    return ApartmentWithRooms.model_validate(apartment)


@router.delete(
    "/{apartment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Delete apartment",
)
async def delete_apartment(apartment_id: UUID, db: DbSession, current_user: CurrentUser) -> None:
    result = await db.execute(
        select(Apartment).where(Apartment.id == apartment_id, Apartment.user_id == current_user.id)
    )
    apartment = result.scalar_one_or_none()
    if apartment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Apartment not found")
    await db.delete(apartment)
    logger.info("apartment_deleted", apartment_id=str(apartment_id))
