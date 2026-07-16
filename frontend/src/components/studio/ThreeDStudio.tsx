import { Suspense, useMemo, useState, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Sky, ContactShadows, SoftShadows, Lightformer } from "@react-three/drei";
import { useRoomStore } from "@/store/roomStore";
import type { AppliedSurfaces, RoomGeometry } from "@/store/roomStore";
import { updateRoom } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import MaterialPanel from "./MaterialPanel";
import type { Room, Material } from "@/lib/api";
import * as THREE from "three";
import { getMaterialTextures, inferTextureKey } from "@/lib/materialTextures";
import type { MaterialTextureKey } from "@/lib/materialTextures";
import { createOboyTexture, setOboyRepeat } from "@/lib/oboyPatterns";
import type { OboyPatternId } from "@/lib/oboyPatterns";
import type { DesignState } from "@/store/roomStore";

// ─── Types ────────────────────────────────────────────────────────────────────

type TimeOfDay = "tong" | "kunduz" | "kech";

type SurfaceId = "A" | "B" | "C" | "D" | "floor";

interface ThreeDStudioProps {
  room: Room;
}

// ─── Lighting config per time of day ─────────────────────────────────────────

const TIME_CONFIG: Record<
  TimeOfDay,
  {
    label: string;
    sunAzimuth: number;
    sunInclination: number;
    ambientIntensity: number;
    sunIntensity: number;
    sunColor: string;
    showInteriorLight: boolean;
  }
> = {
  tong: {
    label: "Tong",
    sunAzimuth: 90,
    sunInclination: 82,
    ambientIntensity: 0.3,
    sunIntensity: 1.4,
    sunColor: "#FFD0A0",
    showInteriorLight: false,
  },
  kunduz: {
    label: "Kunduz",
    sunAzimuth: 180,
    sunInclination: 30,
    ambientIntensity: 0.4,
    sunIntensity: 2.0,
    sunColor: "#FFFFFF",
    showInteriorLight: false,
  },
  kech: {
    label: "Kech",
    sunAzimuth: 270,
    sunInclination: 95,
    ambientIntensity: 0.15,
    sunIntensity: 0,
    sunColor: "#8090B0",
    showInteriorLight: true,
  },
};

// ─── Sky sun position helper ──────────────────────────────────────────────────

function azimuthInclinationToSunPos(
  azimuthDeg: number,
  inclinationDeg: number,
): [number, number, number] {
  const az = (azimuthDeg * Math.PI) / 180;
  const inc = (inclinationDeg * Math.PI) / 180;
  const x = Math.sin(az) * Math.cos(inc);
  const y = Math.sin(inc);
  const z = Math.cos(az) * Math.cos(inc);
  return [x, y, z];
}

// ─── Wall segment component ───────────────────────────────────────────────────

interface WallSegmentProps {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  roughness?: number;
  receiveShadow?: boolean;
  castShadow?: boolean;
  onClick?: () => void;
  isSelected?: boolean;
  oboyTex?: THREE.CanvasTexture | null;
}

function WallSegment({
  position,
  size,
  color,
  roughness = 0.9,
  receiveShadow = true,
  castShadow = true,
  onClick,
  isSelected,
  oboyTex,
}: WallSegmentProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Set oboy repeat based on this segment's face dimensions
  if (oboyTex) {
    // size: [w, h, d] — for X-axis wall: face = size[0] × size[1]; for Z-axis: size[2] × size[1]
    const faceW = Math.max(size[0], size[2]);
    const faceH = size[1];
    setOboyRepeat(oboyTex, faceW, faceH);
  }

  return (
    <mesh
      ref={meshRef}
      position={position}
      receiveShadow={receiveShadow}
      castShadow={castShadow}
      onClick={onClick}
    >
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={oboyTex ? "#FFFFFF" : color}
        map={oboyTex ?? null}
        roughness={oboyTex ? 0.85 : roughness}
        metalness={0.0}
        envMapIntensity={1.2}
        emissive={isSelected ? new THREE.Color("#D85A30") : new THREE.Color(0x000000)}
        emissiveIntensity={isSelected ? 0.25 : 0}
      />
    </mesh>
  );
}

// ─── Wall with openings ───────────────────────────────────────────────────────

interface WallCoveringProp {
  kind: "paint" | "oboy";
  color?: string;
  baseColor?: string;
  accentColor?: string;
  patternId?: OboyPatternId;
}

interface WallWithOpeningsProps {
  wallLength: number; // meters
  wallHeight: number; // meters
  thickness: number;
  color: string;
  elements: Array<{
    type: "eshik" | "deraza" | "balkon";
    width: number; // mm
    height: number; // mm
    sill_height: number; // mm
    position: number; // mm from left edge
  }>;
  axis: "X" | "Z";
  wallCenterX: number;
  wallCenterZ: number;
  onClick?: () => void;
  isSelected?: boolean;
  covering?: WallCoveringProp;
}

function WallWithOpenings({
  wallLength,
  wallHeight,
  thickness,
  color,
  elements,
  axis,
  wallCenterX,
  wallCenterZ,
  onClick,
  isSelected,
  covering,
}: WallWithOpeningsProps) {
  const oboyTex = useMemo(() => {
    if (!covering || covering.kind !== "oboy" || !covering.patternId) return null;
    return createOboyTexture(
      covering.patternId,
      covering.baseColor ?? "#F5F0E8",
      covering.accentColor ?? "#C0A090",
    );
  }, [covering]);
  const segments = useMemo(() => {
    const segs: Array<{
      x: number;
      y: number;
      z: number;
      w: number;
      h: number;
      d: number;
    }> = [];

    if (elements.length === 0) {
      // Full wall — single box
      segs.push({ x: wallCenterX, y: wallHeight / 2, z: wallCenterZ, w: axis === "X" ? wallLength : thickness, h: wallHeight, d: axis === "Z" ? wallLength : thickness });
      return segs;
    }

    // Sort elements by position
    const sorted = [...elements].sort((a, b) => a.position - b.position);

    // Convert mm → m
    const scaleM = 1 / 1000;

    // Build segments
    let cursor = 0; // left edge in mm

    for (const el of sorted) {
      const elLeft = el.position;
      const elRight = el.position + el.width;
      const elBottom = el.sill_height;
      const elTop = el.sill_height + el.height;

      // Left fill
      if (elLeft > cursor) {
        const segW = (elLeft - cursor) * scaleM;
        const segCX = ((cursor + elLeft) / 2 - wallLength * 500) * scaleM;
        segs.push(
          axis === "X"
            ? { x: wallCenterX + segCX, y: wallHeight / 2, z: wallCenterZ, w: segW, h: wallHeight, d: thickness }
            : { x: wallCenterX, y: wallHeight / 2, z: wallCenterZ + segCX, w: thickness, h: wallHeight, d: segW },
        );
      }

      // Top panel (above opening)
      if (elTop < wallLength * 1000 && elTop < wallHeight * 1000) {
        const panH = (wallHeight * 1000 - elTop) * scaleM;
        const panCX = ((elLeft + elRight) / 2 - wallLength * 500) * scaleM;
        const panCY = (elTop * scaleM + wallHeight) / 2;
        const panW = el.width * scaleM;
        segs.push(
          axis === "X"
            ? { x: wallCenterX + panCX, y: panCY, z: wallCenterZ, w: panW, h: panH, d: thickness }
            : { x: wallCenterX, y: panCY, z: wallCenterZ + panCX, w: thickness, h: panH, d: panW },
        );
      }

      // Sill panel (below opening, e.g. for windows)
      if (elBottom > 0) {
        const silH = elBottom * scaleM;
        const panCX = ((elLeft + elRight) / 2 - wallLength * 500) * scaleM;
        const panW = el.width * scaleM;
        segs.push(
          axis === "X"
            ? { x: wallCenterX + panCX, y: silH / 2, z: wallCenterZ, w: panW, h: silH, d: thickness }
            : { x: wallCenterX, y: silH / 2, z: wallCenterZ + panCX, w: thickness, h: silH, d: panW },
        );
      }

      cursor = elRight;
    }

    // Right fill after last element
    const totalMM = wallLength * 1000;
    if (cursor < totalMM) {
      const segW = (totalMM - cursor) * scaleM;
      const segCX = ((cursor + totalMM) / 2 - wallLength * 500) * scaleM;
      segs.push(
        axis === "X"
          ? { x: wallCenterX + segCX, y: wallHeight / 2, z: wallCenterZ, w: segW, h: wallHeight, d: thickness }
          : { x: wallCenterX, y: wallHeight / 2, z: wallCenterZ + segCX, w: thickness, h: wallHeight, d: segW },
      );
    }

    return segs;
  }, [elements, wallLength, wallHeight, thickness, axis, wallCenterX, wallCenterZ]);

  const effectiveColor = covering?.kind === "paint" ? (covering.color ?? color) : color;

  return (
    <group onClick={onClick}>
      {segments.map((seg, i) => (
        <WallSegment
          key={i}
          position={[seg.x, seg.y, seg.z]}
          size={[seg.w, seg.h, seg.d]}
          color={effectiveColor}
          isSelected={isSelected}
          oboyTex={oboyTex}
        />
      ))}
    </group>
  );
}

// ─── Room geometry ────────────────────────────────────────────────────────────

interface MaterialTextureMeta {
  key: MaterialTextureKey;
  tint?: string;
}

interface RoomGeometryProps {
  room: Room;
  geometry: RoomGeometry;
  surfaces: AppliedSurfaces;
  materialColorMap: Map<string, string>;
  materialTextureMeta: Map<string, MaterialTextureMeta>;
  designState: DesignState;
  selectedSurface: SurfaceId | null;
  onSurfaceClick: (id: SurfaceId) => void;
}

function RoomGeometry({
  room,
  geometry,
  surfaces,
  materialColorMap,
  materialTextureMeta,
  designState,
  selectedSurface,
  onSurfaceClick,
}: RoomGeometryProps) {
  const W = room.width ?? 0;
  const D = room.length ?? 0;
  const H = room.ceiling_height ?? 2.7;
  const T = 0.08; // wall thickness

  function wallColor(id: SurfaceId, def: string): string {
    const matId = surfaces[id as keyof AppliedSurfaces];
    if (!matId) return def;
    return materialColorMap.get(matId) ?? def;
  }

  function surfaceTextures(id: SurfaceId, fallbackKey: MaterialTextureKey) {
    const matId = surfaces[id as keyof AppliedSurfaces];
    const meta = matId ? materialTextureMeta.get(matId) : undefined;
    return getMaterialTextures(meta?.key ?? fallbackKey);
  }

  function wallCovering(wallId: "A" | "B" | "C" | "D"): WallCoveringProp | undefined {
    const c = designState.wallCoverings[wallId] ?? designState.wallCoverings.ALL;
    if (!c) return undefined;
    return c as WallCoveringProp;
  }

  const wallA = geometry.walls.find((w) => w.id === "A");
  const wallB = geometry.walls.find((w) => w.id === "B");
  const wallC = geometry.walls.find((w) => w.id === "C");
  const wallD = geometry.walls.find((w) => w.id === "D");

  return (
    <group>
      {/* Floor */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
        onClick={() => onSurfaceClick("floor")}
      >
        <planeGeometry args={[W, D]} />
        {(() => {
          const tex = surfaceTextures("floor", "parquet");
          tex.map.repeat.set(tex.repeat[0], tex.repeat[1]);
          tex.roughnessMap.repeat.set(tex.repeat[0], tex.repeat[1]);
          tex.normalMap.repeat.set(tex.repeat[0], tex.repeat[1]);
          const baseColor = wallColor("floor", "#C4A27A");
          return (
            <meshStandardMaterial
              color={selectedSurface === "floor" ? baseColor : baseColor}
              map={tex.map}
              roughnessMap={tex.roughnessMap}
              normalMap={tex.normalMap}
              normalScale={new THREE.Vector2(0.6, 0.6)}
              roughness={tex.roughness}
              metalness={tex.metalness}
              envMapIntensity={1.5}
              emissive={selectedSurface === "floor" ? new THREE.Color("#D85A30") : new THREE.Color(0x000000)}
              emissiveIntensity={selectedSurface === "floor" ? 0.15 : 0}
            />
          );
        })()}
      </mesh>

      {/* Ceiling — slightly visible, not glass */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, H, 0]}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial
          color="#F8F6F2"
          roughness={0.95}
          transparent
          opacity={0.55}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Wall A: back wall, z = -D/2, runs along X */}
      <WallWithOpenings
        wallLength={W}
        wallHeight={H}
        thickness={T}
        color={wallColor("A", "#F5F0E8")}
        elements={wallA?.elements ?? []}
        axis="X"
        wallCenterX={0}
        wallCenterZ={-D / 2}
        isSelected={selectedSurface === "A"}
        onClick={() => onSurfaceClick("A")}
        covering={wallCovering("A")}
      />

      {/* Wall B: right wall, x = W/2, runs along Z */}
      <WallWithOpenings
        wallLength={D}
        wallHeight={H}
        thickness={T}
        color={wallColor("B", "#EDE8DF")}
        elements={wallB?.elements ?? []}
        axis="Z"
        wallCenterX={W / 2}
        wallCenterZ={0}
        isSelected={selectedSurface === "B"}
        onClick={() => onSurfaceClick("B")}
        covering={wallCovering("B")}
      />

      {/* Wall C: front wall, z = D/2, runs along X */}
      <WallWithOpenings
        wallLength={W}
        wallHeight={H}
        thickness={T}
        color={wallColor("C", "#F5F0E8")}
        elements={wallC?.elements ?? []}
        axis="X"
        wallCenterX={0}
        wallCenterZ={D / 2}
        isSelected={selectedSurface === "C"}
        onClick={() => onSurfaceClick("C")}
        covering={wallCovering("C")}
      />

      {/* Wall D: left wall, x = -W/2, runs along Z */}
      <WallWithOpenings
        wallLength={D}
        wallHeight={H}
        thickness={T}
        color={wallColor("D", "#EDE8DF")}
        elements={wallD?.elements ?? []}
        axis="Z"
        wallCenterX={-W / 2}
        wallCenterZ={0}
        isSelected={selectedSurface === "D"}
        onClick={() => onSurfaceClick("D")}
        covering={wallCovering("D")}
      />
    </group>
  );
}

// ─── Room trim (plinth, window frames, door casings) ────────────────────────────

interface RoomTrimProps {
  room: Room;
  geometry: RoomGeometry;
}

const PLINTH_H = 0.10;  // 10 cm
const PLINTH_D = 0.015; // 1.5 cm depth
const FRAME_W = 0.05;   // 5 cm frame width
const FRAME_D = 0.02;   // 2 cm frame depth

const PLINTH_COLOR = "#E8E2D8";
const FRAME_COLOR = "#DEDBD5";
const GLASS_COLOR = "#A8C8E0";

function RoomTrim({ room, geometry }: RoomTrimProps) {
  const W = room.width ?? 4;
  const D = room.length ?? 4;
  const T = 0.08;
  const scaleM = 1 / 1000;

  const wallDefs = [
    { id: "A", axis: "X" as const, len: W, cx: 0, cz: -D / 2, wallData: geometry.walls.find((w) => w.id === "A") },
    { id: "B", axis: "Z" as const, len: D, cx: W / 2, cz: 0, wallData: geometry.walls.find((w) => w.id === "B") },
    { id: "C", axis: "X" as const, len: W, cx: 0, cz: D / 2, wallData: geometry.walls.find((w) => w.id === "C") },
    { id: "D", axis: "Z" as const, len: D, cx: -W / 2, cz: 0, wallData: geometry.walls.find((w) => w.id === "D") },
  ] as const;

  const plinthMat = <meshStandardMaterial color={PLINTH_COLOR} roughness={0.4} metalness={0.0} />;
  const frameMat = <meshStandardMaterial color={FRAME_COLOR} roughness={0.35} metalness={0.0} />;
  const glassMat = (
    <meshStandardMaterial
      color={GLASS_COLOR}
      roughness={0.05}
      metalness={0.1}
      transparent
      opacity={0.22}
    />
  );

  const trimMeshes: JSX.Element[] = [];

  for (const wall of wallDefs) {
    const elements = wall.wallData?.elements ?? [];
    const doorPositions = elements
      .filter((e) => e.type === "eshik")
      .map((e) => ({ left: e.position * scaleM, right: (e.position + e.width) * scaleM }));

    // ── Plinth strips (skip door sections) ─────────────────────────────────
    let cursor = 0;
    const plinths: Array<{ start: number; end: number }> = [];
    const sortedDoors = [...doorPositions].sort((a, b) => a.left - b.left);

    for (const door of sortedDoors) {
      if (door.left > cursor) plinths.push({ start: cursor, end: door.left });
      cursor = door.right;
    }
    plinths.push({ start: cursor, end: wall.len });

    for (const p of plinths) {
      const segLen = p.end - p.start;
      if (segLen < 0.01) continue;
      const segCtr = (p.start + p.end) / 2 - wall.len / 2;
      const px = wall.axis === "X" ? wall.cx + segCtr : wall.cx;
      const pz = wall.axis === "Z" ? wall.cz + segCtr : wall.cz;
      const outset = T / 2 + PLINTH_D / 2;
      const finalX = wall.axis === "Z" ? px + (wall.cx > 0 ? -outset : outset) : px;
      const finalZ = wall.axis === "X" ? pz + (wall.cz > 0 ? outset : -outset) : pz;
      const boxW = wall.axis === "X" ? segLen : PLINTH_D;
      const boxD = wall.axis === "Z" ? segLen : PLINTH_D;

      trimMeshes.push(
        <mesh key={`plinth-${wall.id}-${p.start}`} position={[finalX, PLINTH_H / 2, finalZ]} receiveShadow>
          <boxGeometry args={[boxW, PLINTH_H, boxD]} />
          {plinthMat}
        </mesh>,
      );
    }

    // ── Window frames + glass ──────────────────────────────────────────────
    for (const el of elements) {
      if (el.type !== "deraza" && el.type !== "balkon") continue;

      const elL = el.position * scaleM;
      const elW = el.width * scaleM;
      const elH = el.height * scaleM;
      const elBottom = el.sill_height * scaleM;
      const elCtr = elL + elW / 2 - wall.len / 2;

      // Offset from wall face (outer face of frame)
      const wallNormalOffset = T / 2 + FRAME_D / 2;
      const fpx = wall.axis === "X" ? wall.cx + elCtr : (wall.cx > 0 ? wall.cx - wallNormalOffset : wall.cx + wallNormalOffset);
      const fpz = wall.axis === "Z" ? wall.cz + elCtr : (wall.cz > 0 ? wall.cz + wallNormalOffset : wall.cz - wallNormalOffset);

      const frameCY = elBottom + elH / 2;

      // Left side
      trimMeshes.push(
        <mesh key={`wframe-L-${wall.id}-${el.position}`} position={[
          wall.axis === "X" ? wall.cx + (elL - wall.len / 2) + FRAME_W / 2 : fpx,
          frameCY,
          wall.axis === "Z" ? wall.cz + (elL - wall.len / 2) + FRAME_W / 2 : fpz,
        ]}>
          <boxGeometry args={[wall.axis === "X" ? FRAME_W : FRAME_D, elH + FRAME_W * 2, wall.axis === "Z" ? FRAME_W : FRAME_D]} />
          {frameMat}
        </mesh>,
      );
      // Right side
      trimMeshes.push(
        <mesh key={`wframe-R-${wall.id}-${el.position}`} position={[
          wall.axis === "X" ? wall.cx + (elL + elW - wall.len / 2) - FRAME_W / 2 : fpx,
          frameCY,
          wall.axis === "Z" ? wall.cz + (elL + elW - wall.len / 2) - FRAME_W / 2 : fpz,
        ]}>
          <boxGeometry args={[wall.axis === "X" ? FRAME_W : FRAME_D, elH + FRAME_W * 2, wall.axis === "Z" ? FRAME_W : FRAME_D]} />
          {frameMat}
        </mesh>,
      );
      // Top
      trimMeshes.push(
        <mesh key={`wframe-T-${wall.id}-${el.position}`} position={[
          wall.axis === "X" ? fpx : fpx,
          elBottom + elH + FRAME_W / 2,
          wall.axis === "Z" ? fpz : fpz,
        ]}>
          <boxGeometry args={[wall.axis === "X" ? elW + FRAME_W * 2 : FRAME_D, FRAME_W, wall.axis === "Z" ? elW + FRAME_W * 2 : FRAME_D]} />
          {frameMat}
        </mesh>,
      );
      // Sill
      trimMeshes.push(
        <mesh key={`wframe-B-${wall.id}-${el.position}`} position={[
          wall.axis === "X" ? fpx : fpx,
          elBottom - FRAME_W / 2,
          wall.axis === "Z" ? fpz : fpz,
        ]}>
          <boxGeometry args={[wall.axis === "X" ? elW + FRAME_W * 2 : FRAME_D, FRAME_W, wall.axis === "Z" ? elW + FRAME_W * 2 : FRAME_D]} />
          {frameMat}
        </mesh>,
      );

      // Glass pane
      trimMeshes.push(
        <mesh key={`glass-${wall.id}-${el.position}`} position={[
          wall.axis === "X" ? fpx : fpx,
          frameCY,
          wall.axis === "Z" ? fpz : fpz,
        ]}>
          <boxGeometry args={[wall.axis === "X" ? elW : 0.006, elH, wall.axis === "Z" ? elW : 0.006]} />
          {glassMat}
        </mesh>,
      );
    }
  }

  return <group>{trimMeshes}</group>;
}

// ─── Window-driven Lightformers ───────────────────────────────────────────────

interface WindowLightsProps {
  room: Room;
  geometry: RoomGeometry;
  timeOfDay: TimeOfDay;
}

function WindowLights({ room, geometry, timeOfDay }: WindowLightsProps) {
  const W = room.width ?? 4;
  const D = room.length ?? 4;
  const T = 0.08;
  const scaleM = 1 / 1000;

  const cfg = TIME_CONFIG[timeOfDay];
  // Evening: no window light; morning: warm gold; noon: white-blue
  const lightIntensity = cfg.sunIntensity > 0 ? cfg.sunIntensity * 1.2 : 0;
  if (lightIntensity <= 0) return null;

  const lightColor = timeOfDay === "tong" ? "#FFD580" : "#D4E8FF";

  const wallDefs = [
    { id: "A", axis: "X" as const, len: W, cx: 0, cz: -D / 2, inwardZ: 1 },
    { id: "B", axis: "Z" as const, len: D, cx: W / 2, cz: 0, inwardX: -1 },
    { id: "C", axis: "X" as const, len: W, cx: 0, cz: D / 2, inwardZ: -1 },
    { id: "D", axis: "Z" as const, len: D, cx: -W / 2, cz: 0, inwardX: 1 },
  ] as const;

  const lights: JSX.Element[] = [];

  for (const wall of wallDefs) {
    const wallData = geometry.walls.find((w) => w.id === wall.id);
    const windows = (wallData?.elements ?? []).filter(
      (e) => e.type === "deraza" || e.type === "balkon",
    );
    for (const win of windows) {
      const winCenterLocal = win.position * scaleM + (win.width * scaleM) / 2 - wall.len / 2;
      const winCenterY = win.sill_height * scaleM + (win.height * scaleM) / 2;
      const winW = win.width * scaleM;
      const winH = win.height * scaleM;

      // Place Lightformer just outside the window opening (exterior face)
      const offset = T / 2 + 0.05;
      const lx = wall.axis === "X"
        ? wall.cx + winCenterLocal
        : wall.cx + ((wall as {inwardX?: number}).inwardX ?? 0) * -offset;
      const lz = wall.axis === "Z"
        ? wall.cz + winCenterLocal
        : wall.cz + ((wall as {inwardZ?: number}).inwardZ ?? 0) * -offset;

      // Rotation: face inward (toward room center)
      const rotY = wall.axis === "X"
        ? (wall.cz < 0 ? 0 : Math.PI)
        : (wall.cx > 0 ? Math.PI / 2 : -Math.PI / 2);

      lights.push(
        <Lightformer
          key={`wlight-${wall.id}-${win.position}`}
          form="rect"
          color={lightColor}
          intensity={lightIntensity}
          position={[lx, winCenterY, lz]}
          rotation={[0, rotY, 0]}
          scale={[winW, winH, 1]}
          target={[0, winCenterY * 0.6, 0]}
        />,
      );

      // Supplementary area light casting shadow through window
      lights.push(
        <rectAreaLight
          key={`ralight-${wall.id}-${win.position}`}
          color={lightColor}
          intensity={lightIntensity * 0.8}
          width={winW}
          height={winH}
          position={[lx, winCenterY, lz]}
          rotation={[0, rotY, 0]}
        />,
      );
    }
  }

  return <>{lights}</>;
}

// ─── Time of day UI ────────────────────────────────────────────────────────────

function TimeOfDayControl({
  value,
  onChange,
}: {
  value: TimeOfDay;
  onChange: (v: TimeOfDay) => void;
}) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-0.5 bg-gray-900/70 rounded-chip p-1">
      {(["tong", "kunduz", "kech"] as TimeOfDay[]).map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={cn(
            "px-3 py-1.5 text-xs font-medium rounded-chip transition-colors",
            value === t
              ? "bg-white text-gray-900"
              : "text-white/80 hover:text-white",
          )}
        >
          {TIME_CONFIG[t].label}
        </button>
      ))}
    </div>
  );
}

// ─── Scene (inside Canvas) ────────────────────────────────────────────────────

interface SceneProps {
  room: Room;
  geometry: RoomGeometry;
  surfaces: AppliedSurfaces;
  materialColorMap: Map<string, string>;
  materialTextureMeta: Map<string, MaterialTextureMeta>;
  designState: DesignState;
  timeOfDay: TimeOfDay;
  selectedSurface: SurfaceId | null;
  onSurfaceClick: (id: SurfaceId) => void;
}

function Scene({
  room,
  geometry,
  surfaces,
  materialColorMap,
  materialTextureMeta,
  designState,
  timeOfDay,
  selectedSurface,
  onSurfaceClick,
}: SceneProps) {
  const cfg = TIME_CONFIG[timeOfDay];
  const sunPos = azimuthInclinationToSunPos(cfg.sunAzimuth, cfg.sunInclination);

  const W = room.width ?? 4;
  const D = room.length ?? 4;
  const shadowScale = Math.max(W, D) + 3;

  return (
    <>
      {/* Soft shadow shader injection */}
      <SoftShadows size={12} focus={0.5} samples={20} />

      {/* Sky */}
      {timeOfDay !== "kech" && (
        <Sky sunPosition={sunPos} turbidity={8} rayleigh={1.5} />
      )}

      {/* Lighting */}
      <ambientLight intensity={cfg.ambientIntensity} color={timeOfDay === "kech" ? "#8090B0" : "#FFFFFF"} />

      {cfg.sunIntensity > 0 && (
        <directionalLight
          position={[sunPos[0] * 10, sunPos[1] * 10, sunPos[2] * 10]}
          intensity={cfg.sunIntensity}
          color={cfg.sunColor}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-near={0.1}
          shadow-camera-far={30}
          shadow-camera-left={-10}
          shadow-camera-right={10}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
          shadow-bias={-0.0001}
        />
      )}

      {/* Hemisphere fill light for realistic indoor bounce */}
      <hemisphereLight
        color={timeOfDay === "kech" ? "#3040A0" : "#FAEBD7"}
        groundColor={timeOfDay === "kech" ? "#101010" : "#8B7355"}
        intensity={timeOfDay === "kech" ? 0.3 : 0.5}
      />

      {/* Interior lamp (evening mode) */}
      {cfg.showInteriorLight && (
        <pointLight
          position={[0, (room.ceiling_height ?? 2.7) - 0.3, 0]}
          intensity={2.5}
          color="#FFE8C0"
          distance={14}
          decay={2}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
      )}

      {/* Environment map — IBL for realistic surface reflections */}
      <Environment preset="apartment" background={false} />

      {/* Contact shadows baked onto floor (faster than shadow maps, looks great) */}
      <ContactShadows
        position={[0, 0.002, 0]}
        opacity={0.4}
        scale={shadowScale}
        blur={2.5}
        far={4}
        resolution={512}
        color="#000000"
      />

      {/* Room geometry */}
      <RoomGeometry
        room={room}
        geometry={geometry}
        surfaces={surfaces}
        materialColorMap={materialColorMap}
        materialTextureMeta={materialTextureMeta}
        designState={designState}
        selectedSurface={selectedSurface}
        onSurfaceClick={onSurfaceClick}
      />

      {/* Architectural trim — plinth, window frames, glass */}
      <RoomTrim room={room} geometry={geometry} />

      {/* Window-driven Lightformers — natural light entering through openings */}
      <WindowLights room={room} geometry={geometry} timeOfDay={timeOfDay} />

      {/* Camera controls */}
      <OrbitControls
        maxPolarAngle={Math.PI / 2 - 0.01}
        enableDamping
        dampingFactor={0.05}
        minDistance={1}
        maxDistance={20}
        target={[0, (room.ceiling_height ?? 2.7) / 3, 0]}
      />

    </>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function ThreeDStudio({ room }: ThreeDStudioProps) {
  const { geometry, surfaces, applySurface, highQuality3d, setHighQuality3d, designState } = useRoomStore();
  const queryClient = useQueryClient();

  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("kunduz");
  const [selectedSurface, setSelectedSurface] = useState<SurfaceId | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [materialColorMap, setMaterialColorMap] = useState<Map<string, string>>(new Map());
  const [materialTextureMeta, setMaterialTextureMeta] = useState<Map<string, MaterialTextureMeta>>(new Map());

  const saveMutation = useMutation({
    mutationFn: (designState: Record<string, unknown>) =>
      updateRoom(room.id, { design_state: designState }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["room", room.id] }),
  });

  function handleSurfaceClick(id: SurfaceId) {
    setSelectedSurface(id);
    setShowPanel(true);
  }

  function handleApplyMaterial(material: Material) {
    if (!selectedSurface) return;
    applySurface(selectedSurface, material.id);

    // Cache the color and texture for rendering
    const color = material.color_hex ?? "#D0C8C0";
    setMaterialColorMap((prev) => new Map(prev).set(material.id, color));

    // Infer texture key from material metadata
    const texKey = inferTextureKey(material.texture_key, material.name_uz);
    if (texKey) {
      setMaterialTextureMeta((prev) => new Map(prev).set(material.id, { key: texKey }));
    }

    // Autosave
    const currentDesignState = (room.design_state ?? {}) as Record<string, unknown>;
    saveMutation.mutate({
      ...currentDesignState,
      surfaces: {
        ...(currentDesignState.surfaces as object ?? {}),
        [selectedSurface]: material.id,
      },
    });

    setShowPanel(false);
  }

  const currentMatId = selectedSurface
    ? (surfaces[selectedSurface as keyof AppliedSurfaces] ?? null)
    : null;

  return (
    <div className="flex h-full min-h-0 relative">
      {/* 3D Canvas */}
      <div className="flex-1 relative" style={{ minHeight: "60vh" }}>
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{
            position: [(room.width ?? 0) * 0.7, (room.ceiling_height ?? 2.7) * 0.9, (room.length ?? 0) * 1.4],
            fov: 58,
            near: 0.1,
            far: 100,
          }}
          style={{
            background: timeOfDay === "kech" ? "#1A1F2E" : "#87CEEB",
            width: "100%",
            height: "100%",
          }}
          gl={{
            antialias: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.15,
            outputColorSpace: THREE.SRGBColorSpace,
          }}
        >
          <Suspense fallback={null}>
            <Scene
              room={room}
              geometry={geometry}
              surfaces={surfaces}
              materialColorMap={materialColorMap}
              materialTextureMeta={materialTextureMeta}
              designState={designState}
              timeOfDay={timeOfDay}
              selectedSurface={selectedSurface}
              onSurfaceClick={handleSurfaceClick}
            />
          </Suspense>
        </Canvas>

        {/* Time of day control */}
        <TimeOfDayControl value={timeOfDay} onChange={setTimeOfDay} />

        {/* Quality toggle */}
        <button
          onClick={() => setHighQuality3d(!highQuality3d)}
          className={cn(
            "absolute bottom-4 right-4 z-20 px-3 py-1.5 text-xs font-medium rounded-chip transition-colors",
            highQuality3d
              ? "bg-amber-400 text-gray-900"
              : "bg-gray-900/70 text-white/70 hover:text-white",
          )}
          title={highQuality3d ? "Yuqori sifat yoqilgan (N8AO + SMAA)" : "Oddiy sifat (tezkor)"}
        >
          {highQuality3d ? "HD" : "SD"}
        </button>

        {/* Toolbar hint */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-gray-900/60 text-white text-xs rounded-chip px-3 py-1.5 pointer-events-none">
          Devor yoki polga bosib material tanlang · Drag: aylantirish · Scroll: zoom
        </div>

        {/* Autosave indicator */}
        {saveMutation.isPending && (
          <div className="absolute top-3 right-3 bg-white/90 rounded-chip px-3 py-1.5 text-xs text-muted">
            Saqlanmoqda...
          </div>
        )}
      </div>

      {/* Material panel — desktop right drawer */}
      {showPanel && (
        <MaterialPanel
          activeSurface={selectedSurface ? `${selectedSurface} devor` : null}
          selectedMaterialId={currentMatId}
          onApply={handleApplyMaterial}
          onClose={() => setShowPanel(false)}
        />
      )}
    </div>
  );
}
