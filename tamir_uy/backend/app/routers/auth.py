from __future__ import annotations

from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import CurrentUser
from app.config import settings
from app.core.cache import get_redis
from app.core.security import create_access_token
from app.core.sms import generate_otp, send_otp, store_otp, verify_otp
from app.database import get_db
from app.models.user import User
from app.schemas.auth import LoginResponse, OTPRequest, OTPVerify, UserOut

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

_OTP_RATE_LIMIT = 3        # max send requests per window
_OTP_RATE_WINDOW = 600     # 10 minutes
_OTP_MAX_ATTEMPTS = 5      # max verify attempts before lockout
_OTP_ATTEMPT_TTL = 300     # 5 minutes — same as OTP lifetime

_IS_DEV = settings.ENVIRONMENT == "development"
_COOKIE_MAX_AGE = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="token",
        value=token,
        httponly=True,
        secure=not _IS_DEV,  # HTTPS-only in production
        samesite="lax",
        max_age=_COOKIE_MAX_AGE,
        path="/",
    )


@router.post(
    "/otp/request",
    status_code=status.HTTP_200_OK,
    summary="Request an OTP via SMS",
)
async def request_otp(body: OTPRequest) -> dict[str, str]:
    """Rate-limited: max 3 sends per phone per 10 min."""
    redis = get_redis()

    rate_key = f"otp_rate:{body.phone}"
    count_raw = await redis.get(rate_key)
    count = int(count_raw) if count_raw else 0
    if count >= _OTP_RATE_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many OTP requests. Please wait before trying again.",
        )

    pipe = redis.pipeline()
    await pipe.incr(rate_key)
    if count == 0:
        await pipe.expire(rate_key, _OTP_RATE_WINDOW)
    await pipe.execute()

    code = generate_otp()
    await store_otp(body.phone, code, redis)

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
    response_model=LoginResponse,
    status_code=status.HTTP_200_OK,
    summary="Verify OTP, set HttpOnly cookie, return user info",
)
async def verify_otp_endpoint(
    body: OTPVerify,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LoginResponse:
    """Brute-force guarded (max 5 attempts per 5-min window).
    On success: sets an HttpOnly JWT cookie; JWT is NOT in the response body."""
    redis = get_redis()

    attempts_key = f"otp_attempts:{body.phone}"
    attempts_raw = await redis.get(attempts_key)
    attempts = int(attempts_raw) if attempts_raw else 0
    if attempts >= _OTP_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed attempts. Wait 5 minutes and request a new OTP.",
        )

    is_valid = await verify_otp(body.phone, body.code, redis)
    if not is_valid:
        pipe = redis.pipeline()
        await pipe.incr(attempts_key)
        if attempts == 0:
            await pipe.expire(attempts_key, _OTP_ATTEMPT_TTL)
        await pipe.execute()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP code.",
        )

    await redis.delete(attempts_key)

    result = await db.execute(select(User).where(User.phone == body.phone))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(phone=body.phone)
        db.add(user)
        await db.flush()

    logger.info("user_authenticated", user_id=str(user.id), phone=body.phone)

    _set_auth_cookie(response, create_access_token(str(user.id)))

    return LoginResponse(user=UserOut.model_validate(user))


@router.get(
    "/me",
    response_model=UserOut,
    summary="Return current user from cookie session",
)
async def get_me(current_user: CurrentUser) -> UserOut:
    return UserOut.model_validate(current_user)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Clear the auth cookie",
)
async def logout(response: Response) -> None:
    response.delete_cookie(key="token", path="/", samesite="lax")
