import * as React from "react";
import { useOutletContext } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { updateRoom } from "@/lib/api";
import { uz } from "@/locale/uz";
import { useRoomStore, resolveWallColor, resolveWallCovering } from "@/store/roomStore";
import type { WallCovering } from "@/store/roomStore";
import { OBOY_PATTERNS, getOboySvgPattern } from "@/lib/oboyPatterns";
import type { OboyPatternId } from "@/lib/oboyPatterns";
import { computeOboyRolls } from "@/lib/oboySmeta";
import type { Room } from "@/lib/api";

interface StudioContext {
  room: Room;
}

type WallTarget = 'ALL' | 'A' | 'B' | 'C' | 'D'
type CoveringMode = 'paint' | 'oboy'

const WALL_COLORS = [
  "#FFFFFF", "#F5F0E8", "#E8D5C4", "#D4E8D4",
  "#C4D4E8", "#E8C4C4", "#C4C4E8", "#E8E8C4", "#D85A30",
]

const FLOOR_TYPES = [
  { key: "parquet", label: "Parket" },
  { key: "tile", label: "Kafel" },
  { key: "laminate", label: "Laminat" },
  { key: "concrete", label: "Beton" },
]

const WALL_TARGETS: { key: WallTarget; label: string }[] = [
  { key: 'ALL', label: 'Hamma devorlar' },
  { key: 'A', label: 'Devor A' },
  { key: 'B', label: 'Devor B' },
  { key: 'C', label: 'Devor C' },
  { key: 'D', label: 'Devor D' },
]

export default function IsometricPage() {
  const { room } = useOutletContext<StudioContext>();
  const { designState, setDesignState, setWallCovering, geometry, ceilingHeight } = useRoomStore();

  const floorType = designState.floorType;

  // ── Local UI state ──────────────────────────────────────────────────────────
  const [coveringMode, setCoveringMode] = React.useState<CoveringMode>('paint')
  const [targetWall, setTargetWall] = React.useState<WallTarget>('ALL')
  const [selectedPattern, setSelectedPattern] = React.useState<OboyPatternId>('damask')
  const [baseColor, setBaseColor] = React.useState('#F5F0E8')
  const [accentColor, setAccentColor] = React.useState('#8B6F47')

  // Sync local state when wall target changes
  React.useEffect(() => {
    const c = targetWall === 'ALL'
      ? designState.wallCoverings.ALL
      : (designState.wallCoverings[targetWall] ?? designState.wallCoverings.ALL)
    if (c.kind === 'paint') {
      setCoveringMode('paint')
    } else {
      setCoveringMode('oboy')
      setSelectedPattern(c.patternId as OboyPatternId)
      setBaseColor(c.baseColor)
      setAccentColor(c.accentColor)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetWall])

  // ── API sync (debounced) ────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: (data: { design_state: Record<string, unknown> }) =>
      updateRoom(room.id, data),
  })

  const syncTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  function syncToApi(ds: typeof designState) {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(() => {
      mutation.mutate({ design_state: { wallCoverings: ds.wallCoverings, floorType: ds.floorType } })
    }, 600)
  }

  function applyWallCovering(covering: WallCovering) {
    setWallCovering(targetWall, covering)
    // Optimistic sync — build updated coverings for API call
    const updated = { wallCoverings: { ...designState.wallCoverings, [targetWall]: covering }, floorType }
    syncToApi({ ...designState, ...updated })
  }

  function handleSetPaintColor(color: string) {
    applyWallCovering({ kind: 'paint', color })
  }

  function handleSetOboy(patch: Partial<{ patternId: OboyPatternId; baseColor: string; accentColor: string }>) {
    const newPattern = patch.patternId ?? selectedPattern
    const newBase = patch.baseColor ?? baseColor
    const newAccent = patch.accentColor ?? accentColor
    if (patch.patternId) setSelectedPattern(newPattern)
    if (patch.baseColor) setBaseColor(newBase)
    if (patch.accentColor) setAccentColor(newAccent)
    applyWallCovering({ kind: 'oboy', patternId: newPattern, baseColor: newBase, accentColor: newAccent })
  }

  function handleSetFloorType(type: string) {
    const ft = type as typeof floorType
    setDesignState({ floorType: ft })
    syncToApi({ ...designState, floorType: ft })
  }

  function handleSetCoveringMode(mode: CoveringMode) {
    setCoveringMode(mode)
    if (mode === 'paint') {
      const currentColor = resolveWallColor(designState.wallCoverings, targetWall === 'ALL' ? undefined : targetWall)
      applyWallCovering({ kind: 'paint', color: currentColor })
    } else {
      applyWallCovering({ kind: 'oboy', patternId: selectedPattern, baseColor, accentColor })
    }
  }

  // ── Active wall color for SVG preview ──────────────────────────────────────
  const wallColorForPreview = resolveWallColor(designState.wallCoverings)

  // ── Isometric projection ─────────────────────────────────────────────────────
  const w = Math.max(room.width ?? 0, 2)
  const l = Math.max(room.length ?? 0, 2)
  const H = room.ceiling_height ?? 2.7

  const UNIT = 100
  const isoX = UNIT * 0.866
  const isoY = UNIT * 0.5

  const vbW = (w + l) * isoX + 4
  const vbH = (w + l) * isoY + H * UNIT + 20

  const ox = vbW / 2
  const oy = vbH - 10

  const ptA = { x: ox,                        y: oy }
  const ptB = { x: ox - w * isoX,             y: oy - w * isoY }
  const ptC = { x: ox - w * isoX + l * isoX,  y: oy - w * isoY - l * isoY }
  const ptD = { x: ox + l * isoX,             y: oy - l * isoY }

  const lift = (p: { x: number; y: number }) => ({ x: p.x, y: p.y - H * UNIT })
  const pts = (arr: { x: number; y: number }[]) =>
    arr.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  const tA = lift(ptA); const tB = lift(ptB); const tC = lift(ptC); const tD = lift(ptD)

  const floorFillColor = floorType === 'tile' ? '#D8D8D0' : floorType === 'laminate' ? '#B8906A' : floorType === 'concrete' ? '#9E9E9E' : '#C4A27A'

  function shadeWall(hex: string, factor: number): string {
    if (!hex.startsWith('#') || hex.length < 7) return hex
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    const sh = (v: number) => Math.round(v * factor).toString(16).padStart(2, '0')
    return `#${sh(r)}${sh(g)}${sh(b)}`
  }

  // Resolve covering for each wall face in the SVG
  function svgWallFill(wallId: 'A' | 'B' | 'C' | 'D', shadeFactor: number): { fill: string; patternUid: string | null } {
    const covering = resolveWallCovering(designState.wallCoverings, wallId)
    if (covering.kind === 'paint') {
      return { fill: shadeWall(covering.color, shadeFactor), patternUid: null }
    }
    return { fill: `url(#oboy-svg-${wallId})`, patternUid: `oboy-svg-${wallId}` }
  }

  const faceD = svgWallFill('D', 0.88)
  const faceA = svgWallFill('A', 0.78)
  const faceB = svgWallFill('B', 0.78)
  const faceC = svgWallFill('C', 0.88)

  // Collect unique oboy patterns for SVG defs
  const svgPatternDefs: string[] = []
  for (const wallId of ['A', 'B', 'C', 'D'] as const) {
    const c = resolveWallCovering(designState.wallCoverings, wallId)
    if (c.kind === 'oboy') {
      svgPatternDefs.push(getOboySvgPattern(c.patternId as OboyPatternId, c.baseColor, c.accentColor, `oboy-svg-${wallId}`))
    }
  }

  const ceilColor = '#F0EDE6'
  const hasOboy = Object.values(designState.wallCoverings).some(c => c.kind === 'oboy')
  const smeta = hasOboy ? computeOboyRolls(geometry, designState.wallCoverings, ceilingHeight) : null

  return (
    <div className="flex flex-col lg:flex-row" style={{ height: 'calc(100vh - 108px)' }}>
      {/* SVG Preview */}
      <div className="flex-1 min-h-0 flex items-center justify-center bg-paper p-6 overflow-hidden">
        <svg
          viewBox={`0 0 ${vbW.toFixed(1)} ${vbH.toFixed(1)}`}
          style={{ width: '100%', height: '100%', maxWidth: '700px', maxHeight: '100%' }}
          aria-label="Isometric room preview"
        >
          <defs>
            <pattern id="wood" patternUnits="userSpaceOnUse" width="40" height="20">
              <rect width="40" height="20" fill={floorFillColor} />
              <line x1="0" y1="10" x2="40" y2="10" stroke="rgba(0,0,0,0.07)" strokeWidth="0.5" />
              <line x1="20" y1="0" x2="20" y2="10" stroke="rgba(0,0,0,0.05)" strokeWidth="0.5" />
            </pattern>
            <pattern id="tile-pat" patternUnits="userSpaceOnUse" width="30" height="30">
              <rect width="30" height="30" fill={floorFillColor} />
              <rect width="29" height="29" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="0.8" />
            </pattern>
            {svgPatternDefs.map((def, i) => (
              <g key={i} dangerouslySetInnerHTML={{ __html: def }} />
            ))}
          </defs>

          {/* Floor */}
          <polygon
            points={pts([ptA, ptB, ptC, ptD])}
            fill={floorType === 'parquet' ? 'url(#wood)' : floorType === 'tile' ? 'url(#tile-pat)' : floorFillColor}
            stroke="#888" strokeWidth="0.8"
          />

          {/* Left wall (D side) — pattern + shade overlay */}
          <polygon points={pts([ptA, ptB, tB, tA])} fill={faceD.fill} stroke="#888" strokeWidth="0.8" />
          {faceD.patternUid && (
            <polygon points={pts([ptA, ptB, tB, tA])} fill="rgba(0,0,0,0.12)" />
          )}

          {/* Right wall (A side) */}
          <polygon points={pts([ptA, ptD, tD, tA])} fill={faceA.fill} stroke="#888" strokeWidth="0.8" />
          {faceA.patternUid && (
            <polygon points={pts([ptA, ptD, tD, tA])} fill="rgba(0,0,0,0.22)" />
          )}

          {/* Back-left wall (B side) */}
          <polygon points={pts([ptB, ptC, tC, tB])} fill={faceB.fill} stroke="#888" strokeWidth="0.8" />
          {faceB.patternUid && (
            <polygon points={pts([ptB, ptC, tC, tB])} fill="rgba(0,0,0,0.22)" />
          )}

          {/* Back-right wall (C side) */}
          <polygon points={pts([ptD, ptC, tC, tD])} fill={faceC.fill} stroke="#888" strokeWidth="0.8" />
          {faceC.patternUid && (
            <polygon points={pts([ptD, ptC, tC, tD])} fill="rgba(0,0,0,0.12)" />
          )}

          {/* Ceiling */}
          <polygon points={pts([tA, tB, tC, tD])} fill={ceilColor} stroke="#888" strokeWidth="0.8" />

          {/* Lamp */}
          <circle
            cx={((tA.x + tC.x) / 2).toFixed(1)}
            cy={((tA.y + tC.y) / 2).toFixed(1)}
            r="6" fill="#FFE8A0" stroke="#CCC" strokeWidth="0.6"
          />

          {/* Baseboards */}
          <line x1={ptA.x.toFixed(1)} y1={ptA.y.toFixed(1)} x2={ptB.x.toFixed(1)} y2={ptB.y.toFixed(1)} stroke="rgba(0,0,0,0.2)" strokeWidth="1.5" />
          <line x1={ptA.x.toFixed(1)} y1={ptA.y.toFixed(1)} x2={ptD.x.toFixed(1)} y2={ptD.y.toFixed(1)} stroke="rgba(0,0,0,0.2)" strokeWidth="1.5" />
        </svg>
      </div>

      {/* Controls */}
      <aside className="w-full lg:w-72 bg-surface border-t lg:border-t-0 lg:border-l border-gray-200 p-4 overflow-y-auto shrink-0">

        {/* Wall target selector */}
        <section className="mb-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Devor</h3>
          <div className="flex flex-wrap gap-1.5">
            {WALL_TARGETS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTargetWall(key)}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                  targetWall === key
                    ? 'bg-brand text-white border-brand font-semibold'
                    : 'border-gray-300 text-gray-600 hover:border-brand/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* Covering mode toggle */}
        <section className="mb-4">
          <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg">
            {(['paint', 'oboy'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => handleSetCoveringMode(mode)}
                className={`flex-1 py-1.5 text-sm rounded-md font-medium transition-colors ${
                  coveringMode === mode
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {mode === 'paint' ? "Bo'yoq" : 'Oboy'}
              </button>
            ))}
          </div>
        </section>

        {coveringMode === 'paint' && (
          <section className="mb-6">
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
                    borderColor: wallColorForPreview === color ? '#D85A30' : '#D1D5DB',
                    boxShadow: wallColorForPreview === color ? '0 0 0 2px #D85A30' : undefined,
                  }}
                  aria-pressed={wallColorForPreview === color}
                />
              ))}
            </div>
          </section>
        )}

        {coveringMode === 'oboy' && (
          <section className="mb-6">
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
                      border: selectedPattern === p.id ? '2px solid #D85A30' : '2px solid #E5E7EB',
                    }}
                  >
                    <defs dangerouslySetInnerHTML={{ __html: getOboySvgPattern(p.id, baseColor, accentColor, `thumb-${p.id}`) }} />
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
        <section className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">{uz.studio.pol_turi}</h3>
          <div className="space-y-2">
            {FLOOR_TYPES.map((ft) => (
              <button
                key={ft.key}
                onClick={() => handleSetFloorType(ft.key)}
                className={`w-full text-left px-3 py-2.5 rounded-card text-sm border-2 transition-colors ${
                  floorType === ft.key
                    ? 'border-brand bg-brand/10 text-brand font-semibold'
                    : 'border-gray-200 hover:border-brand/40 text-gray-700'
                }`}
              >
                {ft.label}
              </button>
            ))}
          </div>
        </section>

        {/* Oboy smeta */}
        {smeta && smeta.totalRolls > 0 && (
          <section className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-card">
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

        {mutation.isPending && (
          <p className="text-xs text-muted animate-pulse mt-2">{uz.common.saqlash}...</p>
        )}
        {mutation.isError && (
          <p className="text-xs text-amber-600 mt-2">Oflayn rejimda — o'zgarishlar saqlandi</p>
        )}
      </aside>
    </div>
  )
}
