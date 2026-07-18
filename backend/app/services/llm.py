"""Shared async LLM service layer (Google Gemini backend).

All LLM calls go through `call_llm()`.  The budget guard enforces per-user
daily call limits stored in Redis.  When the limit is exceeded it raises
`BudgetExceededError` whose message is Uzbek so it can be shown directly to
the user.

This module talks to the **Gemini API** (google-genai SDK) but exposes an
Anthropic-compatible response shape (`.content` blocks with `.type` / `.text`
/ `.name` / `.input` / `.id`, plus `.usage`).  That lets the agentic
room-builder loop and the smeta explainer keep using the same block-handling
code they were written against — all provider translation is contained here.

Limits (configurable via module constants):
  - builder  : BUILDER_DAILY_LIMIT  calls / user / day
  - explainer: EXPLAINER_DAILY_LIMIT calls / user / day
"""
from __future__ import annotations

import asyncio
import datetime
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

import structlog
from google import genai
from google.genai import errors as genai_errors
from google.genai import types

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
# The room-builder loop and smeta handler expect a response object whose
# `.content` is a list of blocks, each with a `.type` of "text" or "tool_use".
# We reproduce exactly that surface on top of Gemini's response.


@dataclass
class TextBlock:
    text: str
    type: str = "text"
    # Gemini 3 thinking models attach a signature to parts; it must be echoed
    # back verbatim when the turn is replayed in history.
    thought_signature: Optional[bytes] = None


@dataclass
class ToolUseBlock:
    name: str
    input: dict
    id: str = field(default_factory=lambda: "call_" + uuid.uuid4().hex[:12])
    type: str = "tool_use"
    # Required by Gemini 3 when this function_call is replayed in history.
    thought_signature: Optional[bytes] = None


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
# Gemini client
# ---------------------------------------------------------------------------

_client: Optional[genai.Client] = None


def get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _client


# ---------------------------------------------------------------------------
# Format translation: Anthropic-style <-> Gemini
# ---------------------------------------------------------------------------

_TYPE_MAP = {
    "object": "OBJECT",
    "string": "STRING",
    "number": "NUMBER",
    "integer": "INTEGER",
    "boolean": "BOOLEAN",
    "array": "ARRAY",
}


def _to_gemini_schema(js: Optional[dict]) -> Optional[types.Schema]:
    """Convert a JSON-schema dict (Anthropic input_schema) to a Gemini Schema.

    Returns None for an object with no properties (a no-argument tool), so the
    caller can omit `parameters` entirely — Gemini rejects empty OBJECT schemas.
    """
    if not js:
        return None
    t = _TYPE_MAP.get(js.get("type", "object"), "OBJECT")

    if t == "OBJECT":
        props = js.get("properties") or {}
        if not props:
            return None
        kw: dict[str, Any] = {
            "type": "OBJECT",
            "properties": {k: _to_gemini_schema(v) for k, v in props.items()},
        }
        if js.get("required"):
            kw["required"] = list(js["required"])
        if js.get("description"):
            kw["description"] = js["description"]
        return types.Schema(**kw)

    kw = {"type": t}
    if js.get("description"):
        kw["description"] = js["description"]
    if js.get("enum"):
        kw["enum"] = list(js["enum"])
    if t == "ARRAY" and js.get("items"):
        kw["items"] = _to_gemini_schema(js["items"])
    return types.Schema(**kw)


def _to_gemini_tools(tools: list[dict]) -> list[types.Tool]:
    decls: list[types.FunctionDeclaration] = []
    for t in tools:
        params = _to_gemini_schema(t.get("input_schema"))
        decls.append(
            types.FunctionDeclaration(
                name=t["name"],
                description=t.get("description", ""),
                parameters=params,
            )
        )
    return [types.Tool(function_declarations=decls)]


def _to_gemini_contents(messages: list[dict]) -> list[types.Content]:
    """Convert Anthropic-style message history to Gemini `contents`.

    Anthropic tool results reference the tool_use *id*; Gemini function
    responses need the function *name*, so we first map id -> name from the
    assistant tool_use blocks that appear earlier in the conversation.
    """
    id_to_name: dict[str, str] = {}
    for m in messages:
        content = m.get("content")
        if isinstance(content, list):
            for b in content:
                if getattr(b, "type", None) == "tool_use":
                    id_to_name[b.id] = b.name

    contents: list[types.Content] = []
    for m in messages:
        role = m["role"]
        content = m["content"]

        if role == "user":
            if isinstance(content, str):
                contents.append(
                    types.Content(role="user", parts=[types.Part(text=content)])
                )
                continue
            # list of tool_result / text dicts
            parts: list[types.Part] = []
            for item in content:
                if isinstance(item, dict) and item.get("type") == "tool_result":
                    name = id_to_name.get(item.get("tool_use_id", ""), "tool")
                    parts.append(
                        types.Part.from_function_response(
                            name=name,
                            response={"result": item.get("content", "")},
                        )
                    )
                elif isinstance(item, dict) and item.get("type") == "text":
                    parts.append(types.Part(text=item.get("text", "")))
            if parts:
                contents.append(types.Content(role="user", parts=parts))

        elif role == "assistant":
            parts = []
            if isinstance(content, str):
                parts.append(types.Part(text=content))
            else:
                for b in content:
                    bt = getattr(b, "type", None)
                    if bt == "text":
                        parts.append(
                            types.Part(
                                text=b.text,
                                thought_signature=getattr(b, "thought_signature", None),
                            )
                        )
                    elif bt == "tool_use":
                        parts.append(
                            types.Part(
                                function_call=types.FunctionCall(
                                    name=b.name, args=b.input or {}
                                ),
                                thought_signature=getattr(b, "thought_signature", None),
                            )
                        )
            if parts:
                contents.append(types.Content(role="model", parts=parts))

    return contents


def _from_gemini_response(resp: Any) -> LLMMessage:
    blocks: list[Any] = []
    candidates = getattr(resp, "candidates", None) or []
    if candidates:
        cand_content = getattr(candidates[0], "content", None)
        parts = getattr(cand_content, "parts", None) or [] if cand_content else []
        for p in parts:
            sig = getattr(p, "thought_signature", None)
            fc = getattr(p, "function_call", None)
            if fc is not None:
                args = dict(fc.args) if fc.args else {}
                blocks.append(ToolUseBlock(name=fc.name, input=args, thought_signature=sig))
                continue
            text = getattr(p, "text", None)
            if text:
                blocks.append(TextBlock(text=text, thought_signature=sig))

    um = getattr(resp, "usage_metadata", None)
    usage = Usage(
        input_tokens=getattr(um, "prompt_token_count", 0) or 0,
        output_tokens=getattr(um, "candidates_token_count", 0) or 0,
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
    """Call the Gemini API with exponential backoff (3 attempts).

    Args:
        model:      Gemini model ID (e.g. "gemini-2.5-pro").
        system:     System prompt (sent as system_instruction).
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
    contents = _to_gemini_contents(messages)

    config_kwargs: dict[str, Any] = {
        "system_instruction": system,
        "max_output_tokens": max_tokens,
    }
    if tools:
        config_kwargs["tools"] = _to_gemini_tools(tools)
        # We handle tool execution ourselves; keep the SDK from trying to.
        config_kwargs["automatic_function_calling"] = (
            types.AutomaticFunctionCallingConfig(disable=True)
        )
    config = types.GenerateContentConfig(**config_kwargs)

    last_exc: Optional[Exception] = None
    for attempt in range(3):
        try:
            resp = await client.aio.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )
            message = _from_gemini_response(resp)
            log.info(
                "llm.call_ok",
                model=model,
                input_tokens=message.usage.input_tokens,
                output_tokens=message.usage.output_tokens,
                user_id=user_id,
                model_type=model_type,
            )
            return message
        except genai_errors.APIError as exc:
            code = getattr(exc, "code", None)
            if code == 429 or (isinstance(code, int) and code >= 500):
                last_exc = exc
                log.warning(
                    "llm.retryable_error", attempt=attempt, code=code, model=model
                )
                await asyncio.sleep(2**attempt)
            else:
                raise

    raise last_exc  # type: ignore[misc]
