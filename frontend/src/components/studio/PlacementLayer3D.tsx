/**
 * 3D placement visualization — ghost device meshes + wire route lines.
 * Rendered inside a React Three Fiber Canvas.
 * All dimensions in millimetres; converted to metres for Three.js.
 */

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import type { RoomGeometry } from "@/store/roomStore";
import type { DevicePlacement, PlacementResult, WallId } from "@/lib/placement";

const S = 1 / 1000; // mm → m

// ─── Room extent helpers ──────────────────────────────────────────────────────

function roomExtents(geo: RoomGeometry) {
  const wallA = geo.walls.find((w) => w.id === "A");
  const wallB = geo.walls.find((w) => w.id === "B");
  return {
    W: (wallB?.length ?? 3000) * S, // width  (X axis)
    D: (wallA?.length ?? 4000) * S, // depth  (Z axis)
  };
}

// ─── Wall-position → 3D world position ───────────────────────────────────────
// Room is centred at origin: walls at ±W/2 (X) and ±D/2 (Z)
// Wall A: z = -D/2, facing +Z, position runs along X from -W/2
// Wall B: x = +W/2, facing -X, position runs along Z from -D/2
// Wall C: z = +D/2, facing -Z, position runs along X from -W/2
// Wall D: x = -W/2, facing +X, position runs along Z from -D/2

function wallPos(
  wallId: WallId,
  positionMm: number,
  heightMm: number,
  W: number,
  D: number,
): [number, number, number] {
  const p = positionMm * S;
  const y = heightMm * S;
  switch (wallId) {
    case "A": return [p - W / 2, y, -D / 2];
    case "B": return [W / 2, y, p - D / 2];
    case "C": return [p - W / 2, y, D / 2];
    case "D": return [-W / 2, y, p - D / 2];
  }
}

// ─── Ghost device mesh ────────────────────────────────────────────────────────

const DEVICE_STYLE: Record<string, { color: string; emissive: string }> = {
  ac:      { color: "#A8DADC", emissive: "#185FA5" },
  tv:      { color: "#555555", emissive: "#222222" },
  rozetka: { color: "#FFD166", emissive: "#888800" },
};

const RANK_OPACITY = [0.85, 0.45, 0.2];

interface GhostDeviceProps {
  placement: DevicePlacement;
  W: number;
  D: number;
  selected: boolean;
}

function GhostDevice({ placement, W, D, selected }: GhostDeviceProps) {
  const { device, wallId, positionMm, heightMm, widthMm, heightSpanMm, rank } = placement;
  const style = DEVICE_STYLE[device] ?? DEVICE_STYLE.ac;
  const opacity = RANK_OPACITY[rank - 1] ?? 0.15;

  const depthMetre = 0.12; // 12 cm protrusion from wall
  const wM = widthMm * S;
  const hM = heightSpanMm * S;

  // Centre position of device on wall
  const [bx, by, bz] = wallPos(wallId, positionMm, heightMm + heightSpanMm / 2, W, D);

  // Push device slightly off the wall surface
  const wallOffset: [number, number, number] =
    wallId === "A" ? [0, 0, depthMetre / 2] :
    wallId === "B" ? [-depthMetre / 2, 0, 0] :
    wallId === "C" ? [0, 0, -depthMetre / 2] :
               [depthMetre / 2, 0, 0];

  const [gx, gy, gz] = [bx + wallOffset[0], by + wallOffset[1], bz + wallOffset[2]];

  const geomArgs: [number, number, number] =
    wallId === "A" || wallId === "C"
      ? [wM, hM, depthMetre]
      : [depthMetre, hM, wM];

  return (
    <mesh position={[gx, gy, gz]}>
      <boxGeometry args={geomArgs} />
      <meshStandardMaterial
        color={selected ? "#D85A30" : style.color}
        emissive={selected ? "#D85A30" : style.emissive}
        emissiveIntensity={selected ? 0.5 : 0.1}
        transparent
        opacity={opacity}
        roughness={0.4}
      />
    </mesh>
  );
}

// ─── Wire route lines ─────────────────────────────────────────────────────────

const DEVICE_WIRE_COLOR: Record<string, string> = {
  ac: "#185FA5",
  tv: "#888888",
  rozetka: "#D4A017",
};

interface WireRouteLinesProps {
  result: PlacementResult;
  W: number;
  D: number;
}

function WireRouteLines({ result, W, D }: WireRouteLinesProps) {
  const lines = useMemo(() => {
    return result.routes.map((route) => {
      const points: [number, number, number][] = [];
      const color = DEVICE_WIRE_COLOR[route.device] ?? "#888";

      for (const seg of route.segments) {
        const start = wallPos(seg.wallId, seg.startMm, seg.heightMm, W, D);
        const end = seg.isVertical
          ? wallPos(seg.wallId, seg.startMm, seg.heightMm + (result.panelHeightMm < seg.heightMm ? -300 : 300), W, D)
          : wallPos(seg.wallId, seg.endMm, seg.heightMm, W, D);
        points.push(start, end);
      }

      return { color, points };
    });
  }, [result, W, D]);

  return (
    <>
      {lines.map((l, i) =>
        l.points.length >= 2 ? (
          <Line
            key={i}
            points={l.points}
            color={l.color}
            lineWidth={2}
            dashed
            dashSize={0.06}
            gapSize={0.03}
          />
        ) : null,
      )}
    </>
  );
}

// ─── Panel indicator ──────────────────────────────────────────────────────────

function PanelBox({ result, W, D }: { result: PlacementResult; W: number; D: number }) {
  const [px, py, pz] = wallPos(result.panelWall, result.panelPositionMm, result.panelHeightMm + 0.2, W, D);
  return (
    <mesh position={[px, py, pz]}>
      <boxGeometry args={[0.04, 0.4, 0.04]} />
      <meshStandardMaterial color="#185FA5" emissive="#185FA5" emissiveIntensity={0.3} />
    </mesh>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export interface PlacementLayer3DProps {
  geometry: RoomGeometry;
  result: PlacementResult;
  selectedId: string | null;
}

export function PlacementLayer3D({ geometry, result, selectedId }: PlacementLayer3DProps) {
  const { W, D } = useMemo(() => roomExtents(geometry), [geometry]);

  return (
    <group>
      {result.placements.map((p) => (
        <GhostDevice
          key={`${p.device}-${p.wallId}`}
          placement={p}
          W={W}
          D={D}
          selected={selectedId === `${p.device}-${p.wallId}`}
        />
      ))}

      <WireRouteLines result={result} W={W} D={D} />
      <PanelBox result={result} W={W} D={D} />
    </group>
  );
}
