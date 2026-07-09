from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

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
    """Decode *token* and return the ``sub`` claim, or *None* on failure."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        sub: Optional[str] = payload.get("sub")
        return sub
    except JWTError:
        return None


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: AsyncSession = Depends(lambda: None),  # replaced by actual DB dep at wire-up
):
    """FastAPI dependency that resolves the bearer token to a User ORM object.

    Wire the real DB session dependency in ``app.api.v1.deps`` to avoid a
    circular import here.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    sub = verify_token(token)
    if sub is None:
        raise credentials_exception

    # Import lazily to avoid circular imports at module load time
    from app.models.user import User  # noqa: PLC0415
    from sqlalchemy import select  # noqa: PLC0415

    result = await db.execute(select(User).where(User.id == sub))
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception

    return user


async def get_current_active_user(
    current_user=Depends(get_current_user),
):
    """Extend *get_current_user* to reject inactive accounts."""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account",
        )
    return current_user
