"""Tests for N-wall room geometry metrics (Phase 1).

Covers:
  - Triangle (3 walls, shoelace area)
  - L-shaped 6-wall room (shoelace area)
  - Legacy 4-wall room: schema auto-normalizes vertices → metrics identical to old formula
  - _shoelace() helper directly
  - Schema validation: <3 walls rejected
"""
from __future__ import annotations

import math
import pytest

from app.services.room_geometry import compute_metrics as _compute_metrics, shoelace as _shoelace
from app.schemas.room import RoomGeometry, Wall, WallElement


# ---------------------------------------------------------------------------
# _shoelace helper
# ---------------------------------------------------------------------------

def test_shoelace_rectangle():
    verts = [(0.0, 0.0), (4.0, 0.0), (4.0, 3.0), (0.0, 3.0)]
    assert _shoelace(verts) == pytest.approx(12.0)


def test_shoelace_right_triangle():
    # vertices: (0,0), (4,0), (0,3) — area = 4*3/2 = 6
    verts = [(0.0, 0.0), (4.0, 0.0), (0.0, 3.0)]
    assert _shoelace(verts) == pytest.approx(6.0)


def test_shoelace_l_shape():
    # L-shape: 4×4 square minus 2×2 corner = 12 m²
    verts = [
        (0.0, 0.0), (4.0, 0.0), (4.0, 2.0),
        (2.0, 2.0), (2.0, 4.0), (0.0, 4.0),
    ]
    assert _shoelace(verts) == pytest.approx(12.0)


def test_shoelace_clockwise_same_result():
    # Shoelace should return absolute area regardless of vertex order
    cw  = [(0.0, 0.0), (0.0, 3.0), (4.0, 3.0), (4.0, 0.0)]
    ccw = [(0.0, 0.0), (4.0, 0.0), (4.0, 3.0), (0.0, 3.0)]
    assert _shoelace(cw) == pytest.approx(_shoelace(ccw))


# ---------------------------------------------------------------------------
# Schema: _normalize_polygon for legacy 4-wall rooms
# ---------------------------------------------------------------------------

def _legacy_4wall(len_a: float = 4.0, len_b: float = 3.0) -> RoomGeometry:
    return RoomGeometry(walls=[
        Wall(id="A", length=len_a),
        Wall(id="B", length=len_b),
        Wall(id="C", length=len_a),
        Wall(id="D", length=len_b),
    ])


def test_legacy_vertices_auto_populated():
    geom = _legacy_4wall(4.0, 3.0)
    assert geom.vertices == [(0.0, 0.0), (4.0, 0.0), (4.0, 3.0), (0.0, 3.0)]


def test_legacy_vertices_not_overwritten_when_supplied():
    custom = [(0.0, 0.0), (5.0, 0.0), (5.0, 2.5), (0.0, 2.5)]
    geom = RoomGeometry(
        walls=[Wall(id="A", length=4.0), Wall(id="B", length=3.0),
               Wall(id="C", length=4.0), Wall(id="D", length=3.0)],
        vertices=custom,
    )
    assert geom.vertices == custom


def test_schema_rejects_fewer_than_3_walls():
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        RoomGeometry(walls=[Wall(id="A", length=4.0), Wall(id="B", length=3.0)])


# ---------------------------------------------------------------------------
# _compute_metrics: legacy 4-wall room
# ---------------------------------------------------------------------------

def test_legacy_metrics_match_old_formula():
    """Legacy 4-wall room must produce same numbers as the pre-N-wall formula."""
    len_a, len_b, h = 5.0, 4.0, 2.7
    geom = _legacy_4wall(len_a, len_b)
    m = _compute_metrics(geom, h)

    assert m["floor_area"] == pytest.approx(len_a * len_b, rel=1e-4)
    assert m["perimeter"] == pytest.approx(2 * (len_a + len_b), rel=1e-4)
    gross = 2 * (len_a + len_b) * h
    assert m["net_wall_area"] == pytest.approx(gross, rel=1e-4)
    assert m["openings_count"] == 0


def test_legacy_metrics_with_openings():
    geom = RoomGeometry(walls=[
        Wall(id="A", length=5.0, elements=[WallElement(type="eshik", width=0.9, height=2.1)]),
        Wall(id="B", length=4.0),
        Wall(id="C", length=5.0),
        Wall(id="D", length=4.0),
    ])
    m = _compute_metrics(geom, 2.7)

    door_area = 0.9 * 2.1
    gross = 2 * (5.0 + 4.0) * 2.7
    assert m["floor_area"] == pytest.approx(20.0, rel=1e-4)
    assert m["net_wall_area"] == pytest.approx(gross - door_area, rel=1e-4)
    assert m["openings_count"] == 1


# ---------------------------------------------------------------------------
# _compute_metrics: triangle (3 walls)
# ---------------------------------------------------------------------------

def test_triangle_metrics():
    """3-4-5 right triangle: area=6, perimeter=12."""
    geom = RoomGeometry(
        walls=[
            Wall(id="A", length=4.0),
            Wall(id="B", length=3.0),
            Wall(id="C", length=5.0),
        ],
        vertices=[(0.0, 0.0), (4.0, 0.0), (0.0, 3.0)],
    )
    m = _compute_metrics(geom, 2.5)

    assert m["floor_area"] == pytest.approx(6.0, rel=1e-4)
    assert m["perimeter"] == pytest.approx(12.0, rel=1e-4)
    assert m["net_wall_area"] == pytest.approx(12.0 * 2.5, rel=1e-4)
    assert m["openings_count"] == 0


# ---------------------------------------------------------------------------
# _compute_metrics: L-shaped 6-wall room
# ---------------------------------------------------------------------------

def test_l_shape_metrics():
    """L-shape: 4×4 square minus 2×2 corner = 12 m²; perimeter = 12 m."""
    # Walls going counter-clockwise around the L:
    # bottom (4m), right-lower (2m), step-inward (2m), right-upper (2m), top (2m), left (4m)
    verts = [
        (0.0, 0.0), (4.0, 0.0), (4.0, 2.0),
        (2.0, 2.0), (2.0, 4.0), (0.0, 4.0),
    ]
    wall_lengths = [4.0, 2.0, 2.0, 2.0, 2.0, 4.0]
    geom = RoomGeometry(
        walls=[Wall(id=str(i), length=l) for i, l in enumerate(wall_lengths)],
        vertices=verts,
    )
    m = _compute_metrics(geom, 3.0)

    assert m["floor_area"] == pytest.approx(12.0, rel=1e-4)
    assert m["perimeter"] == pytest.approx(sum(wall_lengths), rel=1e-4)  # 16.0
    assert m["net_wall_area"] == pytest.approx(16.0 * 3.0, rel=1e-4)
    assert m["openings_count"] == 0


def test_l_shape_with_window():
    verts = [
        (0.0, 0.0), (4.0, 0.0), (4.0, 2.0),
        (2.0, 2.0), (2.0, 4.0), (0.0, 4.0),
    ]
    window = WallElement(type="deraza", width=1.2, height=1.0, sill_height=0.9)
    walls = [
        Wall(id="0", length=4.0, elements=[window]),
        Wall(id="1", length=2.0),
        Wall(id="2", length=2.0),
        Wall(id="3", length=2.0),
        Wall(id="4", length=2.0),
        Wall(id="5", length=4.0),
    ]
    geom = RoomGeometry(walls=walls, vertices=verts)
    m = _compute_metrics(geom, 3.0)

    win_area = 1.2 * 1.0
    gross = 16.0 * 3.0
    assert m["floor_area"] == pytest.approx(12.0, rel=1e-4)
    assert m["net_wall_area"] == pytest.approx(gross - win_area, rel=1e-4)
    assert m["openings_count"] == 1


# ---------------------------------------------------------------------------
# _compute_metrics: N-wall without vertices → 422
# ---------------------------------------------------------------------------

def test_n_wall_without_vertices_raises():
    from fastapi import HTTPException
    geom = RoomGeometry(
        walls=[Wall(id="A", length=4.0), Wall(id="B", length=3.0), Wall(id="C", length=5.0)],
        vertices=None,
    )
    # Manually clear auto-normalized vertices (only happens for 4-wall; 3-wall has None)
    assert geom.vertices is None
    with pytest.raises(HTTPException) as exc_info:
        _compute_metrics(geom, 2.7)
    assert exc_info.value.status_code == 422
