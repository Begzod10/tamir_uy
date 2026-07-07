import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  ContactShadows,
  PerformanceMonitor,
} from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useOutletContext } from "react-router-dom";
import { useRoomStore, resolveWallCovering } from "@/store/roomStore";
import type { RoomGeometry, DesignState, WallCovering } from "@/store/roomStore";
import { createOboyTexture } from "@/lib/oboyPatterns";
import type { OboyPatternId } from "@/lib/oboyPatterns";
import type { Room } from "@/lib/api";
import * as THREE from "three";

interface StudioContext {
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
    type: string;
    width: number;
    height: number;
    sill_height: number;
    position: number;
  }>;
  axis: "X" | "Z";
  cx: number;
  cz: number;
}

interface Seg {
  x: number; y: number; z: number;
  w: number; h: number; d: number;
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
    <mesh position={[seg.x, seg.y, seg.z]} receiveShadow castShadow>
      <boxGeometry args={[seg.w, seg.h, seg.d]} />
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

  const segments = useMemo(() => {
    const segs: Seg[] = [];
    const s = 1 / 1000;

    function makeSeg(
      posX: number, posY: number, posZ: number,
      sw: number, sh: number, sd: number,
      startMm: number,
    ): Seg {
      const segLenM = (axis === 'X' ? sw : sd)
      const startM = startMm / 1000
      const uOffset = (startM % WALLPAPER_WIDTH_M) / WALLPAPER_WIDTH_M
      const uRepeat = segLenM / WALLPAPER_WIDTH_M
      const vRepeat = sh / 1.0
      return { x: posX, y: posY, z: posZ, w: sw, h: sh, d: sd, uOffset, uRepeat, vRepeat }
    }

    if (elements.length === 0) {
      segs.push(makeSeg(
        cx, height / 2, cz,
        axis === 'X' ? length : thickness,
        height,
        axis === 'Z' ? length : thickness,
        0,
      ));
      return segs;
    }

    const sorted = [...elements].sort((a, b) => a.position - b.position);
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
  }, [elements, length, height, thickness, axis, cx, cz]);

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

    for (const el of wall.elements) {
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

function Baseboard({ width, depth }: { width: number; depth: number }) {
  const h = 0.1;
  const t = 0.02;
  const color = "#E0D8CC";
  return (
    <group>
      <mesh position={[0, h / 2, -depth / 2 + t / 2]}>
        <boxGeometry args={[width, h, t]} /><meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh position={[0, h / 2, depth / 2 - t / 2]}>
        <boxGeometry args={[width, h, t]} /><meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh position={[-width / 2 + t / 2, h / 2, 0]}>
        <boxGeometry args={[t, h, depth]} /><meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh position={[width / 2 - t / 2, h / 2, 0]}>
        <boxGeometry args={[t, h, depth]} /><meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
    </group>
  );
}

// ─── Ceiling lamp ─────────────────────────────────────────────────────────────

function CeilingLamp({ height }: { height: number }) {
  return (
    <group position={[0, height - 0.05, 0]}>
      <mesh>
        <cylinderGeometry args={[0.12, 0.12, 0.04, 16]} />
        <meshStandardMaterial color="#BBBBBB" metalness={0.6} roughness={0.25} />
      </mesh>
      <mesh position={[0, -0.15, 0]}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial color="#FFEECC" emissive="#FFD080" emissiveIntensity={1.8} roughness={0.4} />
      </mesh>
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

function SceneLighting({ width, depth, height }: { width: number; depth: number; height: number }) {
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
      <pointLight
        position={[0, height - 0.25, 0]}
        intensity={0.9}
        color="#FFE0A0"
        distance={Math.max(width, depth) * 2.5}
        decay={2}
        castShadow
      />
    </>
  );
}

// ─── Full room scene ──────────────────────────────────────────────────────────

function shadeCovering(covering: WallCovering, factor: number): WallCovering {
  if (covering.kind === 'paint') {
    return { kind: 'paint', color: shadeHex(covering.color, factor) }
  }
  // For oboy, shade the baseColor only (accent stays vivid)
  return { ...covering, baseColor: shadeHex(covering.baseColor, factor) }
}

function RoomScene({
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
  const T = 0.08;

  const wallA = geometry.walls.find((w) => w.id === "A");
  const wallB = geometry.walls.find((w) => w.id === "B");
  const wallC = geometry.walls.find((w) => w.id === "C");
  const wallD = geometry.walls.find((w) => w.id === "D");

  // Per-wall coverings with depth shading
  const coveringA = shadeCovering(resolveWallCovering(designState.wallCoverings, 'A'), 0.92);
  const coveringB = shadeCovering(resolveWallCovering(designState.wallCoverings, 'B'), 0.82);
  const coveringC = shadeCovering(resolveWallCovering(designState.wallCoverings, 'C'), 0.92);
  const coveringD = shadeCovering(resolveWallCovering(designState.wallCoverings, 'D'), 0.82);

  return (
    <group>
      <WoodFloor width={W} depth={D} floorType={designState.floorType} />

      {/* Ceiling — hidden in top view so you see the floor plan */}
      {!topView && (
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, H, 0]}>
          <planeGeometry args={[W, D]} />
          <meshStandardMaterial color={CEILING_DEFAULT} roughness={0.95} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Wall A — back */}
      <Wall wallId="A" length={W} height={H} thickness={T} covering={coveringA}
        elements={wallA?.elements ?? []} axis="X" cx={0} cz={-D / 2} />

      {/* Wall B — right */}
      <Wall wallId="B" length={D} height={H} thickness={T} covering={coveringB}
        elements={wallB?.elements ?? []} axis="Z" cx={W / 2} cz={0} />

      {/* Wall C — front */}
      <Wall wallId="C" length={W} height={H} thickness={T} covering={coveringC}
        elements={wallC?.elements ?? []} axis="X" cx={0} cz={D / 2} />

      {/* Wall D — left */}
      <Wall wallId="D" length={D} height={H} thickness={T} covering={coveringD}
        elements={wallD?.elements ?? []} axis="Z" cx={-W / 2} cz={0} />

      <WindowPanes geometry={geometry} wallWidth={W} wallDepth={D} />
      <Baseboard width={W} depth={D} />
      <CornerShadows width={W} depth={D} />
      <CeilingLamp height={H} />

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

type ViewPreset = "corner" | "front" | "top" | "left" | "right" | "back";

const VIEW_LABELS: Record<ViewPreset, string> = {
  corner: "Burchak",
  front:  "Old tomon",
  back:   "Orqa",
  left:   "Chap",
  right:  "O'ng",
  top:    "Yuqori",
};

function getCamera(preset: ViewPreset, W: number, D: number, H: number) {
  switch (preset) {
    case "corner": return { position: [W * 0.8,      H * 0.8,  D * 1.15]  as [number,number,number], target: [0, H * 0.4, 0]         as [number,number,number] };
    case "front":  return { position: [0,             H * 0.5,  D * 1.45]  as [number,number,number], target: [0, H * 0.4, -D * 0.1]   as [number,number,number] };
    case "back":   return { position: [0,             H * 0.5, -D * 1.45]  as [number,number,number], target: [0, H * 0.4,  D * 0.1]   as [number,number,number] };
    case "left":   return { position: [-W * 1.45,     H * 0.5,  0]          as [number,number,number], target: [ W * 0.1, H * 0.4, 0]   as [number,number,number] };
    case "right":  return { position: [ W * 1.45,     H * 0.5,  0]          as [number,number,number], target: [-W * 0.1, H * 0.4, 0]   as [number,number,number] };
    // Small X offset avoids gimbal lock in top view
    case "top":    return { position: [ W * 0.08,     H * 3.5,  0]          as [number,number,number], target: [0, 0, 0]                as [number,number,number] };
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
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
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
  const [preset, setPreset] = useState<ViewPreset>("corner");
  const [dpr, setDpr] = useState<number | [number, number]>([1, 2]);
  const [showContactShadows, setShowContactShadows] = useState(true);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  const topView = preset === "top";
  const cam = getCamera(preset, room.width, room.length, room.ceiling_height);
  const maxPolarAngle = Math.PI * 0.88;

  // Initial camera position — only used on first mount
  const initCam = useMemo(
    () => getCamera("corner", room.width, room.length, room.ceiling_height),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 108px)" }}>
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-4 py-2 bg-surface border-b border-gray-200 text-xs shrink-0">
        <span className="mr-1 font-medium text-gray-600">Ko'rinish:</span>
        {(["corner", "front", "back", "left", "right", "top"] as ViewPreset[]).map((v) => (
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
        <span className="ml-auto text-gray-400">Drag: aylantirish · Scroll: zoom</span>
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

            <OrbitControls
              ref={controlsRef}
              target={initCam.target}
              enableDamping
              dampingFactor={0.12}
              minDistance={0.5}
              maxDistance={Math.max(room.width, room.length) * 4}
              maxPolarAngle={maxPolarAngle}
              minPolarAngle={0.0}
              rotateSpeed={1.0}
              zoomSpeed={1.2}
              panSpeed={0.8}
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
  );
}
