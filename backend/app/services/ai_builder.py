"""Room-builder agentic service.

Implements an agentic LLM tool-use loop that builds/edits a room on behalf
of the user.  All changes accumulate in a RoomDraft; nothing is persisted until
the frontend user presses "Qo'llash" (Apply).

Limits enforced here:
  - MAX_TOOL_CALLS  : 25  (prevents runaway loops)
  - MAX_CONSECUTIVE_FAILURES : 3  (stops on repeated invalid calls)

The budget guard (per-user daily limit) is enforced inside call_llm().
"""
from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Awaitable, Callable

import structlog

from app.config import settings
from app.services.llm import call_llm

log = structlog.get_logger(__name__)

MAX_TOOL_CALLS = 25
MAX_CONSECUTIVE_FAILURES = 3

_SYSTEM_PROMPT = """Siz UyTamir ilovasi uchun xona dizayn assistentisiz.
Foydalanuvchi o'zbek tilida yozadi va siz ham O'zbek tilida javob berasiz.

Qoidalar (MAJBURIY):
1. Faqat list_materials va list_furniture toollaridan olingan real ID lardan foydalaning.
   Tasavvur qilingan (hallucinated) ID lardan FOYDALANMANG.
2. Narx yoki maydon miqdorini HECH QACHON o'zingiz hisoblang — run_estimate_preview tooldan foydalaning.
3. O'zgarish qilishdan oldin avval get_room_state bilan holatni tekshiring.
4. Draft rejimda ishlaysiz — foydalanuvchi "Qo'llash" ni bosgandan keyingina saqlanadi.
5. Ko'pi bilan 25 ta tool chaqiruv ishlating, keyin natijani xulosalang."""

# ---------------------------------------------------------------------------
# Tool definitions (name/description/input_schema — translated to the
# provider's function-calling format inside app/services/llm.py)
# ---------------------------------------------------------------------------

TOOLS: list[dict] = [
    {
        "name": "get_room_state",
        "description": "Xonaning joriy holati: geometriya, materiallar, mebel joylashuvi.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "list_materials",
        "description": "Bazadagi real materiallar ro'yxati. Ixtiyoriy kategoriya filtrdan foydalaning.",
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "enum": [
                        "boyoq", "oboy", "dekorativ", "laminat", "parket",
                        "plitka", "eshik", "deraza", "gips", "sement",
                        "santexnika", "elektr_mat",
                    ],
                }
            },
            "required": [],
        },
    },
    {
        "name": "list_furniture",
        "description": "Katalogdagi mebel ro'yxati. Ixtiyoriy kategoriya filtrdan foydalaning.",
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {"type": "string", "description": "Mebel kategoriyasi (ixtiyoriy)."},
            },
            "required": [],
        },
    },
    {
        "name": "set_room_geometry",
        "description": "Xona o'lchamlarini o'zgartiradi (devor uzunliklari va/yoki shift balandligi).",
        "input_schema": {
            "type": "object",
            "properties": {
                "ceiling_h": {"type": "number", "description": "Shift balandligi metrda (1.8–6.0)."},
                "walls": {
                    "type": "array",
                    "description": "O'zgartiriladigan devorlar: [{id: 'A', length: 4.5}, ...]",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string"},
                            "length": {"type": "number"},
                        },
                        "required": ["id", "length"],
                    },
                },
            },
            "required": [],
        },
    },
    {
        "name": "apply_material",
        "description": "Bir yoki bir nechta yuzaga material qo'llaydi.",
        "input_schema": {
            "type": "object",
            "properties": {
                "surface_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Yuz IDlar: devor IDlari (A, B, C, D), 'floor', 'ceiling'.",
                },
                "material_id": {
                    "type": "string",
                    "description": "list_materials tooldan olingan UUID.",
                },
            },
            "required": ["surface_ids", "material_id"],
        },
    },
    {
        "name": "place_furniture",
        "description": "Mebelni xonaga joylashtiradi. Pozitsiya metrda, xona markazi (0,0).",
        "input_schema": {
            "type": "object",
            "properties": {
                "furniture_id": {
                    "type": "string",
                    "description": "list_furniture tooldan olingan UUID.",
                },
                "x": {"type": "number", "description": "X o'qi bo'yicha pozitsiya (metrda)."},
                "y": {"type": "number", "description": "Y o'qi bo'yicha pozitsiya (metrda)."},
                "rotation": {"type": "number", "description": "Aylanish burchagi gradusda (0–360)."},
            },
            "required": ["furniture_id", "x", "y"],
        },
    },
    {
        "name": "run_estimate_preview",
        "description": "Joriy draft asosida smeta preview ni hisoblaydi va qaytaradi.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
]


# ---------------------------------------------------------------------------
# Draft accumulator
# ---------------------------------------------------------------------------

@dataclass
class RoomDraft:
    """Pending changes — never written to DB until the user confirms."""
    ceiling_h: float | None = None
    wall_lengths: dict[str, float] = field(default_factory=dict)
    surfaces: dict[str, str] = field(default_factory=dict)
    material_colors: dict[str, str] = field(default_factory=dict)  # surface_id -> color_hex
    furniture: list[dict] = field(default_factory=list)

    def to_patch(self) -> dict[str, Any]:
        patch: dict[str, Any] = {}
        if self.ceiling_h is not None:
            patch["ceiling_h"] = self.ceiling_h
        if self.wall_lengths:
            patch["wall_lengths"] = self.wall_lengths
        if self.surfaces:
            patch["surfaces"] = self.surfaces
        if self.material_colors:
            patch["material_colors"] = self.material_colors
        if self.furniture:
            patch["furniture"] = self.furniture
        return patch


# ---------------------------------------------------------------------------
# SSE helper
# ---------------------------------------------------------------------------

def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


# ---------------------------------------------------------------------------
# Main async generator
# ---------------------------------------------------------------------------

async def run_ai_builder(
    *,
    user_id: str,
    prompt: str,
    room_state: dict,
    materials_by_category: dict[str, list[dict]],
    furniture_list: list[dict],
    estimate_fn: Callable[["RoomDraft"], Awaitable[dict]],
) -> AsyncIterator[str]:
    """Yield SSE lines from the agentic builder loop.

    Args:
        user_id:               For budget guard and logging.
        prompt:                User's Uzbek natural-language request.
        room_state:            Serialised current room (geometry, surfaces, furniture).
        materials_by_category: {category: [{id, name_uz, ...}]} — only real DB rows.
        furniture_list:        [{id, name_uz, category, ...}] — only real DB rows.
        estimate_fn:           Async callable(draft) → dict with total_uzs etc.
    """
    draft = RoomDraft()
    messages: list[dict] = [{"role": "user", "content": prompt}]
    tool_call_count = 0
    consecutive_failures = 0

    valid_material_ids: set[str] = {
        m["id"]
        for mats in materials_by_category.values()
        for m in mats
    }
    valid_furniture_ids: set[str] = {f["id"] for f in furniture_list}

    # Room dimensions for bounds checking
    walls = room_state.get("geometry", {}).get("walls", [])
    room_w = next((w["length"] for w in walls if w.get("id") == "A"), 4.0)
    room_d = next((w["length"] for w in walls if w.get("id") == "B"), 3.0)

    async def _handle_tool(name: str, args: dict) -> tuple[str, bool]:
        """Dispatch a single tool call. Returns (result_text, ok)."""
        nonlocal draft

        if name == "get_room_state":
            return json.dumps(room_state, ensure_ascii=False, default=str), True

        if name == "list_materials":
            cat = args.get("category")
            mats = (
                materials_by_category.get(cat, [])
                if cat
                else [m for ms in materials_by_category.values() for m in ms]
            )
            return json.dumps(mats[:60], ensure_ascii=False, default=str), True

        if name == "list_furniture":
            cat = args.get("category")
            items = (
                [f for f in furniture_list if f.get("category") == cat]
                if cat
                else furniture_list
            )
            return json.dumps(items[:60], ensure_ascii=False, default=str), True

        if name == "set_room_geometry":
            ceiling_h = args.get("ceiling_h")
            new_walls: list[dict] = args.get("walls") or []
            if ceiling_h is not None:
                if not (1.8 <= float(ceiling_h) <= 6.0):
                    return "Xato: shift balandligi 1.8–6.0 metr bo'lishi kerak.", False
                draft.ceiling_h = float(ceiling_h)
            for w in new_walls:
                wid = w.get("id")
                wlen = w.get("length")
                if wid and wlen and 0.5 < float(wlen) < 25.0:
                    draft.wall_lengths[str(wid)] = float(wlen)
            return "OK: geometriya draft ga qo'shildi.", True

        if name == "apply_material":
            surface_ids: list[str] = args.get("surface_ids") or []
            material_id: str = str(args.get("material_id", ""))
            if not material_id:
                return "Xato: material_id ko'rsatilmagan.", False
            try:
                uuid.UUID(material_id)
            except ValueError:
                return "Xato: material_id to'g'ri UUID emas.", False
            if material_id not in valid_material_ids:
                return (
                    f"Xato: '{material_id}' — bu material bazada mavjud emas. "
                    "list_materials tooldan haqiqiy ID oling."
                ), False
            # Get material color from the catalog
            material_color = "#FFFFFF"  # default white
            for mats in materials_by_category.values():
                for m in mats:
                    if str(m.get("id")) == material_id:
                        material_color = m.get("color_hex", "#FFFFFF")
                        break
            for sid in surface_ids:
                draft.surfaces[str(sid)] = material_id
                draft.material_colors[str(sid)] = material_color
            return f"OK: {len(surface_ids)} ta yuzga material qo'llandi.", True

        if name == "place_furniture":
            furniture_id: str = str(args.get("furniture_id", ""))
            x = float(args.get("x", 0.0))
            y = float(args.get("y", 0.0))
            rotation = float(args.get("rotation", 0.0))
            if not furniture_id:
                return "Xato: furniture_id ko'rsatilmagan.", False
            if furniture_id not in valid_furniture_ids:
                return (
                    f"Xato: '{furniture_id}' — bu mebel katalogda mavjud emas. "
                    "list_furniture tooldan haqiqiy ID oling."
                ), False
            half_w = room_w / 2
            half_d = room_d / 2
            if not (-half_w <= x <= half_w and -half_d <= y <= half_d):
                return (
                    f"Xato: pozitsiya ({x:.2f}, {y:.2f}) xona tashqarisida. "
                    f"Ruxsat: x ∈ [{-half_w:.1f}, {half_w:.1f}], y ∈ [{-half_d:.1f}, {half_d:.1f}]."
                ), False
            draft.furniture.append({
                "id": str(uuid.uuid4()),
                "furniture_id": furniture_id,
                "x": x,
                "y": y,
                "rotation": rotation,
            })
            return f"OK: mebel joylashtirildi ({furniture_id}).", True

        if name == "run_estimate_preview":
            try:
                result = await estimate_fn(draft)
                summary = {
                    "total_uzs": result.get("total_uzs"),
                    "total_min": result.get("total_min"),
                    "total_max": result.get("total_max"),
                    "lines_count": len(result.get("lines", [])),
                }
                return json.dumps(summary, ensure_ascii=False), True
            except Exception as exc:
                return f"Xato: smeta hisoblashda muammo — {exc}", False

        return f"Xato: noma'lum tool '{name}'.", False

    # ---- Loop -----------------------------------------------------------
    yield _sse({"type": "thinking", "text": "So'rov tahlil qilinmoqda..."})

    while tool_call_count < MAX_TOOL_CALLS:
        try:
            response = await call_llm(
                model=settings.AI_MODEL_BUILDER,
                system=_SYSTEM_PROMPT,
                messages=messages,
                tools=TOOLS,
                max_tokens=4096,
                user_id=user_id,
                model_type="builder",
            )
        except Exception as exc:
            log.error("ai_builder.llm_error", error=str(exc), user_id=user_id)
            yield _sse({"type": "error", "message": str(exc)})
            return

        # Append assistant turn for conversation continuity
        messages.append({"role": "assistant", "content": response.content})

        tool_blocks = [b for b in response.content if b.type == "tool_use"]

        if not tool_blocks:
            text_blocks = [b for b in response.content if b.type == "text"]
            summary = text_blocks[0].text if text_blocks else "Tayyor."
            yield _sse({"type": "done", "summary": summary, "patch": draft.to_patch()})
            return

        tool_results = []
        for block in tool_blocks:
            tool_call_count += 1
            name = block.name
            args = block.input if isinstance(block.input, dict) else {}

            yield _sse({"type": "tool_call", "name": name, "args": args})

            result_text, ok = await _handle_tool(name, args)

            if ok:
                consecutive_failures = 0
            else:
                consecutive_failures += 1
                log.warning(
                    "ai_builder.tool_failure",
                    name=name,
                    consecutive=consecutive_failures,
                    user_id=user_id,
                )
                if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                    yield _sse({
                        "type": "error",
                        "message": (
                            f"Ketma-ket {MAX_CONSECUTIVE_FAILURES} ta xato sodir bo'ldi. "
                            "So'rovni qayta shakllantiring."
                        ),
                    })
                    return

            yield _sse({
                "type": "tool_result",
                "name": name,
                "ok": ok,
                "result": result_text[:500],
            })
            # For OpenAI: append tool result as separate message
            messages.append({
                "role": "tool",
                "tool_call_id": block.id,
                "content": result_text,
            })

    # Tool call cap reached
    yield _sse({
        "type": "done",
        "summary": "Tool chaqiriqlar limiti to'ldi. Quyidagi draft saqlandi.",
        "patch": draft.to_patch(),
    })
