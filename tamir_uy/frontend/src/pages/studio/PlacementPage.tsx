import { Suspense, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows } from "@react-three/drei";
import { useOutletContext } from "react-router-dom";
import { useRoomStore } from "@/store/roomStore";
import { solvePlacements } from "@/lib/placement";
import { PlacementLayer3D } from "@/components/studio/PlacementLayer3D";
import PlacementAdvisor from "@/components/studio/PlacementOverlay";
import type { Room } from "@/lib/api";
import * as THREE from "three";

interface StudioContext {
  room: Room;
}

type ViewMode = "svg" | "3d";

// ─── Minimal room box for 3D placement view ───────────────────────────────────

function RoomBox({ W, D, H }: { W: number; D: number; H: number }) {
  const T = 0.04;
  const wallColor = "#EDE8E0";
  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#C9AB7E" roughness={0.7} />
      </mesh>

      {/* Walls — transparent outlines */}
      {[
        { args: [W, H, T] as [number, number, number], pos: [0, H / 2, -D / 2] as [number, number, number] },
        { args: [W, H, T] as [number, number, number], pos: [0, H / 2,  D / 2] as [number, number, number] },
        { args: [T, H, D] as [number, number, number], pos: [-W / 2, H / 2, 0] as [number, number, number] },
        { args: [T, H, D] as [number, number, number], pos: [ W / 2, H / 2, 0] as [number, number, number] },
      ].map((w, i) => (
        <mesh key={i} position={w.pos}>
          <boxGeometry args={w.args} />
          <meshStandardMaterial color={wallColor} transparent opacity={0.35} roughness={0.9} />
        </mesh>
      ))}

      <ContactShadows position={[0, 0.01, 0]} opacity={0.25} scale={Math.max(W, D) * 2} blur={2} far={0.3} />
    </group>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlacementPage() {
  const { room } = useOutletContext<StudioContext>();
  const { geometry, ceilingHeight } = useRoomStore();
  const [viewMode, setViewMode] = useState<ViewMode>("svg");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const result = useMemo(
    () => solvePlacements(geometry, ceilingHeight),
    [geometry, ceilingHeight],
  );

  const W = room.width;
  const D = room.length;
  const H = room.ceiling_height;

  if (viewMode === "svg") {
    return (
      <div className="flex flex-col" style={{ height: "calc(100vh - 108px)" }}>
        {/* View toggle toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 bg-surface border-b border-gray-200 text-xs shrink-0">
          <button
            onClick={() => setViewMode("svg")}
            className="px-3 py-1 rounded-full bg-brand text-white font-medium"
          >
            Sxema
          </button>
          <button
            onClick={() => setViewMode("3d")}
            className="px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700"
          >
            3D ko'rinish
          </button>
          <span className="ml-auto text-gray-400">
            Jami kabel: {result.totalCableM.toFixed(1)} m · Shtroblash: {result.totalShtroblashM.toFixed(1)} m
          </span>
        </div>
        <div className="flex-1 min-h-0">
          <PlacementAdvisor geometry={geometry} ceilingHeightMm={ceilingHeight} room={room} />
        </div>
      </div>
    );
  }

  // 3D view
  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 108px)" }}>
      {/* View toggle toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-surface border-b border-gray-200 text-xs shrink-0">
        <button
          onClick={() => setViewMode("svg")}
          className="px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700"
        >
          Sxema
        </button>
        <button
          onClick={() => setViewMode("3d")}
          className="px-3 py-1 rounded-full bg-brand text-white font-medium"
        >
          3D ko'rinish
        </button>
        <span className="ml-auto text-gray-400">Drag: aylantirish · Scroll: zoom</span>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* 3D Canvas */}
        <div className="flex-1 min-h-0">
          <Canvas
            shadows="soft"
            camera={{ position: [W * 1.2, H * 1.4, D * 1.8], fov: 50, near: 0.05, far: 50 }}
            style={{ width: "100%", height: "100%" }}
            gl={{
              antialias: true,
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 1.1,
            }}
            dpr={[1, 2]}
          >
            <color attach="background" args={["#E8E4DC"]} />

            <Suspense fallback={null}>
              <hemisphereLight color="#FFE8CC" groundColor="#3A3020" intensity={0.8} />
              <directionalLight position={[W * 2, H * 3, D * 2]} intensity={1.2} castShadow shadow-mapSize={[1024, 1024]} />
              <Environment preset="apartment" environmentIntensity={0.3} />

              <RoomBox W={W} D={D} H={H} />
              <PlacementLayer3D geometry={geometry} result={result} selectedId={selectedId} />

              <OrbitControls
                target={[0, H * 0.4, 0]}
                enableDamping
                dampingFactor={0.06}
                minDistance={0.5}
                maxDistance={Math.max(W, D) * 5}
                maxPolarAngle={Math.PI * 0.88}
                rotateSpeed={0.6}
                zoomSpeed={0.8}
              />
            </Suspense>
          </Canvas>
        </div>

        {/* Device list sidebar */}
        <div className="w-56 flex-shrink-0 border-l border-gray-100 bg-white overflow-y-auto">
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-700 mb-2">Qurilmalar</p>
            {(["ac", "tv"] as const).map((dev) => {
              const options = result.placements.filter((p) => p.device === dev);
              const label = dev === "ac" ? "❄️ Konditsioner" : "📺 TV";
              return (
                <div key={dev} className="mb-3">
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  {options.map((p) => {
                    const id = `${p.device}-${p.wallId}`;
                    return (
                      <button
                        key={id}
                        onClick={() => setSelectedId((prev) => (prev === id ? null : id))}
                        className={[
                          "w-full text-left text-xs px-2 py-1.5 rounded mb-0.5 transition-colors",
                          selectedId === id
                            ? "bg-brand/10 text-brand font-semibold border border-brand/30"
                            : "hover:bg-gray-50 text-gray-700",
                        ].join(" ")}
                      >
                        #{p.rank} {p.wallId} devor — {p.score.toFixed(0)} ball
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {selectedId && (() => {
            const p = result.placements.find((pl) => `${pl.device}-${pl.wallId}` === selectedId);
            const route = p ? result.routes.find((r) => r.device === p.device) : null;
            if (!p) return null;
            return (
              <div className="px-3 py-2 space-y-1.5">
                <p className="text-xs font-semibold text-gray-700">{p.wallId} devor</p>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <div className="bg-gray-50 rounded p-1.5">
                    <p className="text-gray-400">Balandlik</p>
                    <p className="font-semibold">{(p.heightMm / 1000).toFixed(2)} m</p>
                  </div>
                  <div className="bg-gray-50 rounded p-1.5">
                    <p className="text-gray-400">Pozitsiya</p>
                    <p className="font-semibold">{(p.positionMm / 1000).toFixed(2)} m</p>
                  </div>
                  {route && (
                    <div className="bg-blue-50 rounded p-1.5 col-span-2">
                      <p className="text-gray-400">Kabel</p>
                      <p className="font-semibold text-blue-700">{route.totalLengthM.toFixed(1)} m</p>
                    </div>
                  )}
                </div>
                <ul className="space-y-0.5">
                  {p.notes.map((n, i) => (
                    <li key={i} className="text-xs text-gray-600 flex gap-1.5">
                      <span className="text-gray-400 flex-shrink-0">•</span>
                      <span>{n}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
