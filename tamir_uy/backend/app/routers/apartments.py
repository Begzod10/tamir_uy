from __future__ import annotations

from uuid import UUID

import structlog
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import DbSession
from app.models.apartment import Apartment
from app.schemas.apartment import ApartmentCreate, ApartmentOut, ApartmentWithRooms

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/apartments", tags=["apartments"])

_DEV_USER_ID = "00000000-0000-0000-0000-000000000001"


@router.get(
    "",
    response_model=list[ApartmentOut],
    summary="List all apartments",
)
async def list_apartments(db: DbSession) -> list[ApartmentOut]:
    result = await db.execute(select(Apartment).order_by(Apartment.created_at.desc()))
    return [ApartmentOut.model_validate(a) for a in result.scalars().all()]


@router.post(
    "",
    response_model=ApartmentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new apartment",
)
async def create_apartment(body: ApartmentCreate, db: DbSession) -> ApartmentOut:
    from uuid import UUID as _UUID
    apartment = Apartment(
        user_id=_UUID(_DEV_USER_ID),
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
async def get_apartment(apartment_id: UUID, db: DbSession) -> ApartmentWithRooms:
    result = await db.execute(
        select(Apartment)
        .where(Apartment.id == apartment_id)
        .options(selectinload(Apartment.rooms))
    )
    apartment = result.scalar_one_or_none()
    if apartment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Apartment not found")
    return ApartmentWithRooms.model_validate(apartment)


@router.delete(
    "/{apartment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Delete apartment",
)
async def delete_apartment(apartment_id: UUID, db: DbSession) -> None:
    result = await db.execute(select(Apartment).where(Apartment.id == apartment_id))
    apartment = result.scalar_one_or_none()
    if apartment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Apartment not found")
    await db.delete(apartment)
    logger.info("apartment_deleted", apartment_id=str(apartment_id))
