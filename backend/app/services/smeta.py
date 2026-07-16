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
ROLL_AREA_M2: float = ROLL_WIDTH_M * ROLL_LENGTH_M  # 10.653 m² per roll
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

# Waste factors by wallpaper pattern type
WASTE_FACTORS: dict[str, float] = {
    "tekstura": 1.05,
    "yolli": 1.10,
    "damask": 1.15,
    "geometrik": 1.15,
    "gul": 1.15,
    "bolalar": 1.15,
}


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


def _to_metres(v: float) -> float:
    """Auto-convert mm → m when value looks like mm (> 100).

    Phase 5 will remove this heuristic and require metres throughout.
    For now, geometry from the frontend arrives in mm.
    """
    return v / 1000.0 if v > 100 else v


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
    qty_val: float = float(qty)
    # All monetary arithmetic in tiyin (UZS × 100) to avoid float rounding
    price_tiyin: int = round(float(price_uzs) * 100)
    subtotal_tiyin: int = round(qty_val * price_tiyin)
    subtotal_uzs: int = subtotal_tiyin // 100
    return ComputedLine(
        label=label,
        formula=formula,
        qty=qty_val,
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
    norms_map: "dict[str, Norm]",
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
    grunt_norm = norms_map.get("grunt")
    grunt_params = grunt_norm.params if grunt_norm and grunt_norm.params else {}
    primer_rate = float(grunt_params.get("rate_kg_m2", PRIMER_RATE_KG_M2))
    primer_bag_kg = int(grunt_params.get("bag_kg", PRIMER_BAG_KG))
    primer_price = int(grunt_params.get("bag_price_uzs", PRIMER_BAG_PRICE_UZS))
    grunt_approximate = grunt_norm is None
    grunt_warning = "Norma topilmadi, standart qiymat ishlatildi" if grunt_norm is None else None

    kg_primer = math.ceil(net_wall * primer_rate)
    bags_primer = math.ceil(kg_primer / primer_bag_kg)
    lines.append(_make_line(
        label=f"Grunt (asosiy qatlam) {primer_bag_kg} kg qop",
        formula=(
            f"{net_wall:.1f} m² × {primer_rate} kg/m² "
            f"= {kg_primer} kg → {bags_primer} qop"
        ),
        qty=bags_primer,
        unit="qop",
        price_uzs=primer_price,
        category="grunt",
        is_approximate=grunt_approximate,
        warning=grunt_warning,
    ))

    # -- Putty (shpatlyovka) --
    putty_norm = norms_map.get("shpatlyovka")
    putty_params = putty_norm.params if putty_norm and putty_norm.params else {}
    putty_rate = float(putty_params.get("rate_kg_m2", PUTTY_RATE_KG_M2))
    putty_bag_kg = int(putty_params.get("bag_kg", PUTTY_BAG_KG))
    putty_price = int(putty_params.get("bag_price_uzs", PUTTY_BAG_PRICE_UZS))
    putty_approximate = putty_norm is None
    putty_warning = "Norma topilmadi, standart qiymat ishlatildi" if putty_norm is None else None

    kg_putty = net_wall * putty_rate
    bags_putty = math.ceil(kg_putty / putty_bag_kg)
    lines.append(_make_line(
        label=f"Shpatlyovka {putty_bag_kg} kg qop",
        formula=(
            f"{net_wall:.1f} m² × {putty_rate} kg/m² "
            f"= {kg_putty:.1f} kg → {bags_putty} qop"
        ),
        qty=bags_putty,
        unit="qop",
        price_uzs=putty_price,
        category="shpatlyovka",
        is_approximate=putty_approximate,
        warning=putty_warning,
    ))

    return lines


def _wallpaper_lines(
    room: "Room",
    wall_surfaces: dict[str, str],
    materials_map: dict[str, "Material"],
    norm: "Norm | None",
    norms_map: "dict[str, Norm]",
) -> list[ComputedLine]:
    """Per-wall oboy (wallpaper) lines.

    Reads wall geometry from room.geometry (lengths may be in mm; applies
    _to_metres heuristic).  Reads which walls have oboy covering from
    room.state['wallCoverings'].  Emits one ComputedLine per wall that has
    an 'oboy' kind covering.
    """
    geometry: dict = room.geometry or {}
    walls_data = geometry.get("walls", [])
    walls_by_id: dict[str, dict] = {str(w.get("id", "")): w for w in walls_data}

    ceiling_h_raw = _float(room.ceiling_h, 2.7)
    ceiling_h_m = _to_metres(ceiling_h_raw)

    state: dict = room.state or {}
    wall_coverings: dict = state.get("wallCoverings", {})

    lines: list[ComputedLine] = []

    # Iterate over actual wall ids from geometry — works for N-wall rooms
    wall_keys = [str(w.get("id", "")) for w in walls_data]
    for wall_key in wall_keys:
        covering = wall_coverings.get(wall_key) or wall_coverings.get("ALL")
        if not covering or not isinstance(covering, dict):
            continue
        if covering.get("kind") != "oboy":
            continue

        wall = walls_by_id.get(wall_key, {})
        raw_length = float(wall.get("length", 0) or 0)
        wall_length_m = _to_metres(raw_length)
        if wall_length_m <= 0:
            continue

        gross_area = wall_length_m * ceiling_h_m

        elements = wall.get("elements", []) or []
        openings_area = sum(
            _to_metres(float(el.get("width", 0) or 0))
            * _to_metres(float(el.get("height", 0) or 0))
            for el in elements
        )

        net_area = max(0.0, gross_area - openings_area)

        pattern_id: str = covering.get("patternId", "") or ""
        # Waste factor: prefer DB norm (oboy_{pattern_id}), fallback to WASTE_FACTORS dict
        pattern_norm = norms_map.get(f"oboy_{pattern_id}") if pattern_id else None
        if pattern_norm is not None:
            waste_factor = _float(pattern_norm.waste_factor, 1.10)
        else:
            waste_factor = WASTE_FACTORS.get(pattern_id, 1.10)

        # Roll dimensions: prefer DB norm params for "oboy", fallback to constants
        oboy_norm = norm  # passed as norm parameter
        oboy_params = getattr(oboy_norm, "params", None) or {}
        roll_width = float(oboy_params.get("roll_width_m", ROLL_WIDTH_M))
        roll_length = float(oboy_params.get("roll_length_m", ROLL_LENGTH_M))
        roll_area = roll_width * roll_length

        strips_per_roll = int(roll_length / ceiling_h_m) if ceiling_h_m > 0 else 1  # noqa: F841
        rolls_per_wall = math.ceil(net_area * waste_factor / roll_area) if roll_area > 0 else 0

        mat_id = wall_surfaces.get(wall_key) or wall_surfaces.get("ALL")
        material = materials_map.get(mat_id) if mat_id else None

        label = (
            f"Oboy devor {wall_key}: {material.name_uz}"
            if material
            else f"Oboy devor {wall_key}"
        )
        formula = (
            f"Devor {wall_key}: {wall_length_m:.2f} m × {ceiling_h_m:.2f} m "
            f"− teshiklar {openings_area:.2f} m² = {net_area:.2f} m²; "
            f"× {waste_factor:.2f} (isrof) ÷ {roll_area:.3f} m²/rulon "
            f"= {rolls_per_wall} rulon"
        )

        price_uzs = int(material.price_uzs) if material else 0

        lines.append(_make_line(
            label=label,
            formula=formula,
            qty=rolls_per_wall,
            unit="rulon",
            price_uzs=price_uzs,
            category="oboy",
            material_id=str(material.id) if material else None,
            store_name=_store_name(material) if material else None,
        ))

    return lines


def _laminate_lines(
    room: "Room",
    material: "Material",
    norm: "Norm | None",
    norms_map: "dict[str, Norm]",
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

    # Plinth — read dimensions and price from DB norm when available
    plintus_norm = norms_map.get("plintus")
    plintus_params = plintus_norm.params if plintus_norm and plintus_norm.params else {}
    plinth_piece_m = float(plintus_params.get("piece_m", PLINTH_PIECE_M))
    plinth_price = int(plintus_params.get("piece_price_uzs", PLINTH_PIECE_PRICE_UZS))
    plinth_approximate = plintus_norm is None
    plinth_warning = "Norma topilmadi, standart qiymat ishlatildi" if plintus_norm is None else None

    door_m = _door_widths_m(room)
    perimeter = _float(room.perimeter)
    plinth_m = max(0.0, perimeter - door_m)
    pieces = math.ceil(plinth_m / plinth_piece_m)
    lines.append(_make_line(
        label=f"Plintus ({plinth_piece_m:.1f} m dona)",
        formula=(
            f"Perimetr {perimeter:.2f} m − eshiklar {door_m:.2f} m "
            f"= {plinth_m:.2f} m → {pieces} dona"
        ),
        qty=pieces,
        unit="dona",
        price_uzs=plinth_price,
        category="plintus",
        is_approximate=plinth_approximate,
        warning=plinth_warning,
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


def _electrical_line(
    room: "Room",
    norms_map: "dict[str, Norm]",
) -> ComputedLine:
    """Electrical cable estimate.

    Uses actual placed electrical point counts from room.state when available
    (keys: 'electricals' and 'lights', saved by StudioPage).  Falls back to
    ELEC_POINTS_DEFAULT and marks the line as approximate when no count is found.
    """
    elec_norm = norms_map.get("elektr_kabel")
    elec_params = elec_norm.params if elec_norm and elec_norm.params else {}
    avg_run_m = float(elec_params.get("avg_run_m", ELEC_AVG_RUN_M))
    slack = float(elec_params.get("slack", ELEC_SLACK))
    price_per_m = int(elec_params.get("price_per_m_uzs", ELEC_CABLE_PRICE_UZS))

    norm_warning_suffix = (
        " Norma topilmadi, standart qiymat ishlatildi." if elec_norm is None else ""
    )

    # Derive point count from user-placed electricals and ceiling lights.
    state: dict = room.state or {}
    placed_electricals = state.get("electricals") or []
    placed_lights = state.get("lights") or []
    actual_count = len(placed_electricals) + len(placed_lights)

    if actual_count > 0:
        elec_points = actual_count
        is_approximate = False
        warning_text = (
            "Elektr kabel hisob-kitobi haqiqiy nuqtalar soniga asoslanadi. "
            f"Elektrik sxemasini elektrik ustasi bilan tasdiqlang.{norm_warning_suffix}"
        )
    else:
        elec_points = int(elec_params.get("points_default", ELEC_POINTS_DEFAULT))
        is_approximate = True
        warning_text = (
            "Bu taxminiy hisob: elektr nuqtalari soni kiritilmagan. "
            "Elektrik sxemasini elektrik ustasi bilan "
            f"tasdiqlang.{norm_warning_suffix}"
        )

    cable_m = math.ceil(elec_points * avg_run_m * slack)
    return _make_line(
        label="Elektr kabel (taxminiy)" if is_approximate else "Elektr kabel",
        formula=(
            f"{elec_points} nuqta × {avg_run_m} m × "
            f"{slack} (zaxira) = {cable_m} m"
        ),
        qty=cable_m,
        unit="m",
        price_uzs=price_per_m,
        category="elektr",
        is_approximate=is_approximate,
        warning=warning_text,
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

    wall_materials: list = [
        materials_map[mid] for mid in wall_mids if mid in materials_map
    ]
    wall_categories: set[str] = {m.category for m in wall_materials}

    # Wall surfaces map: wall_key -> material_id (includes 'ALL' key)
    wall_surfaces_map: dict[str, str] = {
        k: v for k, v in surfaces.items()
        if k not in NON_WALL_SURFACE_KEYS and v
    }

    # ------------------------------------------------------------------ #
    # 1. Paint (boyoq) + primer + putty                                   #
    # ------------------------------------------------------------------ #
    if "boyoq" in wall_categories:
        boyoq_mat = next(m for m in wall_materials if m.category == "boyoq")
        boyoq_norm = norms_map.get("boyoq")
        if boyoq_norm and _float(room.net_wall_area) > 0:
            lines.extend(_paint_lines(room, boyoq_mat, boyoq_norm, norms_map))

    # ------------------------------------------------------------------ #
    # 2. Wallpaper (oboy) — per-wall from design state                   #
    # ------------------------------------------------------------------ #
    wall_coverings_state: dict = (room.state or {}).get("wallCoverings", {})
    has_any_oboy = any(
        isinstance(c, dict) and c.get("kind") == "oboy"
        for c in wall_coverings_state.values()
    )
    if has_any_oboy:
        oboy_norm = norms_map.get("oboy")
        lines.extend(_wallpaper_lines(room, wall_surfaces_map, materials_map, oboy_norm, norms_map))

    # ------------------------------------------------------------------ #
    # 3. Floor covering                                                    #
    # ------------------------------------------------------------------ #
    floor_mat = materials_map.get(floor_mid) if floor_mid else None
    if floor_mat is not None:
        if floor_mat.category in ("laminat", "parket"):
            laminat_norm = norms_map.get("laminat") or norms_map.get("parket")
            if _float(room.floor_area) > 0:
                lines.extend(_laminate_lines(room, floor_mat, laminat_norm, norms_map))
        elif floor_mat.category == "plitka":
            if _float(room.floor_area) > 0:
                lines.extend(_tile_lines(room, floor_mat))

    # ------------------------------------------------------------------ #
    # 4. Electrical — uses actual point counts from state when available   #
    # ------------------------------------------------------------------ #
    elec_line = _electrical_line(room, norms_map)
    lines.append(elec_line)

    # ------------------------------------------------------------------ #
    # Totals (exclude approximate lines from deterministic total)         #
    # ------------------------------------------------------------------ #
    total_uzs = sum(ln.subtotal_uzs for ln in lines if not ln.is_approximate)
    total_min = int(total_uzs * 0.9)
    total_max = int(total_uzs * 1.1)
    # has_electrical is True only when there is at least one confirmed (non-approximate)
    # electrical line — i.e. the user provided actual point counts.
    has_electrical = any(
        ln.category == "elektr" and not ln.is_approximate for ln in lines
    )

    return ComputedEstimate(
        lines=lines,
        total_uzs=total_uzs,
        total_min=total_min,
        total_max=total_max,
        has_electrical=has_electrical,
    )
