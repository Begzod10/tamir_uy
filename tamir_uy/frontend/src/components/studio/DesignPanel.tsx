import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { nanoid } from "nanoid";
import { updateRoom } from "@/lib/api";
import type { Room } from "@/lib/api";
import { uz } from "@/locale/uz";
import { useRoomStore, resolveWallColor } from "@/store/roomStore";
import type { WallCovering } from "@/store/roomStore";
import { OBOY_PATTERNS, getOboySvgPattern } from "@/lib/oboyPatterns";
import type { OboyPatternId } from "@/lib/oboyPatterns";
import { computeOboyRolls } from "@/lib/oboySmeta";
import { FURNITURE_CATALOG } from "@/lib/furnitureCatalog";
import type { FurnitureCatalogEntry } from "@/lib/furnitureCatalog";
import { ModelImportButton } from "@/components/studio/ModelImportButton";
import { useRestoreUserModels } from "@/hooks/useRestoreUserModels";

type WallTarget = "ALL" | "A" | "B" | "C" | "D";
type CoveringMode = "paint" | "oboy";

const WALL_COLORS = [
  "#FFFFFF", "#F5F0E8", "#E8D5C4", "#D4E8D4",
  "#C4D4E8", "#E8C4C4", "#C4C4E8", "#E8E8C4", "#D85A30",
];

const FLOOR_TYPES = [
  { key: "parquet",  label: "Parket"  },
  { key: "tile",     label: "Kafel"   },
  { key: "laminate", label: "Laminat" },
  { key: "concrete", label: "Beton"   },
];

const WALL_TARGETS: { key: WallTarget; label: string }[] = [
  { key: "ALL", label: "Hamma devorlar" },
  { key: "A",   label: "Devor A" },
  { key: "B",   label: "Devor B" },
  { key: "C",   label: "Devor C" },
  { key: "D",   label: "Devor D" },
];

export function DesignPanel({ room }: { room: Room }) {
  useRestoreUserModels()

  const { designState, setDesignState, setWallCovering, geometry, ceilingHeight,
          furniture, placeFurniture, removeFurniture, setFurnitureColors,
          userFurniture, removeUserFurniture } =
    useRoomStore();

  const [colorEditorId, setColorEditorId] = React.useState<string | null>(null);
  const floorType = designState.floorType;

  const [coveringMode, setCoveringMode] = React.useState<CoveringMode>("paint");
  const [targetWall, setTargetWall] = React.useState<WallTarget>("ALL");
  const [selectedPattern, setSelectedPattern] = React.useState<OboyPatternId>("damask");
  const [baseColor, setBaseColor] = React.useState("#F5F0E8");
  const [accentColor, setAccentColor] = React.useState("#8B6F47");

  // Sync local mode/pattern state when the selected wall changes
  React.useEffect(() => {
    const c =
      targetWall === "ALL"
        ? designState.wallCoverings.ALL
        : (designState.wallCoverings[targetWall] ?? designState.wallCoverings.ALL);
    if (c.kind === "paint") {
      setCoveringMode("paint");
    } else {
      setCoveringMode("oboy");
      setSelectedPattern(c.patternId as OboyPatternId);
      setBaseColor(c.baseColor);
      setAccentColor(c.accentColor);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetWall]);

  const mutation = useMutation({
    mutationFn: (data: { design_state: Record<string, unknown> }) =>
      updateRoom(room.id, data),
  });

  const syncTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  function syncToApi(ds: typeof designState) {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      mutation.mutate({
        design_state: { wallCoverings: ds.wallCoverings, floorType: ds.floorType },
      });
    }, 600);
  }

  function applyWallCovering(covering: WallCovering) {
    setWallCovering(targetWall, covering);
    const updated = {
      wallCoverings: { ...designState.wallCoverings, [targetWall]: covering },
      floorType,
    };
    syncToApi({ ...designState, ...updated });
  }

  function handleSetPaintColor(color: string) {
    applyWallCovering({ kind: "paint", color });
  }

  function handleSetOboy(
    patch: Partial<{ patternId: OboyPatternId; baseColor: string; accentColor: string }>,
  ) {
    const newPattern = patch.patternId ?? selectedPattern;
    const newBase = patch.baseColor ?? baseColor;
    const newAccent = patch.accentColor ?? accentColor;
    if (patch.patternId) setSelectedPattern(newPattern);
    if (patch.baseColor) setBaseColor(newBase);
    if (patch.accentColor) setAccentColor(newAccent);
    applyWallCovering({ kind: "oboy", patternId: newPattern, baseColor: newBase, accentColor: newAccent });
  }

  function handleSetFloorType(type: string) {
    const ft = type as typeof floorType;
    setDesignState({ floorType: ft });
    syncToApi({ ...designState, floorType: ft });
  }

  function handleSetCoveringMode(mode: CoveringMode) {
    setCoveringMode(mode);
    if (mode === "paint") {
      const currentColor = resolveWallColor(
        designState.wallCoverings,
        targetWall === "ALL" ? undefined : targetWall,
      );
      applyWallCovering({ kind: "paint", color: currentColor });
    } else {
      applyWallCovering({ kind: "oboy", patternId: selectedPattern, baseColor, accentColor });
    }
  }

  const wallColorForPreview = resolveWallColor(designState.wallCoverings);
  const hasOboy = Object.values(designState.wallCoverings).some((c) => c.kind === "oboy");
  const smeta = hasOboy ? computeOboyRolls(geometry, designState.wallCoverings, ceilingHeight) : null;

  return (
    <aside className="w-72 shrink-0 bg-surface border-l border-gray-200 overflow-y-auto">
      <div className="p-4 space-y-5">

        {/* Wall selector */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Devor
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {WALL_TARGETS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTargetWall(key)}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                  targetWall === key
                    ? "bg-brand text-white border-brand font-semibold"
                    : "border-gray-300 text-gray-600 hover:border-brand/50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* Bo'yoq / Oboy toggle */}
        <section>
          <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg">
            {(["paint", "oboy"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => handleSetCoveringMode(mode)}
                className={`flex-1 py-1.5 text-sm rounded-md font-medium transition-colors ${
                  coveringMode === mode
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {mode === "paint" ? "Bo'yoq" : "Oboy"}
              </button>
            ))}
          </div>
        </section>

        {/* Paint colors */}
        {coveringMode === "paint" && (
          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{uz.studio.devor_rangi}</h3>
            <div className="flex flex-wrap gap-2">
              {WALL_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => handleSetPaintColor(color)}
                  title={color}
                  className="w-9 h-9 rounded-full border-2 transition-transform hover:scale-110 active:scale-95"
                  style={{
                    backgroundColor: color,
                    borderColor: wallColorForPreview === color ? "#D85A30" : "#D1D5DB",
                    boxShadow: wallColorForPreview === color ? "0 0 0 2px #D85A30" : undefined,
                  }}
                  aria-pressed={wallColorForPreview === color}
                />
              ))}
            </div>
          </section>
        )}

        {/* Wallpaper patterns */}
        {coveringMode === "oboy" && (
          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Naqsh</h3>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {OBOY_PATTERNS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSetOboy({ patternId: p.id })}
                  className="flex flex-col items-center gap-1"
                  title={p.label}
                >
                  <svg
                    width="60"
                    height="60"
                    className="rounded-md overflow-hidden"
                    style={{
                      border:
                        selectedPattern === p.id
                          ? "2px solid #D85A30"
                          : "2px solid #E5E7EB",
                    }}
                  >
                    <defs
                      dangerouslySetInnerHTML={{
                        __html: getOboySvgPattern(p.id, baseColor, accentColor, `thumb-${p.id}`),
                      }}
                    />
                    <rect width="60" height="60" fill={`url(#thumb-${p.id})`} />
                  </svg>
                  <span className="text-xs text-gray-600">{p.label}</span>
                </button>
              ))}
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Asosiy rang</label>
                <input
                  type="color"
                  value={baseColor}
                  onChange={(e) => handleSetOboy({ baseColor: e.target.value })}
                  className="w-full h-8 rounded border border-gray-200 cursor-pointer"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Naqsh rangi</label>
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => handleSetOboy({ accentColor: e.target.value })}
                  className="w-full h-8 rounded border border-gray-200 cursor-pointer"
                />
              </div>
            </div>
          </section>
        )}

        {/* Floor type */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">{uz.studio.pol_turi}</h3>
          <div className="space-y-2">
            {FLOOR_TYPES.map((ft) => (
              <button
                key={ft.key}
                onClick={() => handleSetFloorType(ft.key)}
                className={`w-full text-left px-3 py-2.5 rounded-card text-sm border-2 transition-colors ${
                  floorType === ft.key
                    ? "border-brand bg-brand/10 text-brand font-semibold"
                    : "border-gray-200 hover:border-brand/40 text-gray-700"
                }`}
              >
                {ft.label}
              </button>
            ))}
          </div>
        </section>

        {/* Oboy smeta */}
        {smeta && smeta.totalRolls > 0 && (
          <section className="p-3 bg-amber-50 border border-amber-200 rounded-card">
            <h4 className="text-xs font-semibold text-amber-800 mb-1">Kerakli oboy</h4>
            <p className="text-sm font-bold text-amber-900">
              {smeta.totalRolls} rulon (~{smeta.totalAreaM2.toFixed(1)} m²)
            </p>
            <div className="mt-2 space-y-0.5">
              {smeta.perWall.map((w) => (
                <p key={w.wallId} className="text-xs text-amber-700">
                  Devor {w.wallId}: {w.rolls} rulon ({w.areaM2.toFixed(1)} m²)
                </p>
              ))}
            </div>
          </section>
        )}

        {/* Furniture */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Mebel</h3>

          {/* Built-in catalog */}
          <div className="space-y-2 mb-3">
            {FURNITURE_CATALOG.map((entry) => {
              const count = furniture.filter((f) => f.furniture_id === entry.id).length;
              return (
                <div key={entry.id} className="flex items-center gap-2 p-2 border border-gray-200 rounded-card">
                  <span className="text-2xl">{entry.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-900 truncate">{entry.name}</p>
                    <p className="text-xs text-gray-400">{entry.sizeM.w}×{entry.sizeM.d} m</p>
                  </div>
                  {count > 0 && <span className="text-xs font-bold text-brand">{count}×</span>}
                  <button
                    onClick={() => placeFurniture({ id: nanoid(), furniture_id: entry.id, x: (count * 300) % 1000, y: (count * 300) % 1000, rotation: 0 })}
                    className="w-7 h-7 rounded-full bg-brand/10 hover:bg-brand/20 text-brand font-bold text-base flex items-center justify-center shrink-0 transition-colors"
                    title="Qo'shish"
                  >+</button>
                </div>
              );
            })}
          </div>

          {/* User-imported models */}
          {userFurniture.length > 0 && (
            <div className="space-y-2 mb-3">
              <p className="text-xs text-gray-500 font-medium">Yuklangan modellar:</p>
              {userFurniture.map((entry) => {
                const count = furniture.filter((f) => f.furniture_id === entry.id).length;
                const ready = !!entry.modelPath;
                return (
                  <div key={entry.id} className={`flex items-center gap-2 p-2 border rounded-card ${ready ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
                    <span className="text-2xl">{entry.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <p className="text-xs font-semibold text-gray-900 truncate">{entry.name}</p>
                        {!entry.hasTextures && (
                          <span className="text-xs text-amber-500" title="Tekstura yo'q">⚠</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">{entry.sizeM.w}×{entry.sizeM.d} m</p>
                    </div>
                    {count > 0 && <span className="text-xs font-bold text-brand">{count}×</span>}
                    <button
                      onClick={() => ready && placeFurniture({ id: nanoid(), furniture_id: entry.id, x: (count * 300) % 1000, y: (count * 300) % 1000, rotation: 0 })}
                      disabled={!ready}
                      className="w-7 h-7 rounded-full bg-brand/10 hover:bg-brand/20 text-brand font-bold text-base flex items-center justify-center shrink-0 transition-colors disabled:opacity-40"
                      title="Qo'shish"
                    >+</button>
                    <button
                      onClick={() => removeUserFurniture(entry.id)}
                      className="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors text-xs"
                      title="Modelni o'chirish"
                    >✕</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Import button */}
          <ModelImportButton />

          {/* Placed items list */}
          {furniture.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-xs text-gray-500 font-medium mb-1">Joylashtirilgan:</p>
              {furniture.map((f) => {
                const staticEntry = FURNITURE_CATALOG.find((c) => c.id === f.furniture_id) as FurnitureCatalogEntry | undefined;
                const userEntry = userFurniture.find((c) => c.id === f.furniture_id);
                const entry = staticEntry ?? userEntry;
                const slots = staticEntry?.materialSlots ?? null;
                const isEditing = colorEditorId === f.id;
                const hasOverrides = f.colorOverrides && Object.keys(f.colorOverrides).length > 0;
                return (
                  <div key={f.id}>
                    <div className="flex items-center gap-2 text-xs py-1 border-b border-gray-100">
                      <span>{entry?.emoji ?? '📦'}</span>
                      <span className="flex-1 text-gray-700 truncate">{entry?.name ?? 'Model'}</span>
                      <button
                        onClick={() => setColorEditorId(isEditing ? null : f.id)}
                        title="Rang o'zgartirish"
                        className={`text-sm leading-none transition-colors ${isEditing ? 'text-brand' : hasOverrides ? 'text-amber-500' : 'text-gray-300 hover:text-gray-500'}`}
                      >🎨</button>
                      <button onClick={() => removeFurniture(f.id)} className="text-gray-400 hover:text-red-500 transition-colors text-sm leading-none" title="O'chirish">✕</button>
                    </div>
                    {isEditing && (
                      <div className="pl-2 py-1.5 space-y-1.5 bg-gray-50 rounded-b">
                        {slots ? slots.map((slot) => {
                          const current = f.colorOverrides?.[slot.name] ?? '#ffffff';
                          return (
                            <div key={slot.name} className="flex items-center gap-2">
                              <label className="text-xs text-gray-500 w-16 shrink-0">{slot.label}</label>
                              <input
                                type="color"
                                value={current}
                                onChange={(e) => setFurnitureColors(f.id, { ...(f.colorOverrides ?? {}), [slot.name]: e.target.value })}
                                className="h-6 w-10 rounded border border-gray-200 cursor-pointer"
                              />
                              {current !== '#ffffff' && (
                                <button
                                  onClick={() => {
                                    const rest = { ...(f.colorOverrides ?? {}) };
                                    delete rest[slot.name];
                                    setFurnitureColors(f.id, rest);
                                  }}
                                  className="text-xs text-gray-400 hover:text-red-400"
                                  title="Asl rangga qaytarish"
                                >↺</button>
                              )}
                            </div>
                          );
                        }) : (
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-500 w-16 shrink-0">Rang</label>
                            <input
                              type="color"
                              value={f.colorOverrides?.['*'] ?? '#ffffff'}
                              onChange={(e) => setFurnitureColors(f.id, { '*': e.target.value })}
                              className="h-6 w-10 rounded border border-gray-200 cursor-pointer"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {mutation.isPending && (
          <p className="text-xs text-muted animate-pulse">{uz.common.saqlash}...</p>
        )}
        {mutation.isError && (
          <p className="text-xs text-amber-600">Oflayn rejimda — o'zgarishlar saqlandi</p>
        )}
      </div>
    </aside>
  );
}
