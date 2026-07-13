import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getMaterials, updateRoom } from "@/lib/api";
import { useRoomStore } from "@/store/roomStore";
import type { AppliedSurfaces } from "@/store/roomStore";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { uz } from "@/locale/uz";
import { cn } from "@/lib/utils";
import type { Material, Room } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type SurfaceId = "A" | "B" | "C" | "D" | "floor";

interface IsometricStudioProps {
  room: Room;
  showFurniture: boolean;
}

// ─── Material category configs ────────────────────────────────────────────────

const WALL_TABS = [
  { key: "boyoq", label: "Bo'yoq" },
  { key: "oboy", label: "Oboy" },
  { key: "dekorativ", label: "Dekorativ" },
] as const;

const FLOOR_TABS = [
  { key: "laminat", label: "Laminat" },
  { key: "parket", label: "Parket" },
  { key: "plitka", label: "Plitka" },
] as const;

const SURFACE_LABELS: Record<SurfaceId, string> = {
  A: "A devor",
  B: "B devor",
  C: "C devor",
  D: "D devor",
  floor: "Pol",
};

const DEFAULT_WALL_COLOR = "#F5F0E8";
const DEFAULT_FLOOR_COLOR = "#C4A27A";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pts(points: Array<{ x: number; y: number }>): string {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

function formatSoum(tiyin: number): string {
  const s = Math.round(tiyin / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${s} soʻm`;
}

// ─── Running total hook ────────────────────────────────────────────────────────

function useRunningTotal(
  surfaces: AppliedSurfaces,
  materialMap: Map<string, Material>,
  room: Room,
): number {
  return useMemo(() => {
    const w = room.width ?? 0;
    const l = room.length ?? 0;
    const h = room.ceiling_height ?? 2.7;

    const areas: Record<SurfaceId, number> = {
      A: w * h,
      B: l * h,
      C: w * h,
      D: l * h,
      floor: w * l,
    };

    let total = 0;
    for (const [surfaceId, materialId] of Object.entries(surfaces) as [SurfaceId, string][]) {
      const material = materialMap.get(materialId);
      if (!material) continue;
      const area = areas[surfaceId] ?? 0;
      total += area * material.price_uzs;
    }
    return total;
  }, [surfaces, materialMap, room]);
}

// ─── Material grid ────────────────────────────────────────────────────────────

function MaterialGrid({
  materials,
  selected,
  onSelect,
}: {
  materials: Material[];
  selected: string | null;
  onSelect: (m: Material) => void;
}) {
  if (materials.length === 0) {
    return (
      <p className="text-center text-muted text-sm py-6">{uz.empty.material_yoq}</p>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {materials.map((m) => {
        const isSelected = m.id === selected;
        const hasColor = m.color_hex?.startsWith("#") || false;
        const color = m.color_hex?.startsWith("#") ? m.color_hex : "#CCCCCC";

        return (
          <button
            key={m.id}
            onClick={() => onSelect(m)}
            className={cn(
              "flex flex-col items-center gap-1.5 p-2 rounded-card border-2 transition-all",
              isSelected
                ? "border-brand bg-brand/5 shadow-sm"
                : "border-gray-200 hover:border-brand/40",
            )}
          >
            <div
              className="w-10 h-10 rounded-card border border-gray-200"
              style={{
                backgroundColor: hasColor ? color : undefined,
                backgroundImage: hasColor
                  ? undefined
                  : `url(${m.color_hex ?? ""})`,
                backgroundSize: "cover",
              }}
            />
            <span className="text-xs font-medium text-gray-800 text-center leading-tight">
              {m.name_uz}
            </span>
            <span className="text-xs text-brand font-semibold">
              {formatSoum(m.price_uzs)}/{m.unit}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Material bottom sheet ─────────────────────────────────────────────────────

interface MaterialSheetProps {
  open: boolean;
  surfaceId: SurfaceId | null;
  currentMaterialId: string | null;
  materialMap: Map<string, Material>;
  onSelect: (surfaceId: SurfaceId, material: Material) => void;
  onClose: () => void;
}

function MaterialSheet({
  open,
  surfaceId,
  currentMaterialId,
  materialMap: _materialMap,
  onSelect,
  onClose,
}: MaterialSheetProps) {
  const isFloor = surfaceId === "floor";
  const tabs = isFloor ? FLOOR_TABS : WALL_TABS;
  const [activeTab, setActiveTab] = useState<string>(tabs[0].key);

  const { data: materials = [], isLoading } = useQuery({
    queryKey: ["materials", activeTab],
    queryFn: () => getMaterials({ category: activeTab }),
    enabled: open,
  });

  if (!surfaceId) return null;

  return (
    <BottomSheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      defaultSnap="half"
      title={`${SURFACE_LABELS[surfaceId]} materiali`}
    >
      <div className="pb-4">
        {/* Surface label */}
        <h2 className="text-base font-bold text-gray-900 mb-3">
          {SURFACE_LABELS[surfaceId]} — material tanlash
        </h2>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-gray-100 pb-0">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeTab === t.key
                  ? "border-brand text-brand"
                  : "border-transparent text-muted hover:text-gray-900",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Material grid */}
        {isLoading ? (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-24 bg-gray-100 rounded-card animate-pulse"
              />
            ))}
          </div>
        ) : (
          <MaterialGrid
            materials={materials}
            selected={currentMaterialId}
            onSelect={(m) => {
              onSelect(surfaceId, m);
              onClose();
            }}
          />
        )}
      </div>
    </BottomSheet>
  );
}

// ─── Cost chip ────────────────────────────────────────────────────────────────

function CostChip({
  surfaceId,
  material,
  area,
  onDismiss,
}: {
  surfaceId: SurfaceId;
  material: Material;
  area: number;
  onDismiss: () => void;
}) {
  const cost = area * material.price_uzs;

  return (
    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 animate-fade-slide">
      <div className="bg-gray-900/90 text-white rounded-chip px-4 py-2 flex items-center gap-3 shadow-xl text-sm">
        <span>
          {SURFACE_LABELS[surfaceId]} · {area.toFixed(1)} m² ·{" "}
          <strong>{formatSoum(cost)}</strong>
        </span>
        <button
          onClick={onDismiss}
          className="text-white/60 hover:text-white ml-1"
          aria-label="Yopish"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ─── Isometric SVG ────────────────────────────────────────────────────────────

interface IsometricSVGProps {
  room: Room;
  surfaces: AppliedSurfaces;
  materialMap: Map<string, Material>;
  selectedSurface: SurfaceId | null;
  onSurfaceClick: (id: SurfaceId) => void;
}

function IsometricSVG({
  room,
  surfaces,
  materialMap,
  selectedSurface,
  onSurfaceClick,
}: IsometricSVGProps) {
  const w = Math.max(room.width ?? 0, 2);
  const l = Math.max(room.length ?? 0, 2);
  const h = room.ceiling_height ?? 2.7;

  // Isometric projection constants
  const scale = 60;
  const isoX = scale * Math.cos(Math.PI / 6); // cos(30°)
  const isoY = scale * Math.sin(Math.PI / 6); // sin(30°)
  const ceilPx = h * scale * 0.8;

  const svgW = (w + l) * isoX + 40;
  const svgH = (w + l) * isoY + ceilPx + 40;
  const ox = svgW / 2; // origin x (front-bottom corner)
  const oy = svgH - 20; // origin y

  // Key corners on floor plane
  const ptA = { x: ox, y: oy }; // front (closest to viewer)
  const ptB = { x: ox - w * isoX, y: oy - w * isoY }; // left
  const ptC = { x: ox - w * isoX + l * isoX, y: oy - w * isoY - l * isoY }; // back
  const ptD = { x: ox + l * isoX, y: oy - l * isoY }; // right

  const lift = (p: { x: number; y: number }) => ({ x: p.x, y: p.y - ceilPx });

  // Lifted corners (ceiling plane)
  const ptAu = lift(ptA);
  const ptBu = lift(ptB);
  const ptCu = lift(ptC);
  const ptDu = lift(ptD);

  function surfaceColor(id: SurfaceId, defaultColor: string): string {
    const matId = surfaces[id as keyof AppliedSurfaces];
    if (!matId) return defaultColor;
    const mat = materialMap.get(matId);
    if (!mat) return defaultColor;
    // Try to extract color from image_url if it's a hex
    if (mat.color_hex?.startsWith("#")) return mat.color_hex;
    return defaultColor;
  }

  const leftWallColor = surfaceColor("D", DEFAULT_WALL_COLOR);
  const rightWallColor = surfaceColor("B", "#EDE8DF");
  const backLeftColor = surfaceColor("A", "#E8E3DA");
  const floorColor = surfaceColor("floor", DEFAULT_FLOOR_COLOR);

  const isSelected = (id: SurfaceId) => selectedSurface === id;

  return (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      className="w-full h-full drop-shadow-2xl select-none"
      aria-label="Isometric room view — tap a surface to apply material"
    >
      {/* Floor */}
      <polygon
        points={pts([ptA, ptB, ptC, ptD])}
        fill={floorColor}
        stroke={isSelected("floor") ? "#D85A30" : "#8B7355"}
        strokeWidth={isSelected("floor") ? 2.5 : 1}
        className="cursor-pointer transition-all duration-200 hover:brightness-110"
        onClick={() => onSurfaceClick("floor")}
        style={{ filter: isSelected("floor") ? "brightness(1.15)" : undefined }}
      />

      {/* Left wall (wall D) */}
      <polygon
        points={pts([ptA, ptB, ptBu, ptAu])}
        fill={leftWallColor}
        stroke={isSelected("D") ? "#D85A30" : "#555"}
        strokeWidth={isSelected("D") ? 2.5 : 1}
        className="cursor-pointer transition-all duration-200 hover:brightness-110"
        onClick={() => onSurfaceClick("D")}
        style={{ filter: isSelected("D") ? "brightness(1.1)" : undefined }}
      />

      {/* Right wall (wall B) */}
      <polygon
        points={pts([ptA, ptD, ptDu, ptAu])}
        fill={rightWallColor}
        stroke={isSelected("B") ? "#D85A30" : "#777"}
        strokeWidth={isSelected("B") ? 2.5 : 1}
        className="cursor-pointer transition-all duration-200 hover:brightness-110"
        onClick={() => onSurfaceClick("B")}
        style={{ filter: isSelected("B") ? "brightness(1.1)" : undefined }}
      />

      {/* Back-left wall (wall A) */}
      <polygon
        points={pts([ptB, ptC, ptCu, ptBu])}
        fill={backLeftColor}
        stroke={isSelected("A") ? "#D85A30" : "#666"}
        strokeWidth={isSelected("A") ? 2.5 : 1}
        className="cursor-pointer transition-all duration-200 hover:brightness-110"
        onClick={() => onSurfaceClick("A")}
        style={{ filter: isSelected("A") ? "brightness(1.1)" : undefined }}
      />

      {/* Back-right wall (wall C) - partially visible */}
      <polygon
        points={pts([ptD, ptC, ptCu, ptDu])}
        fill={surfaceColor("C", "#DEDAD1")}
        stroke={isSelected("C") ? "#D85A30" : "#888"}
        strokeWidth={isSelected("C") ? 2.5 : 1}
        className="cursor-pointer transition-all duration-200 hover:brightness-95"
        onClick={() => onSurfaceClick("C")}
        style={{ filter: isSelected("C") ? "brightness(1.05)" : undefined }}
      />

      {/* Ceiling outline (subtle) */}
      <polygon
        points={pts([ptAu, ptBu, ptCu, ptDu])}
        fill="rgba(255,255,255,0.15)"
        stroke="#ccc"
        strokeWidth="0.5"
        style={{ pointerEvents: "none" }}
      />

      {/* Surface tap indicators */}
      {(["A", "B", "C", "D", "floor"] as SurfaceId[]).map((id) => {
        const hasMat = !!surfaces[id];
        if (!hasMat) return null;
        return (
          <circle
            key={id}
            r="5"
            cx={
              id === "D"
                ? (ptA.x + ptB.x) / 2
                : id === "B"
                ? (ptA.x + ptD.x) / 2
                : id === "A"
                ? (ptB.x + ptC.x) / 2
                : id === "C"
                ? (ptD.x + ptC.x) / 2
                : (ptA.x + ptC.x) / 2
            }
            cy={
              id === "D"
                ? (ptA.y + ptBu.y) / 2
                : id === "B"
                ? (ptA.y + ptDu.y) / 2
                : id === "A"
                ? (ptB.y + ptCu.y) / 2
                : id === "C"
                ? (ptD.y + ptCu.y) / 2
                : (ptA.y + ptB.y) / 2
            }
            fill="#D85A30"
            opacity="0.85"
            style={{ pointerEvents: "none" }}
          />
        );
      })}

      {/* Surface labels */}
      {[
        {
          id: "D" as SurfaceId,
          cx: (ptA.x + ptB.x) / 2 - 10,
          cy: (ptAu.y + ptB.y) / 2 + 10,
        },
        {
          id: "B" as SurfaceId,
          cx: (ptA.x + ptD.x) / 2 + 10,
          cy: (ptAu.y + ptD.y) / 2 + 10,
        },
        {
          id: "floor" as SurfaceId,
          cx: (ptA.x + ptC.x) / 2,
          cy: (ptA.y + ptC.y) / 2,
        },
      ].map(({ id, cx, cy }) => (
        <text
          key={id}
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="11"
          fill="rgba(0,0,0,0.4)"
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {SURFACE_LABELS[id]}
        </text>
      ))}
    </svg>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function IsometricStudio({ room }: IsometricStudioProps) {
  const { surfaces, applySurface, furniture } = useRoomStore();
  const queryClient = useQueryClient();

  const [selectedSurface, setSelectedSurface] = useState<SurfaceId | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [lastApplied, setLastApplied] = useState<{
    surfaceId: SurfaceId;
    material: Material;
    area: number;
  } | null>(null);
  const [materialMap, setMaterialMap] = useState<Map<string, Material>>(
    new Map(),
  );

  const runningTotal = useRunningTotal(surfaces, materialMap, room);

  const saveMutation = useMutation({
    mutationFn: (designState: Record<string, unknown>) =>
      updateRoom(room.id, { design_state: designState }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["room", room.id] });
    },
  });

  function handleSurfaceClick(id: SurfaceId) {
    setSelectedSurface(id);
    setSheetOpen(true);
  }

  function handleMaterialSelect(surfaceId: SurfaceId, material: Material) {
    // Optimistic update in store
    applySurface(surfaceId, material.id);

    // Update material map for color lookup
    setMaterialMap((prev) => new Map(prev).set(material.id, material));

    // Compute area for the cost chip
    const w = room.width ?? 0;
    const l = room.length ?? 0;
    const h = room.ceiling_height ?? 2.7;
    const areaMap: Record<SurfaceId, number> = {
      A: w * h,
      B: l * h,
      C: w * h,
      D: l * h,
      floor: w * l,
    };

    setLastApplied({ surfaceId, material, area: areaMap[surfaceId] });
    setSheetOpen(false);

    // Auto-save to server
    const currentDesignState = (room.design_state ?? {}) as Record<string, unknown>;
    saveMutation.mutate({
      ...currentDesignState,
      surfaces: { ...(currentDesignState.surfaces as object), [surfaceId]: material.id },
    });

    // Clear chip after 4 seconds
    setTimeout(() => setLastApplied(null), 4000);
  }

  const currentMaterialId = selectedSurface
    ? (surfaces[selectedSurface as keyof AppliedSurfaces] ?? null)
    : null;

  return (
    <div className="relative flex flex-col lg:flex-row h-full min-h-0 overflow-hidden">
      {/* SVG Canvas */}
      <div className="flex-1 flex items-center justify-center bg-paper p-4 min-h-0 overflow-auto relative">
        <div className="w-full max-w-2xl aspect-[4/3]">
          <IsometricSVG
            room={room}
            surfaces={surfaces}
            materialMap={materialMap}
            selectedSurface={selectedSurface}
            onSurfaceClick={handleSurfaceClick}
          />
        </div>

        {/* Tap hint */}
        {Object.keys(surfaces).length === 0 && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 rounded-chip px-4 py-2 text-xs text-muted shadow-sm border border-gray-200 pointer-events-none">
            Devor yoki polga bosib material tanlang
          </div>
        )}

        {/* Cost chip */}
        {lastApplied && (
          <CostChip
            surfaceId={lastApplied.surfaceId}
            material={lastApplied.material}
            area={lastApplied.area}
            onDismiss={() => setLastApplied(null)}
          />
        )}

        {/* Furniture overlay info */}
        {furniture.length > 0 && (
          <div className="absolute top-4 right-4 bg-white/90 rounded-card px-3 py-1.5 text-xs text-muted shadow-sm">
            {furniture.length} ta mebel
          </div>
        )}
      </div>

      {/* Running total bar */}
      {runningTotal > 0 && (
        <div className="flex-shrink-0 bg-surface border-t border-gray-200 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted">Material xarajati</p>
            <p className="text-base font-bold text-gray-900">
              {formatSoum(runningTotal)}
            </p>
          </div>
          {saveMutation.isPending && (
            <span className="text-xs text-muted animate-pulse">Saqlanmoqda...</span>
          )}
          {saveMutation.isSuccess && !saveMutation.isPending && (
            <span className="text-xs text-success">Saqlandi</span>
          )}
        </div>
      )}

      {/* Material bottom sheet */}
      <MaterialSheet
        open={sheetOpen}
        surfaceId={selectedSurface}
        currentMaterialId={currentMaterialId}
        materialMap={materialMap}
        onSelect={handleMaterialSelect}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}
