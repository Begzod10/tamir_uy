"""Auth unit tests — no database or network required.

Tests cover:
  - verify_refresh_token: valid refresh token, access token rejected, expired token
  - verify_token: valid access token, refresh token rejected
  - verify_otp: correct code returns True, wrong code returns False, missing key returns False
  - _set_auth_cookie / _set_refresh_cookie: cookie attributes (httponly, samesite, path)
  - OTP per-IP rate limit: 11th request raises 429
"""
from __future__ import annotations

import importlib.util
import sys
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import Response
from fastapi.testclient import TestClient
from jose import jwt

# ---------------------------------------------------------------------------
# Minimal environment so Settings() can instantiate without real DB/secrets
# ---------------------------------------------------------------------------
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-tests-only-32chars!!")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

# ---------------------------------------------------------------------------
# Imports under test (must come after env is set)
# ---------------------------------------------------------------------------
from app.core.security import (
    ALGORITHM,
    create_access_token,
    create_refresh_token,
    verify_refresh_token,
    verify_token,
)
from app.core.sms import verify_otp


def _load_auth_module():
    """Load app/routers/auth.py directly, bypassing routers/__init__.py
    which would pull in heavy optional dependencies (celery, boto3, etc.)."""
    auth_path = Path(__file__).parent.parent / "app" / "routers" / "auth.py"
    spec = importlib.util.spec_from_file_location("app.routers.auth", auth_path)
    mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    # Pre-register so transitive imports within auth.py can find it
    sys.modules.setdefault("app.routers.auth", mod)
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


_auth_mod = _load_auth_module()
_set_auth_cookie = _auth_mod._set_auth_cookie
_set_refresh_cookie = _auth_mod._set_refresh_cookie


# ===========================================================================
# security.py — verify_refresh_token
# ===========================================================================


class TestVerifyRefreshToken:
    def test_valid_refresh_token_returns_subject(self):
        token = create_refresh_token("user-123")
        result = verify_refresh_token(token)
        assert result == "user-123"

    def test_access_token_rejected_by_verify_refresh(self):
        """An access token must NOT be accepted as a refresh token."""
        access = create_access_token("user-123")
        result = verify_refresh_token(access)
        assert result is None

    def test_expired_refresh_token_returns_none(self):
        from app.config import settings

        payload = {
            "sub": "user-456",
            "exp": int(time.time()) - 1,  # already expired
            "type": "refresh",
        }
        expired_token = jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)
        result = verify_refresh_token(expired_token)
        assert result is None

    def test_tampered_token_returns_none(self):
        token = create_refresh_token("user-789")
        tampered = token[:-4] + "XXXX"
        result = verify_refresh_token(tampered)
        assert result is None

    def test_random_string_returns_none(self):
        result = verify_refresh_token("not.a.jwt")
        assert result is None


# ===========================================================================
# security.py — verify_token (access)
# ===========================================================================


class TestVerifyToken:
    def test_valid_access_token_returns_subject(self):
        token = create_access_token("user-abc")
        result = verify_token(token)
        assert result == "user-abc"

    def test_refresh_token_rejected_by_verify_token(self):
        """A refresh token must NOT be accepted as an access token."""
        refresh = create_refresh_token("user-abc")
        result = verify_token(refresh)
        assert result is None

    def test_expired_access_token_returns_none(self):
        from app.config import settings

        payload = {
            "sub": "user-exp",
            "exp": int(time.time()) - 1,
            "type": "access",
        }
        expired_token = jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)
        result = verify_token(expired_token)
        assert result is None


# ===========================================================================
# sms.py — verify_otp (mocked Redis)
# ===========================================================================


class TestVerifyOtp:
    @pytest.mark.asyncio
    async def test_correct_code_returns_true(self):
        # Redis is configured with decode_responses=True so values are plain strings.
        redis_mock = AsyncMock()
        redis_mock.get.return_value = "123456"
        redis_mock.delete = AsyncMock()

        result = await verify_otp("+998901234567", "123456", redis_mock)

        assert result is True
        redis_mock.delete.assert_called_once_with("otp:+998901234567")

    @pytest.mark.asyncio
    async def test_wrong_code_returns_false(self):
        redis_mock = AsyncMock()
        redis_mock.get.return_value = "123456"

        result = await verify_otp("+998901234567", "999999", redis_mock)

        assert result is False
        redis_mock.delete.assert_not_called()

    @pytest.mark.asyncio
    async def test_missing_key_returns_false(self):
        redis_mock = AsyncMock()
        redis_mock.get.return_value = None

        result = await verify_otp("+998901234567", "123456", redis_mock)

        assert result is False

    @pytest.mark.asyncio
    async def test_constant_time_comparison_used(self):
        """Verify that secrets.compare_digest is used (timing-safe)."""
        import secrets as _secrets

        redis_mock = AsyncMock()
        redis_mock.get.return_value = "111111"

        with patch.object(_secrets, "compare_digest", wraps=_secrets.compare_digest) as mock_cd:
            await verify_otp("+998901234567", "222222", redis_mock)
            mock_cd.assert_called_once()


# ===========================================================================
# auth.py — cookie helper attributes
# ===========================================================================


class TestCookieHelpers:
    def test_set_auth_cookie_is_httponly(self):
        response = Response()
        token = create_access_token("u1")
        _set_auth_cookie(response, token)

        raw = response.headers.get("set-cookie", "")
        assert "HttpOnly" in raw
        assert "token=" in raw

    def test_set_refresh_cookie_scoped_to_refresh_path(self):
        response = Response()
        token = create_refresh_token("u1")
        _set_refresh_cookie(response, token)

        raw = response.headers.get("set-cookie", "")
        assert "HttpOnly" in raw
        assert "refresh_token=" in raw
        assert "/api/v1/auth/refresh" in raw

    def test_set_auth_cookie_samesite_lax(self):
        response = Response()
        _set_auth_cookie(response, create_access_token("u1"))
        raw = response.headers.get("set-cookie", "")
        assert "SameSite=lax" in raw


# ===========================================================================
# OTP per-IP rate limit — integration-lite with mocked Redis + FastAPI
# ===========================================================================


class TestOtpIpRateLimit:
    """Simulate 11 OTP requests from the same IP and assert the 11th returns 429."""

    def _make_app(self):
        """Build a minimal FastAPI app that wires the auth router with mocked deps.

        We load the auth module directly (not via routers/__init__.py) to avoid
        pulling in heavy optional deps like celery and boto3.
        """
        from fastapi import FastAPI

        app = FastAPI()
        app.include_router(_auth_mod.router, prefix="/api/v1")
        return app

    def test_eleventh_request_returns_429(self):
        import asyncio

        # We use a plain dict to simulate Redis counters (no real Redis needed).
        counters: dict[str, int] = {}

        class FakeRedis:
            async def get(self, key: str):
                # decode_responses=True → return strings, not bytes
                val = counters.get(key, 0)
                return str(val) if val else None

            async def incr(self, key: str) -> int:
                counters[key] = counters.get(key, 0) + 1
                return counters[key]

            async def expire(self, key: str, ttl: int) -> None:
                pass  # no-op in tests

            async def set(self, key: str, value: str, ex: int = 0) -> None:
                counters[key] = value  # type: ignore[assignment]

            def pipeline(self):
                return FakePipeline(self)

        class FakePipeline:
            def __init__(self, redis: FakeRedis):
                self._redis = redis
                self._cmds: list = []

            async def incr(self, key: str) -> None:
                self._cmds.append(("incr", key))

            async def expire(self, key: str, ttl: int) -> None:
                self._cmds.append(("expire", key, ttl))

            async def execute(self):
                results = []
                for cmd in self._cmds:
                    if cmd[0] == "incr":
                        results.append(await self._redis.incr(cmd[1]))
                    else:
                        results.append(None)
                self._cmds.clear()
                return results

        fake_redis = FakeRedis()

        # Use patch.object on the already-loaded module object to avoid triggering
        # app/routers/__init__.py which imports heavy optional deps (celery, boto3).
        with patch.object(_auth_mod, "get_redis", return_value=fake_redis):
            with patch.object(_auth_mod, "send_otp", new=AsyncMock(return_value=True)):
                with patch.object(_auth_mod, "store_otp", new=AsyncMock()):
                    app = self._make_app()
                    client = TestClient(app, raise_server_exceptions=False)

                    responses = []
                    for i in range(11):
                        # Use a unique phone per request so the per-phone limit (3)
                        # is never triggered — we are testing only the per-IP limit (10).
                        phone = f"+99890{i:07d}"
                        r = client.post(
                            "/api/v1/auth/otp/request",
                            json={"phone": phone},
                            headers={"X-Real-IP": "192.168.1.1"},
                        )
                        responses.append(r.status_code)

        # First 10 should succeed (200), the 11th should be 429
        assert all(s == 200 for s in responses[:10]), f"Expected 200s, got {responses[:10]}"
        assert responses[10] == 429, f"Expected 429 on request 11, got {responses[10]}"
