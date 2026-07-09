/**
 * SVG overlay that draws AC/TV placement candidates and cable routing
 * on top of the IsometricSVG coordinate system.
 */

import { useMemo, useState } from "react";
import type { RoomGeometry } from "@/store/roomStore";
import { solvePlacements } from "@/lib/placement";
import type { DevicePlacement, PlacementResult, WallId } from "@/lib/placement";

// ─── Isometric projection helpers ────────────────────────────────────────────

interface IsoParams {
  w: number;   // room width metres
  l: number;   // room length metres
  h: number;   // ceiling height metres
  scale: number;
  ox: number;  // SVG origin x (front-bottom corner)
  oy: number;  // SVG origin y
  ceilPx: number;
}

function buildIso(
  roomWidthMm: number,
  roomLengthMm: number,
  ceilingHeightMm: number,
): IsoParams {
  const w = Math.max(roomWidthMm / 1000, 2);
  const l = Math.max(roomLengthMm / 1000, 2);
  const h = ceilingHeightMm / 1000;
  const scale = 60;
  const isoX = scale * Math.cos(Math.PI / 6);
  const isoY = scale * Math.sin(Math.PI / 6);
  const ceilPx = h * scale * 0.8;
  const svgW = (w + l) * isoX + 40;
  const svgH = (w + l) * isoY + ceilPx + 40;
  const ox = svgW / 2;
  const oy = svgH - 20;
  return { w, l, h, scale, ox, oy, ceilPx };
}

type IsoPoint = { x: number; y: number };

/**
 * Projects a point on a wall face into SVG coordinates.
 *
 * Wall layout (seen from above):
 *   D = front-left  (width axis, from front corner toward left = +W direction)
 *   B = front-right (length axis, from front corner toward right = +L direction)
 *   A = back-left   (length axis, from left corner toward back)
 *   C = back-right  (width axis, from right corner toward back)
 *
 * @param wallId     which wall
 * @param positionMm distance along wall from its left edge (viewer-facing left)
 * @param heightMm   height from floor in mm
 * @param ceiling    ceiling height in mm
 */
function projectWallPoint(
  wallId: WallId,
  positionMm: number,
  heightMm: number,
  ceilingMm: number,
  iso: IsoParams,
): IsoPoint {
  const scale = iso.scale;
  const isoX = scale * Math.cos(Math.PI / 6);
  const isoY = scale * Math.sin(Math.PI / 6);

  // Front-bottom corner of each wall in room-space, then project
  // Room space: X = width direction (right), Y = length direction (depth)
  // Front corner ptA = (0, 0), ptB = (0, l), ptC = (w, l), ptD = (w, 0)
  // Wall D: from ptA(0,0) to ptD(w,0)  — along X axis, facing front viewer
  // Wall B: from ptA(0,0) to ptB(0,l)  — along Y axis, facing right viewer
  // Wall A: from ptD(w,0) to ptC(w,l)  — along Y axis, back-right
  // Wall C: from ptB(0,l) to ptC(w,l)  — along X axis, back

  const tM = positionMm / 1000;

  // Isometric projection: room (rx, ry) → SVG
  // SVG_x = ox + (ry * isoX) - (rx * isoX)
  // SVG_y = oy - (rx * isoY) - (ry * isoY) - heightPx

  const heightPx = (heightMm / ceilingMm) * iso.ceilPx;

  let rx: number;
  let ry: number;

  switch (wallId) {
    case "D": // left wall: from ptA(0,0) to ptB(w→ measured as D length)
      rx = tM;
      ry = 0;
      break;
    case "B": // right wall: from ptA(0,0) to ptD (depth direction)
      rx = 0;
      ry = tM;
      break;
    case "A": // back-left wall: from ptB(w,0) along depth
      rx = iso.w;
      ry = tM;
      break;
    case "C": // back-right wall: from ptD(0,l) along width
      rx = tM;
      ry = iso.l;
      break;
  }

  const sx = iso.ox - rx * isoX + ry * isoX;
  const sy = iso.oy - rx * isoY - ry * isoY - heightPx;

  return { x: sx, y: sy };
}

/** Returns isoX/isoY vector along the wall surface in SVG space (per mm). */
function wallDirVector(wallId: WallId, iso: IsoParams): IsoPoint {
  const scale = iso.scale;
  const isoX = scale * Math.cos(Math.PI / 6);
  const isoY = scale * Math.sin(Math.PI / 6);
  const perMm = 1 / 1000;
  switch (wallId) {
    case "D": return { x: -isoX * perMm, y: -isoY * perMm }; // +rx dir
    case "B": return { x: +isoX * perMm, y: -isoY * perMm }; // +ry dir
    case "A": return { x: +isoX * perMm, y: -isoY * perMm }; // +ry dir
    case "C": return { x: -isoX * perMm, y: -isoY * perMm }; // +rx dir
  }
}

// ─── Device rendering ─────────────────────────────────────────────────────────

const DEVICE_COLORS = {
  ac: { fill: "#A8DADC", stroke: "#185FA5", label: "❄️ Konditsioner" },
  tv: { fill: "#2D2D2D", stroke: "#444", label: "📺 TV" },
  rozetka: { fill: "#FFD166", stroke: "#888", label: "⚡ Rozetka" },
};

const RANK_OPACITY = [1, 0.55, 0.3];

interface DeviceBoxProps {
  placement: DevicePlacement;
  ceilingMm: number;
  iso: IsoParams;
  onClick: () => void;
  selected: boolean;
}

function DeviceBox({ placement, ceilingMm, iso, onClick, selected }: DeviceBoxProps) {
  const { device, wallId, positionMm, heightMm, widthMm, heightSpanMm, rank } = placement;
  const colors = DEVICE_COLORS[device];
  // Selected device is always fully opaque; others fade by rank
  const opacity = selected ? 1 : (RANK_OPACITY[rank - 1] ?? 0.2);

  const dir = wallDirVector(wallId, iso);

  const pBase = projectWallPoint(wallId, positionMm - widthMm / 2, heightMm, ceilingMm, iso);
  const pBaseR = projectWallPoint(wallId, positionMm + widthMm / 2, heightMm, ceilingMm, iso);
  const heightPx = (heightSpanMm / ceilingMm) * iso.ceilPx;

  const bl = pBase;
  const br = pBaseR;
  const tl = { x: pBase.x, y: pBase.y - heightPx };
  const tr = { x: pBaseR.x, y: pBaseR.y - heightPx };
  void dir;

  const points = [bl, br, tr, tl].map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  const cx = (bl.x + br.x + tl.x + tr.x) / 4;
  const cy = (bl.y + br.y + tl.y + tr.y) / 4;

  return (
    <g opacity={opacity} onClick={onClick} style={{ cursor: "pointer" }}>
      {/* Glow ring when selected */}
      {selected && (
        <polygon points={points} fill="none" stroke="#D85A30" strokeWidth={5} strokeOpacity={0.25} />
      )}
      <polygon
        points={points}
        fill={selected ? colors.stroke : colors.fill}
        stroke={selected ? "#D85A30" : colors.stroke}
        strokeWidth={selected ? 2.5 : 1.5}
        strokeDasharray={rank > 1 && !selected ? "4 3" : undefined}
      />
      {/* Show rank badge for selected device at any rank, or always for rank-1 */}
      {(rank === 1 || selected) && (
        <circle cx={cx} cy={cy} r={8} fill={selected ? "#D85A30" : colors.stroke} />
      )}
      {(rank === 1 || selected) && (
        <text
          x={cx} y={cy + 4}
          textAnchor="middle"
          fontSize="8"
          fill="white"
          style={{ pointerEvents: "none", userSelect: "none", fontWeight: "bold" }}
        >
          {rank}
        </text>
      )}
    </g>
  );
}

// ─── Wire routing ─────────────────────────────────────────────────────────────

interface WirePathProps {
  result: PlacementResult;
  ceilingMm: number;
  iso: IsoParams;
}

function WirePaths({ result, ceilingMm, iso }: WirePathProps) {
  return (
    <>
      {result.routes.map((route, ri) => {
        const color = DEVICE_COLORS[route.device].stroke;
        const pathParts: string[] = [];

        for (const seg of route.segments) {
          const start = projectWallPoint(seg.wallId, seg.startMm, seg.heightMm, ceilingMm, iso);
          const end = seg.isVertical
            ? projectWallPoint(seg.wallId, seg.startMm, seg.heightMm - 100, ceilingMm, iso)
            : projectWallPoint(seg.wallId, seg.endMm, seg.heightMm, ceilingMm, iso);

          if (pathParts.length === 0) {
            pathParts.push(`M ${start.x.toFixed(1)} ${start.y.toFixed(1)}`);
          } else {
            pathParts.push(`L ${start.x.toFixed(1)} ${start.y.toFixed(1)}`);
          }
          pathParts.push(`L ${end.x.toFixed(1)} ${end.y.toFixed(1)}`);
        }

        return (
          <path
            key={ri}
            d={pathParts.join(" ")}
            stroke={color}
            strokeWidth={1.8}
            fill="none"
            strokeDasharray="6 3"
            opacity={0.85}
          />
        );
      })}

      {/* Panel indicator */}
      {(() => {
        const panelPt = projectWallPoint(
          result.panelWall,
          result.panelPositionMm,
          result.panelHeightMm,
          ceilingMm,
          iso,
        );
        return (
          <g>
            <rect
              x={panelPt.x - 8} y={panelPt.y - 10}
              width={16} height={20}
              rx={2}
              fill="#185FA5"
              stroke="#0D3A6B"
              strokeWidth={1}
            />
            <text
              x={panelPt.x} y={panelPt.y + 4}
              textAnchor="middle"
              fontSize="7"
              fill="white"
              style={{ pointerEvents: "none", userSelect: "none", fontWeight: "bold" }}
            >
              Щ
            </text>
          </g>
        );
      })()}
    </>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  selected,
  result,
}: {
  selected: DevicePlacement | null;
  result: PlacementResult;
}) {
  if (!selected) {
    return (
      <div className="p-3 text-xs text-gray-500 text-center">
        Qurilmaga bosib tafsilotlarni ko'ring
      </div>
    );
  }

  const colors = DEVICE_COLORS[selected.device];
  const route = result.routes.find((r) => r.device === selected.device);

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div
          className="w-3 h-3 rounded-sm border flex-shrink-0"
          style={{ backgroundColor: colors.fill, borderColor: colors.stroke }}
        />
        <span className="text-xs font-bold text-gray-900">
          {colors.label} — {selected.wallId} devor (#{selected.rank} variant)
        </span>
        <span
          className="ml-auto text-xs font-bold px-1.5 py-0.5 rounded"
          style={{ background: colors.fill, color: colors.stroke }}
        >
          {selected.score.toFixed(0)} ball
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1 text-xs">
        <div className="bg-gray-50 rounded p-1.5">
          <p className="text-gray-400">Balandlik</p>
          <p className="font-semibold">{(selected.heightMm / 1000).toFixed(2)} m</p>
        </div>
        <div className="bg-gray-50 rounded p-1.5">
          <p className="text-gray-400">Pozitsiya</p>
          <p className="font-semibold">{(selected.positionMm / 1000).toFixed(2)} m</p>
        </div>
        {route && (
          <>
            <div className="bg-blue-50 rounded p-1.5">
              <p className="text-gray-400">Kabel</p>
              <p className="font-semibold text-blue-700">{route.totalLengthM.toFixed(1)} m</p>
            </div>
            <div className="bg-blue-50 rounded p-1.5">
              <p className="text-gray-400">Shtroblash</p>
              <p className="font-semibold text-blue-700">{route.shtroblashM.toFixed(1)} m</p>
            </div>
          </>
        )}
      </div>

      <ul className="space-y-0.5">
        {selected.notes.map((n, i) => (
          <li key={i} className="text-xs text-gray-600 flex gap-1.5">
            <span className="text-gray-400 flex-shrink-0">•</span>
            <span>{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Summary bar ──────────────────────────────────────────────────────────────

function SummaryBar({ result }: { result: PlacementResult }) {
  return (
    <div className="flex gap-3 px-3 py-2 border-b border-gray-100 bg-white/80 text-xs">
      <div>
        <span className="text-gray-400">Jami kabel: </span>
        <span className="font-semibold">{result.totalCableM.toFixed(1)} m</span>
      </div>
      <div>
        <span className="text-gray-400">Shtroblash: </span>
        <span className="font-semibold">{result.totalShtroblashM.toFixed(1)} m</span>
      </div>
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export interface PlacementOverlayProps {
  geometry: RoomGeometry;
  ceilingHeightMm: number;
  svgW: number;
  svgH: number;
}

export function PlacementOverlaySVG({
  geometry,
  ceilingHeightMm,
  svgW,
  svgH: _svgH,
}: PlacementOverlayProps & { selectedId: string | null }) {
  const wallA = geometry.walls.find((w) => w.id === "A");
  const wallB = geometry.walls.find((w) => w.id === "B");
  const roomWidthMm = wallA?.length ?? 4000;
  const roomLengthMm = wallB?.length ?? 3000;

  const iso = useMemo(
    () => buildIso(roomWidthMm, roomLengthMm, ceilingHeightMm),
    [roomWidthMm, roomLengthMm, ceilingHeightMm],
  );
  void svgW;

  const result = useMemo(
    () => solvePlacements(geometry, ceilingHeightMm),
    [geometry, ceilingHeightMm],
  );

  return (
    <>
      <WirePaths result={result} ceilingMm={ceilingHeightMm} iso={iso} />
    </>
  );
}

/** Full panel — renders the devices + sidebar. Wraps the SVG overlay externally. */
export default function PlacementAdvisor({
  geometry,
  ceilingHeightMm,
}: {
  geometry: RoomGeometry;
  ceilingHeightMm: number;
  room?: unknown;
}) {
  const wallA = geometry.walls.find((w) => w.id === "A");
  const wallB = geometry.walls.find((w) => w.id === "B");
  const roomWidthMm = wallA?.length ?? 4000;
  const roomLengthMm = wallB?.length ?? 3000;

  const iso = useMemo(
    () => buildIso(roomWidthMm, roomLengthMm, ceilingHeightMm),
    [roomWidthMm, roomLengthMm, ceilingHeightMm],
  );

  const result = useMemo(
    () => solvePlacements(geometry, ceilingHeightMm),
    [geometry, ceilingHeightMm],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedPlacement = result.placements.find(
    (p) => `${p.device}-${p.wallId}` === selectedId,
  ) ?? null;

  const svgW = (iso.w + iso.l) * iso.scale * Math.cos(Math.PI / 6) + 40;
  const svgH = (iso.w + iso.l) * iso.scale * Math.sin(Math.PI / 6) + iso.ceilPx + 40;

  return (
    <div className="flex flex-col h-full min-h-0">
      <SummaryBar result={result} />

      <div className="flex flex-1 min-h-0">
        {/* SVG canvas */}
        <div className="flex-1 overflow-auto flex items-center justify-center bg-paper p-4">
          <div className="w-full max-w-2xl">
            <svg
              viewBox={`0 0 ${svgW} ${svgH}`}
              className="w-full drop-shadow-xl select-none"
            >
              {/* Devices */}
              {result.placements.map((p) => (
                <DeviceBox
                  key={`${p.device}-${p.wallId}`}
                  placement={p}
                  ceilingMm={ceilingHeightMm}
                  iso={iso}
                  selected={selectedId === `${p.device}-${p.wallId}`}
                  onClick={() =>
                    setSelectedId((prev) =>
                      prev === `${p.device}-${p.wallId}` ? null : `${p.device}-${p.wallId}`,
                    )
                  }
                />
              ))}

              {/* Wire routes */}
              <WirePaths result={result} ceilingMm={ceilingHeightMm} iso={iso} />
            </svg>
          </div>
        </div>

        {/* Detail sidebar */}
        <div className="w-64 flex-shrink-0 border-l border-gray-100 bg-white overflow-y-auto">
          {/* Legend */}
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-700 mb-1.5">Variantlar</p>
            <div className="space-y-1">
              {(["ac", "tv"] as const).map((dev) => (
                <div key={dev} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-sm border flex-shrink-0"
                    style={{
                      backgroundColor: DEVICE_COLORS[dev].fill,
                      borderColor: DEVICE_COLORS[dev].stroke,
                    }}
                  />
                  <span className="text-xs text-gray-600">{DEVICE_COLORS[dev].label}</span>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <div className="w-6 h-0 border-t-2 border-dashed border-blue-500 flex-shrink-0" />
                <span className="text-xs text-gray-600">Sim trassasi</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-4 bg-blue-700 rounded-sm flex-shrink-0" />
                <span className="text-xs text-gray-600">Щ щиток</span>
              </div>
            </div>
          </div>

          {/* Device list */}
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-700 mb-1.5">Qurilmalar</p>
            {(["ac", "tv"] as const).map((dev) => {
              const topOpts = result.placements.filter((p) => p.device === dev);
              return (
                <div key={dev} className="mb-2">
                  <p className="text-xs text-gray-500 mb-0.5">{DEVICE_COLORS[dev].label}</p>
                  <div className="space-y-0.5">
                    {topOpts.map((p) => {
                      const id = `${p.device}-${p.wallId}`;
                      return (
                        <button
                          key={id}
                          onClick={() => setSelectedId((prev) => (prev === id ? null : id))}
                          className={[
                            "w-full text-left text-xs px-2 py-1 rounded transition-colors",
                            selectedId === id
                              ? "bg-brand/10 text-brand font-semibold"
                              : "hover:bg-gray-50 text-gray-700",
                          ].join(" ")}
                        >
                          #{p.rank} {p.wallId} devor — {p.score.toFixed(0)} ball
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <DetailPanel selected={selectedPlacement} result={result} />
        </div>
      </div>
    </div>
  );
}
