"""15 room fixture tests for compute_estimate.

Uses SimpleNamespace mock objects — no SQLAlchemy or database required.
Geometry wall lengths are in metres (< 100) so the _to_metres heuristic
passes them through unchanged; this keeps fixture maths readable.

Constants used in assertions (mirrors smeta.py):
    ROLL_WIDTH_M  = 1.06
    ROLL_LENGTH_M = 10.05
    ROLL_AREA_M2  = 1.06 * 10.05 = 10.653
    TILE_WASTE    = 1.10
    LAMINAT_WASTE_DEFAULT = 1.07
    PACK_M2       = 2.13
    PLINTH_PIECE_M = 2.5
    PRIMER_RATE_KG_M2 = 0.15   (bag=5 kg)
    PUTTY_RATE_KG_M2  = 1.2    (bag=25 kg)
"""
from __future__ import annotations

import math
from types import SimpleNamespace

import pytest

from app.services.smeta import (
    ROLL_AREA_M2,
    TILE_WASTE,
    LAMINAT_WASTE_DEFAULT,
    PACK_M2,
    PLINTH_PIECE_M,
    WASTE_FACTORS,
    compute_estimate,
)

# ---------------------------------------------------------------------------
# Mock factory helpers
# ---------------------------------------------------------------------------

def _wall(wall_id: str, length_m: float, elements: list | None = None) -> dict:
    """Build a wall dict (geometry in metres, id keyed)."""
    return {"id": wall_id, "length": length_m, "elements": elements or []}


def _elem(elem_type: str, width: float, height: float) -> dict:
    return {"type": elem_type, "width": width, "height": height}


def _room(
    *,
    ceiling_h: float = 2.7,
    floor_area: float = 0.0,
    net_wall_area: float = 0.0,
    perimeter: float = 0.0,
    openings_count: int = 0,
    geometry: dict | None = None,
    surfaces: dict | None = None,
    state: dict | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        ceiling_h=ceiling_h,
        floor_area=floor_area,
        net_wall_area=net_wall_area,
        perimeter=perimeter,
        openings_count=openings_count,
        geometry=geometry or {"walls": []},
        surfaces=surfaces or {},
        state=state or {},
    )


def _material(mid: str, category: str, name_uz: str = "Test", price_uzs: int = 100_000) -> SimpleNamespace:
    return SimpleNamespace(
        id=mid,
        category=category,
        name_uz=name_uz,
        price_uzs=price_uzs,
        store=None,
    )


def _norm(
    material_key: str,
    coverage_per_unit: float = 9.0,
    coats: int = 2,
    waste_factor: float = LAMINAT_WASTE_DEFAULT,
) -> SimpleNamespace:
    return SimpleNamespace(
        material_key=material_key,
        coverage_per_unit=coverage_per_unit,
        coats=coats,
        waste_factor=waste_factor,
    )


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def boyoq_norm() -> SimpleNamespace:
    return _norm("boyoq", coverage_per_unit=9.0, coats=2)


@pytest.fixture
def laminat_norm() -> SimpleNamespace:
    return _norm("laminat", coverage_per_unit=PACK_M2, coats=2, waste_factor=LAMINAT_WASTE_DEFAULT)


@pytest.fixture
def oboy_norm() -> SimpleNamespace:
    """Norm for oboy — not actually used in per-wall computation, but must be present."""
    return _norm("oboy", coverage_per_unit=0.0, coats=0, waste_factor=1.0)


@pytest.fixture
def plitka_norm() -> SimpleNamespace:
    return _norm("plitka", coverage_per_unit=1.0, coats=1)


@pytest.fixture
def paint_mat() -> SimpleNamespace:
    return _material("p1", "boyoq", "Oq bo'yoq", 25_000)


@pytest.fixture
def laminat_mat() -> SimpleNamespace:
    return _material("l1", "laminat", "Laminat 8mm", 120_000)


@pytest.fixture
def tile_mat() -> SimpleNamespace:
    return _material("t1", "plitka", "Kafel 60×60", 85_000)


@pytest.fixture
def oboy_mat() -> SimpleNamespace:
    return _material("o1", "oboy", "Oboy damask", 45_000)


# ---------------------------------------------------------------------------
# Helper to build norms_map
# ---------------------------------------------------------------------------

def _norms(*norms: SimpleNamespace) -> dict:
    return {n.material_key: n for n in norms}


def _mats(*mats: SimpleNamespace) -> dict:
    return {m.id: m for m in mats}


# ---------------------------------------------------------------------------
# Test 1: Simple 4×3 room, no openings, paint walls, laminate floor
# ---------------------------------------------------------------------------

def test_1_simple_paint_laminate(boyoq_norm, laminat_norm, paint_mat, laminat_mat):
    """4×3 room, no openings, all-paint walls, laminate floor."""
    # net_wall_area = (2*(4+3)) * 2.7 = 14 * 2.7 = 37.8 m²
    walls = [_wall("A", 4.0), _wall("B", 3.0), _wall("C", 4.0), _wall("D", 3.0)]
    room = _room(
        ceiling_h=2.7,
        floor_area=12.0,
        net_wall_area=37.8,
        perimeter=14.0,
        geometry={"walls": walls},
        surfaces={"ALL": "p1", "floor": "l1"},
        state={"wallCoverings": {"ALL": {"kind": "paint", "color": "#fff"}}},
    )
    mats = _mats(paint_mat, laminat_mat)
    norms = _norms(boyoq_norm, laminat_norm)

    est = compute_estimate(room, mats, norms)

    # categories present: boyoq(3 lines) + laminat+plintus(2 lines) + elektr(1) = 6
    cats = [ln.category for ln in est.lines]
    assert cats.count("boyoq") == 1
    assert cats.count("grunt") == 1
    assert cats.count("shpatlyovka") == 1
    assert cats.count("laminat") == 1
    assert cats.count("plintus") == 1
    assert cats.count("elektr") == 1
    assert len(est.lines) == 6

    # Spot-check paint qty: ceil(37.8 * 2 / 9.0) = ceil(8.4) = 9 liters
    paint_line = next(ln for ln in est.lines if ln.category == "boyoq")
    assert paint_line.qty == 9.0


# ---------------------------------------------------------------------------
# Test 2: 4×3 room with 1 door + 1 window, paint walls, laminate
# ---------------------------------------------------------------------------

def test_2_paint_laminate_with_openings(boyoq_norm, laminat_norm, paint_mat, laminat_mat):
    """4×3 room, 1 door in wall A (0.9×2.1) + 1 window in wall B (1.2×1.5)."""
    door = _elem("eshik", 0.9, 2.1)
    window = _elem("deraza", 1.2, 1.5)
    walls = [_wall("A", 4.0, [door]), _wall("B", 3.0, [window]), _wall("C", 4.0), _wall("D", 3.0)]
    # openings_area = 0.9*2.1 + 1.2*1.5 = 1.89 + 1.8 = 3.69
    # net_wall_area = 14*2.7 - 3.69 = 37.8 - 3.69 = 34.11
    room = _room(
        ceiling_h=2.7,
        floor_area=12.0,
        net_wall_area=34.11,
        perimeter=14.0,
        openings_count=2,
        geometry={"walls": walls},
        surfaces={"ALL": "p1", "floor": "l1"},
        state={"wallCoverings": {"ALL": {"kind": "paint", "color": "#fff"}}},
    )
    mats = _mats(paint_mat, laminat_mat)
    norms = _norms(boyoq_norm, laminat_norm)

    est = compute_estimate(room, mats, norms)

    assert len(est.lines) == 6

    # Spot-check paint: ceil(34.11 * 2 / 9.0) = ceil(7.58) = 8 liters
    paint_line = next(ln for ln in est.lines if ln.category == "boyoq")
    assert paint_line.qty == 8.0

    # Spot-check plinth: door_m = 0.9, plinth_m = 14 - 0.9 = 13.1, pieces = ceil(13.1/2.5) = 6
    plinth_line = next(ln for ln in est.lines if ln.category == "plintus")
    assert plinth_line.qty == 6.0


# ---------------------------------------------------------------------------
# Test 3: 5×4 room, oboy all walls (damask), tile floor
# ---------------------------------------------------------------------------

def test_3_oboy_all_damask_tile(oboy_norm, tile_mat, oboy_mat):
    """5×4 room, all-oboy (damask) walls, tile floor — 4 oboy lines."""
    walls = [_wall("A", 5.0), _wall("B", 4.0), _wall("C", 5.0), _wall("D", 4.0)]
    room = _room(
        ceiling_h=2.7,
        floor_area=20.0,
        net_wall_area=48.6,
        perimeter=18.0,
        geometry={"walls": walls},
        surfaces={"ALL": "o1", "floor": "t1"},
        state={"wallCoverings": {"ALL": {"kind": "oboy", "patternId": "damask"}}},
    )
    mats = _mats(oboy_mat, tile_mat)
    norms = _norms(oboy_norm)

    est = compute_estimate(room, mats, norms)

    oboy_lines = [ln for ln in est.lines if ln.category == "oboy"]
    assert len(oboy_lines) == 4, "One oboy line per wall A, B, C, D"

    # Total oboy lines: 4 + tile: 1 + elektr: 1 = 6
    assert len(est.lines) == 6

    # Wall A: 5.0 * 2.7 = 13.5, waste=13.5*1.15=15.525, rolls=ceil(15.525/10.653)=2
    wall_a = next(ln for ln in oboy_lines if "devor A" in ln.label)
    assert wall_a.qty == 2.0

    # Wall B: 4.0 * 2.7 = 10.8, waste=10.8*1.15=12.42, rolls=ceil(12.42/10.653)=2
    wall_b = next(ln for ln in oboy_lines if "devor B" in ln.label)
    assert wall_b.qty == 2.0


# ---------------------------------------------------------------------------
# Test 4: Per-wall mixed: A+C oboy(damask), B+D paint, laminate floor
# ---------------------------------------------------------------------------

def test_4_mixed_oboy_paint_laminate(boyoq_norm, laminat_norm, oboy_norm, paint_mat, laminat_mat, oboy_mat):
    """Walls A+C have oboy(damask), walls B+D have paint, laminate floor."""
    walls = [_wall("A", 5.0), _wall("B", 4.0), _wall("C", 5.0), _wall("D", 4.0)]
    room = _room(
        ceiling_h=2.7,
        floor_area=20.0,
        net_wall_area=48.6,
        perimeter=18.0,
        geometry={"walls": walls},
        surfaces={"A": "o1", "C": "o1", "B": "p1", "D": "p1", "floor": "l1"},
        state={
            "wallCoverings": {
                "A": {"kind": "oboy", "patternId": "damask"},
                "B": {"kind": "paint", "color": "#fff"},
                "C": {"kind": "oboy", "patternId": "damask"},
                "D": {"kind": "paint", "color": "#fff"},
            }
        },
    )
    mats = _mats(oboy_mat, paint_mat, laminat_mat)
    norms = _norms(boyoq_norm, laminat_norm, oboy_norm)

    est = compute_estimate(room, mats, norms)

    oboy_lines = [ln for ln in est.lines if ln.category == "oboy"]
    assert len(oboy_lines) == 2, "Only walls A and C produce oboy lines"

    wall_ids_with_oboy = [ln.label for ln in oboy_lines]
    assert any("devor A" in lbl for lbl in wall_ids_with_oboy)
    assert any("devor C" in lbl for lbl in wall_ids_with_oboy)

    # Paint lines (boyoq+grunt+shpatlyovka) should also be present
    assert any(ln.category == "boyoq" for ln in est.lines)
    # Laminat + plintus + elektr
    assert any(ln.category == "laminat" for ln in est.lines)
    # Total: 2 oboy + 3 paint + 2 laminat/plintus + 1 elektr = 8
    assert len(est.lines) == 8


# ---------------------------------------------------------------------------
# Test 5: Zero openings room, all oboy (tekstura)
# ---------------------------------------------------------------------------

def test_5_oboy_tekstura_no_floor(oboy_norm, oboy_mat):
    """3×3 room, all-oboy (tekstura), no floor material."""
    walls = [_wall("A", 3.0), _wall("B", 3.0), _wall("C", 3.0), _wall("D", 3.0)]
    room = _room(
        ceiling_h=2.5,
        floor_area=9.0,
        net_wall_area=30.0,
        perimeter=12.0,
        geometry={"walls": walls},
        surfaces={"ALL": "o1"},
        state={"wallCoverings": {"ALL": {"kind": "oboy", "patternId": "tekstura"}}},
    )
    mats = _mats(oboy_mat)
    norms = _norms(oboy_norm)

    est = compute_estimate(room, mats, norms)

    oboy_lines = [ln for ln in est.lines if ln.category == "oboy"]
    assert len(oboy_lines) == 4

    # Wall A: 3.0 * 2.5 = 7.5 m², tekstura waste=1.05, area=7.875
    # rolls = ceil(7.875 / 10.653) = ceil(0.7394) = 1
    wall_a = next(ln for ln in oboy_lines if "devor A" in ln.label)
    assert wall_a.qty == 1.0

    # No floor material → only oboy(4) + elektr(1) = 5 lines
    assert len(est.lines) == 5


# ---------------------------------------------------------------------------
# Test 6: High ceiling 3.2m room, oboy (yolli)
# ---------------------------------------------------------------------------

def test_6_oboy_yolli_high_ceiling(oboy_norm, oboy_mat):
    """4×3 room, ceiling 3.2 m, all-oboy yolli pattern."""
    walls = [_wall("A", 4.0), _wall("B", 3.0), _wall("C", 4.0), _wall("D", 3.0)]
    room = _room(
        ceiling_h=3.2,
        floor_area=12.0,
        net_wall_area=44.8,
        perimeter=14.0,
        geometry={"walls": walls},
        surfaces={"ALL": "o1"},
        state={"wallCoverings": {"ALL": {"kind": "oboy", "patternId": "yolli"}}},
    )
    mats = _mats(oboy_mat)
    norms = _norms(oboy_norm)

    est = compute_estimate(room, mats, norms)

    oboy_lines = [ln for ln in est.lines if ln.category == "oboy"]
    assert len(oboy_lines) == 4

    # Wall A: 4.0 * 3.2 = 12.8, yolli waste=1.10, gross*waste=14.08
    # rolls = ceil(14.08 / 10.653) = ceil(1.3222) = 2
    wall_a = next(ln for ln in oboy_lines if "devor A" in ln.label)
    assert wall_a.qty == 2.0

    # Wall B: 3.0 * 3.2 = 9.6, waste=10.56
    # rolls = ceil(10.56 / 10.653) = ceil(0.9913) = 1
    wall_b = next(ln for ln in oboy_lines if "devor B" in ln.label)
    assert wall_b.qty == 1.0


# ---------------------------------------------------------------------------
# Test 7: Minimal room 2.5×2.0, paint only, no floor
# ---------------------------------------------------------------------------

def test_7_minimal_paint_no_floor(boyoq_norm, paint_mat):
    """2.5×2.0 room, paint walls only, no floor material."""
    walls = [_wall("A", 2.5), _wall("B", 2.0), _wall("C", 2.5), _wall("D", 2.0)]
    # net_wall_area = 2*(2.5+2.0)*2.7 = 9*2.7 = 24.3
    room = _room(
        ceiling_h=2.7,
        floor_area=5.0,
        net_wall_area=24.3,
        perimeter=9.0,
        geometry={"walls": walls},
        surfaces={"ALL": "p1"},
        state={"wallCoverings": {"ALL": {"kind": "paint", "color": "#fff"}}},
    )
    mats = _mats(paint_mat)
    norms = _norms(boyoq_norm)

    est = compute_estimate(room, mats, norms)

    # boyoq + grunt + shpatlyovka + elektr = 4 lines
    assert len(est.lines) == 4
    assert sum(1 for ln in est.lines if ln.category == "boyoq") == 1
    assert sum(1 for ln in est.lines if ln.category == "elektr") == 1


# ---------------------------------------------------------------------------
# Test 8: Large room 7×5, tile floor + paint walls
# ---------------------------------------------------------------------------

def test_8_large_tile_paint(boyoq_norm, plitka_norm, paint_mat, tile_mat):
    """7×5 room, paint walls + tile floor."""
    walls = [_wall("A", 7.0), _wall("B", 5.0), _wall("C", 7.0), _wall("D", 5.0)]
    # net_wall_area = 2*(7+5)*2.7 = 24*2.7 = 64.8
    room = _room(
        ceiling_h=2.7,
        floor_area=35.0,
        net_wall_area=64.8,
        perimeter=24.0,
        geometry={"walls": walls},
        surfaces={"ALL": "p1", "floor": "t1"},
        state={"wallCoverings": {"ALL": {"kind": "paint", "color": "#fff"}}},
    )
    mats = _mats(paint_mat, tile_mat)
    norms = _norms(boyoq_norm, plitka_norm)

    est = compute_estimate(room, mats, norms)

    # boyoq + grunt + shpatlyovka + plitka + elektr = 5 lines
    assert len(est.lines) == 5

    tile_line = next(ln for ln in est.lines if ln.category == "plitka")
    # m² = ceil(35.0 * 1.10 * 100) / 100 = ceil(3850) / 100 = 38.50
    assert tile_line.qty == pytest.approx(38.5, abs=0.01)


# ---------------------------------------------------------------------------
# Test 9: Room with 2 doors + 2 windows, oboy (geometrik)
# ---------------------------------------------------------------------------

def test_9_oboy_geometrik_with_openings(oboy_norm, oboy_mat):
    """5×4 room, oboy geometrik, 2 doors + 2 windows."""
    door_a = _elem("eshik", 0.9, 2.1)
    window_a = _elem("deraza", 1.5, 1.2)
    door_c = _elem("eshik", 0.9, 2.1)
    window_d = _elem("deraza", 1.5, 1.2)
    walls = [
        _wall("A", 5.0, [door_a, window_a]),
        _wall("B", 4.0),
        _wall("C", 5.0, [door_c]),
        _wall("D", 4.0, [window_d]),
    ]
    room = _room(
        ceiling_h=2.7,
        floor_area=20.0,
        net_wall_area=42.93,  # 18*2.7 - (0.9*2.1*2 + 1.5*1.2*2) = 48.6 - 5.67 = 42.93
        perimeter=18.0,
        openings_count=4,
        geometry={"walls": walls},
        surfaces={"ALL": "o1"},
        state={"wallCoverings": {"ALL": {"kind": "oboy", "patternId": "geometrik"}}},
    )
    mats = _mats(oboy_mat)
    norms = _norms(oboy_norm)

    est = compute_estimate(room, mats, norms)

    oboy_lines = [ln for ln in est.lines if ln.category == "oboy"]
    assert len(oboy_lines) == 4

    # Wall A: gross=13.5, openings=0.9*2.1+1.5*1.2=1.89+1.8=3.69, net=9.81
    #         waste=9.81*1.15=11.28, rolls=ceil(11.28/10.653)=2
    wall_a = next(ln for ln in oboy_lines if "devor A" in ln.label)
    assert wall_a.qty == 2.0

    # Wall D: gross=10.8, openings=1.5*1.2=1.8, net=9.0
    #         waste=9.0*1.15=10.35, rolls=ceil(10.35/10.653)=1
    wall_d = next(ln for ln in oboy_lines if "devor D" in ln.label)
    assert wall_d.qty == 1.0


# ---------------------------------------------------------------------------
# Test 10: Room with no floor material selected
# ---------------------------------------------------------------------------

def test_10_paint_only_no_floor(boyoq_norm, paint_mat):
    """4×3 room, paint walls, no floor material at all."""
    walls = [_wall("A", 4.0), _wall("B", 3.0), _wall("C", 4.0), _wall("D", 3.0)]
    room = _room(
        ceiling_h=2.7,
        floor_area=12.0,
        net_wall_area=37.8,
        perimeter=14.0,
        geometry={"walls": walls},
        surfaces={"ALL": "p1"},
        state={"wallCoverings": {"ALL": {"kind": "paint", "color": "#fff"}}},
    )
    mats = _mats(paint_mat)
    norms = _norms(boyoq_norm)

    est = compute_estimate(room, mats, norms)

    # boyoq + grunt + shpatlyovka + elektr = 4, no floor lines
    assert len(est.lines) == 4
    assert not any(ln.category in ("laminat", "plitka", "plintus") for ln in est.lines)


# ---------------------------------------------------------------------------
# Test 11: Room with plitka floor, no wall material
# ---------------------------------------------------------------------------

def test_11_tile_floor_no_wall_material(plitka_norm, tile_mat):
    """4×3 room, tile floor only, no wall material in surfaces."""
    room = _room(
        ceiling_h=2.7,
        floor_area=12.0,
        net_wall_area=37.8,
        perimeter=14.0,
        geometry={"walls": [_wall("A", 4.0), _wall("B", 3.0), _wall("C", 4.0), _wall("D", 3.0)]},
        surfaces={"floor": "t1"},
        state={},
    )
    mats = _mats(tile_mat)
    norms = _norms(plitka_norm)

    est = compute_estimate(room, mats, norms)

    # plitka + elektr = 2
    assert len(est.lines) == 2
    assert any(ln.category == "plitka" for ln in est.lines)

    tile_line = next(ln for ln in est.lines if ln.category == "plitka")
    # ceil(12.0 * 1.10 * 100) / 100 = ceil(1320) / 100 = 13.2
    assert tile_line.qty == pytest.approx(13.2, abs=0.01)


# ---------------------------------------------------------------------------
# Test 12: Laminat floor, oboy bolalar walls
# ---------------------------------------------------------------------------

def test_12_oboy_bolalar_laminat(oboy_norm, laminat_norm, oboy_mat, laminat_mat):
    """4×3 room, oboy bolalar walls + laminat floor."""
    walls = [_wall("A", 4.0), _wall("B", 3.0), _wall("C", 4.0), _wall("D", 3.0)]
    room = _room(
        ceiling_h=2.7,
        floor_area=12.0,
        net_wall_area=37.8,
        perimeter=14.0,
        geometry={"walls": walls},
        surfaces={"ALL": "o1", "floor": "l1"},
        state={"wallCoverings": {"ALL": {"kind": "oboy", "patternId": "bolalar"}}},
    )
    mats = _mats(oboy_mat, laminat_mat)
    norms = _norms(oboy_norm, laminat_norm)

    est = compute_estimate(room, mats, norms)

    oboy_lines = [ln for ln in est.lines if ln.category == "oboy"]
    assert len(oboy_lines) == 4

    # Wall A: 4.0*2.7=10.8, bolalar waste=1.15, gross*waste=12.42
    # rolls = ceil(12.42 / 10.653) = 2
    wall_a = next(ln for ln in oboy_lines if "devor A" in ln.label)
    assert wall_a.qty == 2.0

    # Wall B: 3.0*2.7=8.1, bolalar waste=1.15, 8.1*1.15=9.315
    # rolls = ceil(9.315 / 10.653) = 1
    wall_b = next(ln for ln in oboy_lines if "devor B" in ln.label)
    assert wall_b.qty == 1.0

    # oboy(4) + laminat(1) + plintus(1) + elektr(1) = 7
    assert len(est.lines) == 7


# ---------------------------------------------------------------------------
# Test 13: Only paint, no floor material, 3×3 ceiling 3.0m
# ---------------------------------------------------------------------------

def test_13_paint_only_high_ceiling(boyoq_norm, paint_mat):
    """3×3 room with 3.0 m ceiling, paint only, no floor."""
    walls = [_wall("A", 3.0), _wall("B", 3.0), _wall("C", 3.0), _wall("D", 3.0)]
    # net_wall_area = 12 * 3.0 = 36.0
    room = _room(
        ceiling_h=3.0,
        floor_area=9.0,
        net_wall_area=36.0,
        perimeter=12.0,
        geometry={"walls": walls},
        surfaces={"ALL": "p1"},
        state={"wallCoverings": {"ALL": {"kind": "paint", "color": "#fff"}}},
    )
    mats = _mats(paint_mat)
    norms = _norms(boyoq_norm)

    est = compute_estimate(room, mats, norms)

    assert len(est.lines) == 4

    # Paint: ceil(36.0 * 2 / 9.0) = ceil(8.0) = 8 liters
    paint_line = next(ln for ln in est.lines if ln.category == "boyoq")
    assert paint_line.qty == 8.0


# ---------------------------------------------------------------------------
# Test 14: 3×3 room, oboy gul, verify waste factor 1.15
# ---------------------------------------------------------------------------

def test_14_oboy_gul_waste_factor(oboy_norm, oboy_mat):
    """3×3 room, gul pattern — waste factor must be 1.15."""
    assert WASTE_FACTORS["gul"] == pytest.approx(1.15), "gul waste factor is 1.15"

    walls = [_wall("A", 3.0), _wall("B", 3.0), _wall("C", 3.0), _wall("D", 3.0)]
    room = _room(
        ceiling_h=2.7,
        floor_area=9.0,
        net_wall_area=32.4,
        perimeter=12.0,
        geometry={"walls": walls},
        surfaces={"ALL": "o1"},
        state={"wallCoverings": {"ALL": {"kind": "oboy", "patternId": "gul"}}},
    )
    mats = _mats(oboy_mat)
    norms = _norms(oboy_norm)

    est = compute_estimate(room, mats, norms)

    oboy_lines = [ln for ln in est.lines if ln.category == "oboy"]
    assert len(oboy_lines) == 4

    # Wall A: 3.0*2.7=8.1, gul waste=1.15, area=8.1*1.15=9.315
    # rolls = ceil(9.315 / 10.653) = 1
    wall_a = next(ln for ln in oboy_lines if "devor A" in ln.label)
    assert wall_a.qty == 1.0

    # Verify the formula string contains the waste factor 1.15
    assert "1.15" in wall_a.formula


# ---------------------------------------------------------------------------
# Test 15: Door widths reduce plinth count
# ---------------------------------------------------------------------------

def test_15_plinth_reduced_by_doors(boyoq_norm, laminat_norm, paint_mat, laminat_mat):
    """4×3 room, 2 doors (one in A, one in C), laminat floor.

    Without doors: perimeter=14m → pieces = ceil(14/2.5) = ceil(5.6) = 6
    With doors:    door_m=1.8  → plinth = 14-1.8 = 12.2m → ceil(12.2/2.5) = ceil(4.88) = 5
    """
    door = _elem("eshik", 0.9, 2.1)
    walls = [_wall("A", 4.0, [door]), _wall("B", 3.0), _wall("C", 4.0, [door]), _wall("D", 3.0)]
    # net_wall_area = 14*2.7 - 2*(0.9*2.1) = 37.8 - 3.78 = 34.02
    room = _room(
        ceiling_h=2.7,
        floor_area=12.0,
        net_wall_area=34.02,
        perimeter=14.0,
        openings_count=2,
        geometry={"walls": walls},
        surfaces={"ALL": "p1", "floor": "l1"},
        state={"wallCoverings": {"ALL": {"kind": "paint", "color": "#fff"}}},
    )
    mats = _mats(paint_mat, laminat_mat)
    norms = _norms(boyoq_norm, laminat_norm)

    est = compute_estimate(room, mats, norms)

    plinth_line = next(ln for ln in est.lines if ln.category == "plintus")

    # door_widths_m = 0.9 + 0.9 = 1.8m
    # plinth_m = 14 - 1.8 = 12.2m
    # pieces = ceil(12.2 / 2.5) = ceil(4.88) = 5
    assert plinth_line.qty == 5.0

    # Confirm total lines: boyoq+grunt+shpatlyovka(3) + laminat+plintus(2) + elektr(1) = 6
    assert len(est.lines) == 6
