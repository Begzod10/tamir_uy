import { Suspense, useMemo, useState, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Sky } from "@react-three/drei";
import { useRoomStore } from "@/store/roomStore";
import type { AppliedSurfaces, RoomGeometry } from "@/store/roomStore";
import { updateRoom } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import MaterialPanel from "./MaterialPanel";
import type { Room, Material } from "@/lib/api";
import * as THREE from "three";

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
}: WallSegmentProps) {
  const meshRef = useRef<THREE.Mesh>(null);

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
        color={isSelected ? "#D85A30" : color}
        roughness={roughness}
        envMapIntensity={0.5}
      />
    </mesh>
  );
}

// ─── Wall with openings ───────────────────────────────────────────────────────

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
}: WallWithOpeningsProps) {
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

  return (
    <group onClick={onClick}>
      {segments.map((seg, i) => (
        <WallSegment
          key={i}
          position={[seg.x, seg.y, seg.z]}
          size={[seg.w, seg.h, seg.d]}
          color={color}
          isSelected={isSelected}
        />
      ))}
    </group>
  );
}

// ─── Room geometry ────────────────────────────────────────────────────────────

interface RoomGeometryProps {
  room: Room;
  geometry: RoomGeometry;
  surfaces: AppliedSurfaces;
  materialColorMap: Map<string, string>;
  selectedSurface: SurfaceId | null;
  onSurfaceClick: (id: SurfaceId) => void;
}

function RoomGeometry({
  room,
  geometry,
  surfaces,
  materialColorMap,
  selectedSurface,
  onSurfaceClick,
}: RoomGeometryProps) {
  const W = room.width;
  const D = room.length;
  const H = room.ceiling_height;
  const T = 0.08; // wall thickness

  function wallColor(id: SurfaceId, def: string): string {
    const matId = surfaces[id as keyof AppliedSurfaces];
    if (!matId) return def;
    return materialColorMap.get(matId) ?? def;
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
        <meshStandardMaterial
          color={wallColor("floor", "#C4A27A")}
          roughness={0.65}
          envMapIntensity={0.5}
        />
      </mesh>

      {/* Ceiling (semi-transparent) */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, H, 0]}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial
          color="#FFFFFF"
          transparent
          opacity={0.25}
          side={THREE.DoubleSide}
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
      />
    </group>
  );
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
  timeOfDay: TimeOfDay;
  selectedSurface: SurfaceId | null;
  onSurfaceClick: (id: SurfaceId) => void;
}

function Scene({
  room,
  geometry,
  surfaces,
  materialColorMap,
  timeOfDay,
  selectedSurface,
  onSurfaceClick,
}: SceneProps) {
  const cfg = TIME_CONFIG[timeOfDay];
  const sunPos = azimuthInclinationToSunPos(cfg.sunAzimuth, cfg.sunInclination);

  return (
    <>
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
          shadow-camera-left={-8}
          shadow-camera-right={8}
          shadow-camera-top={8}
          shadow-camera-bottom={-8}
        />
      )}

      {/* Interior lamp (evening mode) */}
      {cfg.showInteriorLight && (
        <pointLight
          position={[0, room.ceiling_height - 0.3, 0]}
          intensity={2.0}
          color="#FFE8C0"
          distance={12}
          decay={2}
          castShadow
        />
      )}

      {/* Environment reflections */}
      <Environment preset="apartment" />

      {/* Room geometry */}
      <RoomGeometry
        room={room}
        geometry={geometry}
        surfaces={surfaces}
        materialColorMap={materialColorMap}
        selectedSurface={selectedSurface}
        onSurfaceClick={onSurfaceClick}
      />

      {/* Camera controls */}
      <OrbitControls
        maxPolarAngle={Math.PI / 2 - 0.01}
        enableDamping
        dampingFactor={0.05}
        minDistance={1}
        maxDistance={20}
        target={[0, room.ceiling_height / 3, 0]}
      />
    </>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function ThreeDStudio({ room }: ThreeDStudioProps) {
  const { geometry, surfaces, applySurface } = useRoomStore();
  const queryClient = useQueryClient();

  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("kunduz");
  const [selectedSurface, setSelectedSurface] = useState<SurfaceId | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [materialColorMap, setMaterialColorMap] = useState<Map<string, string>>(new Map());

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

    // Cache the color for rendering
    const color = material.image_url?.startsWith("#") ? material.image_url : "#D0C8C0";
    setMaterialColorMap((prev) => new Map(prev).set(material.id, color));

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
          camera={{
            position: [room.width * 0.7, room.ceiling_height * 0.9, room.length * 1.4],
            fov: 58,
            near: 0.1,
            far: 100,
          }}
          style={{
            background: timeOfDay === "kech" ? "#1A1F2E" : "#87CEEB",
            width: "100%",
            height: "100%",
          }}
          gl={{ antialias: true }}
        >
          <Suspense fallback={null}>
            <Scene
              room={room}
              geometry={geometry}
              surfaces={surfaces}
              materialColorMap={materialColorMap}
              timeOfDay={timeOfDay}
              selectedSurface={selectedSurface}
              onSurfaceClick={handleSurfaceClick}
            />
          </Suspense>
        </Canvas>

        {/* Time of day control */}
        <TimeOfDayControl value={timeOfDay} onChange={setTimeOfDay} />

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
