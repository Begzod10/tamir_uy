"""Pure geometry helpers for room metrics — no DB, no HTTP, no side effects.

Keeping these separate from the router allows them to be imported and tested
without pulling in FastAPI or Celery (which are router-level dependencies).
"""
from __future__ import annotations

from fastapi import HTTPException, status

from app.schemas.room import RoomGeometry


def shoelace(vertices: list[tuple[float, float]]) -> float:
    """Polygon area via the shoelace formula (all values in metres)."""
    n = len(vertices)
    area = 0.0
    for i in range(n):
        x1, y1 = vertices[i]
        x2, y2 = vertices[(i + 1) % n]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2.0


def compute_metrics(geometry: RoomGeometry, ceiling_h: float) -> dict:
    """Compute derived metrics for an N-wall room geometry.

    Supports both legacy 4-wall rectangles and arbitrary N-wall polygons.
    For legacy rooms the schema normalizer pre-computes `geometry.vertices`;
    N-wall rooms must supply `vertices` explicitly.
    All lengths must be in metres — no unit conversion is applied.
    """
    walls = geometry.walls

    if geometry.vertices:
        floor_area = shoelace(geometry.vertices)
    elif len(walls) == 4:
        # Fallback: legacy rectangle without pre-computed vertices
        floor_area = walls[0].length * walls[1].length
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Ko'pburchak xonalar uchun vertices maydoni talab qilinadi",
        )

    perimeter = sum(w.length for w in walls)

    for wall in walls:
        wall_area = wall.length * ceiling_h
        element_area = sum(el.width * el.height for el in wall.elements)
        if element_area > wall_area:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Devor elementlari devor maydonidan oshib ketmoqda",
            )

    openings_count = sum(len(w.elements) for w in walls)
    openings_area = sum(
        el.width * el.height
        for w in walls
        for el in w.elements
    )
    gross_wall_area = perimeter * ceiling_h
    net_wall_area = max(0.0, gross_wall_area - openings_area)

    return {
        "floor_area": round(floor_area, 2),
        "perimeter": round(perimeter, 2),
        "net_wall_area": round(net_wall_area, 2),
        "openings_count": openings_count,
    }
