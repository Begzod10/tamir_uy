from __future__ import annotations

import json
from typing import Any, Optional

from redis.asyncio import Redis

from app.config import settings

_redis_client: Optional[Redis] = None


def get_redis() -> Redis:
    """Return (and lazily create) the shared async Redis client singleton."""
    global _redis_client
    if _redis_client is None:
        _redis_client = Redis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis_client


async def cache_get(key: str) -> Optional[Any]:
    """Return the cached value for *key*, or *None* if missing / expired."""
    redis = get_redis()
    raw = await redis.get(key)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return raw


async def cache_set(key: str, value: Any, ttl: int = 300) -> None:
    """Serialize *value* to JSON and store it under *key* with *ttl* seconds."""
    redis = get_redis()
    serialized = json.dumps(value, default=str)
    await redis.set(key, serialized, ex=ttl)


async def cache_delete(key: str) -> None:
    """Remove *key* from the cache."""
    redis = get_redis()
    await redis.delete(key)
