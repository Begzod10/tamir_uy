from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt

from app.config import settings

ALGORITHM = "HS256"


def create_access_token(
    subject: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Return a signed JWT access token for *subject*."""
    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    expire = datetime.now(tz=timezone.utc) + expires_delta
    payload = {
        "sub": subject,
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(subject: str) -> str:
    """Return a signed JWT refresh token for *subject*."""
    expire = datetime.now(tz=timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    payload = {
        "sub": subject,
        "exp": expire,
        "type": "refresh",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> Optional[str]:
    """Decode *token* and return the ``sub`` claim, or *None* on failure.

    Only tokens with ``type == "access"`` are accepted; refresh tokens are
    explicitly rejected so they cannot be used as session credentials.
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "access":
            return None
        sub: Optional[str] = payload.get("sub")
        return sub
    except JWTError:
        return None


def verify_refresh_token(token: str) -> Optional[str]:
    """Decode *token* and return the ``sub`` claim, or *None* on failure.

    Only tokens with ``type == "refresh"`` are accepted; access tokens are
    explicitly rejected so they cannot be used as refresh credentials.
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            return None
        sub: Optional[str] = payload.get("sub")
        return sub
    except JWTError:
        return None
