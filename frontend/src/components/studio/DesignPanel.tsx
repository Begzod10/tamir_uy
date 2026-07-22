import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { nanoid } from "nanoid";
import { updateRoom, getMaterials, previewEstimate } from "@/lib/api";
import type { Room, Material } from "@/lib/api";
import { uz } from "@/locale/uz";
import { useRoomStore, resolveWallColor, resolveWallPanel } from "@/store/roomStore";
import type { WallCovering, WallPanelSettings, FloorType } from "@/store/roomStore";
import { OBOY_PATTERNS, getOboySvgPattern } from "@/lib/oboyPatterns";
import type { OboyPatternId } from "@/lib/oboyPatterns";
import { computeOboyRolls } from "@/lib/oboySmeta";
import { FURNITURE_CATALOG, CATEGORY_LABELS } from "@/lib/furnitureCatalog";
import type { FurnitureCatalogEntry, FurnitureCategory } from "@/lib/furnitureCatalog";
import { ModelImportButton } from "@/components/studio/ModelImportButton";
import { useRestoreUserModels } from "@/hooks/useRestoreUserModels";

type PhaseKey = 'suvoq' | 'shpaklovka' | 'boyoq' | 'pol' | 'montaj' | 'mebel'

type WallTarget = "ALL" | "A" | "B" | "C" | "D" | "FLOOR";
type CoveringMode = "paint" | "oboy" | "texture";
type FloorMode = "turi" | "rasm";

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
  { key: "ALL",   label: "Hamma devorlar" },
  { key: "A",     label: "Devor A" },
  { key: "B",     label: "Devor B" },
  { key: "C",     label: "Devor C" },
  { key: "D",     label: "Devor D" },
  { key: "FLOOR", label: "Pol" },
];

function PanelInput({
  label, valueMm, minMm, maxMm, onCommit,
}: {
  label: string;
  valueMm: number;
  minMm: number;
  maxMm: number;
  onCommit: (mm: number) => void;
}) {
  const displayMm = String(valueMm);
  const [draft, setDraft] = React.useState<string | null>(null);
  const showing = draft ?? displayMm;

  function commit() {
    if (draft === null) return;
    const parsed = parseFloat(draft);
    if (!isNaN(parsed) && parsed >= minMm && parsed <= maxMm) {
      onCommit(Math.round(parsed));
    }
    setDraft(null);
  }

  const draftVal = draft !== null ? parseFloat(draft) : NaN;
  const isInvalid = draft !== null && (isNaN(draftVal) || draftVal < minMm || draftVal > maxMm);

  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      <input
        type="text"
        inputMode="decimal"
        value={showing}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => { setDraft(displayMm); e.currentTarget.select(); }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        className={`w-full px-2 py-1.5 text-sm border rounded-md focus:outline-none transition-colors ${
          isInvalid ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-brand'
        }`}
      />
      {draft !== null && !isNaN(draftVal) && draftVal < minMm && (
        <p className="text-[10px] text-red-500 mt-0.5">Min: {minMm} mm</p>
      )}
    </div>
  );
}

export function DesignPanel({ room, phase, selectedWall, onWallChange }: {
  room: Room;
  phase: PhaseKey;
  selectedWall?: string | null;
  onWallChange?: (id: string | null) => void;
}) {
  useRestoreUserModels()

  const { designState, setDesignState, setWallCovering, setWallPanel, setFloorTexture, geometry, ceilingHeight,
          furniture, placeFurniture, removeFurniture, setFurnitureColors,
          userFurniture, removeUserFurniture } =
    useRoomStore();

  const [colorEditorId, setColorEditorId] = React.useState<string | null>(null);
  const floorType = designState.floorType;

  const [coveringMode, setCoveringMode] = React.useState<CoveringMode>("paint");
  const [floorMode, setFloorMode] = React.useState<FloorMode>("turi");
  const floorFileRef = React.useRef<HTMLInputElement>(null);

  const targetWall: WallTarget = (selectedWall && (['A','B','C','D','FLOOR'] as string[]).includes(selectedWall))
    ? selectedWall as WallTarget
    : 'ALL';
  const setTargetWall = (w: WallTarget) => onWallChange?.(w === 'ALL' ? null : w);
  const [selectedPattern, setSelectedPattern] = React.useState<OboyPatternId>("damask");
  const [baseColor, setBaseColor] = React.useState("#F5F0E8");
  const [accentColor, setAccentColor] = React.useState("#8B6F47");
  const [selectedProductId, setSelectedProductId] = React.useState<string | null>(null);
  const [furnitureCat, setFurnitureCat] = React.useState<FurnitureCategory | 'barchasi' | 'mening'>('barchasi');

  const { data: oboyProducts = [] } = useQuery({
    queryKey: ["materials", "oboy"],
    queryFn: () => getMaterials({ category: "oboy", per_page: 20 }),
    staleTime: 10 * 60 * 1000,
  });

  // Sync local mode/pattern state when the selected wall changes
  React.useEffect(() => {
    const c =
      targetWall === "ALL"
        ? designState.wallCoverings.ALL
        : (designState.wallCoverings[targetWall] ?? designState.wallCoverings.ALL);
    if (c.kind === "paint") {
      setCoveringMode("paint");
    } else if (c.kind === "texture") {
      setCoveringMode("texture");
    } else {
      setCoveringMode("oboy");
      setSelectedPattern(c.patternId as OboyPatternId);
      setBaseColor(c.baseColor);
      setAccentColor(c.accentColor);
    }
    setSelectedProductId(null);
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
    const ft = type as FloorType;
    setDesignState({ floorType: ft });
    setFloorTexture(null);
    syncToApi({ ...designState, floorType: ft, floorTexture: null });
  }

  const DEFAULT_FLOOR_TEX_SETTINGS = { repeatX: 1, repeatY: 1, offsetX: 0, offsetY: 0, rotation: 0 };

  function updateFloorTexSettings(patch: Partial<{ repeatX: number; repeatY: number; offsetX: number; offsetY: number; rotation: number }>) {
    const current = designState.floorTextureSettings ?? DEFAULT_FLOOR_TEX_SETTINGS;
    setDesignState({ floorTextureSettings: { ...current, ...patch } });
  }

  function handleFloorTextureUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      if (url) setFloorTexture(url);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function handleSetCoveringMode(mode: CoveringMode) {
    setCoveringMode(mode);
    if (mode === "paint") {
      const currentColor = resolveWallColor(
        designState.wallCoverings,
        targetWall === "ALL" ? undefined : targetWall,
      );
      applyWallCovering({ kind: "paint", color: currentColor });
    } else if (mode === "texture") {
      // Don't auto-apply; wait for image upload
    } else {
      applyWallCovering({ kind: "oboy", patternId: selectedPattern, baseColor, accentColor });
    }
  }

  const textureFileRef = React.useRef<HTMLInputElement>(null);
  function handleTextureUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      if (url) applyWallCovering({ kind: 'texture', url, color: '#ffffff', repeatX: 0.5, repeatY: 1.0, offsetX: 0, offsetY: 0, rotation: 0 });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function updateTextureProp(patch: Partial<{ repeatX: number; repeatY: number; offsetX: number; offsetY: number; rotation: number }>) {
    const c = targetWall === 'ALL'
      ? designState.wallCoverings.ALL
      : (designState.wallCoverings[targetWall] ?? designState.wallCoverings.ALL)
    if (c.kind !== 'texture') return
    applyWallCovering({ ...c, ...patch })
  }

  // ─── Panel settings ─────────────────────────────────────────────────────────

  const DEFAULT_PANEL: WallPanelSettings = {
    enabled: false, width: 300, height: 600, depth: 20, rotation: 0, gap: 10, chamfer: 0, color: '#D4C5B0',
  };

  const panelSettings = resolveWallPanel(
    designState.wallPanels,
    targetWall === 'ALL' ? undefined : targetWall as 'A' | 'B' | 'C' | 'D',
  ) ?? DEFAULT_PANEL;

  function handlePanelChange(patch: Partial<WallPanelSettings>) {
    setWallPanel(targetWall, { ...panelSettings, ...patch });
  }

  // B/D walls own the corners so their rendered length = inner + 2×T (T=250mm)
  function renderLengthMm(w: { id: string; length: number }): number {
    return (w.id === 'B' || w.id === 'D') ? w.length + 500 : w.length;
  }

  function getPanelCount(): number {
    if (!panelSettings.enabled) return 0;
    const refWalls = targetWall === 'ALL'
      ? geometry.walls
      : geometry.walls.filter((w) => w.id === targetWall);
    const avgLengthMm = refWalls.reduce((s, w) => s + renderLengthMm(w), 0) / (refWalls.length || 1);
    const pw = panelSettings.rotation === 90 ? panelSettings.height : panelSettings.width;
    const ph = panelSettings.rotation === 90 ? panelSettings.width : panelSettings.height;
    const stride = pw + panelSettings.gap;
    if (stride <= 0 || pw <= 0 || ph <= 0) return 0;
    const cols = avgLengthMm > 0 ? Math.ceil(avgLengthMm / stride) : 0;
    const rowStride = ph + panelSettings.gap;
    const rows = (ceilingHeight > 0 && rowStride > 0) ? Math.max(1, Math.floor((ceilingHeight - ph / 2) / rowStride) + 1) : 0;
    return cols * rows;
  }

  const wallColorForPreview = resolveWallColor(designState.wallCoverings);
  const hasOboy = Object.values(designState.wallCoverings).some((c) => c?.kind === "oboy");

  // Server smeta is authoritative; oboySmeta.ts is instant fallback only
  const { data: previewData, isLoading: previewLoading } = useQuery({
    queryKey: ["estimate-preview", room.id, designState],
    queryFn: () => previewEstimate(room.id),
    enabled: hasOboy && !!room.id,
    staleTime: 0,
    refetchInterval: false as const,
  });

  const smeta = hasOboy ? computeOboyRolls(geometry, designState.wallCoverings, ceilingHeight) : null;

  const WallSection = (
    <>
      {/* Wall + floor selector */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Devor / Pol</h3>
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

      {/* Floor controls when "Pol" is selected */}
      {targetWall === 'FLOOR' && (
        <>
          {/* Turi / Rasm tabs */}
          <section>
            <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg">
              {(['turi', 'rasm'] as FloorMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFloorMode(mode)}
                  className={`flex-1 py-1.5 text-xs rounded-md font-medium transition-colors ${
                    floorMode === mode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {mode === 'turi' ? 'Turi' : 'Rasm'}
                </button>
              ))}
            </div>
          </section>

          {floorMode === 'turi' && (
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
          )}

          {floorMode === 'rasm' && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Pol rasmi</h3>
              <input
                ref={floorFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFloorTextureUpload}
              />
              <button
                onClick={() => floorFileRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-brand/50 hover:text-brand transition-colors"
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <path d="M21 15l-5-5L5 21"/>
                </svg>
                <span className="text-sm font-medium">Rasm yuklash</span>
                <span className="text-xs text-gray-400">JPG, PNG, WEBP</span>
              </button>
              {designState.floorTexture && (() => {
                const fs = designState.floorTextureSettings ?? DEFAULT_FLOOR_TEX_SETTINGS;
                return (
                  <>
                    <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg border border-gray-200">
                      <img src={designState.floorTexture} alt="Pol teksturasi" className="w-14 h-14 object-cover rounded-md border border-gray-200 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate">Yuklangan rasm</p>
                        <button
                          onClick={() => setFloorTexture(null)}
                          className="text-xs text-red-400 hover:text-red-600 mt-0.5"
                        >
                          O'chirish
                        </button>
                      </div>
                    </div>

                    {/* UVW controls */}
                    <div className="space-y-2.5 p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Tekstura sozlamalari</p>

                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <label className="text-xs text-gray-600 font-medium">Masshtab X</label>
                          <span className="text-xs text-gray-400 tabular-nums">{(1 / fs.repeatX).toFixed(2)} m</span>
                        </div>
                        <input type="range" min="0.1" max="5" step="0.05" value={fs.repeatX}
                          onChange={(e) => updateFloorTexSettings({ repeatX: parseFloat(e.target.value) })}
                          className="w-full accent-brand h-1.5" />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <label className="text-xs text-gray-600 font-medium">Masshtab Y</label>
                          <span className="text-xs text-gray-400 tabular-nums">{(1 / fs.repeatY).toFixed(2)} m</span>
                        </div>
                        <input type="range" min="0.1" max="5" step="0.05" value={fs.repeatY}
                          onChange={(e) => updateFloorTexSettings({ repeatY: parseFloat(e.target.value) })}
                          className="w-full accent-brand h-1.5" />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <label className="text-xs text-gray-600 font-medium">Burish</label>
                          <span className="text-xs text-gray-400 tabular-nums">{Math.round(fs.rotation * 180 / Math.PI)}°</span>
                        </div>
                        <input type="range" min="0" max={Math.PI * 2} step={Math.PI / 36} value={fs.rotation}
                          onChange={(e) => updateFloorTexSettings({ rotation: parseFloat(e.target.value) })}
                          className="w-full accent-brand h-1.5" />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <label className="text-xs text-gray-600 font-medium">Siljish X</label>
                          <span className="text-xs text-gray-400 tabular-nums">{fs.offsetX.toFixed(2)}</span>
                        </div>
                        <input type="range" min="0" max="1" step="0.01" value={fs.offsetX}
                          onChange={(e) => updateFloorTexSettings({ offsetX: parseFloat(e.target.value) })}
                          className="w-full accent-brand h-1.5" />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <label className="text-xs text-gray-600 font-medium">Siljish Y</label>
                          <span className="text-xs text-gray-400 tabular-nums">{fs.offsetY.toFixed(2)}</span>
                        </div>
                        <input type="range" min="0" max="1" step="0.01" value={fs.offsetY}
                          onChange={(e) => updateFloorTexSettings({ offsetY: parseFloat(e.target.value) })}
                          className="w-full accent-brand h-1.5" />
                      </div>

                      <button
                        onClick={() => setDesignState({ floorTextureSettings: DEFAULT_FLOOR_TEX_SETTINGS })}
                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        Standartga qaytarish
                      </button>
                    </div>
                  </>
                );
              })()}
            </section>
          )}
        </>
      )}

      {/* Bo'yoq / Oboy / Tekstura controls — only for actual walls */}
      {targetWall !== 'FLOOR' && (<>
      <section>
        <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg">
          {(["paint", "oboy", "texture"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => handleSetCoveringMode(mode)}
              className={`flex-1 py-1.5 text-xs rounded-md font-medium transition-colors ${
                coveringMode === mode
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {mode === "paint" ? "Bo'yoq" : mode === "oboy" ? "Oboy" : "Rasm"}
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
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Naqsh</h3>
            <div className="grid grid-cols-3 gap-2">
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
                    style={{ border: selectedPattern === p.id ? "2px solid #D85A30" : "2px solid #E5E7EB" }}
                  >
                    <defs dangerouslySetInnerHTML={{ __html: getOboySvgPattern(p.id, baseColor, accentColor, `thumb-${p.id}`) }} />
                    <rect width="60" height="60" fill={`url(#thumb-${p.id})`} />
                  </svg>
                  <span className="text-xs text-gray-600">{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {oboyProducts.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Do'kondan tanlang</h3>
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                {oboyProducts.map((product: Material) => {
                  const color = product.color_hex ?? "#E5E7EB";
                  const isActive = selectedProductId === product.id;
                  return (
                    <button
                      key={product.id}
                      title={`${product.name_uz} — ${product.price_uzs.toLocaleString("uz-UZ")} so'm/${product.unit}`}
                      onClick={() => { setSelectedProductId(product.id); handleSetOboy({ baseColor: color }); }}
                      className="flex-shrink-0 flex flex-col items-center gap-1 w-14"
                    >
                      <div
                        className="w-12 h-12 rounded-lg border-2 transition-all"
                        style={{ backgroundColor: color, borderColor: isActive ? "#D85A30" : "#E5E7EB", boxShadow: isActive ? "0 0 0 2px #D85A30" : undefined }}
                      />
                      <span className="text-[10px] text-gray-500 text-center line-clamp-2 leading-tight">
                        {product.name_uz.split(" ").slice(0, 2).join(" ")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Asosiy rang</label>
              <input type="color" value={baseColor} onChange={(e) => { setSelectedProductId(null); handleSetOboy({ baseColor: e.target.value }); }} className="w-full h-8 rounded border border-gray-200 cursor-pointer" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Naqsh rangi</label>
              <input type="color" value={accentColor} onChange={(e) => handleSetOboy({ accentColor: e.target.value })} className="w-full h-8 rounded border border-gray-200 cursor-pointer" />
            </div>
          </div>
        </section>
      )}

      {/* Texture upload */}
      {coveringMode === "texture" && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Devor rasmi</h3>
          <input
            ref={textureFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleTextureUpload}
          />
          <button
            onClick={() => textureFileRef.current?.click()}
            className="w-full flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-brand/50 hover:text-brand transition-colors"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <path d="M21 15l-5-5L5 21"/>
            </svg>
            <span className="text-sm font-medium">Rasm yuklash</span>
            <span className="text-xs text-gray-400">JPG, PNG, WEBP</span>
          </button>
          {(() => {
            const c = targetWall === "ALL"
              ? designState.wallCoverings.ALL
              : (designState.wallCoverings[targetWall] ?? designState.wallCoverings.ALL)
            if (c.kind !== 'texture') return null
            return (
              <div className="space-y-3">
                {/* Preview + remove */}
                <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg border border-gray-200">
                  <img src={c.url} alt="Tekstura" className="w-14 h-14 object-cover rounded-md border border-gray-200 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">Yuklangan rasm</p>
                    <button
                      onClick={() => applyWallCovering({ kind: 'paint', color: '#F5F0E8' })}
                      className="text-xs text-red-400 hover:text-red-600 mt-0.5"
                    >
                      O'chirish
                    </button>
                  </div>
                </div>

                {/* UVW controls */}
                <div className="space-y-2.5 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Tekstura sozlamalari</p>

                  {/* Scale — value = tiles per meter; display as tile size in cm */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-gray-600 font-medium">Masshtab X</label>
                      <span className="text-xs text-gray-400 tabular-nums">{Math.round(100 / c.repeatX)} sm</span>
                    </div>
                    <input type="range" min="0.1" max="5" step="0.05" value={c.repeatX}
                      onChange={(e) => updateTextureProp({ repeatX: parseFloat(e.target.value) })}
                      className="w-full accent-brand h-1.5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-gray-600 font-medium">Vertikal cho'zish</label>
                      <span className="text-xs text-gray-400 tabular-nums">{c.repeatY.toFixed(2)}×</span>
                    </div>
                    <input type="range" min="0.1" max="4" step="0.05" value={c.repeatY}
                      onChange={(e) => updateTextureProp({ repeatY: parseFloat(e.target.value) })}
                      className="w-full accent-brand h-1.5" />
                  </div>

                  {/* Rotation */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-gray-600 font-medium">Burish</label>
                      <span className="text-xs text-gray-400 tabular-nums">{Math.round(c.rotation * 180 / Math.PI)}°</span>
                    </div>
                    <input type="range" min="0" max={Math.PI * 2} step={Math.PI / 36} value={c.rotation}
                      onChange={(e) => updateTextureProp({ rotation: parseFloat(e.target.value) })}
                      className="w-full accent-brand h-1.5" />
                  </div>

                  {/* Offset */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-gray-600 font-medium">Siljish X</label>
                      <span className="text-xs text-gray-400 tabular-nums">{c.offsetX.toFixed(2)}</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.01" value={c.offsetX}
                      onChange={(e) => updateTextureProp({ offsetX: parseFloat(e.target.value) })}
                      className="w-full accent-brand h-1.5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-gray-600 font-medium">Siljish Y</label>
                      <span className="text-xs text-gray-400 tabular-nums">{c.offsetY.toFixed(2)}</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.01" value={c.offsetY}
                      onChange={(e) => updateTextureProp({ offsetY: parseFloat(e.target.value) })}
                      className="w-full accent-brand h-1.5" />
                  </div>

                  <button
                    onClick={() => updateTextureProp({ repeatX: 0.5, repeatY: 1.0, offsetX: 0, offsetY: 0, rotation: 0 })}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Standartga qaytarish
                  </button>
                </div>
              </div>
            )
          })()}
        </section>
      )}

      {/* Oboy smeta */}
      {hasOboy && (
        <section className="p-3 bg-amber-50 border border-amber-200 rounded-card">
          <h4 className="text-xs font-semibold text-amber-800 mb-1">Kerakli oboy</h4>
          {previewLoading ? (
            <p className="text-sm text-amber-700">Hisoblanmoqda...</p>
          ) : previewData ? (
            (() => {
              const oboyLines = previewData.lines.filter((l) => l.category === "oboy");
              const totalRolls = oboyLines.reduce((s, l) => s + l.quantity, 0);
              return (
                <>
                  <p className="text-sm font-bold text-amber-900">{totalRolls} rulon</p>
                  <div className="mt-2 space-y-0.5">
                    {oboyLines.map((l, i) => (
                      <p key={i} className="text-xs text-amber-700">{l.label}: {l.quantity} rulon</p>
                    ))}
                  </div>
                </>
              );
            })()
          ) : smeta && smeta.totalRolls > 0 ? (
            <>
              <p className="text-sm font-bold text-amber-900">{smeta.totalRolls} rulon (~{smeta.totalAreaM2.toFixed(1)} m²)</p>
              <div className="mt-2 space-y-0.5">
                {smeta.perWall.map((w) => (
                  <p key={w.wallId} className="text-xs text-amber-700">Devor {w.wallId}: {w.rolls} rulon ({w.areaM2.toFixed(1)} m²)</p>
                ))}
              </div>
            </>
          ) : null}
        </section>
      )}

      {/* Panel generator */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">Devor panellari</h3>
          <button
            onClick={() => handlePanelChange({ enabled: !panelSettings.enabled })}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${
              panelSettings.enabled ? 'bg-brand' : 'bg-gray-200'
            }`}
            aria-checked={panelSettings.enabled}
            role="switch"
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                panelSettings.enabled ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {panelSettings.enabled && (
          <div className="space-y-3">
            {/* Width & Height */}
            <div className="grid grid-cols-2 gap-2">
              <PanelInput
                label="Kenglik (mm)"
                valueMm={panelSettings.width}
                minMm={10}
                maxMm={2000}
                onCommit={(mm) => handlePanelChange({ width: mm })}
              />
              <PanelInput
                label="Balandlik (mm)"
                valueMm={panelSettings.height}
                minMm={10}
                maxMm={4000}
                onCommit={(mm) => handlePanelChange({ height: mm })}
              />
            </div>

            {/* Depth & Gap */}
            <div className="grid grid-cols-2 gap-2">
              <PanelInput
                label="Qalinlik (mm)"
                valueMm={panelSettings.depth}
                minMm={4}
                maxMm={200}
                onCommit={(mm) => handlePanelChange({ depth: mm })}
              />
              <PanelInput
                label="Oraliq (mm)"
                valueMm={panelSettings.gap}
                minMm={1}
                maxMm={500}
                onCommit={(mm) => handlePanelChange({ gap: mm })}
              />
            </div>

            {/* Orientation */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Joylashuv</label>
              <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg">
                {([0, 90] as const).map((angle) => (
                  <button
                    key={angle}
                    onClick={() => handlePanelChange({ rotation: angle })}
                    className={`flex-1 py-1.5 text-xs rounded-md font-medium transition-colors ${
                      panelSettings.rotation === angle
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {angle === 0 ? 'Vertikal' : 'Gorizontal'}
                  </button>
                ))}
              </div>
            </div>

            {/* Chamfer */}
            <PanelInput
              label="Chamfer (mm)"
              valueMm={panelSettings.chamfer ?? 0}
              minMm={0}
              maxMm={200}
              onCommit={(mm) => handlePanelChange({ chamfer: mm })}
            />

            {/* Color */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Panel rangi</label>
              <input
                type="color"
                value={panelSettings.color}
                onChange={(e) => handlePanelChange({ color: e.target.value })}
                className="w-full h-8 rounded border border-gray-200 cursor-pointer"
              />
            </div>

            {/* Panel count */}
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
              <p className="text-xs text-gray-500 mb-0.5">Bir devordagi panel soni</p>
              <p className="text-2xl font-bold text-gray-900 leading-tight">
                {getPanelCount()}
                <span className="text-sm font-normal text-gray-400 ml-1">dona</span>
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {(() => {
                  const refWalls = targetWall === 'ALL' ? geometry.walls : geometry.walls.filter(w => w.id === targetWall);
                  const avgMm = refWalls.reduce((s, w) => s + renderLengthMm(w), 0) / (refWalls.length || 1);
                  const pw = panelSettings.rotation === 90 ? panelSettings.height : panelSettings.width;
                  const ph = panelSettings.rotation === 90 ? panelSettings.width : panelSettings.height;
                  const stride = pw + panelSettings.gap;
                  const cols = stride > 0 && avgMm > 0 ? Math.ceil(avgMm / stride) : 0;
                  const rowStride2 = ph + panelSettings.gap;
                  const rows = ph > 0 && ceilingHeight > 0 && rowStride2 > 0 ? Math.max(1, Math.floor((ceilingHeight - ph / 2) / rowStride2) + 1) : 0;
                  return `${cols} ustun × ${rows} qator`;
                })()}
              </p>
            </div>
          </div>
        )}
      </section>
      </>)}
    </>
  )

  const FloorSection = (
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
  )

  const allCatalogEntries = [
    ...FURNITURE_CATALOG.map(e => ({ ...e, isUser: false as const })),
    ...userFurniture.map(e => ({ ...e, isUser: true as const })),
  ]

  const catChips: Array<{ key: FurnitureCategory | 'barchasi' | 'mening'; label: string }> = [
    { key: 'barchasi', label: 'Barchasi' },
    ...Object.entries(CATEGORY_LABELS).map(([k, v]) => ({ key: k as FurnitureCategory, label: v })),
    { key: 'mening', label: 'Mening' },
  ]

  const filteredEntries = allCatalogEntries.filter((e) => {
    if (furnitureCat === 'barchasi') return true
    if (furnitureCat === 'mening') return e.isUser
    if (e.isUser) return false
    return (e as FurnitureCatalogEntry).category === furnitureCat
  })

  const MebelSection = (
    <section>
      <h3 className="text-sm font-semibold text-gray-900 mb-2">3D Modellar</h3>

      {/* Category chips */}
      <div className="flex gap-1.5 flex-wrap mb-3">
        {catChips.map((c) => (
          <button
            key={c.key}
            onClick={() => setFurnitureCat(c.key)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors whitespace-nowrap ${
              furnitureCat === c.key
                ? 'bg-brand text-white border-brand'
                : 'bg-white text-gray-600 border-gray-200 hover:border-brand/50 hover:text-brand'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Catalog grid */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {filteredEntries.map((entry) => {
          const count = furniture.filter((f) => f.furniture_id === entry.id).length;
          const ready = !entry.isUser || !!entry.modelPath;
          return (
            <div
              key={entry.id}
              className={`relative flex flex-col rounded-xl border-2 overflow-hidden transition-all
                ${count > 0 ? 'border-brand shadow-sm' : 'border-gray-200 hover:border-brand/40'}`}
            >
              {/* Thumbnail */}
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center h-20 text-4xl select-none">
                {entry.emoji}
                {entry.isUser && !entry.modelPath && (
                  <span className="absolute top-1 right-1 text-[9px] bg-amber-100 text-amber-600 px-1 rounded">yüklanmoqda</span>
                )}
                {entry.isUser && !('hasTextures' in entry && entry.hasTextures) && entry.modelPath && (
                  <span className="absolute top-1 right-1 text-[9px]" title="Tekstura yo'q">⚠️</span>
                )}
              </div>

              {/* Info */}
              <div className="px-2 py-1.5 flex-1">
                <p className="text-[11px] font-semibold text-gray-900 leading-tight line-clamp-2">{entry.name}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{entry.sizeM.w}×{entry.sizeM.d} m</p>
              </div>

              {/* Count badge */}
              {count > 0 && (
                <span className="absolute top-1 left-1 bg-brand text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {count}×
                </span>
              )}

              {/* Actions row */}
              <div className="flex border-t border-gray-100">
                <button
                  onClick={() => ready && placeFurniture({ id: nanoid(), furniture_id: entry.id, x: (count * 300) % 1000, y: (count * 300) % 1000, rotation: 0 })}
                  disabled={!ready}
                  className="flex-1 py-1.5 text-brand text-sm font-bold hover:bg-brand/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Qo'shish"
                >
                  + Qo'shish
                </button>
                {entry.isUser && (
                  <button
                    onClick={() => removeUserFurniture(entry.id)}
                    className="px-2 border-l border-gray-100 text-gray-300 hover:text-red-400 transition-colors text-xs"
                    title="Modelni o'chirish"
                  >✕</button>
                )}
              </div>
            </div>
          );
        })}

        {/* Upload card */}
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 hover:border-brand/40 transition-colors h-full min-h-[130px]">
          <ModelImportButton compact />
        </div>
      </div>

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
            const so = f.scaleOverride ?? 1;
            const actualW = ((entry?.sizeM.w ?? 0) * so).toFixed(2);
            const actualD = ((entry?.sizeM.d ?? 0) * so).toFixed(2);
            return (
              <div key={f.id} className="border border-gray-100 rounded-lg overflow-hidden mb-1">
                <div className="flex items-center gap-2 text-xs px-2 py-1.5 bg-gray-50">
                  <span>{entry?.emoji ?? '📦'}</span>
                  <span className="flex-1 text-gray-700 truncate font-medium">{entry?.name ?? 'Model'}</span>
                  <span className="text-[10px] text-gray-400 tabular-nums shrink-0">{actualW}×{actualD} m</span>
                  <button
                    onClick={() => setColorEditorId(isEditing ? null : f.id)}
                    title="Rang o'zgartirish"
                    className={`text-sm leading-none transition-colors ${isEditing ? 'text-brand' : hasOverrides ? 'text-amber-500' : 'text-gray-300 hover:text-gray-500'}`}
                  >🎨</button>
                  <button onClick={() => removeFurniture(f.id)} className="text-gray-400 hover:text-red-500 transition-colors text-sm leading-none" title="O'chirish">✕</button>
                </div>

                {isEditing && (
                  <div className="px-2 py-1.5 space-y-1.5 bg-gray-50 border-t border-gray-100">
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
  )

  return (
    <aside className="w-full lg:w-72 lg:shrink-0 bg-surface border-l border-gray-200 overflow-y-auto lg:h-full">
      <div className="p-4 space-y-5">

        {phase === 'boyoq' && WallSection}
        {phase === 'pol'   && FloorSection}
        {phase === 'mebel' && MebelSection}
        {(phase === 'suvoq' || phase === 'shpaklovka' || phase === 'montaj') && (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
            <span className="text-2xl">🏗️</span>
            <p className="text-sm text-gray-400">Bu bosqich uchun sozlamalar yo'q</p>
          </div>
        )}

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
