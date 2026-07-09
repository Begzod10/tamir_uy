from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.v1.deps import DbSession
from app.models.draft_room import DraftRoom
from app.schemas.draft_room import DraftRoomCreate, DraftRoomOut, DraftRoomUpdate

router = APIRouter(prefix="/draft-rooms", tags=["draft-rooms"])


@router.post("", response_model=DraftRoomOut, status_code=status.HTTP_201_CREATED)
async def create_draft(body: DraftRoomCreate, db: DbSession) -> DraftRoomOut:
    draft = DraftRoom(state=body.state)
    db.add(draft)
    await db.flush()
    await db.refresh(draft)
    return DraftRoomOut.model_validate(draft)


@router.get("/{draft_id}", response_model=DraftRoomOut)
async def get_draft(draft_id: UUID, db: DbSession) -> DraftRoomOut:
    result = await db.execute(select(DraftRoom).where(DraftRoom.id == draft_id))
    draft = result.scalar_one_or_none()
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Draft not found")
    return DraftRoomOut.model_validate(draft)


@router.patch("/{draft_id}", response_model=DraftRoomOut)
async def update_draft(draft_id: UUID, body: DraftRoomUpdate, db: DbSession) -> DraftRoomOut:
    result = await db.execute(select(DraftRoom).where(DraftRoom.id == draft_id))
    draft = result.scalar_one_or_none()
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Draft not found")
    draft.state = body.state
    draft.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(draft)
    return DraftRoomOut.model_validate(draft)


@router.delete("/{draft_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_draft(draft_id: UUID, db: DbSession) -> None:
    result = await db.execute(select(DraftRoom).where(DraftRoom.id == draft_id))
    draft = result.scalar_one_or_none()
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Draft not found")
    await db.delete(draft)
