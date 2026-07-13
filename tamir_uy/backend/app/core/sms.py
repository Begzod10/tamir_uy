from __future__ import annotations

import secrets
import string

import httpx
from redis.asyncio import Redis

from app.config import settings

_OTP_TTL_SECONDS = 300  # 5 minutes
_OTP_KEY_PREFIX = "otp:"


def generate_otp() -> str:
    """Return a cryptographically random 6-digit OTP string."""
    return "".join(secrets.choice(string.digits) for _ in range(6))


async def store_otp(phone: str, code: str, redis: Redis) -> None:
    """Persist *code* in Redis under the phone-keyed OTP namespace, TTL 5 min."""
    key = f"{_OTP_KEY_PREFIX}{phone}"
    await redis.set(key, code, ex=_OTP_TTL_SECONDS)


async def verify_otp(phone: str, code: str, redis: Redis) -> bool:
    """Check *code* against the stored OTP for *phone*.

    Returns *True* on a match and deletes the key so it can only be used once.
    Returns *False* if the key does not exist or the code is wrong.
    """
    key = f"{_OTP_KEY_PREFIX}{phone}"
    stored = await redis.get(key)
    if stored is None:
        return False
    if stored != code:
        return False
    await redis.delete(key)
    return True


async def send_otp(phone: str, code: str) -> bool:
    """Dispatch an SMS containing *code* to *phone* via the configured provider.

    Supports Eskiz (default) and Playmobile based on settings.SMS_PROVIDER.
    Returns *True* on success, *False* on any delivery failure.
    """
    provider = settings.SMS_PROVIDER.lower()

    if provider == "eskiz":
        return await _send_via_eskiz(phone, code)
    elif provider == "playmobile":
        return await _send_via_playmobile(phone, code)
    else:
        raise ValueError(f"Unknown SMS_PROVIDER: {settings.SMS_PROVIDER!r}")


async def _send_via_eskiz(phone: str, code: str) -> bool:
    message = f"UyTa'mir: your OTP is {code}. Valid for 5 minutes."
    token = await _get_eskiz_token()
    if token is None:
        return False

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(
            "https://notify.eskiz.uz/api/message/sms/send",
            headers={"Authorization": f"Bearer {token}"},
            data={
                "mobile_phone": phone.lstrip("+"),
                "message": message,
                "from": settings.SMS_SENDER_ID or "4546",
                "callback_url": "",
            },
        )

    return response.status_code == 200


async def _get_eskiz_token() -> str | None:
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(
            "https://notify.eskiz.uz/api/auth/login",
            data={
                "email": settings.ESKIZ_EMAIL,
                "password": settings.ESKIZ_PASSWORD,
            },
        )
    if response.status_code != 200:
        return None
    data = response.json()
    return data.get("data", {}).get("token")


async def _send_via_playmobile(phone: str, code: str) -> bool:
    message = f"UyTa'mir: your OTP is {code}. Valid for 5 minutes."
    payload = {
        "messages": [
            {
                "recipient": phone.lstrip("+"),
                "message-id": f"otp-{phone}",
                "sms": {
                    "originator": settings.SMS_SENDER_ID or "UyTamir",
                    "content": {"text": message},
                },
            }
        ]
    }

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(
            settings.PLAYMOBILE_URL or "https://send.smsxabar.uz/broker-api/send",
            json=payload,
            auth=(settings.PLAYMOBILE_LOGIN, settings.PLAYMOBILE_PASSWORD),
        )

    return response.status_code == 200
