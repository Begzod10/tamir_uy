from __future__ import annotations

from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_redis
from app.core.security import create_access_token, create_refresh_token
from app.core.sms import generate_otp, send_otp, store_otp, verify_otp
from app.database import get_db
from app.models.user import User
from app.schemas.auth import OTPRequest, OTPVerify, TokenResponse

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

_OTP_RATE_LIMIT = 3        # max requests per window
_OTP_RATE_WINDOW = 600     # seconds (10 minutes)


@router.post(
    "/otp/request",
    status_code=status.HTTP_200_OK,
    summary="Request an OTP via SMS",
)
async def request_otp(
    body: OTPRequest,
) -> dict[str, str]:
    """Generate a 6-digit OTP, store it in Redis with a 5-minute TTL, and
    dispatch it via SMS.  Returns 429 when the same phone has requested more
    than 3 codes within a 10-minute window."""
    redis = get_redis()

    # Rate limiting
    rate_key = f"otp_rate:{body.phone}"
    count_raw = await redis.get(rate_key)
    count = int(count_raw) if count_raw else 0
    if count >= _OTP_RATE_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many OTP requests. Please wait before trying again.",
        )

    # Increment counter; set expiry only on the first increment in this window
    pipe = redis.pipeline()
    await pipe.incr(rate_key)
    if count == 0:
        await pipe.expire(rate_key, _OTP_RATE_WINDOW)
    await pipe.execute()

    # Generate and store the OTP
    code = generate_otp()
    await store_otp(body.phone, code, redis)

    # Dispatch SMS (non-blocking: failures are logged but do not abort the request)
    try:
        delivered = await send_otp(body.phone, code)
        if not delivered:
            logger.warning("sms_delivery_failed", phone=body.phone)
    except Exception as exc:
        logger.error("sms_error", phone=body.phone, error=str(exc))

    logger.info("otp_requested", phone=body.phone)
    return {"message": "SMS yuborildi"}


@router.post(
    "/otp/verify",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Verify OTP and obtain JWT pair",
)
async def verify_otp_endpoint(
    body: OTPVerify,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    """Verify the OTP code from Redis. On success, upsert the User row and
    return a JWT access + refresh token pair.  Returns 400 on invalid/expired
    code."""
    redis = get_redis()

    is_valid = await verify_otp(body.phone, body.code, redis)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP code.",
        )

    # Upsert user
    result = await db.execute(select(User).where(User.phone == body.phone))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(phone=body.phone)
        db.add(user)
        await db.flush()

    logger.info("user_authenticated", user_id=str(user.id), phone=body.phone)

    subject = str(user.id)
    return TokenResponse(
        access_token=create_access_token(subject),
        refresh_token=create_refresh_token(subject),
    )
