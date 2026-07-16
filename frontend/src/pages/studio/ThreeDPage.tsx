import { Suspense, memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  ContactShadows,
  SoftShadows,
  PerformanceMonitor,
  Html,
  useGLTF,
  Grid,
  RoundedBox,
} from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useOutletContext } from "react-router-dom";
import { useRoomStore, resolveWallCovering, resolveWallPanel } from "@/store/roomStore";
import type { PlacedFurniture, UserFurnitureEntry, PlacedLight, PlacedElectrical, WallPanelSettings } from "@/store/roomStore";
import { DesignPanel } from "@/components/studio/DesignPanel";
import { AddObjectSheet } from "@/components/studio/AddObjectSheet";
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

  const texture = useMemo<THREE.CanvasTexture>(() => {
    const canvas = document.createElement("canvas");
    const W = 512;
    canvas.width = W;
    canvas.height = W;
    const ctx = canvas.getContext("2d")!;

    // Each canvas represents a real-world unit size.
    // tex.repeat ensures one canvas = that physical size in metres.
    let repeatX: number;
    let repeatY: number;

    if (floorType === "tile") {
      // Canvas = one 600×600mm porcelain tile
      const tileM = 0.6;
      const grout = 7; // px ≈ 8mm grout joint
      ctx.fillStyle = "#C4C3BB";
      ctx.fillRect(0, 0, W, W);
      ctx.fillStyle = floorColor;
      ctx.fillRect(grout, grout, W - 2 * grout, W - 2 * grout);
      ctx.fillStyle = "rgba(0,0,0,0.025)";
      ctx.fillRect(grout, grout, (W - 2 * grout) * 0.5, (W - 2 * grout) * 0.5);
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(grout + (W - 2 * grout) * 0.5, grout, (W - 2 * grout) * 0.5, (W - 2 * grout) * 0.5);
      repeatX = width / tileM;
      repeatY = depth / tileM;

    } else if (floorType === "parquet") {
      // Canvas = 600×600mm section, 8 planks of 75mm each (run along Y axis)
      const unitM = 0.6;
      const plankW = W / 8; // 64px ≈ 75mm
      ctx.fillStyle = floorColor;
      ctx.fillRect(0, 0, W, W);
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 === 0 ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.03)";
        ctx.fillRect(i * plankW, 0, plankW, W);
        ctx.strokeStyle = "rgba(0,0,0,0.18)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(i * plankW, 0); ctx.lineTo(i * plankW, W); ctx.stroke();
        ctx.strokeStyle = "rgba(0,0,0,0.05)";
        ctx.lineWidth = 0.5;
        for (let g = 1; g < 7; g++) {
          const gy = (W / 7) * g;
          ctx.beginPath();
          ctx.moveTo(i * plankW, gy + Math.sin(i * 1.7 + g) * 4);
          ctx.quadraticCurveTo(i * plankW + plankW * 0.5, gy + Math.cos(g) * 2, (i + 1) * plankW, gy + Math.sin(i + g) * 3);
          ctx.stroke();
        }
        if (i % 2 === 0) {
          ctx.strokeStyle = "rgba(0,0,0,0.13)";
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(i * plankW + 2, W / 2); ctx.lineTo((i + 1) * plankW - 2, W / 2); ctx.stroke();
        }
      }
      repeatX = width / unitM;
      repeatY = depth / unitM;

    } else if (floorType === "laminate") {
      // Canvas = 1200×1200mm section, 6 planks of 200mm each (run along Y axis)
      const unitM = 1.2;
      const plankW = W / 6; // ≈ 85px = 200mm
      ctx.fillStyle = floorColor;
      ctx.fillRect(0, 0, W, W);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 === 0 ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)";
        ctx.fillRect(i * plankW, 0, plankW, W);
        ctx.strokeStyle = "rgba(0,0,0,0.15)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(i * plankW, 0); ctx.lineTo(i * plankW, W); ctx.stroke();
        ctx.strokeStyle = "rgba(0,0,0,0.04)";
        ctx.lineWidth = 0.5;
        for (let g = 1; g < 9; g++) {
          const gy = (W / 9) * g;
          ctx.beginPath();
          ctx.moveTo(i * plankW, gy + Math.sin(i * 2.3 + g) * 3);
          ctx.lineTo((i + 1) * plankW, gy + Math.cos(i + g * 0.7) * 3);
          ctx.stroke();
        }
        ctx.strokeStyle = "rgba(0,0,0,0.12)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(i * plankW + 2, W / 2); ctx.lineTo((i + 1) * plankW - 2, W / 2); ctx.stroke();
      }
      repeatX = width / unitM;
      repeatY = depth / unitM;

    } else {
      // Concrete — canvas = 1×1m section with deterministic aggregate texture
      const unitM = 1.0;
      ctx.fillStyle = floorColor;
      ctx.fillRect(0, 0, W, W);
      for (let row = 0; row < W; row += 8) {
        for (let col = 0; col < W; col += 8) {
          const v = ((col * 127 + row * 31 + col * row) % 100) / 100;
          ctx.fillStyle = `rgba(0,0,0,${(v * 0.06).toFixed(3)})`;
          ctx.fillRect(col, row, 8, 8);
        }
      }
      repeatX = width / unitM;
      repeatY = depth / unitM;
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    return tex;
  }, [width, depth, floorType, floorColor]);

  // Release GPU memory when texture is replaced or component unmounts
  useEffect(() => () => { texture.dispose() }, [texture]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} castShadow receiveShadow>
      <planeGeometry args={[width + 0.04, depth + 0.04]} />
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
  isSelected?: boolean;
  onClick?: () => void;
  panelSettings?: WallPanelSettings;
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
  isSelected,
}: {
  seg: Seg;
  covering: WallCovering;
  baseTexture: THREE.CanvasTexture | null;
  isSelected: boolean;
}) {
  const mat = useMemo(() => {
    if (covering.kind !== 'oboy' || !baseTexture) return null;
    const t = baseTexture.clone();
    t.repeat.set(seg.uRepeat, seg.vRepeat);
    t.offset.set(seg.uOffset, 0);
    t.needsUpdate = true;
    return t;
  // covering.kind guards the early-exit so it must be a dep
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [covering.kind, baseTexture, seg.uOffset, seg.uRepeat, seg.vRepeat]);

  const paintColor = covering.kind === 'paint' ? covering.color : '#ffffff';

  return (
    <mesh position={[seg.px, seg.py, seg.pz]} rotation={[0, seg.ry, 0]} castShadow receiveShadow>
      <planeGeometry args={[seg.pw, seg.ph]} />
      {covering.kind === 'paint' ? (
        <meshStandardMaterial color={paintColor} roughness={0.88} metalness={0} envMapIntensity={0.3}
          emissive={isSelected ? "#D85A30" : "#000000"} emissiveIntensity={isSelected ? 0.22 : 0} />
      ) : (
        <meshStandardMaterial map={mat ?? undefined} color="#ffffff" roughness={0.9} metalness={0} envMapIntensity={0.2}
          emissive={isSelected ? "#D85A30" : "#000000"} emissiveIntensity={isSelected ? 0.15 : 0} />
      )}
    </mesh>
  );
}

type ResolvedEl = { position: number; width: number; height: number; sill_height: number };

function WallPanelGrid({
  wallLengthM,
  wallHeightM,
  thickness,
  axis,
  cx,
  cz,
  settings,
  elements,
}: {
  wallLengthM: number;
  wallHeightM: number;
  thickness: number;
  axis: 'X' | 'Z';
  cx: number;
  cz: number;
  settings: WallPanelSettings;
  elements: ResolvedEl[];
}) {
  const panels = useMemo(() => {
    const pw = (settings.rotation === 90 ? settings.height : settings.width) / 1000;
    const ph = (settings.rotation === 90 ? settings.width : settings.height) / 1000;
    const pd = settings.depth / 1000;
    const gapM = Math.max(0, settings.gap / 1000);
    const stride = pw + gapM;

    if (pw <= 0 || ph <= 0 || stride <= 0 || wallLengthM <= 0 || wallHeightM <= 0) return [];

    const faceDir = axis === 'X'
      ? (cz <= 0 ? 1 : -1)
      : (cx >= 0 ? -1 : 1);
    const depthOffset = faceDir * (thickness / 2 + pd / 2 + 0.001);
    const wallLeft = -wallLengthM / 2;

    // Pre-convert openings to meters for overlap checks
    const openings = elements.map((el) => ({
      l: el.position / 1000,
      r: (el.position + el.width) / 1000,
      b: el.sill_height / 1000,
      t: (el.sill_height + el.height) / 1000,
    }));

    const items: Array<{ x: number; y: number; z: number; aw: number; ah: number; pd: number }> = [];

    // Merge a list of {b,t} intervals (must be pre-sorted by b)
    function mergeIntervals(segs: Array<{ b: number; t: number }>) {
      const out: Array<{ b: number; t: number }> = [];
      for (const seg of segs) {
        if (out.length === 0 || out[out.length - 1].t <= seg.b) {
          out.push({ b: seg.b, t: seg.t });
        } else {
          out[out.length - 1].t = Math.max(out[out.length - 1].t, seg.t);
        }
      }
      return out;
    }

    // Rows from bottom. Only the first row may be clipped (when panel is taller than wall).
    // Subsequent rows stop before a partial strip at the top would appear.
    for (let r = 0; ; r++) {
      const rowStart = r * (ph + gapM);
      if (rowStart >= wallHeightM) break;
      if (r > 0 && wallHeightM - rowStart < ph / 2) break;
      const rowH = Math.min(ph, wallHeightM - rowStart);
      const rowEnd = rowStart + rowH;

      // Columns from left — last column is clipped to remaining width
      for (let c = 0; ; c++) {
        const colStart = c * stride;
        if (colStart >= wallLengthM) break;
        const colEnd = colStart + Math.min(pw, wallLengthM - colStart);

        // Split column at every opening's left/right edge that falls inside [colStart, colEnd].
        // This gives horizontal sub-strips, each of which is either fully free or fully
        // over an opening — avoiding panels that straddle window boundaries.
        const hBreaks = new Set<number>([colStart, colEnd]);
        for (const o of openings) {
          if (o.l > colStart && o.l < colEnd) hBreaks.add(o.l);
          if (o.r > colStart && o.r < colEnd) hBreaks.add(o.r);
        }
        const hSorted = [...hBreaks].sort((a, b) => a - b);

        for (let hi = 0; hi < hSorted.length - 1; hi++) {
          const sl = hSorted[hi];
          const sr = hSorted[hi + 1];
          const sw = sr - sl;
          const sCenterAlong = wallLeft + (sl + sr) / 2;

          const pushSeg = (segCY: number, segH: number) => {
            if (axis === 'X') {
              items.push({ x: cx + sCenterAlong, y: segCY, z: cz + depthOffset, aw: sw, ah: segH, pd });
            } else {
              items.push({ x: cx + depthOffset, y: segCY, z: cz + sCenterAlong, aw: sw, ah: segH, pd });
            }
          };

          // Openings that overlap this horizontal sub-strip
          const hOverlap = openings.filter((o) => sl < o.r && sr > o.l);

          if (hOverlap.length === 0) {
            // No opening in this strip → full-height panel segment
            pushSeg(rowStart + rowH / 2, rowH);
          } else {
            // Opening present → render only the vertical free segments (above/below openings)
            const blocked = hOverlap
              .map((o) => ({ b: Math.max(o.b, rowStart), t: Math.min(o.t, rowEnd) }))
              .filter((seg) => seg.b < seg.t)
              .sort((a, b) => a.b - b.b);
            const merged = mergeIntervals(blocked);
            let cursor = rowStart;
            for (const seg of merged) {
              if (cursor < seg.b) {
                const segH = seg.b - cursor;
                pushSeg(cursor + segH / 2, segH);
              }
              cursor = seg.t;
            }
            if (cursor < rowEnd) {
              const segH = rowEnd - cursor;
              pushSeg(cursor + segH / 2, segH);
            }
          }
        }
      }
    }
    return items;
  }, [settings, wallLengthM, wallHeightM, thickness, axis, cx, cz, elements]);

  const chamferMm = settings.chamfer ?? 0;

  return (
    <>
      {panels.map((p, i) => {
        const bw = axis === 'X' ? p.aw : p.pd;
        const bd = axis === 'X' ? p.pd : p.aw;
        const maxR = Math.min(bw, p.ah, bd) / 2 - 0.0005;
        const radius = chamferMm > 0 ? Math.min(chamferMm / 1000, maxR) : 0;
        if (radius > 0.0004) {
          return (
            <RoundedBox key={i} position={[p.x, p.y, p.z]} args={[bw, p.ah, bd]} radius={radius} smoothness={3} castShadow receiveShadow>
              <meshStandardMaterial color={settings.color} roughness={0.45} metalness={0.05} />
            </RoundedBox>
          );
        }
        return (
          <mesh key={i} position={[p.x, p.y, p.z]} castShadow receiveShadow>
            <boxGeometry args={[bw, p.ah, bd]} />
            <meshStandardMaterial color={settings.color} roughness={0.45} metalness={0.05} />
          </mesh>
        );
      })}
    </>
  );
}

function Wall({ length, height, thickness, covering, elements, axis, cx, cz, isSelected = false, onClick, panelSettings }: WallProps) {
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
      const vRepeat = sh / WALLPAPER_WIDTH_M

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
    <group onClick={onClick}>
      {segments.map((seg, i) => (
        <WallSegment
          key={`${i}-${covering.kind === 'oboy' ? covering.patternId : 'p'}`}
          seg={seg}
          covering={covering}
          baseTexture={oboyTexture}
          isSelected={isSelected}
        />
      ))}
      {panelSettings?.enabled && (
        <WallPanelGrid
          wallLengthM={length}
          wallHeightM={height}
          thickness={thickness}
          axis={axis}
          cx={cx}
          cz={cz}
          settings={panelSettings}
          elements={resolvedElements}
        />
      )}
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
        <mesh key={`A${i}`} position={[s.center, h / 2, -depth / 2 + t / 2 - 0.001]}>
          <boxGeometry args={[s.len, h, t]} />{mat}
        </mesh>
      ))}
      {segsC.map((s, i) => (
        <mesh key={`C${i}`} position={[s.center, h / 2, depth / 2 - t / 2 + 0.001]}>
          <boxGeometry args={[s.len, h, t]} />{mat}
        </mesh>
      ))}
      {segsB.map((s, i) => (
        <mesh key={`B${i}`} position={[width / 2 - t / 2 + 0.001, h / 2, s.center]}>
          <boxGeometry args={[t, h, s.len]} />{mat}
        </mesh>
      ))}
      {segsD.map((s, i) => (
        <mesh key={`D${i}`} position={[-width / 2 + t / 2 - 0.001, h / 2, s.center]}>
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

function CeilingLightDisk({ x, z, height, emit = true }: {
  x: number; z: number; height: number; emit?: boolean
}) {
  return (
    <group>
      <mesh position={[x, height - 0.009, z]}>
        <cylinderGeometry args={[0.068, 0.062, 0.018, 24]} />
        <meshStandardMaterial color="#BFBBB0" metalness={0.65} roughness={0.28} />
      </mesh>
      <mesh position={[x, height - 0.002, z]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.05, 24]} />
        <meshStandardMaterial
          color={emit ? "#F0F8FF" : "#707070"}
          emissive={emit ? "#C8E8FF" : "#000000"}
          emissiveIntensity={emit ? 5 : 0}
          roughness={1}
        />
      </mesh>
    </group>
  );
}

// CeilingLights renders auto-grid ONLY when no user lights are placed.
// User-placed lights are rendered + made draggable by DraggableLightModels (in Canvas).
function CeilingLights({
  width, depth, height,
  hasUserLights, lightsOn,
}: {
  width: number; depth: number; height: number;
  hasUserLights: boolean; lightsOn: boolean;
}) {
  const autoPositions = useMemo(
    () => computeDiskLightPositions(width, depth),
    [width, depth],
  );

  if (hasUserLights) return null;

  // Visual fixtures — all disks show emissive glow
  // Real lights capped at 2 regardless of fixture count (performance)
  const poolPositions = autoPositions.slice(0, Math.min(2, autoPositions.length));
  const poolIntensity = 1.6 / Math.max(1, poolPositions.length);
  const spread = Math.max(width, depth) * 1.9;

  return (
    <group>
      {autoPositions.map(([x, z], i) => (
        <CeilingLightDisk key={i} x={x} z={z} height={height} emit={lightsOn} />
      ))}
      {lightsOn && poolPositions.map(([x, z], i) => (
        <pointLight
          key={`auto-pool-${i}`}
          position={[x, height - 0.06, z]}
          color="#D8EEFF"
          intensity={poolIntensity}
          distance={spread}
          decay={2}
        />
      ))}
    </group>
  );
}

// ─── Draggable ceiling lights (user-placed from elektr menu) ──────────────────

function DraggableLightModels({
  controlsRef,
  roomW,
  roomD,
  roomH,
  toolMode,
  lightsOn,
}: {
  controlsRef: RefObject<OrbitControlsImpl | null>
  roomW: number
  roomD: number
  roomH: number
  toolMode: ToolMode
  lightsOn: boolean
}) {
  const lights = useRoomStore((s) => s.lights)
  const moveLight = useRoomStore((s) => s.moveLight)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const draggingIdRef = useRef<string | null>(null)
  const dragPosRef = useRef(new THREE.Vector2())
  const lightsRef = useRef(lights)
  lightsRef.current = lights
  const { camera, gl } = useThree()
  const ceilingPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), roomH), [roomH])
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const hitPoint = useRef(new THREE.Vector3())

  const poolPositions = useMemo(() => {
    if (!lightsOn || lights.length === 0) return []
    return lights.slice(0, Math.min(2, lights.length))
  }, [lights, lightsOn])
  const poolIntensity = 1.4 / Math.max(1, poolPositions.length)
  const spread = Math.max(roomW, roomD) * 1.9

  function startDrag(light: PlacedLight, e: ThreeEvent<PointerEvent>) {
    if (toolMode === 'select') return
    e.stopPropagation()
    dragPosRef.current.set(light.xMm, light.zMm)
    draggingIdRef.current = light.id
    setDraggingId(light.id)
    if (controlsRef.current) controlsRef.current.enabled = false
    document.body.style.cursor = 'grabbing'
  }

  function commitDrag() {
    const id = draggingIdRef.current
    if (!id) return
    moveLight(id, Math.round(dragPosRef.current.x), Math.round(dragPosRef.current.y))
    draggingIdRef.current = null
    setDraggingId(null)
    if (controlsRef.current) controlsRef.current.enabled = true
    document.body.style.cursor = ''
  }

  useEffect(() => {
    if (!draggingId) return
    const canvas = gl.domElement
    const halfW = (roomW / 2) * 1000
    const halfD = (roomD / 2) * 1000

    const handleMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      if (!raycaster.ray.intersectPlane(ceilingPlane, hitPoint.current)) return
      const xMm = Math.max(-halfW, Math.min(halfW, hitPoint.current.x * 1000)) + halfW
      const zMm = Math.max(-halfD, Math.min(halfD, hitPoint.current.z * 1000)) + halfD
      dragPosRef.current.set(xMm, zMm)
    }

    canvas.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', commitDrag)
    return () => {
      canvas.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', commitDrag)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingId, roomW, roomD, roomH])

  if (lights.length === 0) return null
  return (
    <>
      {lights.map((l) => {
        const x = l.xMm / 1000 - roomW / 2
        const z = l.zMm / 1000 - roomD / 2
        const isDragging = draggingId === l.id
        return (
          <group key={l.id}>
            <CeilingLightDisk x={x} z={z} height={roomH} emit={lightsOn} />
            {/* Invisible drag handle on ceiling */}
            <mesh
              position={[x, roomH, z]}
              rotation={[Math.PI / 2, 0, 0]}
              onPointerDown={(e) => startDrag(l, e)}
              onPointerEnter={() => { if (toolMode !== 'select') document.body.style.cursor = 'grab' }}
              onPointerLeave={() => { if (!isDragging) document.body.style.cursor = '' }}
            >
              <circleGeometry args={[0.12, 16]} />
              <meshBasicMaterial transparent opacity={0} />
            </mesh>
          </group>
        )
      })}
      {/* At most 2 pooled point lights regardless of fixture count */}
      {poolPositions.map((l, i) => {
        const x = l.xMm / 1000 - roomW / 2
        const z = l.zMm / 1000 - roomD / 2
        return (
          <pointLight
            key={`user-pool-${i}`}
            position={[x, roomH - 0.06, z]}
            color="#D8EEFF"
            intensity={poolIntensity}
            distance={spread}
            decay={2}
          />
        )
      })}
    </>
  )
}

// ─── Wall-mounted electrical devices ─────────────────────────────────────────

const ELECTRICAL_DIMS: Record<string, { w: number; h: number }> = {
  switch1:      { w: 0.08, h: 0.08 },
  switch2:      { w: 0.14, h: 0.08 },
  socket1:      { w: 0.08, h: 0.08 },
  socket2:      { w: 0.14, h: 0.08 },
  socket_media: { w: 0.18, h: 0.08 },
  // panel is a cabinet, not a thin faceplate
  panel:        { w: 0.40, h: 0.50 },
}

// ─── Draggable electrical items (3D) ─────────────────────────────────────────

function getWallPlane(wallId: 'A' | 'B' | 'C' | 'D', W: number, D: number): THREE.Plane {
  switch (wallId) {
    case 'A': return new THREE.Plane(new THREE.Vector3(0, 0, 1),  D / 2)
    case 'C': return new THREE.Plane(new THREE.Vector3(0, 0, -1), D / 2)
    case 'D': return new THREE.Plane(new THREE.Vector3(1, 0, 0),  W / 2)
    case 'B': return new THREE.Plane(new THREE.Vector3(-1, 0, 0), W / 2)
  }
}

function DraggableElectricalItem({
  el, W, D, isDragging, dragPosMmRef, onPointerDown,
}: {
  el: PlacedElectrical
  W: number; D: number
  isDragging: boolean
  dragPosMmRef: React.MutableRefObject<number>
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void
}) {
  const groupRef = useRef<THREE.Group>(null)
  const isPanel = el.type === 'panel'
  const dim = ELECTRICAL_DIMS[el.type] ?? { w: 0.08, h: 0.08 }
  const depth = isPanel ? 0.12 : 0.018
  const T = 0.004
  const isSwitch = el.type.startsWith('switch')
  const isH = el.wallId === 'A' || el.wallId === 'C'

  // Compute static position (the axis that stays fixed during drag)
  const { px, py, pz, ry } = useMemo(() => {
    const cy = el.heightMm / 1000 + dim.h / 2
    const p = el.positionMm / 1000
    switch (el.wallId) {
      case 'A': return { px: p - W / 2, py: cy, pz: -(D / 2) + depth / 2 + T, ry: 0 }
      case 'C': return { px: p - W / 2, py: cy, pz: D / 2 - depth / 2 - T, ry: Math.PI }
      case 'D': return { px: -(W / 2) + depth / 2 + T, py: cy, pz: p - D / 2, ry: Math.PI / 2 }
      case 'B': return { px: W / 2 - depth / 2 - T, py: cy, pz: p - D / 2, ry: -Math.PI / 2 }
      default: return { px: 0, py: cy, pz: 0, ry: 0 }
    }
  }, [el, W, D, dim.h, depth])

  useFrame(() => {
    if (!isDragging || !groupRef.current) return
    const pos = dragPosMmRef.current / 1000
    if (isH) groupRef.current.position.x = pos - W / 2
    else     groupRef.current.position.z = pos - D / 2
  })

  if (isPanel) {
    return (
      <group ref={groupRef} position={[px, py, pz]} rotation={[0, ry, 0]}>
        <mesh castShadow
          onPointerDown={onPointerDown}
          onPointerEnter={() => { document.body.style.cursor = 'grab' }}
          onPointerLeave={() => { if (!isDragging) document.body.style.cursor = '' }}>
          <boxGeometry args={[dim.w, dim.h, depth]} />
          <meshStandardMaterial color="#E8E4DC" roughness={0.6} metalness={0.1}
            emissive={isDragging ? '#4466AA' : '#000'} emissiveIntensity={isDragging ? 0.08 : 0}/>
        </mesh>
        <mesh position={[0, 0, depth / 2 + 0.002]}>
          <boxGeometry args={[dim.w - 0.02, dim.h - 0.02, 0.01]} />
          <meshStandardMaterial color="#1B3784" roughness={0.4} metalness={0.15} />
        </mesh>
        {[-0.08, 0, 0.08].map((rowY, ri) =>
          [-0.08, 0.08].map((colX, ci) => (
            <mesh key={`${ri}-${ci}`} position={[colX, rowY, depth / 2 + 0.008]}>
              <boxGeometry args={[0.06, 0.04, 0.006]} />
              <meshStandardMaterial color="#F0F0F0" roughness={0.5} />
            </mesh>
          ))
        )}
        <mesh position={[dim.w / 2 - 0.03, 0, depth / 2 + 0.012]}>
          <boxGeometry args={[0.012, 0.04, 0.008]} />
          <meshStandardMaterial color="#C0B8A8" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>
    )
  }

  return (
    <group ref={groupRef} position={[px, py, pz]} rotation={[0, ry, 0]}>
      <mesh castShadow
        onPointerDown={onPointerDown}
        onPointerEnter={() => { document.body.style.cursor = 'grab' }}
        onPointerLeave={() => { if (!isDragging) document.body.style.cursor = '' }}>
        <boxGeometry args={[dim.w, dim.h, depth]} />
        <meshStandardMaterial color="#F5F5F0" roughness={0.5} metalness={0.05}
          emissive={isDragging ? '#4466AA' : '#000'} emissiveIntensity={isDragging ? 0.1 : 0}/>
      </mesh>
      {isSwitch ? (
        <mesh position={[0, 0.005, depth / 2 + 0.001]}>
          <boxGeometry args={[dim.w * 0.7, dim.h * 0.55, 0.004]} />
          <meshStandardMaterial color="#1B3784" roughness={0.4} metalness={0.1} />
        </mesh>
      ) : (
        <>
          <mesh position={[-0.012, 0.008, depth / 2 + 0.001]}>
            <cylinderGeometry args={[0.004, 0.004, 0.003, 12]} />
            <meshStandardMaterial color="#1B3784" />
          </mesh>
          <mesh position={[0.012, 0.008, depth / 2 + 0.001]}>
            <cylinderGeometry args={[0.004, 0.004, 0.003, 12]} />
            <meshStandardMaterial color="#1B3784" />
          </mesh>
        </>
      )}
    </group>
  )
}

function DraggableElectricalModels({
  controlsRef, W, D,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>
  W: number; D: number
}) {
  const electricals = useRoomStore(s => s.electricals)
  const moveElectrical = useRoomStore(s => s.moveElectrical)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const draggingIdRef = useRef<string | null>(null)
  const dragPosMmRef = useRef(0)
  const electricalsRef = useRef(electricals)
  electricalsRef.current = electricals

  const { camera, gl } = useThree()
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const hitPoint = useRef(new THREE.Vector3())

  function startDrag(el: PlacedElectrical, e: ThreeEvent<PointerEvent>) {
    e.stopPropagation()
    dragPosMmRef.current = el.positionMm
    draggingIdRef.current = el.id
    setDraggingId(el.id)
    if (controlsRef.current) controlsRef.current.enabled = false
    document.body.style.cursor = 'grabbing'
  }

  function commitDrag() {
    const id = draggingIdRef.current
    if (!id) return
    moveElectrical(id, Math.round(dragPosMmRef.current))
    draggingIdRef.current = null
    setDraggingId(null)
    if (controlsRef.current) controlsRef.current.enabled = true
    document.body.style.cursor = ''
  }

  useEffect(() => {
    if (!draggingId) return
    const el = electricalsRef.current.find(e => e.id === draggingId)
    if (!el) return

    const wallPlane = getWallPlane(el.wallId as 'A' | 'B' | 'C' | 'D', W, D)
    const isH = el.wallId === 'A' || el.wallId === 'C'
    const wallLenMm = isH ? W * 1000 : D * 1000
    const canvas = gl.domElement

    const handleMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      if (!raycaster.ray.intersectPlane(wallPlane, hitPoint.current)) return
      let posMm = isH
        ? (hitPoint.current.x + W / 2) * 1000
        : (hitPoint.current.z + D / 2) * 1000
      posMm = Math.max(100, Math.min(wallLenMm - 100, posMm))
      dragPosMmRef.current = posMm
    }

    canvas.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', commitDrag)
    return () => {
      canvas.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', commitDrag)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingId, W, D])

  if (electricals.length === 0) return null
  return (
    <>
      {electricals.map(el => (
        <DraggableElectricalItem
          key={el.id}
          el={el} W={W} D={D}
          isDragging={draggingId === el.id}
          dragPosMmRef={dragPosMmRef}
          onPointerDown={(e) => startDrag(el, e)}
        />
      ))}
    </>
  )
}

// ─── Corner shadow accents ────────────────────────────────────────────────────

function CornerShadows({ width, depth, composerActive }: { width: number; depth: number; composerActive: boolean }) {
  // Halve opacity when N8AO composer is active to avoid double-darkening corners
  const opacity = composerActive ? 0.07 : 0.15;
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
          <meshBasicMaterial color="#000000" transparent opacity={opacity} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Lighting ─────────────────────────────────────────────────────────────────

export function SceneLighting({
  width, depth, height, highQuality,
}: {
  width: number; depth: number; height: number; highQuality: boolean
}) {
  const sunRef = useRef<THREE.DirectionalLight | null>(null)

  // Enable layer 2 on the shadow camera so the ceiling mesh (moved to layer 2 in
  // topView) still appears in the shadow map and blocks the sun from above.
  useLayoutEffect(() => {
    sunRef.current?.shadow.camera.layers.enable(2)
  }, [])

  // Frustum fitted tightly to the room so shadow texels aren't wasted
  const hw = width / 2 + 1.2
  const hd = depth / 2 + 1.2
  const mapSize = highQuality ? 2048 : 1024

  return (
    <>
      {highQuality && <SoftShadows size={22} samples={10} focus={0} />}
      {/* Low-intensity sky fill — dominant light is the directional sun */}
      <hemisphereLight color="#FFE8CC" groundColor="#3A3020" intensity={0.22} />
      <directionalLight
        ref={sunRef}
        position={[width * 1.5, height * 2.5, depth * 1.2]}
        intensity={1.85}
        color="#FFF5E8"
        castShadow
        shadow-mapSize={[mapSize, mapSize]}
        shadow-camera-near={0.1}
        shadow-camera-far={40}
        shadow-camera-left={-hw}
        shadow-camera-right={hw}
        shadow-camera-top={hd}
        shadow-camera-bottom={-hd}
        shadow-bias={-0.001}
      />
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
  const { scene } = useGLTF(modelPath || '/models/table_boconcept_hauge.glb')
  const cloned = useMemo(() => {
    const c = scene.clone(true)
    prepareMesh(c)
    return c
  }, [scene]);

  // Compute bottom offset ONCE per clone, before R3F touches the object's position.
  // Storing scale-independent value so it stays correct when scaleOverride changes.
  const yOffUnit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(cloned)
    return isFinite(box.min.y) ? -box.min.y : 0
  }, [cloned]);

  useLayoutEffect(() => {
    if (!item.colorOverrides || Object.keys(item.colorOverrides).length === 0) return
    applyColorOverrides(cloned, item.colorOverrides)
  }, [cloned, item.colorOverrides])

  if (!entry || !modelPath) return null;
  const s = entry.scale * (item.scaleOverride ?? 1);
  return (
    <primitive
      object={cloned}
      position={[item.x / 1000, yOffUnit * s, item.y / 1000]}
      rotation={[0, item.rotation, 0]}
      scale={s}
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

type ToolMode = 'select' | 'move' | 'rotate'

function DraggableFurnitureItem({
  item,
  isDragging,
  toolMode,
  dragPosRef,
  dragRotRef,
  onMeshPointerDown,
  onButtonPointerDown,
}: {
  item: PlacedFurniture
  isDragging: boolean
  toolMode: ToolMode
  dragPosRef: RefObject<THREE.Vector3>
  dragRotRef: RefObject<number>
  onMeshPointerDown: (e: ThreeEvent<PointerEvent>) => void
  onButtonPointerDown: (e: React.PointerEvent) => void
}) {
  const entry = useFurnitureEntry(item.furniture_id)
  const modelPath = entry?.modelPath ?? ''
  const { scene } = useGLTF(modelPath || '/models/table_boconcept_hauge.glb')
  const cloned = useMemo(() => {
    const c = scene.clone(true)
    prepareMesh(c)
    return c
  }, [scene])
  const groupRef = useRef<THREE.Group>(null)
  const primitiveRef = useRef<THREE.Object3D>(null)

  // Compute bottom offset ONCE per clone before R3F sets position on the object.
  const yOffUnit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(cloned)
    return isFinite(box.min.y) ? -box.min.y : 0
  }, [cloned])

  useLayoutEffect(() => {
    if (!item.colorOverrides || Object.keys(item.colorOverrides).length === 0) return
    applyColorOverrides(cloned, item.colorOverrides)
  }, [cloned, item.colorOverrides])

  useFrame(() => {
    if (!isDragging) return
    if (toolMode === 'move' && groupRef.current && dragPosRef.current) {
      groupRef.current.position.x = dragPosRef.current.x
      groupRef.current.position.z = dragPosRef.current.z
    } else if (toolMode === 'rotate' && primitiveRef.current && dragRotRef.current !== null) {
      primitiveRef.current.rotation.y = dragRotRef.current
    }
  })

  if (!entry || !modelPath) return null

  const interactive = toolMode !== 'select'
  const so = item.scaleOverride ?? 1
  const s = entry.scale * so
  const yOff = yOffUnit * s
  const buttonH = (entry.sizeM.h ?? 1) * so + 0.18
  const btnActive = isDragging

  return (
    <group ref={groupRef} position={[item.x / 1000, 0, item.y / 1000]}>
      <primitive
        ref={primitiveRef}
        object={cloned}
        position={[0, yOff, 0]}
        rotation={[0, item.rotation, 0]}
        scale={s}
        onPointerDown={interactive ? onMeshPointerDown : undefined}
        onPointerEnter={() => { if (interactive) document.body.style.cursor = toolMode === 'rotate' ? 'ew-resize' : 'grab' }}
        onPointerLeave={() => { if (!isDragging) document.body.style.cursor = '' }}
      />
      {toolMode === 'move' && (
        <Html position={[0, buttonH, 0]} center zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }}>
          <button
            onPointerDown={(e) => { e.stopPropagation(); onButtonPointerDown(e) }}
            title="Siljitish"
            style={{
              pointerEvents: 'all', width: 30, height: 30, borderRadius: '50%',
              border: btnActive ? '2px solid #1E40AF' : '1.5px solid rgba(0,0,0,0.18)',
              background: btnActive ? '#1E40AF' : 'rgba(255,255,255,0.92)',
              color: btnActive ? '#fff' : '#555',
              cursor: btnActive ? 'grabbing' : 'grab',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.22)', userSelect: 'none', touchAction: 'none',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11 3l-4 4h3v3H7V7l-4 4 4 4v-3h3v3H7l4 4 4-4h-3v-3h3v3l4-4-4-4v3h-3V7h3l-4-4z"/>
            </svg>
          </button>
        </Html>
      )}
      {toolMode === 'rotate' && (
        <Html position={[0, buttonH, 0]} center zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }}>
          <button
            onPointerDown={(e) => { e.stopPropagation(); onButtonPointerDown(e) }}
            title="Aylantirish"
            style={{
              pointerEvents: 'all', width: 30, height: 30, borderRadius: '50%',
              border: btnActive ? '2px solid #1E40AF' : '1.5px solid rgba(0,0,0,0.18)',
              background: btnActive ? '#1E40AF' : 'rgba(255,255,255,0.92)',
              color: btnActive ? '#fff' : '#555',
              cursor: 'ew-resize',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.22)', userSelect: 'none', touchAction: 'none',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
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
  toolMode,
  onSelectItem,
}: {
  controlsRef: RefObject<OrbitControlsImpl | null>
  roomW: number
  roomD: number
  toolMode: ToolMode
  onSelectItem: (id: string) => void
}) {
  const furniture = useRoomStore((s) => s.furniture)
  const userFurniture = useRoomStore((s) => s.userFurniture)
  const moveFurniture = useRoomStore((s) => s.moveFurniture)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragPosRef = useRef(new THREE.Vector3())
  const dragRotRef = useRef(0)
  const draggingIdRef = useRef<string | null>(null)
  const furnitureRef = useRef(furniture)
  furnitureRef.current = furniture
  const dragHalfRef = useRef({ w: 0.3, d: 0.3 })
  const rotateStartXRef = useRef(0)
  const rotateStartAngleRef = useRef(0)
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

  // Bounding-sphere radius for a furniture item (half-diagonal of its footprint)
  function itemRadius(furnitureId: string, scaleOverride: number): number {
    const entry = resolveEntry(furnitureId)
    if (!entry) return 0.4
    const so = scaleOverride
    const hw = (entry.sizeM.w ?? 1) * so / 2
    const hd = (entry.sizeM.d ?? 1) * so / 2
    return Math.sqrt(hw * hw + hd * hd)
  }

  // Returns true if placing draggingId at (nx, nz) [metres] overlaps any other item
  function wouldCollide(draggingId: string, nx: number, nz: number): boolean {
    const all = furnitureRef.current
    const self = all.find(f => f.id === draggingId)
    if (!self) return false
    const rA = itemRadius(self.furniture_id, self.scaleOverride ?? 1)
    for (const f of all) {
      if (f.id === draggingId) continue
      const rB = itemRadius(f.furniture_id, f.scaleOverride ?? 1)
      const dx = nx - f.x / 1000
      const dz = nz - f.y / 1000
      if (dx * dx + dz * dz < (rA + rB) * (rA + rB)) return true
    }
    return false
  }

  function activateDrag(item: PlacedFurniture, clientX: number) {
    onSelectItem(item.id)
    if (toolMode === 'move') {
      const entry = resolveEntry(item.furniture_id)
      const so = item.scaleOverride ?? 1
      dragHalfRef.current = { w: (entry?.sizeM.w ?? 0.6) * so / 2, d: (entry?.sizeM.d ?? 0.6) * so / 2 }
      dragPosRef.current.set(item.x / 1000, 0, item.y / 1000)
      document.body.style.cursor = 'grabbing'
    } else if (toolMode === 'rotate') {
      rotateStartXRef.current = clientX
      rotateStartAngleRef.current = item.rotation
      dragRotRef.current = item.rotation
      document.body.style.cursor = 'ew-resize'
    }
    draggingIdRef.current = item.id
    setDraggingId(item.id)
    if (controlsRef.current) controlsRef.current.enabled = false
  }

  function startDragFromMesh(item: PlacedFurniture, e: ThreeEvent<PointerEvent>) {
    e.stopPropagation()
    if (toolMode === 'select') { onSelectItem(item.id); return }
    activateDrag(item, e.clientX)
  }

  function startDragFromButton(item: PlacedFurniture, e: React.PointerEvent) {
    e.stopPropagation()
    e.preventDefault()
    if (toolMode === 'select') { onSelectItem(item.id); return }
    activateDrag(item, e.clientX)
  }

  function commitDrag() {
    const id = draggingIdRef.current
    if (!id) return
    const item = furnitureRef.current.find((f) => f.id === id)
    if (item) {
      if (toolMode === 'move') {
        moveFurniture(id, dragPosRef.current.x * 1000, dragPosRef.current.z * 1000, item.rotation)
      } else if (toolMode === 'rotate') {
        moveFurniture(id, item.x, item.y, dragRotRef.current)
      }
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
      if (toolMode === 'move') {
        const rect = canvas.getBoundingClientRect()
        const ndc = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        )
        raycaster.setFromCamera(ndc, camera)
        if (!raycaster.ray.intersectPlane(floorPlane, hitPoint.current)) return
        const { w, d } = dragHalfRef.current
        const halfW = roomW / 2
        const halfD = roomD / 2
        const snap = 0.05
        const rawX = Math.max(-halfW + w, Math.min(halfW - w, hitPoint.current.x))
        const rawZ = Math.max(-halfD + d, Math.min(halfD - d, hitPoint.current.z))
        const x = Math.round(rawX / snap) * snap
        const z = Math.round(rawZ / snap) * snap
        // Only update position if it doesn't overlap another item
        if (!wouldCollide(draggingIdRef.current!, x, z)) {
          dragPosRef.current.set(x, 0, z)
        }
      } else if (toolMode === 'rotate') {
        const deltaX = e.clientX - rotateStartXRef.current
        const rawRot = rotateStartAngleRef.current - deltaX * (Math.PI / 120)
        const step = 5 * (Math.PI / 180)
        dragRotRef.current = Math.round(rawRot / step) * step
      }
    }

    canvas.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', commitDrag)
    return () => {
      canvas.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', commitDrag)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingId, toolMode, roomW, roomD])

  return (
    <>
      {furniture.map((item) => (
        <Suspense key={item.id} fallback={null}>
          <DraggableFurnitureItem
            item={item}
            isDragging={draggingId === item.id}
            toolMode={toolMode}
            dragPosRef={dragPosRef}
            dragRotRef={dragRotRef}
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

// ─── N-wall polygon room shell ────────────────────────────────────────────────
//
// Used when the room has non-ABCD wall IDs (e.g. from a RoomPlan scan).
// Renders a polygon floor/ceiling and N wall boxes positioned along each edge.
// Windows/doors and baseboards are omitted for now (Phase 5 enhancement).

function NWallRoomShell({
  geometry,
  H,
  designState,
  selectedWall,
  onWallClick,
}: {
  geometry: RoomGeometry;
  H: number;
  designState: DesignState;
  selectedWall?: string | null;
  onWallClick?: (id: string) => void;
}) {
  const verts = geometry.vertices!
  const n = verts.length

  // Centroid for centering polygon at origin (metres)
  const cxM = verts.reduce((s, [x]) => s + x, 0) / n / 1000
  const czM = verts.reduce((s, [, z]) => s + z, 0) / n / 1000

  // Centred vertices in metres (XZ plane)
  const centred = useMemo(
    () => verts.map(([x, z]) => [x / 1000 - cxM, z / 1000 - czM] as [number, number]),
    // Stable dep: stringify only the numeric values so reference changes don't cause churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [verts.map(v => v.join(',')).join(';')]
  )

  const floorGeo = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(centred[0][0], centred[0][1])
    for (let i = 1; i < centred.length; i++) shape.lineTo(centred[i][0], centred[i][1])
    shape.closePath()
    return new THREE.ShapeGeometry(shape)
  }, [centred])

  const T = 0.18  // 18 cm wall thickness for polygon rooms

  return (
    <group>
      {/* Floor — ShapeGeometry in XY plane, rotated flat */}
      <mesh geometry={floorGeo} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <meshStandardMaterial
          color={FLOOR_COLORS[designState.floorType] ?? '#C9AB7E'}
          roughness={0.8}
        />
      </mesh>

      {/* Ceiling — same shape, flipped */}
      <mesh geometry={floorGeo} rotation={[Math.PI / 2, 0, 0]} position={[0, H, 0]} castShadow>
        <meshStandardMaterial color={CEILING_DEFAULT} roughness={0.95} side={THREE.DoubleSide} />
      </mesh>

      {/* One wall box per polygon edge */}
      {centred.map(([x1, z1], i) => {
        const [x2, z2] = centred[(i + 1) % n]
        const dx = x2 - x1
        const dz = z2 - z1
        const length = Math.sqrt(dx * dx + dz * dz)
        if (length < 0.01) return null

        const wall = geometry.walls[i]
        const wallId = wall?.id ?? String(i)

        // Rotation: atan2(-dz, dx) aligns box local-X with edge direction (dx,dz)
        const ry = Math.atan2(-dz, dx)

        // Alternate shade factor for depth cues (avoid all walls looking identical)
        const shadeFactor = i % 2 === 0 ? 0.92 : 0.82
        const covering = shadeCovering(
          resolveWallCovering(designState.wallCoverings, wallId),
          shadeFactor,
        )
        const baseColor = covering.kind === 'paint' ? covering.color : covering.baseColor
        const isSelected = selectedWall === wallId

        return (
          <mesh
            key={wallId}
            position={[(x1 + x2) / 2, H / 2, (z1 + z2) / 2]}
            rotation={[0, ry, 0]}
            castShadow
            receiveShadow
            onClick={() => onWallClick?.(wallId)}
          >
            <boxGeometry args={[length, H, T]} />
            <meshStandardMaterial
              color={isSelected ? '#D85A30' : baseColor}
              roughness={0.85}
              emissive={isSelected ? '#D85A30' : '#000000'}
              emissiveIntensity={isSelected ? 0.12 : 0}
            />
          </mesh>
        )
      })}
    </group>
  )
}

// ─── Full room scene ──────────────────────────────────────────────────────────

export function RoomScene({
  room,
  geometry,
  topView,
  designState,
  showContactShadows,
  composerActive,
  highQuality,
  hasUserLights,
  lightsOn,
  selectedWall,
  onWallClick,
}: {
  room: Room;
  geometry: RoomGeometry;
  topView: boolean;
  designState: DesignState;
  showContactShadows: boolean;
  composerActive: boolean;
  highQuality: boolean;
  hasUserLights: boolean;
  lightsOn: boolean;
  selectedWall?: string | null;
  onWallClick?: (id: string) => void;
}) {
  // Legacy 4-wall ABCD rectangle — use the existing precise rendering.
  // Any other layout (N-wall from RoomPlan) uses NWallRoomShell.
  const isLegacyAbcd =
    geometry.walls.length === 4 &&
    geometry.walls[0]?.id === 'A' &&
    geometry.walls[1]?.id === 'B' &&
    geometry.walls[2]?.id === 'C' &&
    geometry.walls[3]?.id === 'D'

  const wallA = geometry.walls.find((w) => w.id === "A");
  const wallB = geometry.walls.find((w) => w.id === "B");

  // W/D from room API when available, fall back to store geometry
  const W_abcd = (room.width  > 0 ? room.width  : (wallB?.length ?? 3000) / 1000);
  const D_abcd = (room.length > 0 ? room.length : (wallA?.length ?? 4000) / 1000);

  // For N-wall rooms, estimate W/D from the bounding box of polygon vertices
  const verts = geometry.vertices
  const W_poly = verts && verts.length >= 2
    ? (Math.max(...verts.map(([x]) => x)) - Math.min(...verts.map(([x]) => x))) / 1000
    : 4.0
  const D_poly = verts && verts.length >= 2
    ? (Math.max(...verts.map(([, z]) => z)) - Math.min(...verts.map(([, z]) => z))) / 1000
    : 3.0

  const W = isLegacyAbcd ? W_abcd : W_poly
  const D = isLegacyAbcd ? D_abcd : D_poly
  const H = (room.ceiling_height > 0 ? room.ceiling_height : 2.7);
  const T = 0.25; // 25 cm wall thickness (used only for legacy ABCD)
  const wallC = geometry.walls.find((w) => w.id === "C");
  const wallD = geometry.walls.find((w) => w.id === "D");

  // Per-wall coverings with depth shading
  const coveringA = shadeCovering(resolveWallCovering(designState.wallCoverings, 'A'), 0.92);
  const coveringB = shadeCovering(resolveWallCovering(designState.wallCoverings, 'B'), 0.82);
  const coveringC = shadeCovering(resolveWallCovering(designState.wallCoverings, 'C'), 0.92);
  const coveringD = shadeCovering(resolveWallCovering(designState.wallCoverings, 'D'), 0.82);

  // Per-wall panel settings
  const panelsA = resolveWallPanel(designState.wallPanels, 'A');
  const panelsB = resolveWallPanel(designState.wallPanels, 'B');
  const panelsC = resolveWallPanel(designState.wallPanels, 'C');
  const panelsD = resolveWallPanel(designState.wallPanels, 'D');

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

  const ceilingRef = useRef<THREE.Mesh | null>(null)

  // In topView the camera must see through the ceiling, but the ceiling box must still
  // block the directional sun (shadow map). Move it to layer 2 so the main camera
  // ignores it while the sun's shadow camera (which has layer 2 enabled) still sees it.
  useLayoutEffect(() => {
    if (!ceilingRef.current) return
    ceilingRef.current.layers.set(topView ? 2 : 0)
  }, [topView])

  return (
    <group>
      {isLegacyAbcd ? (
        <>
          <WoodFloor width={W} depth={D} floorType={designState.floorType} />

          {/* Ceiling — always present for shadow casting; layer 2 in topView hides from camera */}
          <mesh ref={ceilingRef} position={[0, H + 0.025, 0]} castShadow receiveShadow>
            <boxGeometry args={[W, 0.05, D]} />
            <meshStandardMaterial color={CEILING_DEFAULT} roughness={0.95} />
          </mesh>

          {/* Wall A — back, inner width W only, inner face at z = -D/2 */}
          <Wall wallId="A" length={W} height={H} thickness={T} covering={coveringA}
            elements={wallA?.elements ?? []} axis="X" cx={0} cz={-(D / 2 + T / 2)}
            isSelected={selectedWall === 'A'} onClick={() => onWallClick?.('A')}
            panelSettings={panelsA} />

          {/* Wall B — right, full outer depth D+2T (owns corners), inner face at x = +W/2 */}
          <Wall wallId="B" length={D + 2 * T} height={H} thickness={T} covering={coveringB}
            elements={elementsBOuter} axis="Z" cx={W / 2 + T / 2} cz={0}
            isSelected={selectedWall === 'B'} onClick={() => onWallClick?.('B')}
            panelSettings={panelsB} />

          {/* Wall C — front, inner width W only, inner face at z = +D/2 */}
          <Wall wallId="C" length={W} height={H} thickness={T} covering={coveringC}
            elements={wallC?.elements ?? []} axis="X" cx={0} cz={D / 2 + T / 2}
            isSelected={selectedWall === 'C'} onClick={() => onWallClick?.('C')}
            panelSettings={panelsC} />

          {/* Wall D — left, full outer depth D+2T (owns corners), inner face at x = -W/2 */}
          <Wall wallId="D" length={D + 2 * T} height={H} thickness={T} covering={coveringD}
            elements={elementsDOuter} axis="Z" cx={-(W / 2 + T / 2)} cz={0}
            isSelected={selectedWall === 'D'} onClick={() => onWallClick?.('D')}
            panelSettings={panelsD} />

          <WindowPanes geometry={geometry} wallWidth={W} wallDepth={D} />
          <Baseboard width={W} depth={D} geometry={geometry} />
          <CornerShadows width={W} depth={D} composerActive={composerActive} />
        </>
      ) : (
        /* N-wall polygon room — only available when geometry.vertices is set */
        geometry.vertices && geometry.vertices.length >= 3 ? (
          <NWallRoomShell
            geometry={geometry}
            H={H}
            designState={designState}
            selectedWall={selectedWall}
            onWallClick={onWallClick}
          />
        ) : null
      )}

      <CeilingLights width={W} depth={D} height={H} hasUserLights={hasUserLights} lightsOn={lightsOn} />

      {showContactShadows && (
        <ContactShadows
          position={[0, 0.01, 0]}
          opacity={0.55}
          scale={[W + 1, D + 1]}
          blur={2.2}
          far={0.5}
          resolution={highQuality ? 512 : 256}
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
  version,
}: {
  target: [number, number, number];
  position: [number, number, number];
  controlsRef: RefObject<OrbitControlsImpl | null>;
  version: number;
}) {
  const { camera } = useThree();
  const targetPos = useMemo(() => new THREE.Vector3(...position), [position]);
  const targetLookAt = useMemo(() => new THREE.Vector3(...target), [target]);

  // Only animate when preset changes — stop once arrived or user starts dragging
  const isAnimating = useRef(false);
  const userDragging = useRef(false);

  // Trigger animation when target changes OR when version bumps (same preset re-clicked)
  useEffect(() => {
    isAnimating.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetPos, targetLookAt, version]);

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

export type PhaseKey = 'suvoq' | 'shpaklovka' | 'boyoq' | 'pol' | 'montaj' | 'mebel'

const RENO_STAGES: Array<{ key: PhaseKey; label: string }> = [
  { key: 'suvoq',      label: "Suvoq"       },
  { key: 'shpaklovka', label: "Shpaklovka"  },
  { key: 'boyoq',      label: "Bo'yoq/Oboi" },
  { key: 'pol',        label: "Pol"         },
  { key: 'montaj',     label: "Montaj"      },
  { key: 'mebel',      label: "Mebel"       },
]

export default function ThreeDPage() {
  const { room } = useOutletContext<StudioContext>();
  const { geometry, designState, lights: userLights, highQuality3d } = useRoomStore();

  // Fall back to geometry wall lengths when API room has width/length = 0
  const geoWallB = geometry.walls.find((w) => w.id === "B");
  const geoWallA = geometry.walls.find((w) => w.id === "A");
  const W = room.width  > 0 ? room.width  : (geoWallB?.length ?? 3000) / 1000;
  const D = room.length > 0 ? room.length : (geoWallA?.length ?? 4000) / 1000;
  const H = room.ceiling_height > 0 ? room.ceiling_height : 2.7;

  const [preset, setPreset] = useState<ViewPreset>("back");
  const [presetVersion, setPresetVersion] = useState(0);
  const [dpr, setDpr] = useState<number | [number, number]>([1, 2]);
  // Two consecutive PerformanceMonitor declines required before killing shadows / composer
  const [declineCount, setDeclineCount] = useState(0);
  const showContactShadows = declineCount < 2;
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [lightsOn, setLightsOn] = useState(true);
  const [selectedFurId, setSelectedFurId] = useState<string | null>(null);
  const [angleInputDeg, setAngleInputDeg] = useState('');
  const furniture = useRoomStore((s) => s.furniture);
  const moveFurniture = useRoomStore((s) => s.moveFurniture);
  const [activePhase, setActivePhase] = useState<PhaseKey>('boyoq');
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [selectedWall, setSelectedWall] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const addSheetSection: 'wallpaper' | 'lyustra' | 'furniture' =
    activePhase === 'boyoq' ? 'wallpaper' : activePhase === 'montaj' ? 'lyustra' : 'furniture';
  const controlsRef = useRef<OrbitControlsImpl | null>(null);


  const topView = preset === "top";
  const cam = useMemo(
    () => getCamera(preset, W, D, H),
    [preset, W, D, H],
  );

  // Limit orbit radius to shorter room dimension so camera stays inside
  const interiorMaxDist = Math.min(W, D) * 0.85;
  // Top view: keep camera above ceiling — ceiling is hidden so user can scroll "through" it
  const topMinDist = H * 2.4;
  const maxPolarAngle = Math.PI * 0.88;

  // Initial camera position — only used on first mount
  const initCam = useMemo(
    () => getCamera("corner", W, D, H),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const activeIdx = RENO_STAGES.findIndex(s => s.key === activePhase);

  return (
    <div className="flex flex-col lg:flex-row" style={{ height: "calc(100vh - 108px)" }}>

      {/* ── Mobile: horizontal phase strip ──────────────────────── */}
      <div className="flex lg:hidden shrink-0 overflow-x-auto bg-surface border-b border-gray-200 select-none" style={{ scrollbarWidth: 'none' }}>
        {RENO_STAGES.map((stage, i) => {
          const status = i < activeIdx ? 'done' : i === activeIdx ? 'current' : 'pending';
          return (
            <button
              key={stage.key}
              onClick={() => setActivePhase(stage.key)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-semibold whitespace-nowrap border-b-2 transition-colors ${
                status === 'current' ? 'border-brand text-brand' :
                status === 'done'    ? 'border-transparent text-success' :
                                       'border-transparent text-gray-400'
              }`}
            >
              {status === 'done' && (
                <svg width="10" height="10" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1.5 5.5l3 3 5-5"/>
                </svg>
              )}
              {status === 'current' && <span className="w-1.5 h-1.5 rounded-full bg-brand inline-block" />}
              {stage.label}
            </button>
          );
        })}
      </div>

      {/* ── Desktop: left phase stepper sidebar ─────────────────── */}
      <nav className="hidden lg:flex w-36 shrink-0 bg-surface border-r border-gray-200 flex-col pt-3 select-none">
        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest px-4 mb-2">Bosqichlar</p>
        {RENO_STAGES.map((stage, i) => {
          const status = i < activeIdx ? 'done' : i === activeIdx ? 'current' : 'pending';
          return (
            <button
              key={stage.key}
              onClick={() => setActivePhase(stage.key)}
              className={`w-full flex items-center gap-2 px-4 py-2.5 text-[12px] font-semibold text-left transition-colors ${
                status === 'current'
                  ? 'bg-brand text-white'
                  : status === 'done'
                  ? 'text-success hover:bg-gray-50'
                  : 'text-gray-400 hover:bg-gray-50'
              }`}
            >
              {status === 'done' && (
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M1.5 5.5l3 3 5-5"/>
                </svg>
              )}
              {status === 'current' && (
                <span className="w-2 h-2 rounded-full bg-white/90 animate-pulse inline-block shrink-0" />
              )}
              {status === 'pending' && (
                <span className="w-2 h-2 rounded-full bg-gray-300 inline-block shrink-0" />
              )}
              <span className="leading-tight">{stage.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ── Center: toolbar + canvas ─────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Toolbar */}
        <div className="flex items-center gap-1.5 px-2 lg:px-4 py-1.5 lg:py-2 bg-surface border-b border-gray-200 shrink-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          <span className="text-xs font-medium text-gray-500 mr-0.5 shrink-0 hidden sm:block">Ko'rinish:</span>
          {(["back", "top"] as ViewPreset[]).map((v) => (
            <button
              key={v}
              onClick={() => { setPreset(v); setPresetVersion(n => n + 1) }}
              className={`shrink-0 px-2.5 py-1 rounded-full text-xs transition-colors ${
                preset === v
                  ? "bg-brand text-white font-medium"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-700"
              }`}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            <div className="flex items-center bg-gray-100 rounded-full p-0.5 gap-0.5">
              <button
                onClick={() => setToolMode('select')}
                title="Tanlash"
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                  toolMode === 'select' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4 0l16 10.5-7 1.5 4 8-2.5 1-4-8-6.5 4.5z"/>
                </svg>
                <span className="hidden sm:inline">Tanlash</span>
              </button>
              <button
                onClick={() => setToolMode('move')}
                title="Siljitish"
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                  toolMode === 'move' ? 'bg-brand text-white shadow' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11 3l-4 4h3v3H7V7l-4 4 4 4v-3h3v3H7l4 4 4-4h-3v-3h3v3l4-4-4-4v3h-3V7h3l-4-4z"/>
                </svg>
                <span className="hidden sm:inline">Siljitish</span>
              </button>
              <button
                onClick={() => setToolMode('rotate')}
                title="Aylantirish"
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                  toolMode === 'rotate' ? 'bg-brand text-white shadow' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                </svg>
                <span className="hidden sm:inline">Aylantirish</span>
              </button>
            </div>
            {toolMode === 'rotate' && selectedFurId && (() => {
              const item = furniture.find(f => f.id === selectedFurId)
              if (!item) return null
              const currentDeg = Math.round(item.rotation * (180 / Math.PI))
              return (
                <form
                  className="flex items-center gap-1"
                  onSubmit={e => {
                    e.preventDefault()
                    const deg = parseFloat(angleInputDeg)
                    if (!isNaN(deg)) {
                      moveFurniture(item.id, item.x, item.y, deg * (Math.PI / 180))
                      setAngleInputDeg('')
                    }
                  }}
                >
                  <input
                    key={selectedFurId + currentDeg}
                    type="number"
                    defaultValue={currentDeg}
                    onChange={e => setAngleInputDeg(e.target.value)}
                    placeholder={`${currentDeg}°`}
                    className="w-14 text-xs border border-gray-300 rounded px-1 py-0.5 text-center focus:outline-none focus:border-brand"
                    title="Burchakni darajada kiriting va Enter bosing"
                  />
                  <span className="text-gray-400 text-xs">°</span>
                  <button type="submit" className="text-xs px-1.5 py-0.5 bg-brand text-white rounded font-medium">✓</button>
                </form>
              )
            })()}
            <button
              onClick={() => setLightsOn(v => !v)}
              title={lightsOn ? "Chiroqni o'chirish" : "Chiroqni yoqish"}
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors border shrink-0 ${
                lightsOn
                  ? 'bg-yellow-100 text-yellow-700 border-yellow-300 hover:bg-yellow-200'
                  : 'bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200'
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 14c.2-1 .7-1.7 1.5-2.5C17.7 10.2 19 8.7 19 7c0-3.3-2.7-6-6-6S7 3.7 7 7c0 1.7 1.3 3.2 2.5 4.5.8.8 1.3 1.5 1.5 2.5"/>
                <path d="M9 18h6M10 22h4"/>
              </svg>
              <span className="hidden sm:inline">{lightsOn ? 'Yoqilgan' : "O'chirilgan"}</span>
            </button>
            {/* Mobile: design panel toggle */}
            <button
              onClick={() => setShowPanel(v => !v)}
              title="Dizayn paneli"
              className="lg:hidden flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-brand text-white shrink-0"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="13.5" cy="6.5" r="2.5"/><circle cx="19" cy="17" r="2.5"/><circle cx="6" cy="17" r="2.5"/>
                <path d="M13.5 9v3.5M19 14.5V11l-5.5-2M6 14.5V11l5.5-2"/>
              </svg>
              <span className="hidden sm:inline">Dizayn</span>
            </button>
          </div>
        </div>

        {/* Canvas area */}
        <div className="flex-1 min-h-0 relative">

          {/* Hint overlay — bottom-left of canvas */}
          <p className="absolute bottom-16 left-4 z-10 text-[10px] text-white/40 pointer-events-none select-none" style={{ textShadow: '0 1px 3px rgba(0,0,0,.5)' }}>
            Drag: aylantirish · Scroll: zoom
          </p>

          {/* Bottom CTA */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
            <button
              onClick={() => setShowAddSheet(true)}
              className="pointer-events-auto flex items-center gap-2 px-6 py-3 text-white rounded-[20px] font-bold text-[15px] active:scale-[0.97] transition-transform"
              style={{ background: "linear-gradient(135deg,#F97316 0%,#EA580C 100%)", boxShadow: "0 12px 28px -8px rgba(249,115,22,.65)" }}
            >
              <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <path d="M8.5 2.5v12M2.5 8.5h12"/>
              </svg>
              Buyum qo'shish
            </button>
          </div>

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

          {/* Infinite workspace grid — grey floor with white lines */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.003, 0]}>
            <planeGeometry args={[200, 200]} />
            <meshBasicMaterial color="#888888" />
          </mesh>
          <Grid
            position={[0, -0.002, 0]}
            infiniteGrid
            cellSize={0.1}
            cellThickness={0.4}
            cellColor="#ffffff"
            sectionSize={1}
            sectionThickness={0.8}
            sectionColor="#ffffff"
            fadeDistance={28}
            fadeStrength={1.4}
          />

          <PerformanceMonitor
            onDecline={() => {
              setDpr(1);
              setDeclineCount(n => n + 1);
            }}
          />

          <Suspense fallback={null}>
            <SceneLighting
              width={W}
              depth={D}
              height={H}
              highQuality={highQuality3d}
            />
            <Environment preset="apartment" environmentIntensity={0.35} />

            <RoomScene
              room={room}
              geometry={geometry}
              topView={topView}
              designState={designState}
              showContactShadows={showContactShadows}
              composerActive={false}
              highQuality={highQuality3d}
              hasUserLights={userLights.length > 0}
              lightsOn={lightsOn}
              selectedWall={selectedWall}
              onWallClick={(id) => {
                setSelectedWall(id);
                setActivePhase('boyoq');
              }}
            />
            <SwapButtons W={W} D={D} H={H} />
            <DraggableFurnitureModels controlsRef={controlsRef} roomW={W} roomD={D} toolMode={toolMode} onSelectItem={setSelectedFurId} />
            <DraggableElectricalModels controlsRef={controlsRef} W={W} D={D} />
            <DraggableLightModels controlsRef={controlsRef} roomW={W} roomD={D} roomH={H} toolMode={toolMode} lightsOn={lightsOn} />

            <OrbitControls
              ref={controlsRef}
              target={initCam.target}
              enableDamping
              dampingFactor={0.06}
              enablePan={false}
              minDistance={topView ? topMinDist : 0.25}
              maxDistance={topView ? Math.max(W, D) * 4 : interiorMaxDist}
              maxPolarAngle={topView ? Math.PI * 0.3 : maxPolarAngle}
              minPolarAngle={topView ? 0 : 0.08}
              rotateSpeed={topView ? 0.6 : -0.45}
              zoomSpeed={0.8}
            />

            <CameraAnimator
              position={cam.position}
              target={cam.target}
              controlsRef={controlsRef}
              version={presetVersion}
            />
          </Suspense>
        </Canvas>
        </div>
      </div>

      {/* ── Right: contextual design panel ───────────────────────── */}

      {/* Mobile backdrop */}
      {showPanel && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/30"
          onClick={() => setShowPanel(false)}
        />
      )}

      {/* Panel — desktop: static sidebar | mobile: slide-up sheet */}
      <div
        className={[
          /* mobile base */
          'fixed bottom-0 left-0 right-0 z-50 max-h-[72vh] rounded-t-2xl shadow-2xl transition-transform duration-300 ease-in-out',
          showPanel ? 'translate-y-0' : 'translate-y-full',
          /* desktop override */
          'lg:static lg:translate-y-0 lg:max-h-none lg:rounded-none lg:shadow-none lg:z-auto',
        ].join(' ')}
      >
        {/* Mobile drag handle */}
        <div
          className="lg:hidden flex justify-center pt-2 pb-0.5 bg-surface rounded-t-2xl cursor-pointer"
          onClick={() => setShowPanel(false)}
        >
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <DesignPanel room={room} phase={activePhase} selectedWall={selectedWall} onWallChange={setSelectedWall} />
      </div>

      {showAddSheet && <AddObjectSheet onClose={() => setShowAddSheet(false)} initialSection={addSheetSection} />}
    </div>
  );
}
