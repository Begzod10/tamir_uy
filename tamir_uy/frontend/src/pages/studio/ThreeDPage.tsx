import { Suspense, memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  ContactShadows,
  PerformanceMonitor,
  Html,
  useGLTF,
} from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useOutletContext } from "react-router-dom";
import { useRoomStore, resolveWallCovering } from "@/store/roomStore";
import type { PlacedFurniture, UserFurnitureEntry } from "@/store/roomStore";
import { DesignPanel } from "@/components/studio/DesignPanel";
import type { RoomGeometry, DesignState, WallCovering, WallElement } from "@/store/roomStore";
import { createOboyTexture } from "@/lib/oboyPatterns";
import type { OboyPatternId } from "@/lib/oboyPatterns";
import { resolveElementPositions } from "@/lib/wallPositions";
import { FURNITURE_CATALOG } from "@/lib/furnitureCatalog";
import type { Room } from "@/lib/api";
import * as THREE from "three";


export interface StudioContext {
  room: Room;
}

// ─── Surface color defaults ───────────────────────────────────────────────────

const CEILING_DEFAULT = "#F8F6F2";

function shadeHex(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const sh = (v: number) => Math.round(v * factor).toString(16).padStart(2, "0");
  return `#${sh(r)}${sh(g)}${sh(b)}`;
}

// ─── Floor with canvas texture ────────────────────────────────────────────────

const FLOOR_COLORS: Record<string, string> = {
  parquet: "#C9AB7E",
  laminate: "#B8906A",
  tile: "#D8D8D0",
  concrete: "#9E9E9E",
};

function WoodFloor({ width, depth, floorType }: { width: number; depth: number; floorType: string }) {
  const floorColor = FLOOR_COLORS[floorType] ?? FLOOR_COLORS.parquet;

  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = floorColor;
    ctx.fillRect(0, 0, 512, 512);

    const plankH = 64;
    for (let y = 0; y < 512; y += plankH) {
      ctx.fillStyle = "rgba(0,0,0,0.06)";
      ctx.fillRect(0, y, 512, 1.5);
      ctx.strokeStyle = "rgba(0,0,0,0.04)";
      ctx.lineWidth = 0.5;
      for (let g = 0; g < 6; g++) {
        const gy = y + 8 + g * 8;
        ctx.beginPath();
        ctx.moveTo(0, gy + Math.sin(g * 1.7) * 3);
        ctx.bezierCurveTo(128, gy + 2, 384, gy - 2, 512, gy + Math.cos(g) * 2);
        ctx.stroke();
      }
    }
    for (let y = 0; y < 512; y += plankH * 2) {
      ctx.fillStyle = "rgba(0,0,0,0.05)";
      ctx.fillRect(256, y, 1.5, plankH);
      ctx.fillRect(0, y + plankH, 1.5, plankH);
    }

    // Tile overlay for non-parquet types
    if (floorType === "tile") {
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 2;
      for (let x = 0; x <= 512; x += 64) ctx.beginPath(), ctx.moveTo(x, 0), ctx.lineTo(x, 512), ctx.stroke();
      for (let y = 0; y <= 512; y += 64) ctx.beginPath(), ctx.moveTo(0, y), ctx.lineTo(512, y), ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(width * 2.5, depth * 2.5);
    return tex;
  }, [width, depth, floorType, floorColor]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
      <planeGeometry args={[width, depth]} />
      <meshStandardMaterial map={texture} roughness={0.55} metalness={0.05} envMapIntensity={0.4} />
    </mesh>
  );
}

// ─── Wall with door/window openings ──────────────────────────────────────────

const WALLPAPER_WIDTH_M = 1.06 // standard roll width

interface WallProps {
  wallId: string;
  length: number;
  height: number;
  thickness: number;
  covering: WallCovering;
  elements: Array<{
    id: string;
    type: 'eshik' | 'deraza' | 'balkon';
    width: number;
    height: number;
    sill_height: number;
    position: number;
  }>;
  axis: "X" | "Z";
  cx: number;
  cz: number;
}

/*
 * Seg stores the inner-face PLANE of each wall segment, not a box.
 *
 * Using PlaneGeometry with Three.js default FrontSide means:
 *  • From inside the room the plane's normal faces the camera → VISIBLE ✓
 *  • From outside the plane's normal faces AWAY from camera → backface-culled,
 *    invisible — exactly like 3ds Max "Backface Cull" ✓
 *
 * px/py/pz — world position of the inner face plane centre
 * ry        — Y-rotation to align the plane's +Z normal to the correct
 *             room-inward direction:
 *               Wall A (back)  cz<0  ry=0      normal = +Z  (into room)
 *               Wall C (front) cz>0  ry=π      normal = −Z
 *               Wall B (right) cx>0  ry=−π/2   normal = −X
 *               Wall D (left)  cx<0  ry=+π/2   normal = +X
 * pw/ph     — plane width × height
 */
interface Seg {
  px: number; py: number; pz: number;
  ry: number;
  pw: number; ph: number;
  uOffset: number; uRepeat: number; vRepeat: number;
}

function WallSegment({
  seg,
  covering,
  baseTexture,
}: {
  seg: Seg;
  covering: WallCovering;
  baseTexture: THREE.CanvasTexture | null;
}) {
  const mat = useMemo(() => {
    if (covering.kind !== 'oboy' || !baseTexture) return null;
    const t = baseTexture.clone();
    t.repeat.set(seg.uRepeat, seg.vRepeat);
    t.offset.set(seg.uOffset, 0);
    t.needsUpdate = true;
    return t;
  }, [baseTexture, seg.uOffset, seg.uRepeat, seg.vRepeat]);

  const paintColor = covering.kind === 'paint' ? covering.color : '#ffffff';

  return (
    <mesh position={[seg.px, seg.py, seg.pz]} rotation={[0, seg.ry, 0]} receiveShadow>
      <planeGeometry args={[seg.pw, seg.ph]} />
      {covering.kind === 'paint' ? (
        <meshStandardMaterial color={paintColor} roughness={0.88} metalness={0} envMapIntensity={0.3} />
      ) : (
        <meshStandardMaterial map={mat ?? undefined} color="#ffffff" roughness={0.9} metalness={0} envMapIntensity={0.2} />
      )}
    </mesh>
  );
}

function Wall({ length, height, thickness, covering, elements, axis, cx, cz }: WallProps) {
  const oboyTexture = useMemo(() => {
    if (covering.kind !== 'oboy') return null;
    return createOboyTexture(covering.patternId as OboyPatternId, covering.baseColor, covering.accentColor);
  }, [
    covering.kind,
    covering.kind === 'oboy' ? covering.patternId : '',
    covering.kind === 'oboy' ? covering.baseColor : '',
    covering.kind === 'oboy' ? covering.accentColor : '',
  ]);

  const resolvedElements = useMemo(
    () => resolveElementPositions(elements, length * 1000),
    [elements, length],
  );

  const segments = useMemo(() => {
    const segs: Seg[] = [];
    const s = 1 / 1000;

    function makeSeg(
      posX: number, posY: number, posZ: number,
      sw: number, sh: number, sd: number,
      startMm: number,
    ): Seg {
      const segLenM = axis === 'X' ? sw : sd
      const startM = startMm / 1000
      const uOffset = (startM % WALLPAPER_WIDTH_M) / WALLPAPER_WIDTH_M
      const uRepeat = segLenM / WALLPAPER_WIDTH_M
      const vRepeat = sh / 1.0

      let px: number, py: number = posY, pz: number, ry: number, pw: number
      const ph = sh

      if (axis === 'X') {
        // Thickness runs in Z. Inner face offset ± T/2 along Z from centre.
        const faceDir = posZ <= 0 ? 1 : -1   // Wall A: cz<0 → +Z; Wall C: cz>0 → −Z
        px = posX
        pz = posZ + faceDir * thickness / 2
        ry = faceDir > 0 ? 0 : Math.PI
        pw = sw
      } else {
        // axis === 'Z': thickness runs in X. Inner face offset ± T/2 along X.
        const faceDir = posX >= 0 ? -1 : 1   // Wall B: cx>0 → −X; Wall D: cx<0 → +X
        px = posX + faceDir * thickness / 2
        pz = posZ
        ry = faceDir > 0 ? Math.PI / 2 : -Math.PI / 2
        pw = sd
      }

      return { px, py, pz, ry, pw, ph, uOffset, uRepeat, vRepeat }
    }

    if (resolvedElements.length === 0) {
      segs.push(makeSeg(
        cx, height / 2, cz,
        axis === 'X' ? length : thickness,
        height,
        axis === 'Z' ? length : thickness,
        0,
      ));
      return segs;
    }

    const sorted = [...resolvedElements].sort((a, b) => a.position - b.position);
    let cursor = 0;

    for (const el of sorted) {
      const elLeft = el.position;
      const elRight = el.position + el.width;
      const elTop = el.sill_height + el.height;

      if (elLeft > cursor) {
        const segW = (elLeft - cursor) * s;
        const offset = ((cursor + elLeft) / 2 - length * 500) * s;
        segs.push(axis === 'X'
          ? makeSeg(cx + offset, height / 2, cz, segW, height, thickness, cursor)
          : makeSeg(cx, height / 2, cz + offset, thickness, height, segW, cursor));
      }

      const elTopM = elTop * s;
      if (elTopM < height) {
        const panH = height - elTopM;
        const panCY = elTopM + panH / 2;
        const offset = ((elLeft + elRight) / 2 - length * 500) * s;
        const panW = el.width * s;
        segs.push(axis === 'X'
          ? makeSeg(cx + offset, panCY, cz, panW, panH, thickness, elLeft)
          : makeSeg(cx, panCY, cz + offset, thickness, panH, panW, elLeft));
      }

      if (el.sill_height > 0) {
        const silH = el.sill_height * s;
        const offset = ((elLeft + elRight) / 2 - length * 500) * s;
        const panW = el.width * s;
        segs.push(axis === 'X'
          ? makeSeg(cx + offset, silH / 2, cz, panW, silH, thickness, elLeft)
          : makeSeg(cx, silH / 2, cz + offset, thickness, silH, panW, elLeft));
      }

      cursor = elRight;
    }

    const totalMM = length * 1000;
    if (cursor < totalMM) {
      const segW = (totalMM - cursor) * s;
      const offset = ((cursor + totalMM) / 2 - length * 500) * s;
      segs.push(axis === 'X'
        ? makeSeg(cx + offset, height / 2, cz, segW, height, thickness, cursor)
        : makeSeg(cx, height / 2, cz + offset, thickness, height, segW, cursor));
    }

    return segs;
  }, [resolvedElements, length, height, thickness, axis, cx, cz]);

  return (
    <group>
      {segments.map((seg, i) => (
        <WallSegment key={i} seg={seg} covering={covering} baseTexture={oboyTexture} />
      ))}
    </group>
  );
}

// ─── Window glass panes ───────────────────────────────────────────────────────

function WindowPanes({
  geometry,
  wallWidth,
  wallDepth,
}: {
  geometry: RoomGeometry;
  wallWidth: number;
  wallDepth: number;
}) {
  const panes: React.ReactElement[] = [];
  const s = 1 / 1000;

  const wallDefs = [
    { id: "A", axis: "X" as const, cz: -wallDepth / 2, cx: 0, length: wallWidth },
    { id: "C", axis: "X" as const, cz: wallDepth / 2, cx: 0, length: wallWidth },
    { id: "B", axis: "Z" as const, cx: wallWidth / 2, cz: 0, length: wallDepth },
    { id: "D", axis: "Z" as const, cx: -wallWidth / 2, cz: 0, length: wallDepth },
  ];

  for (const wd of wallDefs) {
    const wall = geometry.walls.find((w) => w.id === wd.id);
    if (!wall) continue;

    const resolvedWallEls = resolveElementPositions(wall.elements, wd.length * 1000);
    for (const el of resolvedWallEls) {
      if (el.type !== "deraza" && el.type !== "balkon") continue;

      const elW = el.width * s;
      const elH = el.height * s;
      const elY = el.sill_height * s + elH / 2;
      const offset = (el.position + el.width / 2 - wd.length * 500) * s;

      const px = wd.axis === "X" ? wd.cx + offset : wd.cx;
      const pz = wd.axis === "Z" ? wd.cz + offset : wd.cz;
      const pW = wd.axis === "X" ? elW : 0.02;
      const pD = wd.axis === "Z" ? elW : 0.02;

      panes.push(
        <mesh key={`${wd.id}-${el.position}`} position={[px, elY, pz]}>
          <boxGeometry args={[pW, elH, pD]} />
          <meshPhysicalMaterial
            color="#B0CCE0"
            transparent
            opacity={0.22}
            roughness={0.05}
            metalness={0.0}
          />
        </mesh>,
      );
    }
  }
  return <>{panes}</>;
}

// ─── Baseboard trim ────────────────────────────────────────────────────────────

/** Returns (centerLocal, segLen) pairs in meters, skipping door openings. */
function boardSegments(
  wallLenM: number,
  elements: WallElement[],
): Array<{ center: number; len: number }> {
  const wallLenMm = wallLenM * 1000;
  const resolved = resolveElementPositions(elements, wallLenMm);
  const doors = resolved.filter(e => e.type === 'eshik').sort((a, b) => a.position - b.position);

  if (doors.length === 0) return [{ center: 0, len: wallLenM }];

  const segs: Array<{ center: number; len: number }> = [];
  let cursor = 0;
  for (const door of doors) {
    if (door.position > cursor) {
      const lenMm = door.position - cursor;
      segs.push({ center: ((cursor + door.position) / 2 - wallLenMm / 2) / 1000, len: lenMm / 1000 });
    }
    cursor = door.position + door.width;
  }
  if (cursor < wallLenMm) {
    segs.push({ center: ((cursor + wallLenMm) / 2 - wallLenMm / 2) / 1000, len: (wallLenMm - cursor) / 1000 });
  }
  return segs;
}

function Baseboard({ width, depth, geometry }: { width: number; depth: number; geometry: RoomGeometry }) {
  const h = 0.1;
  const t = 0.02;
  const color = "#E0D8CC";

  const wallA = geometry.walls.find(w => w.id === 'A');
  const wallB = geometry.walls.find(w => w.id === 'B');
  const wallC = geometry.walls.find(w => w.id === 'C');
  const wallD = geometry.walls.find(w => w.id === 'D');

  const segsA = boardSegments(width, wallA?.elements ?? []);
  const segsC = boardSegments(width, wallC?.elements ?? []);
  const segsB = boardSegments(depth, wallB?.elements ?? []);
  const segsD = boardSegments(depth, wallD?.elements ?? []);

  const mat = <meshStandardMaterial color={color} roughness={0.7} />;
  return (
    <group>
      {segsA.map((s, i) => (
        <mesh key={`A${i}`} position={[s.center, h / 2, -depth / 2 + t / 2]}>
          <boxGeometry args={[s.len, h, t]} />{mat}
        </mesh>
      ))}
      {segsC.map((s, i) => (
        <mesh key={`C${i}`} position={[s.center, h / 2, depth / 2 - t / 2]}>
          <boxGeometry args={[s.len, h, t]} />{mat}
        </mesh>
      ))}
      {segsB.map((s, i) => (
        <mesh key={`B${i}`} position={[width / 2 - t / 2, h / 2, s.center]}>
          <boxGeometry args={[t, h, s.len]} />{mat}
        </mesh>
      ))}
      {segsD.map((s, i) => (
        <mesh key={`D${i}`} position={[-width / 2 + t / 2, h / 2, s.center]}>
          <boxGeometry args={[t, h, s.len]} />{mat}
        </mesh>
      ))}
    </group>
  );
}

// ─── Ceiling disk lights ──────────────────────────────────────────────────────

function computeDiskLightPositions(W: number, D: number): [number, number][] {
  const minSpacing = 0.6;
  const usableX = W * 0.5;  // 25% offset from each side wall
  const usableZ = D * 0.5;
  const maxNx = Math.max(1, Math.floor(usableX / minSpacing) + 1);
  const maxNz = Math.max(1, Math.floor(usableZ / minSpacing) + 1);
  const target = Math.max(1, Math.round((W * D) / 4));
  const aspect = W / D;

  let bestNx = 1, bestNz = 1, bestScore = Infinity;
  for (let nx = 1; nx <= Math.min(target, maxNx); nx++) {
    for (const nz of [Math.round(target / nx), Math.ceil(target / nx)]) {
      if (nz < 1 || nz > maxNz) continue;
      const spacingX = nx === 1 ? Infinity : usableX / (nx - 1);
      const spacingZ = nz === 1 ? Infinity : usableZ / (nz - 1);
      if (spacingX < minSpacing || spacingZ < minSpacing) continue;
      const score = Math.abs(Math.log((nx / nz) / aspect)) + Math.abs(nx * nz - target) / target * 0.5;
      if (score < bestScore) { bestScore = score; bestNx = nx; bestNz = nz; }
    }
  }

  const positions: [number, number][] = [];
  for (let ix = 0; ix < bestNx; ix++) {
    const x = bestNx === 1 ? 0 : -usableX / 2 + ix * (usableX / (bestNx - 1));
    for (let iz = 0; iz < bestNz; iz++) {
      const z = bestNz === 1 ? 0 : -usableZ / 2 + iz * (usableZ / (bestNz - 1));
      positions.push([x, z]);
    }
  }
  return positions;
}

function CeilingLights({ width, depth, height }: { width: number; depth: number; height: number }) {
  const positions = useMemo(() => computeDiskLightPositions(width, depth), [width, depth]);
  const lightIntensity = Math.max(0.15, 1.8 / positions.length);

  return (
    <group>
      {positions.map(([x, z], i) => (
        <group key={i}>
          {/* Housing ring recessed into ceiling */}
          <mesh position={[x, height - 0.009, z]}>
            <cylinderGeometry args={[0.068, 0.062, 0.018, 24]} />
            <meshStandardMaterial color="#BFBBB0" metalness={0.65} roughness={0.28} />
          </mesh>
          {/* Emissive lens facing down into room */}
          <mesh position={[x, height - 0.002, z]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.05, 24]} />
            <meshStandardMaterial color="#FFF9EE" emissive="#FFE488" emissiveIntensity={4} roughness={1} />
          </mesh>
          {/* Point light — warm white, decays with distance */}
          <pointLight
            position={[x, height - 0.06, z]}
            color="#FFF2C8"
            intensity={lightIntensity}
            distance={height * 3.5}
            decay={2}
          />
        </group>
      ))}
    </group>
  );
}

// ─── Corner shadow accents ────────────────────────────────────────────────────

function CornerShadows({ width, depth }: { width: number; depth: number }) {
  const corners: [number, number][] = [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [-width / 2, depth / 2],
    [width / 2, depth / 2],
  ];
  return (
    <group>
      {corners.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.01, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.5, 0.5]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.15} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Lighting ─────────────────────────────────────────────────────────────────

export function SceneLighting({ width, depth, height }: { width: number; depth: number; height: number }) {
  return (
    <>
      <hemisphereLight color="#FFE8CC" groundColor="#3A3020" intensity={0.8} />
      <directionalLight
        position={[width * 1.5, height * 2.5, depth * 1.2]}
        intensity={1.4}
        color="#FFF5E8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.1}
        shadow-camera-far={40}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-bias={-0.001}
      />
      <directionalLight position={[-width, height * 1.2, -depth]} intensity={0.4} color="#C8D8F0" />
    </>
  );
}

// ─── In-scene swap buttons ────────────────────────────────────────────────────

const SwapButtons = memo(function SwapButtons({ W, D, H }: { W: number; D: number; H: number }) {
  const { geometry, swapAdjacentElements } = useRoomStore();
  const s = 1 / 1000;
  const T = 0.25;
  const T_MM = 250;
  const buttonY = H * 0.42;

  const wallDefs = useMemo(() => [
    { id: "A", axis: "X" as const, cx: 0,                cz: -(D / 2 + T / 2), wallLenM: W,         elOffset: 0    },
    { id: "C", axis: "X" as const, cx: 0,                cz:   D / 2 + T / 2,  wallLenM: W,         elOffset: 0    },
    { id: "B", axis: "Z" as const, cx:  W / 2 + T / 2,  cz: 0,                wallLenM: D + 2 * T, elOffset: T_MM },
    { id: "D", axis: "Z" as const, cx: -(W / 2 + T / 2), cz: 0,               wallLenM: D + 2 * T, elOffset: T_MM },
  ], [W, D]);

  const items: React.ReactElement[] = [];

  for (const wd of wallDefs) {
    const wall = geometry.walls.find((w) => w.id === wd.id);
    if (!wall) continue;
    if (wall.elements.filter((e) => e.type === "eshik" || e.type === "deraza").length < 2) continue;

    const rawLenMm = (wd.id === "B" || wd.id === "D") ? D * 1000 : wd.wallLenM * 1000;
    const resolved = resolveElementPositions(wall.elements, rawLenMm);
    const sorted = resolved
      .filter((e) => e.type === "eshik" || e.type === "deraza")
      .map((e) => ({ ...e, position: e.position + wd.elOffset }))
      .sort((a, b) => a.position - b.position);

    for (let i = 0; i < sorted.length - 1; i++) {
      const el1 = sorted[i];
      const el2 = sorted[i + 1];
      const gapMidMm = (el1.position + el1.width + el2.position) / 2;
      const wallLenMm = wd.wallLenM * 1000;
      const localOffset = (gapMidMm - wallLenMm / 2) * s;

      const px = wd.axis === "X" ? wd.cx + localOffset : wd.cx;
      const pz = wd.axis === "Z" ? wd.cz + localOffset : wd.cz;

      // Capture the exact two IDs this button is responsible for
      const wId = wd.id;
      const e1Id = el1.id;
      const e2Id = el2.id;

      items.push(
        <Html key={`swap-${wd.id}-${i}`} position={[px, buttonY, pz]} center zIndexRange={[50, 0]}>
          <button
            onClick={() => swapAdjacentElements(wId, e1Id, e2Id)}
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              border: "1px solid rgba(0,0,0,0.14)",
              background: "rgba(255,255,255,0.90)",
              cursor: "pointer",
              fontSize: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
              userSelect: "none",
            }}
          >
            ⇄
          </button>
        </Html>,
      );
    }
  }

  return <>{items}</>;
});

// ─── Shared furniture entry (catalog + user-uploaded) ─────────────────────────

type AnyFurnitureEntry = {
  id: string
  modelPath: string
  scale: number
  sizeM: { w: number; d: number; h: number }
  hasTextures?: boolean
}

function useFurnitureEntry(furnitureId: string): AnyFurnitureEntry | undefined {
  const userFurniture = useRoomStore((s) => s.userFurniture)
  return (
    FURNITURE_CATALOG.find((f) => f.id === furnitureId) ??
    userFurniture.find((f) => f.id === furnitureId)
  )
}

function enhanceMaterial(m: THREE.Material): THREE.Material {
  if (!(m instanceof THREE.MeshStandardMaterial)) return m
  if (m.map || m.normalMap || m.roughnessMap) {
    // Clone so per-instance color overrides don't bleed to other models sharing the material
    const c = m.clone()
    c.name = m.name
    return c
  }
  return new THREE.MeshStandardMaterial({
    name: m.name,
    color: m.color.clone(),
    roughness: 0.65,
    metalness: 0.05,
    envMapIntensity: 1.2,
  })
}

/** Set shadows on every mesh + enhance flat materials. Preserves single-vs-array structure. */
function prepareMesh(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.castShadow = true
    child.receiveShadow = true
    if (Array.isArray(child.material)) {
      child.material = child.material.map(enhanceMaterial)
    } else {
      child.material = enhanceMaterial(child.material as THREE.Material)
    }
  })
}

/** Apply per-material color tints. Uses '*' as wildcard for all materials. */
function applyColorOverrides(obj: THREE.Object3D, overrides: Record<string, string>) {
  const wildcard = overrides['*']
  obj.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    mats.forEach((m) => {
      if (!(m instanceof THREE.MeshStandardMaterial)) return
      const named = overrides[m.name]
      if (named) m.color.set(named)
      else if (wildcard) m.color.set(wildcard)
    })
  })
}

// ─── Placed furniture renderer ────────────────────────────────────────────────

function FurnitureItem({ item }: { item: PlacedFurniture }) {
  const entry = useFurnitureEntry(item.furniture_id)
  const modelPath = entry?.modelPath ?? ''
  const { scene } = useGLTF(modelPath || '/models/table_boconcept_hauge_nodrc.glb')
  const cloned = useMemo(() => {
    const c = scene.clone(true)
    prepareMesh(c)
    return c
  }, [scene]);

  useLayoutEffect(() => {
    if (!item.colorOverrides || Object.keys(item.colorOverrides).length === 0) return
    applyColorOverrides(cloned, item.colorOverrides)
  }, [cloned, item.colorOverrides])

  if (!entry || !modelPath) return null;
  return (
    <primitive
      object={cloned}
      position={[item.x / 1000, 0, item.y / 1000]}
      rotation={[0, item.rotation, 0]}
      scale={entry.scale}
    />
  );
}

export function FurnitureModels() {
  const furniture = useRoomStore((s) => s.furniture);
  if (furniture.length === 0) return null;
  return (
    <>
      {furniture.map((item) => (
        <FurnitureItem key={item.id} item={item} />
      ))}
    </>
  );
}

// Preload all catalog models so first render is instant
FURNITURE_CATALOG.forEach((e) => useGLTF.preload(e.modelPath));

// ─── Draggable furniture (ThreeDPage only) ────────────────────────────────────

function DraggableFurnitureItem({
  item,
  isDragging,
  dragEnabled,
  dragPosRef,
  onMeshPointerDown,
  onButtonPointerDown,
}: {
  item: PlacedFurniture
  isDragging: boolean
  dragEnabled: boolean
  dragPosRef: RefObject<THREE.Vector3>
  onMeshPointerDown: (e: ThreeEvent<PointerEvent>) => void
  onButtonPointerDown: (e: React.PointerEvent) => void
}) {
  const entry = useFurnitureEntry(item.furniture_id)
  const modelPath = entry?.modelPath ?? ''
  const { scene } = useGLTF(modelPath || '/models/table_boconcept_hauge_nodrc.glb')
  const cloned = useMemo(() => {
    const c = scene.clone(true)
    prepareMesh(c)
    return c
  }, [scene])
  const groupRef = useRef<THREE.Group>(null)

  useLayoutEffect(() => {
    if (!item.colorOverrides || Object.keys(item.colorOverrides).length === 0) return
    applyColorOverrides(cloned, item.colorOverrides)
  }, [cloned, item.colorOverrides])

  useFrame(() => {
    const pos = dragPosRef.current
    if (isDragging && groupRef.current && pos) {
      groupRef.current.position.x = pos.x
      groupRef.current.position.z = pos.z
    }
  })

  if (!entry || !modelPath) return null

  const buttonH = (entry.sizeM.h ?? 1) + 0.18

  return (
    <group ref={groupRef} position={[item.x / 1000, 0, item.y / 1000]}>
      <primitive
        object={cloned}
        rotation={[0, item.rotation, 0]}
        scale={entry.scale}
        onPointerDown={dragEnabled ? onMeshPointerDown : undefined}
        onPointerEnter={() => { if (dragEnabled) document.body.style.cursor = 'grab' }}
        onPointerLeave={() => { if (!isDragging) document.body.style.cursor = '' }}
      />
      {dragEnabled && (
        <Html position={[0, buttonH, 0]} center zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }}>
          <button
            onPointerDown={(e) => { e.stopPropagation(); onButtonPointerDown(e) }}
            title="Siljitish"
            style={{
              pointerEvents: 'all',
              width: 30,
              height: 30,
              borderRadius: '50%',
              border: isDragging ? '2px solid #D85A30' : '1.5px solid rgba(0,0,0,0.18)',
              background: isDragging ? '#D85A30' : 'rgba(255,255,255,0.92)',
              color: isDragging ? '#fff' : '#555',
              cursor: isDragging ? 'grabbing' : 'grab',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.22)',
              userSelect: 'none',
              touchAction: 'none',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11 3l-4 4h3v3H7V7l-4 4 4 4v-3h3v3H7l4 4 4-4h-3v-3h3v3l4-4-4-4v3h-3V7h3l-4-4z"/>
            </svg>
          </button>
        </Html>
      )}
    </group>
  )
}

function DraggableFurnitureModels({
  controlsRef,
  roomW,
  roomD,
  dragEnabled,
}: {
  controlsRef: RefObject<OrbitControlsImpl | null>
  roomW: number
  roomD: number
  dragEnabled: boolean
}) {
  const furniture = useRoomStore((s) => s.furniture)
  const userFurniture = useRoomStore((s) => s.userFurniture)
  const moveFurniture = useRoomStore((s) => s.moveFurniture)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragPosRef = useRef(new THREE.Vector3())
  const draggingIdRef = useRef<string | null>(null)
  const furnitureRef = useRef(furniture)
  furnitureRef.current = furniture
  // Half-size of the item being dragged — for wall collision clamping
  const dragHalfRef = useRef({ w: 0.3, d: 0.3 })
  const { camera, gl } = useThree()
  const floorPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), [])
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const hitPoint = useRef(new THREE.Vector3())

  function resolveEntry(furnitureId: string): AnyFurnitureEntry | undefined {
    return (
      FURNITURE_CATALOG.find((f) => f.id === furnitureId) ??
      (userFurniture as UserFurnitureEntry[]).find((f) => f.id === furnitureId)
    )
  }

  function activateDrag(item: PlacedFurniture) {
    const entry = resolveEntry(item.furniture_id)
    dragHalfRef.current = { w: (entry?.sizeM.w ?? 0.6) / 2, d: (entry?.sizeM.d ?? 0.6) / 2 }
    dragPosRef.current.set(item.x / 1000, 0, item.y / 1000)
    draggingIdRef.current = item.id
    setDraggingId(item.id)
    if (controlsRef.current) controlsRef.current.enabled = false
    document.body.style.cursor = 'grabbing'
  }

  function startDragFromMesh(item: PlacedFurniture, e: ThreeEvent<PointerEvent>) {
    if (!dragEnabled) return
    e.stopPropagation()
    activateDrag(item)
  }

  function startDragFromButton(item: PlacedFurniture, e: React.PointerEvent) {
    if (!dragEnabled) return
    e.stopPropagation()
    e.preventDefault()
    activateDrag(item)
  }

  function commitDrag() {
    const id = draggingIdRef.current
    if (!id) return
    const item = furnitureRef.current.find((f) => f.id === id)
    if (item) {
      moveFurniture(id, dragPosRef.current.x * 1000, dragPosRef.current.z * 1000, item.rotation)
    }
    draggingIdRef.current = null
    setDraggingId(null)
    if (controlsRef.current) controlsRef.current.enabled = true
    document.body.style.cursor = ''
  }

  useEffect(() => {
    if (!draggingId) return
    const canvas = gl.domElement

    const handleMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      if (!raycaster.ray.intersectPlane(floorPlane, hitPoint.current)) return

      // Clamp to room walls (furniture edge must not cross wall face)
      const { w, d } = dragHalfRef.current
      const halfW = roomW / 2
      const halfD = roomD / 2
      const x = Math.max(-halfW + w, Math.min(halfW - w, hitPoint.current.x))
      const z = Math.max(-halfD + d, Math.min(halfD - d, hitPoint.current.z))
      dragPosRef.current.set(x, 0, z)
    }

    canvas.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', commitDrag)
    return () => {
      canvas.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', commitDrag)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingId, roomW, roomD])

  return (
    <>
      {furniture.map((item) => (
        <Suspense key={item.id} fallback={null}>
          <DraggableFurnitureItem
            item={item}
            isDragging={draggingId === item.id}
            dragEnabled={dragEnabled}
            dragPosRef={dragPosRef}
            onMeshPointerDown={(e) => startDragFromMesh(item, e)}
            onButtonPointerDown={(e) => startDragFromButton(item, e)}
          />
        </Suspense>
      ))}
    </>
  )
}

// ─── Full room scene ──────────────────────────────────────────────────────────

function shadeCovering(covering: WallCovering, factor: number): WallCovering {
  if (covering.kind === 'paint') {
    return { kind: 'paint', color: shadeHex(covering.color, factor) }
  }
  // For oboy, shade the baseColor only (accent stays vivid)
  return { ...covering, baseColor: shadeHex(covering.baseColor, factor) }
}

export function RoomScene({
  room,
  geometry,
  topView,
  designState,
  showContactShadows,
}: {
  room: Room;
  geometry: RoomGeometry;
  topView: boolean;
  designState: DesignState;
  showContactShadows: boolean;
}) {
  const W = room.width;
  const D = room.length;
  const H = room.ceiling_height;
  const T = 0.25; // 25 cm wall thickness

  const wallA = geometry.walls.find((w) => w.id === "A");
  const wallB = geometry.walls.find((w) => w.id === "B");
  const wallC = geometry.walls.find((w) => w.id === "C");
  const wallD = geometry.walls.find((w) => w.id === "D");

  // Per-wall coverings with depth shading
  const coveringA = shadeCovering(resolveWallCovering(designState.wallCoverings, 'A'), 0.92);
  const coveringB = shadeCovering(resolveWallCovering(designState.wallCoverings, 'B'), 0.82);
  const coveringC = shadeCovering(resolveWallCovering(designState.wallCoverings, 'C'), 0.92);
  const coveringD = shadeCovering(resolveWallCovering(designState.wallCoverings, 'D'), 0.82);

  /*
   * Shell topology — "inner walls smaller in width":
   *
   *   Walls B and D (sides) span the FULL OUTER depth D+2T — they own the
   *   four corners.  Walls A and C (back/front) span only the INNER width W
   *   and fit between B and D.
   *
   *   Top-down plan (T = 0.25 m):
   *
   *     ←D+2T→
   *     ┌─────┐
   *     │ ┌─┐ │  ← Wall A (inner W only)
   *     │ │ │ │  ← B (left) / D (right) own corners + inner strip
   *     │ └─┘ │  ← Wall C (inner W only)
   *     └─────┘
   *
   *   Result:
   *   • Interior L-corners: A inner face (z=±D/2) meets B inner face (x=±W/2)
   *     at a perfect right angle, no overlap.
   *   • Exterior: B/D outer face (x=±(W/2+T)) runs the full outer height
   *     including corners — no exposed end-cap faces, no seams.
   *
   *   Element positions in B/D are stored relative to the interior span D.
   *   Pre-resolve them, then shift by T so they land within the D+2T wall.
   */
  const T_MM = Math.round(T * 1000);
  const elementsBOuter = resolveElementPositions(wallB?.elements ?? [], D * 1000)
    .map(el => ({ ...el, position: el.position + T_MM }));
  const elementsDOuter = resolveElementPositions(wallD?.elements ?? [], D * 1000)
    .map(el => ({ ...el, position: el.position + T_MM }));

  return (
    <group>
      <WoodFloor width={W} depth={D} floorType={designState.floorType} />

      {/* Ceiling */}
      {!topView && (
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, H, 0]}>
          <planeGeometry args={[W, D]} />
          <meshStandardMaterial color={CEILING_DEFAULT} roughness={0.95} />
        </mesh>
      )}

      {/* Wall A — back, inner width W only, inner face at z = -D/2 */}
      <Wall wallId="A" length={W} height={H} thickness={T} covering={coveringA}
        elements={wallA?.elements ?? []} axis="X" cx={0} cz={-(D / 2 + T / 2)} />

      {/* Wall B — right, full outer depth D+2T (owns corners), inner face at x = +W/2 */}
      <Wall wallId="B" length={D + 2 * T} height={H} thickness={T} covering={coveringB}
        elements={elementsBOuter} axis="Z" cx={W / 2 + T / 2} cz={0} />

      {/* Wall C — front, inner width W only, inner face at z = +D/2 */}
      <Wall wallId="C" length={W} height={H} thickness={T} covering={coveringC}
        elements={wallC?.elements ?? []} axis="X" cx={0} cz={D / 2 + T / 2} />

      {/* Wall D — left, full outer depth D+2T (owns corners), inner face at x = -W/2 */}
      <Wall wallId="D" length={D + 2 * T} height={H} thickness={T} covering={coveringD}
        elements={elementsDOuter} axis="Z" cx={-(W / 2 + T / 2)} cz={0} />

      <WindowPanes geometry={geometry} wallWidth={W} wallDepth={D} />
      <Baseboard width={W} depth={D} geometry={geometry} />
      <CornerShadows width={W} depth={D} />
      <CeilingLights width={W} depth={D} height={H} />

      {showContactShadows && (
        <ContactShadows
          position={[0, 0.01, 0]}
          opacity={0.3}
          scale={Math.max(W, D) * 2.5}
          blur={1.8}
          far={0.3}
        />
      )}
    </group>
  );
}

// ─── View presets ─────────────────────────────────────────────────────────────

type ViewPreset = "corner" | "front" | "back" | "top";

const VIEW_LABELS: Record<ViewPreset, string> = {
  corner: "Burchak",
  front:  "Old tomon",
  back:   "3D",
  top:    "Yuqori",
};

/*
 * All perspective presets place the camera INSIDE the room so only the
 * interior wall faces (facing toward the camera) are ever visible — like
 * 3ds Max backface culling.  The orbit radius is clamped to ≤ 88% of the
 * shortest half-dimension so the user can never drag the camera outside.
 *
 * Top view is the only mode that lifts the camera above the room; it is
 * treated as an architectural plan view and gets a relaxed maxDistance.
 */
function getCamera(preset: ViewPreset, W: number, D: number, H: number) {
  const eyeH  = H * 0.56;          // eye-level height inside the room
  const cx     = W * 0.34;          // ~34% from centre toward a side wall
  const cz     = D * 0.34;
  const lookH  = H * 0.42;          // look-at height (slightly below eye)
  switch (preset) {
    // Interior corner: standing near back-left, looking toward front-right
    case "corner": return {
      position: [-cx, eyeH, -cz] as [number,number,number],
      target:   [ cx * 0.3, lookH, cz * 0.3] as [number,number,number],
    };
    // Front wall: standing near front, looking toward back
    case "front": return {
      position: [0, eyeH,  cz] as [number,number,number],
      target:   [0, lookH, -cz * 0.4] as [number,number,number],
    };
    // Back wall: standing near back, looking toward front
    case "back": return {
      position: [0, eyeH,  -cz] as [number,number,number],
      target:   [0, lookH,  cz * 0.4] as [number,number,number],
    };
    // Top / plan view — aerial only
    case "top": return {
      position: [W * 0.08, H * 3.5, 0] as [number,number,number],
      target:   [0, 0, 0]               as [number,number,number],
    };
  }
}

// ─── Camera animator (lerp, no Canvas remount) ────────────────────────────────

function CameraAnimator({
  target,
  position,
  controlsRef,
}: {
  target: [number, number, number];
  position: [number, number, number];
  controlsRef: RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  const targetPos = useMemo(() => new THREE.Vector3(...position), [position]);
  const targetLookAt = useMemo(() => new THREE.Vector3(...target), [target]);

  // Only animate when preset changes — stop once arrived or user starts dragging
  const isAnimating = useRef(false);
  const userDragging = useRef(false);

  // Trigger animation when target changes
  useEffect(() => {
    isAnimating.current = true;
  }, [targetPos, targetLookAt]);

  // Pause animation while user drags
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const onStart = () => { userDragging.current = true; isAnimating.current = false; };
    const onEnd = () => { userDragging.current = false; };
    controls.addEventListener("start", onStart);
    controls.addEventListener("end", onEnd);
    return () => {
      controls.removeEventListener("start", onStart);
      controls.removeEventListener("end", onEnd);
    };
  }, [controlsRef]);

  useFrame(() => {
    if (!isAnimating.current || userDragging.current) return;
    camera.position.lerp(targetPos, 0.1);
    if (controlsRef.current) {
      controlsRef.current.target.lerp(targetLookAt, 0.1);
      controlsRef.current.update();
    }
    // Stop when close enough
    if (camera.position.distanceTo(targetPos) < 0.015) {
      camera.position.copy(targetPos);
      if (controlsRef.current) {
        controlsRef.current.target.copy(targetLookAt);
        controlsRef.current.update();
      }
      isAnimating.current = false;
    }
  });

  return null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ThreeDPage() {
  const { room } = useOutletContext<StudioContext>();
  const { geometry, designState } = useRoomStore();
  const [preset, setPreset] = useState<ViewPreset>("back");
  const [dpr, setDpr] = useState<number | [number, number]>([1, 2]);
  const [showContactShadows, setShowContactShadows] = useState(true);
  const [dragEnabled, setDragEnabled] = useState(false);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  const topView = preset === "top";
  const cam = useMemo(
    () => getCamera(preset, room.width, room.length, room.ceiling_height),
    [preset, room.width, room.length, room.ceiling_height],
  );

  // Interior orbit radius: just under the shortest half-wall distance from centre.
  // This ensures the camera never escapes the room during free drag.
  const interiorMaxDist = Math.min(room.width, room.length) / 2 * 0.86;
  const maxPolarAngle = Math.PI * 0.88;

  // Initial camera position — only used on first mount
  const initCam = useMemo(
    () => getCamera("corner", room.width, room.length, room.ceiling_height),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="flex" style={{ height: "calc(100vh - 108px)" }}>
      {/* Left: toolbar + canvas */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-1.5 px-4 py-2 bg-surface border-b border-gray-200 text-xs shrink-0">
          <span className="mr-1 font-medium text-gray-600">Ko'rinish:</span>
          {(["back", "top"] as ViewPreset[]).map((v) => (
            <button
              key={v}
              onClick={() => setPreset(v)}
              className={`px-3 py-1 rounded-full transition-colors ${
                preset === v
                  ? "bg-brand text-white font-medium"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-700"
              }`}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setDragEnabled((v) => !v)}
              title={dragEnabled ? "Mebel joylashtirishni bloklash" : "Mebelni siljitish rejimi"}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-medium transition-colors ${
                dragEnabled
                  ? "bg-brand text-white"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-600"
              }`}
            >
              {dragEnabled ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18 8h-1V6A5 5 0 0 0 7 6v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zm-6 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm3.1-9H8.9V6A3.1 3.1 0 0 1 12 2.9 3.1 3.1 0 0 1 15.1 6v2z"/>
                  </svg>
                  Siljitish yoqiq
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm6-9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2h1V6a5 5 0 0 1 9.9-1h-2.1A3 3 0 0 0 9 6v2h9z"/>
                  </svg>
                  Siljitish
                </>
              )}
            </button>
            <span className="text-gray-400">Drag: aylantirish · Scroll: zoom</span>
          </div>
        </div>

        {/* 3D Canvas — no key={preset}, camera animated via lerp */}
        <div className="flex-1 min-h-0">
        <Canvas
          shadows="soft"
          camera={{ position: initCam.position, fov: 55, near: 0.05, far: 80 }}
          style={{ width: "100%", height: "100%" }}
          gl={{
            antialias: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.1,
          }}
          dpr={dpr}
        >
          <color attach="background" args={["#E8E4DC"]} />
          <fog attach="fog" args={["#E8E4DC", 12, 30]} />

          <PerformanceMonitor
            onDecline={() => {
              setDpr(1);
              setShowContactShadows(false);
            }}
          />

          <Suspense fallback={null}>
            <SceneLighting
              width={room.width}
              depth={room.length}
              height={room.ceiling_height}
            />
            <Environment preset="apartment" environmentIntensity={0.35} />

            <RoomScene
              room={room}
              geometry={geometry}
              topView={topView}
              designState={designState}
              showContactShadows={showContactShadows}
            />
            <SwapButtons W={room.width} D={room.length} H={room.ceiling_height} />
            <DraggableFurnitureModels controlsRef={controlsRef} roomW={room.width} roomD={room.length} dragEnabled={dragEnabled} />

            <OrbitControls
              ref={controlsRef}
              target={initCam.target}
              enableDamping
              dampingFactor={0.06}
              minDistance={0.25}
              maxDistance={topView ? Math.max(room.width, room.length) * 4 : interiorMaxDist}
              maxPolarAngle={maxPolarAngle}
              minPolarAngle={topView ? 0 : 0.08}
              rotateSpeed={topView ? 0.6 : -0.45}
              zoomSpeed={0.8}
            />

            <CameraAnimator
              position={cam.position}
              target={cam.target}
              controlsRef={controlsRef}
            />
          </Suspense>
        </Canvas>
        </div>
      </div>

      {/* Right: design panel */}
      <DesignPanel room={room} />
    </div>
  );
}
