"""Pure deterministic smeta (estimate) calculation engine.

All monetary arithmetic is done in tiyin (UZS × 100) to avoid floating-point
rounding errors.  The public surface is a single function:

    compute_estimate(room, materials_map, norms_map) -> ComputedEstimate

No database access, no I/O — call it from within a router after loading the
required ORM objects.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.material import Material
    from app.models.norm import Norm
    from app.models.room import Room

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ROLL_WIDTH_M: float = 1.06        # wallpaper roll width
ROLL_LENGTH_M: float = 10.05      # wallpaper roll length
PACK_M2: float = 2.13             # laminate pack coverage (from norm; overridable)
PLINTH_PIECE_M: float = 2.5       # standard plinth strip length
DOOR_WIDTH_DEFAULT_M: float = 0.9  # door width assumed when no geometry data

PRIMER_RATE_KG_M2: float = 0.15   # kg of primer per m²
PRIMER_BAG_KG: int = 5
PRIMER_BAG_PRICE_UZS: int = 45_000   # hardcoded Tashkent 2024 avg

PUTTY_RATE_KG_M2: float = 1.2     # kg of putty per m²
PUTTY_BAG_KG: int = 25
PUTTY_BAG_PRICE_UZS: int = 85_000    # hardcoded Tashkent 2024 avg

PLINTH_PIECE_PRICE_UZS: int = 35_000  # per 2.5 m plinth strip

ELEC_POINTS_DEFAULT: int = 8      # sockets + switches estimate per room
ELEC_AVG_RUN_M: float = 8.0
ELEC_SLACK: float = 1.15
ELEC_CABLE_PRICE_UZS: int = 10_000   # UZS per cable-metre estimate

TILE_WASTE: float = 1.10
LAMINAT_WASTE_DEFAULT: float = 1.07

NON_WALL_SURFACE_KEYS: frozenset[str] = frozenset({"floor", "ceiling"})


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------

@dataclass
class ComputedLine:
    """A single line item in the smeta."""
    label: str
    formula: str
    qty: float
    unit: str
    unit_price_uzs: int
    subtotal_uzs: int
    category: str = ""
    material_id: str | None = None
    store_name: str | None = None
    is_approximate: bool = False
    warning: str | None = None


@dataclass
class ComputedEstimate:
    """Returned by compute_estimate(); not yet persisted."""
    lines: list[ComputedLine] = field(default_factory=list)
    total_uzs: int = 0
    total_min: int = 0
    total_max: int = 0
    has_electrical: bool = False


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _float(value: object, default: float = 0.0) -> float:
    """Safely coerce SQLAlchemy Numeric / Decimal to Python float."""
    if value is None:
        return default
    return float(value)


def _make_line(
    *,
    label: str,
    formula: str,
    qty: int | float,
    unit: str,
    price_uzs: int,
    category: str = "",
    material_id: str | None = None,
    store_name: str | None = None,
    is_approximate: bool = False,
    warning: str | None = None,
) -> ComputedLine:
    """Build a ComputedLine with integer tiyin arithmetic for the subtotal."""
    qty_val = int(qty) if isinstance(qty, float) and qty == int(qty) else qty
    # Money: operate in tiyin, convert back to UZS
    price_tiyin: int = int(price_uzs) * 100
    if isinstance(qty_val, int):
        subtotal_tiyin: int = qty_val * price_tiyin
    else:
        # continuous qty (e.g. tile m²): use rounded tiyin-qty
        qty_tiyin = round(float(qty_val) * 100)
        subtotal_tiyin = qty_tiyin * int(price_uzs)  # qty_tiyin * UZS → tiyin-UZS
        # convert: tiyin-UZS / 100 = UZS (we want UZS, so divide by 100)
        # Actually: subtotal_uzs = float(qty) * price_uzs, rounded
        subtotal_tiyin = round(float(qty_val) * price_tiyin)
    subtotal_uzs: int = subtotal_tiyin // 100
    return ComputedLine(
        label=label,
        formula=formula,
        qty=float(qty_val),
        unit=unit,
        unit_price_uzs=int(price_uzs),
        subtotal_uzs=subtotal_uzs,
        category=category,
        material_id=material_id,
        store_name=store_name,
        is_approximate=is_approximate,
        warning=warning,
    )


def _door_widths_m(room: "Room") -> float:
    """Return total door width (metres) from geometry JSONB.

    Geometry format (from RoomGeometry schema):
        {"walls": [{"id": "A", "length": 4.0,
                    "elements": [{"type": "eshik", "width": 0.9, ...}]}]}

    Falls back to openings_count // 2 × 0.9 m when no explicit door data.
    """
    geometry: dict = room.geometry or {}
    walls = geometry.get("walls", [])
    total = sum(
        float(elem.get("width", DOOR_WIDTH_DEFAULT_M))
        for wall in walls
        for elem in wall.get("elements", [])
        if elem.get("type") == "eshik"
    )
    if total > 0:
        return total
    # Fallback: assume half of counted openings are doors
    door_count = max(1, (room.openings_count or 0) // 2)
    return door_count * DOOR_WIDTH_DEFAULT_M


def _store_name(material: "Material") -> str | None:
    try:
        return material.store.name if material.store else None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Line-item computation functions
# ---------------------------------------------------------------------------

def _paint_lines(
    room: "Room",
    material: "Material",
    norm: "Norm",
) -> list[ComputedLine]:
    """Boyoq + grunt (primer) + shpatlyovka (putty)."""
    lines: list[ComputedLine] = []
    net_wall = _float(room.net_wall_area)
    coverage = _float(norm.coverage_per_unit, 9.0)
    coats = int(norm.coats) if norm.coats else 2

    # -- Paint --
    liters = math.ceil(net_wall * coats / coverage)
    lines.append(_make_line(
        label=f"Bo'yoq: {material.name_uz}",
        formula=(
            f"{net_wall:.1f} m² × {coats} qatlam "
            f"÷ {coverage:.1f} m²/litr = {liters} litr"
        ),
        qty=liters,
        unit="litr",
        price_uzs=material.price_uzs,
        category="boyoq",
        material_id=str(material.id),
        store_name=_store_name(material),
    ))

    # -- Primer (grunt) --
    kg_primer = math.ceil(net_wall * PRIMER_RATE_KG_M2)
    bags_primer = math.ceil(kg_primer / PRIMER_BAG_KG)
    lines.append(_make_line(
        label=f"Grunt (asosiy qatlam) {PRIMER_BAG_KG} kg qop",
        formula=(
            f"{net_wall:.1f} m² × {PRIMER_RATE_KG_M2} kg/m² "
            f"= {kg_primer} kg → {bags_primer} qop"
        ),
        qty=bags_primer,
        unit="qop",
        price_uzs=PRIMER_BAG_PRICE_UZS,
        category="grunt",
    ))

    # -- Putty (shpatlyovka) --
    kg_putty = net_wall * PUTTY_RATE_KG_M2
    bags_putty = math.ceil(kg_putty / PUTTY_BAG_KG)
    lines.append(_make_line(
        label=f"Shpatlyovka {PUTTY_BAG_KG} kg qop",
        formula=(
            f"{net_wall:.1f} m² × {PUTTY_RATE_KG_M2} kg/m² "
            f"= {kg_putty:.1f} kg → {bags_putty} qop"
        ),
        qty=bags_putty,
        unit="qop",
        price_uzs=PUTTY_BAG_PRICE_UZS,
        category="shpatlyovka",
    ))

    return lines


def _wallpaper_lines(
    room: "Room",
    material: "Material",
    norm: "Norm",
) -> list[ComputedLine]:
    """Oboy (wallpaper)."""
    perimeter = _float(room.perimeter)
    ceiling_h = _float(room.ceiling_h, 2.7)

    strips_needed = math.ceil(perimeter / ROLL_WIDTH_M)
    # pattern repeat is 0 for MVP
    strips_per_roll = int(ROLL_LENGTH_M / ceiling_h)
    rolls_needed = math.ceil(strips_needed / max(strips_per_roll, 1))

    formula = (
        f"Perimetr {perimeter:.2f} m ÷ {ROLL_WIDTH_M} m = "
        f"{strips_needed} chiziq; "
        f"rulonda {strips_per_roll} chiziq ({ROLL_LENGTH_M} m ÷ {ceiling_h:.1f} m); "
        f"= {rolls_needed} rulon"
    )
    return [_make_line(
        label=f"Oboy: {material.name_uz}",
        formula=formula,
        qty=rolls_needed,
        unit="rulon",
        price_uzs=material.price_uzs,
        category="oboy",
        material_id=str(material.id),
        store_name=_store_name(material),
    )]


def _laminate_lines(
    room: "Room",
    material: "Material",
    norm: "Norm | None",
) -> list[ComputedLine]:
    """Laminat qoplamasi + plinth."""
    lines: list[ComputedLine] = []
    floor_area = _float(room.floor_area)
    waste = _float(norm.waste_factor, LAMINAT_WASTE_DEFAULT) if norm else LAMINAT_WASTE_DEFAULT
    pack_m2 = _float(norm.coverage_per_unit, PACK_M2) if norm else PACK_M2

    packs = math.ceil(floor_area * waste / pack_m2)
    area_with_waste = floor_area * waste

    lines.append(_make_line(
        label=f"Laminat: {material.name_uz}",
        formula=(
            f"{floor_area:.2f} m² × {waste:.2f} (chiqindi) "
            f"= {area_with_waste:.2f} m² "
            f"÷ {pack_m2:.2f} m²/quti = {packs} quti"
        ),
        qty=packs,
        unit="quti",
        price_uzs=material.price_uzs,
        category="laminat",
        material_id=str(material.id),
        store_name=_store_name(material),
    ))

    # Plinth
    door_m = _door_widths_m(room)
    perimeter = _float(room.perimeter)
    plinth_m = max(0.0, perimeter - door_m)
    pieces = math.ceil(plinth_m / PLINTH_PIECE_M)
    lines.append(_make_line(
        label=f"Plintus ({PLINTH_PIECE_M:.1f} m dona)",
        formula=(
            f"Perimetr {perimeter:.2f} m − eshiklar {door_m:.2f} m "
            f"= {plinth_m:.2f} m → {pieces} dona"
        ),
        qty=pieces,
        unit="dona",
        price_uzs=PLINTH_PIECE_PRICE_UZS,
        category="plintus",
    ))

    return lines


def _tile_lines(
    room: "Room",
    material: "Material",
) -> list[ComputedLine]:
    """Plitka (floor tile)."""
    floor_area = _float(room.floor_area)
    # 2-decimal precision with tiyin math
    m2_tiyin = math.ceil(floor_area * TILE_WASTE * 100)   # 2-decimal fixed-point
    m2_needed = m2_tiyin / 100.0

    # Integer tiyin arithmetic for money
    price_tiyin = int(material.price_uzs) * 100
    subtotal_tiyin = m2_tiyin * int(material.price_uzs)
    subtotal_uzs = subtotal_tiyin // 100

    return [ComputedLine(
        label=f"Plitka: {material.name_uz}",
        formula=(
            f"{floor_area:.2f} m² × {TILE_WASTE:.2f} (chiqindi) "
            f"= {m2_needed:.2f} m²"
        ),
        qty=m2_needed,
        unit="m²",
        unit_price_uzs=int(material.price_uzs),
        subtotal_uzs=subtotal_uzs,
        category="plitka",
        material_id=str(material.id),
        store_name=_store_name(material),
    )]


def _electrical_line(room: "Room") -> ComputedLine:
    """Approximate electrical cable estimate (amber warning)."""
    cable_m = math.ceil(ELEC_POINTS_DEFAULT * ELEC_AVG_RUN_M * ELEC_SLACK)
    return _make_line(
        label="Elektr kabel (taxminiy)",
        formula=(
            f"{ELEC_POINTS_DEFAULT} nuqta × {ELEC_AVG_RUN_M} m × "
            f"{ELEC_SLACK} (zaxira) = {cable_m} m"
        ),
        qty=cable_m,
        unit="m",
        price_uzs=ELEC_CABLE_PRICE_UZS,
        category="elektr",
        is_approximate=True,
        warning=(
            "Bu taxminiy hisob. Elektrik sxemasini elektrik ustasi bilan "
            "tasdiqlang."
        ),
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compute_estimate(
    room: "Room",
    materials_map: dict[str, "Material"],
    norms_map: dict[str, "Norm"],
) -> ComputedEstimate:
    """Compute a full smeta for *room*.

    Parameters
    ----------
    room:
        SQLAlchemy Room ORM instance with all area fields populated.
    materials_map:
        Mapping of ``str(material.id)`` to Material ORM objects.
        Should contain every material referenced by ``room.surfaces``.
    norms_map:
        Mapping of ``norm.material_key`` to Norm ORM objects.

    Returns
    -------
    ComputedEstimate
        All line items and rolled-up totals.  No DB writes.
    """
    surfaces: dict[str, str] = room.surfaces or {}
    lines: list[ComputedLine] = []

    # Identify wall vs floor surfaces
    wall_mids = {
        v for k, v in surfaces.items()
        if k not in NON_WALL_SURFACE_KEYS and v
    }
    floor_mid: str | None = surfaces.get("floor")

    wall_materials: list[Material] = [
        materials_map[mid] for mid in wall_mids if mid in materials_map
    ]
    wall_categories: set[str] = {m.category for m in wall_materials}

    # ------------------------------------------------------------------ #
    # 1. Paint (boyoq) + primer + putty                                   #
    # ------------------------------------------------------------------ #
    if "boyoq" in wall_categories:
        boyoq_mat = next(m for m in wall_materials if m.category == "boyoq")
        boyoq_norm = norms_map.get("boyoq")
        if boyoq_norm and _float(room.net_wall_area) > 0:
            lines.extend(_paint_lines(room, boyoq_mat, boyoq_norm))

    # ------------------------------------------------------------------ #
    # 2. Wallpaper (oboy)                                                  #
    # ------------------------------------------------------------------ #
    if "oboy" in wall_categories:
        oboy_mat = next(m for m in wall_materials if m.category == "oboy")
        oboy_norm = norms_map.get("oboy")
        if oboy_norm and _float(room.perimeter) > 0:
            lines.extend(_wallpaper_lines(room, oboy_mat, oboy_norm))

    # ------------------------------------------------------------------ #
    # 3. Floor covering                                                    #
    # ------------------------------------------------------------------ #
    floor_mat: Material | None = (
        materials_map.get(floor_mid) if floor_mid else None
    )
    if floor_mat is not None:
        if floor_mat.category in ("laminat", "parket"):
            laminat_norm = norms_map.get("laminat") or norms_map.get("parket")
            if _float(room.floor_area) > 0:
                lines.extend(_laminate_lines(room, floor_mat, laminat_norm))
        elif floor_mat.category == "plitka":
            if _float(room.floor_area) > 0:
                lines.extend(_tile_lines(room, floor_mat))

    # ------------------------------------------------------------------ #
    # 4. Electrical (always, approximate)                                  #
    # ------------------------------------------------------------------ #
    elec_line = _electrical_line(room)
    lines.append(elec_line)

    # ------------------------------------------------------------------ #
    # Totals (exclude approximate lines from deterministic total)         #
    # ------------------------------------------------------------------ #
    total_uzs = sum(ln.subtotal_uzs for ln in lines if not ln.is_approximate)
    total_min = int(total_uzs * 0.9)
    total_max = int(total_uzs * 1.1)
    has_electrical = any(ln.category == "elektr" for ln in lines)

    return ComputedEstimate(
        lines=lines,
        total_uzs=total_uzs,
        total_min=total_min,
        total_max=total_max,
        has_electrical=has_electrical,
    )
