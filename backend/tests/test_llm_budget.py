"""Unit tests for per-user daily AI budget guard (app/services/llm.py).

All tests use FakeRedis — no real Redis required.
"""
from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-tests-only-32chars!!")
os.environ.setdefault("AI_FEATURES_ENABLED", "true")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")

import pytest
from fakeredis.aioredis import FakeRedis as AsyncFakeRedis
from unittest.mock import patch

from app.services.llm import (
    BudgetExceededError,
    BUILDER_DAILY_LIMIT,
    EXPLAINER_DAILY_LIMIT,
    check_and_increment_budget,
)


@pytest.fixture
def fake_redis():
    return AsyncFakeRedis()


@pytest.mark.asyncio
async def test_first_call_allowed(fake_redis):
    with patch("app.services.llm.get_redis", return_value=fake_redis):
        await check_and_increment_budget("u1", "explainer")


@pytest.mark.asyncio
async def test_explainer_exceeds_limit(fake_redis):
    with patch("app.services.llm.get_redis", return_value=fake_redis):
        for _ in range(EXPLAINER_DAILY_LIMIT):
            await check_and_increment_budget("u2", "explainer")

        with pytest.raises(BudgetExceededError):
            await check_and_increment_budget("u2", "explainer")


@pytest.mark.asyncio
async def test_builder_exceeds_limit(fake_redis):
    with patch("app.services.llm.get_redis", return_value=fake_redis):
        for _ in range(BUILDER_DAILY_LIMIT):
            await check_and_increment_budget("u3", "builder")

        with pytest.raises(BudgetExceededError):
            await check_and_increment_budget("u3", "builder")


@pytest.mark.asyncio
async def test_error_message_is_uzbek(fake_redis):
    with patch("app.services.llm.get_redis", return_value=fake_redis):
        for _ in range(BUILDER_DAILY_LIMIT):
            await check_and_increment_budget("u4", "builder")

        with pytest.raises(BudgetExceededError) as exc_info:
            await check_and_increment_budget("u4", "builder")

        msg = str(exc_info.value)
        assert "Bugun" in msg or "ertaga" in msg.lower()


@pytest.mark.asyncio
async def test_different_users_are_independent(fake_redis):
    with patch("app.services.llm.get_redis", return_value=fake_redis):
        for _ in range(BUILDER_DAILY_LIMIT):
            await check_and_increment_budget("u5", "builder")

        # u6 is a separate user — must not be blocked
        await check_and_increment_budget("u6", "builder")


@pytest.mark.asyncio
async def test_builder_and_explainer_pools_are_separate(fake_redis):
    with patch("app.services.llm.get_redis", return_value=fake_redis):
        for _ in range(BUILDER_DAILY_LIMIT):
            await check_and_increment_budget("u7", "builder")

        # exhausting builder must not affect explainer for same user
        await check_and_increment_budget("u7", "explainer")
