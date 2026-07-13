from __future__ import annotations

import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, field_validator

_PHONE_RE = re.compile(r"^\+?998\d{9}$")


def _normalize_phone(v: str) -> str:
    if not _PHONE_RE.match(v):
        raise ValueError(
            "Phone must start with +998 or 998 and contain exactly 12 digits total"
        )
    return v if v.startswith("+") else f"+{v}"


class OTPRequest(BaseModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return _normalize_phone(v)


class OTPVerify(BaseModel):
    phone: str
    code: str

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return _normalize_phone(v)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: UUID
    phone: str
    name: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class LoginResponse(BaseModel):
    """Returned by /otp/verify; the JWT is delivered via HttpOnly cookie, not here."""

    user: UserOut
