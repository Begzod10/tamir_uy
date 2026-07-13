from __future__ import annotations

from datetime import date
from typing import Annotated

import structlog
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import bcrypt as _bcrypt

from app.api.v1.deps import CurrentUser
from app.config import settings
from app.core.cache import get_redis
from app.core.security import create_access_token, create_refresh_token, verify_refresh_token
from app.core.sms import generate_otp, send_otp, store_otp, verify_otp
from app.database import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, LoginResponse, OTPRequest, OTPVerify, RegisterRequest, UserOut

def _hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()


def _verify_password(password: str, password_hash: str) -> bool:
    return _bcrypt.checkpw(password.encode(), password_hash.encode())

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

_OTP_RATE_LIMIT = 3        # max send requests per phone per window
_OTP_RATE_WINDOW = 600     # 10 minutes
_OTP_IP_RATE_LIMIT = 10   # max send requests per IP per hour
_OTP_IP_RATE_WINDOW = 3600  # 1 hour
_OTP_MAX_ATTEMPTS = 5      # max verify attempts before lockout
_OTP_ATTEMPT_TTL = 300     # 5 minutes — same as OTP lifetime

_IS_DEV = settings.ENVIRONMENT == "development"
_COOKIE_MAX_AGE = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
_REFRESH_COOKIE_MAX_AGE = settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400


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


def _set_refresh_cookie(response: Response, token: str) -> None:
    """Set the HttpOnly refresh token cookie, scoped to the refresh endpoint only."""
    response.set_cookie(
        key="refresh_token",
        value=token,
        httponly=True,
        secure=not _IS_DEV,
        samesite="lax",
        max_age=_REFRESH_COOKIE_MAX_AGE,
        path="/api/v1/auth/refresh",
    )


def _get_client_ip(request: Request) -> str:
    """Return the real client IP, respecting X-Forwarded-For when trusted."""
    if settings.TRUST_PROXY_HEADERS:
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
    return request.client.host  # type: ignore[union-attr]


@router.post(
    "/otp/request",
    status_code=status.HTTP_200_OK,
    summary="Request an OTP via SMS",
)
async def request_otp(body: OTPRequest, request: Request) -> dict[str, str]:
    """Rate-limited: max 3 sends per phone per 10 min, 10 per IP per hour, 2000 globally per day."""
    redis = get_redis()

    # --- global daily cap ---
    today_key = f"otp_global_daily:{date.today().isoformat()}"
    global_count_raw = await redis.incr(today_key)
    if global_count_raw == 1:
        # first increment today — set TTL so the key expires at end of day
        await redis.expire(today_key, 86400)
    if global_count_raw > settings.OTP_GLOBAL_DAILY_LIMIT:
        logger.error("otp_daily_limit_exceeded", count=global_count_raw)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OTP service temporarily unavailable. Try again later.",
        )

    # --- per-IP rate limit ---
    client_ip = _get_client_ip(request)
    ip_key = f"otp_ip_rate:{client_ip}"
    ip_count_raw = await redis.get(ip_key)
    ip_count = int(ip_count_raw) if ip_count_raw else 0
    if ip_count >= _OTP_IP_RATE_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many OTP requests from this IP. Please wait before trying again.",
        )
    ip_pipe = redis.pipeline()
    await ip_pipe.incr(ip_key)
    if ip_count == 0:
        await ip_pipe.expire(ip_key, _OTP_IP_RATE_WINDOW)
    await ip_pipe.execute()

    # --- per-phone rate limit ---
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
    On success: sets HttpOnly JWT cookies; JWTs are NOT in the response body."""
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

    subject = str(user.id)
    _set_auth_cookie(response, create_access_token(subject))
    _set_refresh_cookie(response, create_refresh_token(subject))

    return LoginResponse(user=UserOut.model_validate(user))


@router.get(
    "/me",
    response_model=UserOut,
    summary="Return current user from cookie session",
)
async def get_me(current_user: CurrentUser) -> UserOut:
    return UserOut.model_validate(current_user)


@router.post(
    "/refresh",
    response_model=LoginResponse,
    status_code=status.HTTP_200_OK,
    summary="Rotate access + refresh tokens using the refresh cookie",
)
async def refresh_tokens(
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
    refresh_token: Annotated[str | None, Cookie()] = None,
) -> LoginResponse:
    """Consume the refresh_token cookie and issue fresh access + refresh cookies.

    Returns 401 if the cookie is missing, invalid, or expired.
    """
    if refresh_token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing.",
        )

    user_id = verify_refresh_token(refresh_token)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    logger.info("tokens_rotated", user_id=user_id)

    _set_auth_cookie(response, create_access_token(user_id))
    _set_refresh_cookie(response, create_refresh_token(user_id))

    return LoginResponse(user=UserOut.model_validate(user))


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Clear the auth and refresh cookies",
)
async def logout(response: Response):  # noqa: ANN201 — 204 No Content, no body
    response.delete_cookie(key="token", path="/", samesite="lax")
    response.delete_cookie(
        key="refresh_token",
        path="/api/v1/auth/refresh",
        samesite="lax",
    )


@router.post(
    "/register",
    response_model=LoginResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register with username and password",
)
async def register(
    body: RegisterRequest,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LoginResponse:
    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bu username allaqachon band.",
        )

    user = User(
        username=body.username,
        password_hash=_hash_password(body.password),
        name=body.name,
    )
    db.add(user)
    await db.flush()

    logger.info("user_registered", user_id=str(user.id), username=body.username)

    subject = str(user.id)
    _set_auth_cookie(response, create_access_token(subject))
    _set_refresh_cookie(response, create_refresh_token(subject))

    return LoginResponse(user=UserOut.model_validate(user))


@router.post(
    "/login",
    response_model=LoginResponse,
    status_code=status.HTTP_200_OK,
    summary="Login with username and password",
)
async def login_with_password(
    body: LoginRequest,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LoginResponse:
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()

    if user is None or user.password_hash is None or not _verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Username yoki parol noto'g'ri.",
        )

    logger.info("user_logged_in", user_id=str(user.id), username=body.username)

    subject = str(user.id)
    _set_auth_cookie(response, create_access_token(subject))
    _set_refresh_cookie(response, create_refresh_token(subject))

    return LoginResponse(user=UserOut.model_validate(user))
