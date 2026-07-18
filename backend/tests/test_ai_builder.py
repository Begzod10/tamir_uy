"""Unit tests for the AI room-builder service (app/services/ai_builder.py).

Tests use a mocked Anthropic client — no real API calls or database.
"""
from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-tests-only-32chars!!")
os.environ.setdefault("AI_FEATURES_ENABLED", "true")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.ai_builder import (
    MAX_CONSECUTIVE_FAILURES,
    MAX_TOOL_CALLS,
    RoomDraft,
    run_ai_builder,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

FAKE_ROOM_STATE = {
    "id": "room-1",
    "name": "Yotoqxona",
    "ceiling_h": 2.7,
    "geometry": {
        "walls": [
            {"id": "A", "length": 4.0, "elements": []},
            {"id": "B", "length": 3.0, "elements": []},
            {"id": "C", "length": 4.0, "elements": []},
            {"id": "D", "length": 3.0, "elements": []},
        ]
    },
    "surfaces": {},
    "furniture_layout": [],
}

_MAT_BOYOQ_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
_MAT_LAMINAT_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
_FURN_DIVAN_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc"

FAKE_MATERIALS = {
    "boyoq": [
        {"id": _MAT_BOYOQ_ID, "name_uz": "Oq boyoq", "category": "boyoq", "unit": "litr", "price_uzs": 80000, "color_hex": "#FFFFFF"},
    ],
    "laminat": [
        {"id": _MAT_LAMINAT_ID, "name_uz": "Yong'och laminat", "category": "laminat", "unit": "m2", "price_uzs": 120000, "color_hex": None},
    ],
}

FAKE_FURNITURE = [
    {"id": _FURN_DIVAN_ID, "name_uz": "Divan", "category": "sofa", "footprint_w": 200.0, "footprint_d": 90.0, "price_uzs": 2000000},
]


def _make_mock_llm_response(stop_reason: str = "end_turn", tool_calls: list | None = None, text: str = "Tayyor."):
    """Create a fake anthropic Message response."""
    content = []
    if tool_calls:
        for tc in tool_calls:
            block = MagicMock()
            block.type = "tool_use"
            block.id = f"tool-{tc['name']}"
            block.name = tc["name"]
            block.input = tc.get("input", {})
            content.append(block)
    else:
        block = MagicMock()
        block.type = "text"
        block.text = text
        content.append(block)

    response = MagicMock()
    response.content = content
    response.stop_reason = stop_reason
    response.usage = MagicMock(input_tokens=100, output_tokens=50)
    return response


async def _collect(gen) -> list[dict]:
    """Drain an async generator of SSE lines and parse them."""
    events = []
    async for line in gen:
        if line.startswith("data: "):
            events.append(json.loads(line[6:]))
    return events


async def _noop_estimate(draft: RoomDraft) -> dict:
    return {"total_uzs": 1000000, "total_min": 900000, "total_max": 1100000, "lines": []}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_done_on_no_tool_calls():
    """When the LLM returns text only, stream ends with a 'done' event."""
    mock_response = _make_mock_llm_response(text="Xona tayyor!")

    with patch("app.services.ai_builder.call_llm", new=AsyncMock(return_value=mock_response)):
        events = await _collect(run_ai_builder(
            user_id="u1",
            prompt="Xonani bezat",
            room_state=FAKE_ROOM_STATE,
            materials_by_category=FAKE_MATERIALS,
            furniture_list=FAKE_FURNITURE,
            estimate_fn=_noop_estimate,
        ))

    types = [e["type"] for e in events]
    assert "done" in types
    done = next(e for e in events if e["type"] == "done")
    assert "patch" in done


@pytest.mark.asyncio
async def test_invalid_material_id_rejected():
    """apply_material with a hallucinated material_id fails and increments failure counter."""
    call_count = 0

    async def _fake_llm(**kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return _make_mock_llm_response(
                tool_calls=[{
                    "name": "apply_material",
                    "input": {
                        "surface_ids": ["A"],
                        "material_id": "00000000-0000-0000-0000-000000000000",
                    },
                }]
            )
        # Second call: return text (loop ends)
        return _make_mock_llm_response(text="Material topilmadi, boshqa variant sinab ko'rin.")

    with patch("app.services.ai_builder.call_llm", new=AsyncMock(side_effect=_fake_llm)):
        events = await _collect(run_ai_builder(
            user_id="u2",
            prompt="Devorgа oq boyoq sur",
            room_state=FAKE_ROOM_STATE,
            materials_by_category=FAKE_MATERIALS,
            furniture_list=FAKE_FURNITURE,
            estimate_fn=_noop_estimate,
        ))

    # There must be a tool_result event showing the rejection
    results = [e for e in events if e["type"] == "tool_result" and e["name"] == "apply_material"]
    assert results, "Expected tool_result for apply_material"
    assert results[0]["ok"] is False


@pytest.mark.asyncio
async def test_draft_not_persisted():
    """Draft is never written to DB — the patch is only returned in the SSE 'done' event."""
    apply_input = {
        "surface_ids": ["A", "B"],
        "material_id": _MAT_BOYOQ_ID,
    }
    call_count = 0

    async def _fake_llm(**kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return _make_mock_llm_response(tool_calls=[{"name": "apply_material", "input": apply_input}])
        return _make_mock_llm_response(text="Material qo'llandi.")

    with patch("app.services.ai_builder.call_llm", new=AsyncMock(side_effect=_fake_llm)):
        events = await _collect(run_ai_builder(
            user_id="u3",
            prompt="A va B devorgа boyoq sur",
            room_state=FAKE_ROOM_STATE,
            materials_by_category=FAKE_MATERIALS,
            furniture_list=FAKE_FURNITURE,
            estimate_fn=_noop_estimate,
        ))

    done = next((e for e in events if e["type"] == "done"), None)
    assert done is not None
    patch_data = done.get("patch", {})
    # surfaces should be in patch, not already in room_state
    assert patch_data.get("surfaces", {}).get("A") == _MAT_BOYOQ_ID
    assert FAKE_ROOM_STATE["surfaces"].get("A") is None  # original untouched


@pytest.mark.asyncio
async def test_consecutive_failure_cap():
    """3 consecutive tool failures trigger an error event and stop the loop."""
    call_count = 0

    async def _fake_llm(**kwargs):
        nonlocal call_count
        call_count += 1
        return _make_mock_llm_response(
            tool_calls=[{
                "name": "apply_material",
                "input": {
                    "surface_ids": ["A"],
                    "material_id": "not-a-real-uuid",
                },
            }]
        )

    with patch("app.services.ai_builder.call_llm", new=AsyncMock(side_effect=_fake_llm)):
        events = await _collect(run_ai_builder(
            user_id="u4",
            prompt="Bad request",
            room_state=FAKE_ROOM_STATE,
            materials_by_category=FAKE_MATERIALS,
            furniture_list=FAKE_FURNITURE,
            estimate_fn=_noop_estimate,
        ))

    error_events = [e for e in events if e["type"] == "error"]
    assert error_events, "Expected an error event after consecutive failures"
    # Loop must have stopped — LLM should not be called more than MAX_CONSECUTIVE_FAILURES+1 times
    assert call_count <= MAX_CONSECUTIVE_FAILURES + 1


@pytest.mark.asyncio
async def test_furniture_placement_out_of_bounds_rejected():
    """place_furniture with x,y outside room bounds returns ok=False."""
    call_count = 0

    async def _fake_llm(**kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return _make_mock_llm_response(
                tool_calls=[{
                    "name": "place_furniture",
                    "input": {"furniture_id": _FURN_DIVAN_ID, "x": 99.0, "y": 99.0},
                }]
            )
        return _make_mock_llm_response(text="Pozitsiya to'g'irlanadi.")

    with patch("app.services.ai_builder.call_llm", new=AsyncMock(side_effect=_fake_llm)):
        events = await _collect(run_ai_builder(
            user_id="u5",
            prompt="Divanni qo'y",
            room_state=FAKE_ROOM_STATE,
            materials_by_category=FAKE_MATERIALS,
            furniture_list=FAKE_FURNITURE,
            estimate_fn=_noop_estimate,
        ))

    placement_results = [
        e for e in events
        if e["type"] == "tool_result" and e["name"] == "place_furniture"
    ]
    assert placement_results
    assert placement_results[0]["ok"] is False
