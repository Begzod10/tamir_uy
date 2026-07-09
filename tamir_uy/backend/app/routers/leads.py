from __future__ import annotations

import structlog
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.v1.deps import CurrentUser, DbSession
from app.models.apartment import Apartment
from app.models.estimate import Estimate
from app.models.lead import Lead
from app.models.room import Room
from app.models.usta import Usta
from app.schemas.usta import LeadCreate, LeadOut

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/leads", tags=["leads"])


@router.post(
    "",
    response_model=LeadOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a lead; smeta_snapshot is auto-populated from the latest estimate",
)
async def create_lead(
    body: LeadCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> LeadOut:
    # Verify usta exists and is active
    usta_result = await db.execute(
        select(Usta).where(Usta.id == body.usta_id, Usta.is_active.is_(True))
    )
    if usta_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usta not found")

    # Validate room ownership and pull smeta snapshot when room_id is provided
    smeta_snapshot: dict | None = None
    if body.room_id is not None:
        room_result = await db.execute(
            select(Room)
            .join(Apartment, Room.apartment_id == Apartment.id)
            .where(Room.id == body.room_id, Apartment.user_id == current_user.id)
        )
        if room_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

        # Latest estimate for the room becomes the immutable snapshot
        estimate_result = await db.execute(
            select(Estimate)
            .where(Estimate.room_id == body.room_id)
            .order_by(Estimate.created_at.desc())
            .limit(1)
        )
        estimate = estimate_result.scalar_one_or_none()
        if estimate is not None:
            smeta_snapshot = {
                "estimate_id": str(estimate.id),
                "lines": estimate.lines,
                "total_uzs": estimate.total_uzs,
                "created_at": estimate.created_at.isoformat(),
            }

    lead = Lead(
        usta_id=body.usta_id,
        user_id=current_user.id,
        room_id=body.room_id,
        smeta_snapshot=smeta_snapshot,
        status="new",
    )
    db.add(lead)
    await db.flush()
    logger.info(
        "lead_created",
        lead_id=str(lead.id),
        usta_id=str(body.usta_id),
        user_id=str(current_user.id),
    )
    return LeadOut.model_validate(lead)


@router.get(
    "",
    response_model=list[LeadOut],
    summary="List current user's leads",
)
async def list_leads(
    current_user: CurrentUser,
    db: DbSession,
) -> list[LeadOut]:
    result = await db.execute(
        select(Lead)
        .where(Lead.user_id == current_user.id)
        .order_by(Lead.created_at.desc())
    )
    leads = result.scalars().all()
    return [LeadOut.model_validate(lead) for lead in leads]
