/**
 * Constraint-based placement solver for AC, TV, and socket routing.
 *
 * All dimensions in millimetres unless noted.
 * Wall layout: A = back-left, B = right, C = back-right, D = left.
 * Walls A/C are the "depth" walls (length), B/D are the "width" walls.
 *
 * "Exterior" assumption: wall A is exterior (has outdoor access for AC draining).
 * The user can override this by passing exteriorWall.
 */

import type { RoomGeometry, WallElement } from "@/store/roomStore";

// ─── Public types ─────────────────────────────────────────────────────────────

export type WallId = "A" | "B" | "C" | "D";

export interface DevicePlacement {
  device: "ac" | "tv" | "rozetka";
  wallId: WallId;
  positionMm: number;     // mm from left edge of wall (when facing the wall)
  heightMm: number;       // mm from floor
  widthMm: number;        // footprint width
  heightSpanMm: number;   // footprint height
  score: number;          // 0–100, higher is better
  rank: number;           // 1 = best
  notes: string[];        // uzbek explanation
}

export interface WireSegment {
  wallId: WallId;
  startMm: number;   // mm from left edge of wall
  endMm: number;
  heightMm: number;
  isVertical: boolean;
}

export interface WireRoute {
  device: "ac" | "tv" | "rozetka";
  segments: WireSegment[];
  totalLengthM: number;
  shtroblashM: number;   // штробление = same as total for concealed wiring
}

export interface PlacementResult {
  placements: DevicePlacement[];
  routes: WireRoute[];
  panelWall: WallId;
  panelPositionMm: number;
  panelHeightMm: number;
  totalCableM: number;
  totalShtroblashM: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AC_HEIGHT_FROM_CEILING = 150;     // 15 cm below ceiling
const AC_WIDTH = 900;
const AC_HEIGHT_SPAN = 300;
const AC_CLEARANCE_FROM_OPENING = 400; // min distance from door/window edge

const TV_HEIGHT_FROM_FLOOR = 1050;     // eye level seated ~105 cm
const TV_WIDTH = 1000;
const TV_HEIGHT_SPAN = 600;
const TV_CLEARANCE_FROM_OPENING = 300;

const HORIZONTAL_CABLE_HEIGHT_FROM_CEILING = 200; // magistral runs at -20cm from ceiling
const PANEL_OFFSET_FROM_CORNER = 100;             // щиток is 10cm from front corner
const PANEL_HEIGHT = 1400;                         // щиток standard height

// Score penalties
const PENALTY_WINDOW_WALL = 30;    // TV on window wall (glare)
const PENALTY_FAR_FROM_EXTERIOR = 20; // AC not on exterior wall (longer trassa)
const BONUS_EXTERIOR_WALL = 25;
const PENALTY_NEAR_CORNER = 15;    // device crammed into corner

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wallLength(geo: RoomGeometry, id: WallId): number {
  return geo.walls.find((w) => w.id === id)?.length ?? 3000;
}

function wallElements(geo: RoomGeometry, id: WallId): WallElement[] {
  return geo.walls.find((w) => w.id === id)?.elements ?? [];
}

/** Check if a [start, end] range overlaps any opening on the wall with extra clearance. */
function overlapsOpening(
  elements: WallElement[],
  startMm: number,
  endMm: number,
  clearance: number,
): boolean {
  for (const el of elements) {
    const elStart = el.position - clearance;
    const elEnd = el.position + el.width + clearance;
    if (startMm < elEnd && endMm > elStart) return true;
  }
  return false;
}

/** Returns true if the wall has a window element (TV glare penalty). */
function hasWindow(geo: RoomGeometry, id: WallId): boolean {
  return wallElements(geo, id).some((e) => e.type === "deraza");
}

/** Find the best N positions along a wall for a device. */
function scorePositions(
  geo: RoomGeometry,
  wallId: WallId,
  deviceWidth: number,
  deviceHeight: number,
  preferredHeightFromFloor: number,
  ceilingH: number,
  clearance: number,
  extraPenalty: number,
): { positionMm: number; heightMm: number; score: number }[] {
  const length = wallLength(geo, wallId);
  const elements = wallElements(geo, wallId);
  const results: { positionMm: number; heightMm: number; score: number }[] = [];

  const step = 200; // evaluate every 20 cm
  const margin = deviceWidth / 2 + 100;

  const heightMm = Math.min(
    Math.max(preferredHeightFromFloor, 200),
    ceilingH - deviceHeight - 50,
  );

  for (let pos = margin; pos <= length - margin; pos += step) {
    const start = pos - deviceWidth / 2;
    const end = pos + deviceWidth / 2;

    if (start < 50 || end > length - 50) continue;
    if (overlapsOpening(elements, start, end, clearance)) continue;

    let score = 100;

    // Penalty: too close to a corner
    if (start < 300 || end > length - 300) score -= PENALTY_NEAR_CORNER;

    // Extra device-specific penalties
    score -= extraPenalty;

    // Prefer centre of wall
    const centre = length / 2;
    const distFromCentre = Math.abs(pos - centre) / (length / 2);
    score -= distFromCentre * 10;

    results.push({ positionMm: pos, heightMm, score: Math.max(0, score) });
  }

  return results.sort((a, b) => b.score - a.score);
}

// ─── Public solver options ────────────────────────────────────────────────────

export type WallMaterial = "brick" | "concrete" | "drywall";

export interface SolverOptions {
  exteriorWall?: WallId;
  panelWall?: WallId;           // if omitted, auto-detected as wall containing a door
  wallMaterial?: WallMaterial;  // drywall → shtroblash = 0
}

// ─── Auto-detect panel wall from doors ───────────────────────────────────────

function detectPanelWall(geo: RoomGeometry): WallId {
  for (const id of ["D", "A", "B", "C"] as WallId[]) {
    const wall = geo.walls.find((w) => w.id === id);
    if (wall?.elements.some((e) => e.type === "eshik")) return id;
  }
  return "D"; // fallback
}

// ─── Main solver ──────────────────────────────────────────────────────────────

export function solvePlacements(
  geo: RoomGeometry,
  ceilingH: number,
  exteriorWallOrOpts: WallId | SolverOptions = "A",
): PlacementResult {
  const opts: SolverOptions =
    typeof exteriorWallOrOpts === "string"
      ? { exteriorWall: exteriorWallOrOpts }
      : exteriorWallOrOpts;

  const exteriorWall = opts.exteriorWall ?? "A";
  const wallMaterial = opts.wallMaterial ?? "concrete";
  const shtroblashFactor = wallMaterial === "drywall" ? 0 : 1;
  const walls: WallId[] = ["A", "B", "C", "D"];

  const placements: DevicePlacement[] = [];

  // ── AC placement ──────────────────────────────────────────────────────────
  const acHeightFromFloor = ceilingH - AC_HEIGHT_FROM_CEILING - AC_HEIGHT_SPAN;

  for (const wallId of walls) {
    const isExterior = wallId === exteriorWall;
    const windowPenalty = hasWindow(geo, wallId) ? PENALTY_WINDOW_WALL : 0;
    const extPenalty = isExterior ? 0 : PENALTY_FAR_FROM_EXTERIOR;
    const extra = windowPenalty + extPenalty;

    const positions = scorePositions(
      geo, wallId, AC_WIDTH, AC_HEIGHT_SPAN,
      acHeightFromFloor, ceilingH, AC_CLEARANCE_FROM_OPENING, extra,
    );

    if (positions.length === 0) continue;

    const best = positions[0];
    const notes: string[] = [];

    if (isExterior) {
      notes.push("Tashqi devorda — trassa qisqa bo'ladi ✓");
    } else {
      notes.push("Tashqi devor emas — tashqi blok uchun trassa uzunroq bo'ladi");
    }
    if (hasWindow(geo, wallId)) {
      notes.push("Derazali devorda — to'g'ridan-to'g'ri quyosh tushishi mumkin");
    }
    if (best.positionMm > wallLength(geo, wallId) * 0.3 && best.positionMm < wallLength(geo, wallId) * 0.7) {
      notes.push("Markaz yaqinida — havo teng tarqaladi ✓");
    }
    if (isExterior) notes.push("+25 ball bonus: tashqi devor");

    placements.push({
      device: "ac",
      wallId,
      positionMm: best.positionMm,
      heightMm: best.heightMm,
      widthMm: AC_WIDTH,
      heightSpanMm: AC_HEIGHT_SPAN,
      score: best.score + (isExterior ? BONUS_EXTERIOR_WALL : 0),
      rank: 0,
      notes,
    });
  }

  // ── TV placement ──────────────────────────────────────────────────────────
  for (const wallId of walls) {
    const windowPenalty = hasWindow(geo, wallId) ? PENALTY_WINDOW_WALL : 0;

    const positions = scorePositions(
      geo, wallId, TV_WIDTH, TV_HEIGHT_SPAN,
      TV_HEIGHT_FROM_FLOOR, ceilingH, TV_CLEARANCE_FROM_OPENING, windowPenalty,
    );

    if (positions.length === 0) continue;

    const best = positions[0];
    const notes: string[] = [];

    if (hasWindow(geo, wallId)) {
      notes.push("Derazali devorda — ekranga quyosh tushadi, ko'rinish yomonlashadi");
    } else {
      notes.push("Deraza yo'q — blik bo'lmaydi ✓");
    }

    // Check opposite wall has enough space (viewing distance)
    const oppWall = wallId === "A" ? "C" : wallId === "C" ? "A" : wallId === "B" ? "D" : "B";
    const depth = wallLength(geo, ["A", "C"].includes(wallId) ? "B" : "A");
    const minViewDist = 1500;
    if (depth >= minViewDist) {
      notes.push(`Ko'rish masofasi: ${(depth / 1000).toFixed(1)} m ✓`);
    } else {
      notes.push(`Ko'rish masofasi kalta: ${(depth / 1000).toFixed(1)} m (1.5 m minimum)`);
    }
    void oppWall;

    placements.push({
      device: "tv",
      wallId,
      positionMm: best.positionMm,
      heightMm: TV_HEIGHT_FROM_FLOOR,
      widthMm: TV_WIDTH,
      heightSpanMm: TV_HEIGHT_SPAN,
      score: best.score,
      rank: 0,
      notes,
    });
  }

  // ── Rank by device ────────────────────────────────────────────────────────
  for (const device of ["ac", "tv"] as const) {
    const group = placements
      .filter((p) => p.device === device)
      .sort((a, b) => b.score - a.score);
    group.forEach((p, i) => { p.rank = i + 1; });
  }

  // Keep only top-3 per device
  const top = placements.filter((p) => p.rank <= 3);

  // ── Panel & routing ───────────────────────────────────────────────────────
  const panelWall: WallId = opts.panelWall ?? detectPanelWall(geo);
  const panelPositionMm = PANEL_OFFSET_FROM_CORNER;
  const panelHeightMm = PANEL_HEIGHT;

  const routes = computeRoutes(top, geo, ceilingH, panelWall, panelPositionMm, panelHeightMm, shtroblashFactor);

  const totalCableM = routes.reduce((s, r) => s + r.totalLengthM, 0);
  const totalShtroblashM = routes.reduce((s, r) => s + r.shtroblashM, 0);

  return {
    placements: top,
    routes,
    panelWall,
    panelPositionMm,
    panelHeightMm,
    totalCableM,
    totalShtroblashM,
  };
}

// ─── Routing ──────────────────────────────────────────────────────────────────

function computeRoutes(
  placements: DevicePlacement[],
  geo: RoomGeometry,
  ceilingH: number,
  panelWall: WallId,
  panelPosMm: number,
  panelHeightMm: number,
  shtroblashFactor: number,
): WireRoute[] {
  return placements
    .filter((p) => p.rank === 1)
    .map((p) => routeToDevice(p, geo, ceilingH, panelWall, panelPosMm, panelHeightMm, shtroblashFactor));
}

function routeToDevice(
  device: DevicePlacement,
  _geo: RoomGeometry,
  ceilingH: number,
  panelWall: WallId,
  panelPosMm: number,
  panelHeightMm: number,
  shtroblashFactor = 1,
): WireRoute {
  const magistralH = ceilingH - HORIZONTAL_CABLE_HEIGHT_FROM_CEILING;
  const segments: WireSegment[] = [];

  // 1. Rise from panel to magistral height
  if (panelHeightMm < magistralH) {
    const riseLen = magistralH - panelHeightMm;
    segments.push({
      wallId: panelWall,
      startMm: panelPosMm,
      endMm: panelPosMm,
      heightMm: panelHeightMm,
      isVertical: true,
    });
    void riseLen;
  }

  // 2. Horizontal magistral along panel wall to corner, then along device wall
  // Simplified: we compute total length geometrically
  const sameWall = device.wallId === panelWall;

  if (sameWall) {
    // Run horizontally to device x-position at magistral height
    segments.push({
      wallId: panelWall,
      startMm: panelPosMm,
      endMm: device.positionMm,
      heightMm: magistralH,
      isVertical: false,
    });
  } else {
    // Run to corner of panel wall, then along device wall
    segments.push({
      wallId: panelWall,
      startMm: panelPosMm,
      endMm: 0,
      heightMm: magistralH,
      isVertical: false,
    });
    segments.push({
      wallId: device.wallId,
      startMm: 0,
      endMm: device.positionMm,
      heightMm: magistralH,
      isVertical: false,
    });
  }

  // 3. Drop from magistral height to device height
  const dropLen = magistralH - device.heightMm;
  if (dropLen > 0) {
    segments.push({
      wallId: device.wallId,
      startMm: device.positionMm,
      endMm: device.positionMm,
      heightMm: device.heightMm,
      isVertical: true,
    });
  }
  void dropLen;

  // Compute total length
  let totalMm = 0;

  // Panel rise
  totalMm += Math.abs(magistralH - panelHeightMm);

  if (sameWall) {
    totalMm += Math.abs(device.positionMm - panelPosMm);
  } else {
    totalMm += panelPosMm; // to corner of panel wall
    totalMm += device.positionMm; // along device wall from corner
  }

  // Drop
  totalMm += Math.abs(magistralH - device.heightMm);

  // Add 10% slack
  totalMm *= 1.1;

  return {
    device: device.device,
    segments,
    totalLengthM: totalMm / 1000,
    shtroblashM: (totalMm / 1000) * shtroblashFactor,
  };
}
