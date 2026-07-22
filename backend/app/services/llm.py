"""Shared async LLM service layer (OpenAI backend).

All LLM calls go through `call_llm()`.  The budget guard enforces per-user
daily call limits stored in Redis.  When the limit is exceeded it raises
`BudgetExceededError` whose message is Uzbek so it can be shown directly to
the user.

This module talks to the **OpenAI API** (openai SDK).
"""
from __future__ import annotations

import asyncio
import datetime
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

import structlog
from openai import AsyncOpenAI, APIError

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


# ---------------------------------------------------------------------------
# Anthropic-compatible response shim
# ---------------------------------------------------------------------------

@dataclass
class TextBlock:
    text: str
    type: str = "text"


@dataclass
class ToolUseBlock:
    name: str
    input: dict
    id: str = field(default_factory=lambda: "call_" + uuid.uuid4().hex[:12])
    type: str = "tool_use"


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0


@dataclass
class LLMMessage:
    content: list
    usage: Usage = field(default_factory=Usage)


# ---------------------------------------------------------------------------
# Budget guard
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# OpenAI client
# ---------------------------------------------------------------------------

_client: Optional[AsyncOpenAI] = None


def get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _client


# ---------------------------------------------------------------------------
# Format translation: Anthropic-style <-> OpenAI
# ---------------------------------------------------------------------------

def _to_openai_tools(tools: list[dict]) -> list[dict]:
    """Convert Anthropic-style tools to OpenAI format."""
    openai_tools = []
    for tool in tools:
        openai_tools.append({
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool.get("description", ""),
                "parameters": tool.get("input_schema", {"type": "object", "properties": {}})
            }
        })
    return openai_tools


def _to_openai_messages(messages: list[dict]) -> list[dict]:
    """Convert Anthropic-style messages to OpenAI format."""
    openai_messages = []

    for msg in messages:
        role = msg["role"]
        content = msg["content"]

        if role == "user":
            if isinstance(content, str):
                openai_messages.append({"role": "user", "content": content})
            else:
                # Handle tool results and text
                import json
                text_content = None
                tool_results = []

                for item in content:
                    if isinstance(item, dict):
                        if item.get("type") == "tool_result":
                            tool_results.append({
                                "type": "tool_result",
                                "tool_use_id": item.get("tool_use_id"),
                                "content": item.get("content", "")
                            })
                        elif item.get("type") == "text":
                            text_content = item.get("text", "")

                msg = {"role": "user"}
                if text_content:
                    msg["content"] = text_content
                elif tool_results:
                    msg["content"] = tool_results
                else:
                    msg["content"] = ""

                openai_messages.append(msg)

        elif role == "assistant":
            if isinstance(content, str):
                openai_messages.append({"role": "assistant", "content": content})
            else:
                # Handle tool calls and text
                import json
                text_content = None
                tool_calls = []

                for block in content:
                    if hasattr(block, "type"):
                        if block.type == "text":
                            text_content = block.text
                        elif block.type == "tool_use":
                            tool_calls.append({
                                "id": block.id,
                                "type": "function",
                                "function": {
                                    "name": block.name,
                                    "arguments": json.dumps(block.input) if isinstance(block.input, dict) else block.input
                                }
                            })

                msg = {"role": "assistant"}
                if text_content:
                    msg["content"] = text_content
                else:
                    msg["content"] = None
                if tool_calls:
                    msg["tool_calls"] = tool_calls

                openai_messages.append(msg)

    return openai_messages


def _from_openai_response(resp: Any) -> LLMMessage:
    """Convert OpenAI response to Anthropic-compatible format."""
    blocks: list[Any] = []

    choice = resp.choices[0] if resp.choices else None
    if choice and choice.message:
        # Handle text content
        if choice.message.content:
            blocks.append(TextBlock(text=choice.message.content))

        # Handle tool calls
        if choice.message.tool_calls:
            for tool_call in choice.message.tool_calls:
                if tool_call.type == "function":
                    import json
                    args = tool_call.function.arguments
                    if isinstance(args, str):
                        args = json.loads(args)
                    blocks.append(ToolUseBlock(
                        name=tool_call.function.name,
                        input=args,
                        id=tool_call.id
                    ))

    # Extract usage
    usage = Usage(
        input_tokens=resp.usage.prompt_tokens if resp.usage else 0,
        output_tokens=resp.usage.completion_tokens if resp.usage else 0,
    )

    return LLMMessage(content=blocks, usage=usage)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def call_llm(
    *,
    model: str,
    system: str,
    messages: list[dict],
    tools: Optional[list[dict]] = None,
    max_tokens: int = 4096,
    user_id: Optional[str] = None,
    model_type: str = "explainer",
) -> LLMMessage:
    """Call the OpenAI API with exponential backoff (3 attempts).

    Args:
        model:      OpenAI model ID (e.g. "gpt-4-turbo").
        system:     System prompt.
        messages:   Anthropic-style conversation messages.
        tools:      Optional Anthropic-style tool definitions for agentic loops.
        max_tokens: Maximum response tokens.
        user_id:    When provided, the per-user daily budget is checked and
                    incremented before making the call.
        model_type: "builder" | "explainer" — selects the budget pool.

    Returns:
        An Anthropic-compatible `LLMMessage` (`.content` blocks + `.usage`).
    """
    if not settings.AI_FEATURES_ENABLED:
        raise RuntimeError("AI features are disabled on this deployment.")

    if user_id:
        await check_and_increment_budget(user_id, model_type)

    client = get_client()

    # Build message history
    message_history = _to_openai_messages(messages)

    # Add system message
    if system:
        message_history.insert(0, {"role": "system", "content": system})

    kwargs: dict[str, Any] = {
        "model": model,
        "messages": message_history,
        "max_tokens": max_tokens,
    }

    if tools:
        kwargs["tools"] = _to_openai_tools(tools)

    last_exc: Optional[Exception] = None
    for attempt in range(3):
        try:
            resp = await client.chat.completions.create(**kwargs)
            message = _from_openai_response(resp)
            log.info(
                "llm.call_ok",
                model=model,
                input_tokens=message.usage.input_tokens,
                output_tokens=message.usage.output_tokens,
                user_id=user_id,
                model_type=model_type,
            )
            return message
        except APIError as exc:
            code = getattr(exc, "status_code", None)
            if code == 429 or (isinstance(code, int) and code >= 500):
                last_exc = exc
                log.warning(
                    "llm.retryable_error", attempt=attempt, code=code, model=model
                )
                await asyncio.sleep(2**attempt)
            else:
                raise

    raise last_exc  # type: ignore[misc]
