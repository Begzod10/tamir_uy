import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls, Environment } from "@react-three/drei";
import { useRef, useState, useEffect, Suspense } from "react";
import * as THREE from "three";
import type { PointerLockControls as PointerLockControlsImpl } from "three-stdlib";
import { useOutletContext } from "react-router-dom";
import { useRoomStore } from "@/store/roomStore";
import { RoomScene, SceneLighting, FurnitureModels, type StudioContext } from "./ThreeDPage";

// ─── Movement controller ──────────────────────────────────────────────────────

interface MovementProps {
  roomW: number;
  roomD: number;
  controlsRef: React.RefObject<PointerLockControlsImpl | null>;
}

function MovementController({ roomW, roomD, controlsRef }: MovementProps) {
  const { camera } = useThree();
  const keys = useRef({ w: false, a: false, s: false, d: false, shift: false });

  // Set initial position — centre of room at eye level
  useEffect(() => {
    camera.position.set(0, 1.65, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "KeyW" || e.code === "ArrowUp")    keys.current.w = true;
      if (e.code === "KeyS" || e.code === "ArrowDown")  keys.current.s = true;
      if (e.code === "KeyA" || e.code === "ArrowLeft")  keys.current.a = true;
      if (e.code === "KeyD" || e.code === "ArrowRight") keys.current.d = true;
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.current.shift = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "KeyW" || e.code === "ArrowUp")    keys.current.w = false;
      if (e.code === "KeyS" || e.code === "ArrowDown")  keys.current.s = false;
      if (e.code === "KeyA" || e.code === "ArrowLeft")  keys.current.a = false;
      if (e.code === "KeyD" || e.code === "ArrowRight") keys.current.d = false;
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.current.shift = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls?.isLocked) return;

    const speed = (keys.current.shift ? 5 : 2.5) * delta;
    if (keys.current.w) controls.moveForward(speed);
    if (keys.current.s) controls.moveForward(-speed);
    if (keys.current.a) controls.moveRight(-speed);
    if (keys.current.d) controls.moveRight(speed);

    // Clamp inside room (30 cm margin from inner wall face)
    const margin = 0.30;
    const halfW = roomW / 2 - margin;
    const halfD = roomD / 2 - margin;
    camera.position.x = Math.max(-halfW, Math.min(halfW, camera.position.x));
    camera.position.z = Math.max(-halfD, Math.min(halfD, camera.position.z));
    camera.position.y = 1.65; // fixed eye height
  });

  return null;
}

// ─── Crosshair ────────────────────────────────────────────────────────────────

function Crosshair() {
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      aria-hidden="true"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <line x1="12" y1="4"  x2="12" y2="9"  stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
        <line x1="12" y1="15" x2="12" y2="20" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
        <line x1="4"  y1="12" x2="9"  y2="12" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
        <line x1="15" y1="12" x2="20" y2="12" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
        <circle cx="12" cy="12" r="1.2" fill="white" opacity="0.8" />
      </svg>
    </div>
  );
}

// ─── Enter overlay ────────────────────────────────────────────────────────────

function EnterOverlay({ onEnter }: { onEnter: () => void }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center bg-black/45 backdrop-blur-sm cursor-pointer select-none z-10"
      onClick={onEnter}
    >
      <div className="bg-white/10 border border-white/20 rounded-2xl px-10 py-8 text-center text-white max-w-xs">
        <div className="text-4xl mb-3">🚶</div>
        <h2 className="text-xl font-semibold mb-1">Yurish rejimi</h2>
        <p className="text-sm opacity-70 mb-6">Xonani birinchi shaxs ko'rinishida aylanib chiqing</p>
        <div className="bg-white/15 rounded-xl px-5 py-3 text-sm space-y-1 mb-6 text-left">
          <div className="flex gap-3 items-center"><kbd className="bg-white/20 rounded px-2 py-0.5 font-mono text-xs">W A S D</kbd><span className="opacity-80">yurish</span></div>
          <div className="flex gap-3 items-center"><kbd className="bg-white/20 rounded px-2 py-0.5 font-mono text-xs">Shift</kbd><span className="opacity-80">yugurish</span></div>
          <div className="flex gap-3 items-center"><kbd className="bg-white/20 rounded px-2 py-0.5 font-mono text-xs">Esc</kbd><span className="opacity-80">chiqish</span></div>
        </div>
        <button className="w-full bg-white/90 text-gray-900 font-semibold py-2.5 rounded-xl hover:bg-white transition-colors text-sm">
          Bosing yoki bu yerga bosing
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WalkthroughPage() {
  const { room } = useOutletContext<StudioContext>();
  const { geometry, designState, lights } = useRoomStore();
  const [locked, setLocked] = useState(false);
  const controlsRef = useRef<PointerLockControlsImpl | null>(null);

  // Fallback to store geometry when the API room lacks width/length
  const wallA = geometry.walls.find(w => w.id === 'A');
  const wallB = geometry.walls.find(w => w.id === 'B');
  const roomW = (room.width  > 0 ? room.width  : (wallB?.length ?? 3000) / 1000);
  const roomD = (room.length > 0 ? room.length : (wallA?.length ?? 4000) / 1000);
  const roomH = room.ceiling_height ?? 2.7;

  const handleEnter = () => {
    controlsRef.current?.lock();
  };

  return (
    <div className="relative" style={{ height: "calc(100vh - 108px)" }}>
      {/* 3D scene */}
      <Canvas
        camera={{ fov: 75, near: 0.05, far: 60, position: [0, 1.65, 0] }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
        shadows="soft"
        style={{ width: "100%", height: "100%" }}
      >
        <color attach="background" args={["#E8E4DC"]} />

        <Suspense fallback={null}>
          <SceneLighting width={roomW} depth={roomD} height={roomH} highQuality={true} />
          <Environment preset="apartment" environmentIntensity={0.3} />

          <RoomScene
            room={room}
            geometry={geometry}
            topView={false}
            designState={designState}
            showContactShadows={false}
            composerActive={false}
            highQuality={true}
            hasUserLights={lights.length > 0} lightsOn={true}
          />

          <Suspense fallback={null}>
            <FurnitureModels />
          </Suspense>

          <PointerLockControls
            ref={controlsRef}
            onLock={() => setLocked(true)}
            onUnlock={() => setLocked(false)}
          />

          <MovementController
            roomW={roomW}
            roomD={roomD}
            controlsRef={controlsRef}
          />
        </Suspense>
      </Canvas>

      {/* Overlay — shown when not locked */}
      {!locked && <EnterOverlay onEnter={handleEnter} />}

      {/* Crosshair — shown when locked */}
      {locked && <Crosshair />}

      {/* ESC hint — shown when locked */}
      {locked && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-white/60 text-xs pointer-events-none select-none">
          ESC — to'xtatish
        </div>
      )}
    </div>
  );
}
