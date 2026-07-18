"""Shared async LLM service layer.

All Anthropic API calls go through `call_llm()`.  The budget guard enforces
per-user daily call limits stored in Redis.  When the limit is exceeded it
raises `BudgetExceededError` whose message is Uzbek so it can be shown
directly to the user.

Limits (configurable via module constants):
  - builder  : BUILDER_DAILY_LIMIT  calls / user / day
  - explainer: EXPLAINER_DAILY_LIMIT calls / user / day
"""
from __future__ import annotations

import asyncio
import datetime
from typing import Optional

import anthropic
import structlog

from app.config import settings
from app.core.cache import get_redis

log = structlog.get_logger(__name__)

BUILDER_DAILY_LIMIT: int = 5
EXPLAINER_DAILY_LIMIT: int = 50

_OVER_LIMIT_UZ = (
    "Bugun AI so'rovlar limiti tugadi. Ertaga qayta urinib ko'ring."
)


class BudgetExceededError(Exception):
    """Raised when the user exceeds their daily AI request budget."""

    def __init__(self) -> None:
        super().__init__(_OVER_LIMIT_UZ)


def _budget_key(user_id: str, model_type: str) -> str:
    day = datetime.date.today().isoformat()
    return f"ai_budget:{user_id}:{model_type}:{day}"


async def check_and_increment_budget(user_id: str, model_type: str) -> None:
    """Atomically increment the daily counter; raise if limit exceeded."""
    limit = BUILDER_DAILY_LIMIT if model_type == "builder" else EXPLAINER_DAILY_LIMIT
    key = _budget_key(user_id, model_type)
    redis = get_redis()

    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 86400)

    if count > limit:
        raise BudgetExceededError()


_client: Optional[anthropic.AsyncAnthropic] = None


def get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client


async def call_llm(
    *,
    model: str,
    system: str,
    messages: list[dict],
    tools: Optional[list[dict]] = None,
    max_tokens: int = 4096,
    user_id: Optional[str] = None,
    model_type: str = "explainer",
) -> anthropic.types.Message:
    """Call the Anthropic API with exponential backoff (3 attempts).

    Args:
        model:      Anthropic model ID.
        system:     System prompt.
        messages:   Conversation messages.
        tools:      Optional tool definitions for agentic loops.
        max_tokens: Maximum response tokens.
        user_id:    When provided, the per-user daily budget is checked and
                    decremented before making the call.
        model_type: "builder" | "explainer" — selects the budget pool.
    """
    if not settings.AI_FEATURES_ENABLED:
        raise RuntimeError("AI features are disabled on this deployment.")

    if user_id:
        await check_and_increment_budget(user_id, model_type)

    client = get_client()
    kwargs: dict = {
        "model": model,
        "system": system,
        "messages": messages,
        "max_tokens": max_tokens,
    }
    if tools:
        kwargs["tools"] = tools

    last_exc: Optional[Exception] = None
    for attempt in range(3):
        try:
            response = await client.messages.create(**kwargs)
            log.info(
                "llm.call_ok",
                model=model,
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
                user_id=user_id,
                model_type=model_type,
            )
            return response
        except anthropic.RateLimitError as exc:
            last_exc = exc
            log.warning("llm.rate_limited", attempt=attempt, model=model)
            await asyncio.sleep(2**attempt)
        except anthropic.APIStatusError as exc:
            if exc.status_code >= 500:
                last_exc = exc
                log.warning("llm.server_error", attempt=attempt, status=exc.status_code)
                await asyncio.sleep(2**attempt)
            else:
                raise

    raise last_exc  # type: ignore[misc]
