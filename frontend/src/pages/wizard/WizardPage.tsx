import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  useRoomStore,
  computeFloorArea,
  computeNetWallArea,
  computePerimeter,
  computeOpeningsCount,
} from '@/store/roomStore'
import type { RoomGeometry, Wall, WallElement } from '@/store/roomStore'
import { IsometricRoomPreview } from '@/components/wizard/IsometricRoomPreview'
import { WallElevationPreview } from '@/components/wizard/WallElevationPreview'
import { MetricCard } from '@/components/ui/MetricCard'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { createApartment, createRoom, createDraftRoom, getDraftRoom, updateDraftRoom, deleteDraftRoom, updateRoom } from '@/lib/api'
import { cn } from '@/lib/utils'

// ─── Constants ────────────────────────────────────────────────────────────────

// TOTAL_STEPS is dynamic: geometry.walls.length + 2 (ceiling + N walls + results)

const CEILING_PRESETS = [2.5, 2.7, 3.0, 3.2]

interface ElementPreset {
  type: 'eshik' | 'deraza' | 'balkon'
  label: string
  defaultWidth: number   // mm
  defaultHeight: number  // mm
  defaultSill: number    // mm
}

const ELEMENT_PRESETS: ElementPreset[] = [
  { type: 'eshik',  label: 'Eshik',   defaultWidth: 900,  defaultHeight: 2050, defaultSill: 0 },
  { type: 'deraza', label: 'Deraza',  defaultWidth: 1400, defaultHeight: 1400, defaultSill: 900 },
  { type: 'balkon', label: 'Balkon',  defaultWidth: 750,  defaultHeight: 2050, defaultSill: 0 },
]

// ─── Step transition variants ─────────────────────────────────────────────────

const stepVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 40 : -40,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -40 : 40,
    opacity: 0,
  }),
}

const stepTransition = { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }

// ─── Wall step label ──────────────────────────────────────────────────────────

function wallStepLabel(wall: { id: string }, idx: number): string {
  const defaultLabels = ['A devor', 'B devor', 'C devor', 'D devor']
  return defaultLabels[idx] ?? `${wall.id} devor`
}

// ─── Element chip ─────────────────────────────────────────────────────────────

interface ElementChipProps {
  element: WallElement
  wallLengthMm: number
  onRemove(): void
  onPositionChange(positionMm: number): void
}

function ElementChip({ element, wallLengthMm, onRemove, onPositionChange }: ElementChipProps) {
  const [expanded, setExpanded] = React.useState(false)

  const labelMap: Record<string, string> = { eshik: 'Eshik', deraza: 'Deraza', balkon: 'Balkon' }

  // Resolve display position (centered when 0)
  const resolvedPos = element.position > 0
    ? element.position
    : Math.max(0, Math.round((wallLengthMm - element.width) / 2))

  const leftM = resolvedPos / 1000
  const rightM = (wallLengthMm - resolvedPos - element.width) / 1000
  const maxPos = wallLengthMm - element.width

  function handleLeft(raw: string) {
    const v = parseFloat(raw)
    if (!isNaN(v)) {
      const mm = Math.round(Math.max(0, Math.min(v * 1000, maxPos)))
      onPositionChange(mm)
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-surface overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-1 px-3 py-1.5">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex-1 text-left text-xs font-medium text-neutral-700 flex items-center gap-1.5"
        >
          <span className={`text-[10px] transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
          {labelMap[element.type]} {(element.width / 1000).toFixed(2)}×{(element.height / 1000).toFixed(2)}m
        </button>
        <button onClick={onRemove} aria-label="O'chirish" className="text-neutral-400 hover:text-red-500 transition-colors text-xs leading-none">✕</button>
      </div>

      {/* Position controls */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-neutral-100">
          <p className="text-[10px] text-neutral-400 pt-2">Joylashuv</p>

          {/* Slider */}
          <input
            type="range"
            min={0}
            max={maxPos}
            step={10}
            value={resolvedPos}
            onChange={(e) => onPositionChange(parseInt(e.target.value))}
            className="w-full accent-brand"
          />

          {/* Left / right dimension inputs */}
          <div className="flex items-center gap-2 text-xs">
            <label className="flex-1">
              <span className="text-neutral-500 block mb-0.5">← Sol (m)</span>
              <input
                type="number"
                value={leftM.toFixed(2)}
                min={0}
                max={(wallLengthMm - element.width) / 1000}
                step={0.05}
                onChange={(e) => handleLeft(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </label>
            <div className="text-center text-neutral-400 pt-4">{(element.width / 1000).toFixed(2)}m</div>
            <label className="flex-1">
              <span className="text-neutral-500 block mb-0.5">O'ng → (m)</span>
              <input
                type="number"
                readOnly
                value={Math.max(0, rightM).toFixed(2)}
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-neutral-500"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Add element sheet content ────────────────────────────────────────────────

interface AddElementSheetProps {
  onAdd(el: Omit<WallElement, 'id'>): void
  onClose(): void
}

function AddElementSheet({ onAdd, onClose }: AddElementSheetProps) {
  const [selected, setSelected] = React.useState<ElementPreset>(ELEMENT_PRESETS[0])
  const [w, setW] = React.useState(selected.defaultWidth / 1000)
  const [h, setH] = React.useState(selected.defaultHeight / 1000)
  const [sill, setSill] = React.useState(selected.defaultSill / 1000)

  function selectPreset(preset: ElementPreset) {
    setSelected(preset)
    setW(preset.defaultWidth / 1000)
    setH(preset.defaultHeight / 1000)
    setSill(preset.defaultSill / 1000)
  }

  function handleAdd() {
    onAdd({
      type: selected.type,
      width: Math.round(w * 1000),
      height: Math.round(h * 1000),
      sill_height: Math.round(sill * 1000),
      position: 0,
    })
    onClose()
  }

  return (
    <div className="pb-6 space-y-4">
      <h3 className="text-base font-bold text-neutral-900 pt-2">Element qo'shish</h3>

      {/* Type selector */}
      <div className="flex gap-2">
        {ELEMENT_PRESETS.map((p) => (
          <button
            key={p.type}
            onClick={() => selectPreset(p)}
            className={cn(
              'flex-1 rounded-xl border-2 py-2 text-sm font-medium transition-all',
              selected.type === p.type
                ? 'border-brand bg-brand/10 text-brand'
                : 'border-neutral-200 text-neutral-600 hover:border-brand/40',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Dimension inputs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Kenglik (m)', val: w, set: setW, min: 0.3, max: 4 },
          { label: 'Balandlik (m)', val: h, set: setH, min: 0.5, max: 3 },
          { label: 'Osti (m)', val: sill, set: setSill, min: 0, max: 1.5 },
        ].map(({ label, val, set, min, max }) => (
          <label key={label} className="block">
            <span className="text-xs text-neutral-500">{label}</span>
            <input
              type="number"
              value={val}
              min={min}
              max={max}
              step={0.05}
              onChange={(e) => set(parseFloat(e.target.value) || min)}
              className="mt-1 w-full rounded-xl border border-neutral-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </label>
        ))}
      </div>

      <button
        onClick={handleAdd}
        className="w-full bg-brand text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-brand/90 transition-colors"
      >
        Qo'shish
      </button>
    </div>
  )
}

// ─── Step 0: Ceiling height ───────────────────────────────────────────────────

interface Step0Props {
  ceilingHeight: number
  onChange(h: number): void
  onNext(): void
}

function Step0({ ceilingHeight, onChange, onNext }: Step0Props) {
  const mVal = ceilingHeight / 1000
  const [inputVal, setInputVal] = React.useState(mVal.toFixed(2))

  function handlePreset(v: number) {
    onChange(Math.round(v * 1000))
    setInputVal(v.toFixed(2))
    onNext()
  }

  function handleInput(raw: string) {
    setInputVal(raw)
    const v = parseFloat(raw)
    if (!isNaN(v) && v >= 2.0 && v <= 4.0) {
      onChange(Math.round(v * 1000))
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Shiftning balandligi?</h1>
        <p className="text-sm text-muted mt-1">Odatda 2.5–3.2 metr oralig'ida</p>
      </div>

      {/* Preset chips */}
      <div className="flex gap-2 flex-wrap">
        {CEILING_PRESETS.map((v) => (
          <button
            key={v}
            onClick={() => handlePreset(v)}
            className={cn(
              'rounded-chip px-4 py-2 text-sm font-semibold border-2 transition-all',
              Math.round(v * 1000) === ceilingHeight
                ? 'border-brand bg-brand text-white'
                : 'border-neutral-200 text-neutral-700 hover:border-brand/50',
            )}
          >
            {v.toFixed(1)} m
          </button>
        ))}
      </div>

      {/* Numeric input */}
      <label className="block">
        <span className="text-sm font-medium text-neutral-700">Aniq qiymat (m)</span>
        <input
          type="number"
          value={inputVal}
          min={2.0}
          max={4.0}
          step={0.01}
          onChange={(e) => handleInput(e.target.value)}
          className="mt-1 block w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
        {(parseFloat(inputVal) < 2.0 || parseFloat(inputVal) > 4.0) && !isNaN(parseFloat(inputVal)) && (
          <p className="mt-1 text-xs text-red-500">2.0 dan 4.0 m oralig'ida bo'lishi kerak</p>
        )}
      </label>
    </div>
  )
}

// ─── Steps 1–4: Wall input ────────────────────────────────────────────────────

interface WallStepProps {
  wallIndex: number
  wall: Wall
  wallA: Wall
  ceilingHeight: number
  onLengthChange(wallId: string, mm: number): void
  onAddElement(wallId: string, el: Omit<WallElement, 'id'>): void
  onRemoveElement(wallId: string, elId: string): void
  onMoveElement(wallId: string, elId: string, positionMm: number): void
  onSwapElements(wallId: string): void
}

function WallStep({
  wallIndex,
  wall,
  wallA,
  ceilingHeight,
  onLengthChange,
  onAddElement,
  onRemoveElement,
  onMoveElement,
  onSwapElements,
}: WallStepProps) {
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [copyA, setCopyA] = React.useState(false)

  const isC = wall.id === 'C'
  const lenM = wall.length / 1000
  const label = wallStepLabel(wall, wallIndex)

  function handleSlider(v: number) {
    onLengthChange(wall.id, Math.round(v * 1000))
  }

  function handleInput(raw: string) {
    const v = parseFloat(raw)
    if (!isNaN(v) && v >= 1 && v <= 12) {
      onLengthChange(wall.id, Math.round(v * 1000))
    }
  }

  function handleCopyA(checked: boolean) {
    setCopyA(checked)
    if (checked) {
      onLengthChange(wall.id, wallA.length)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-neutral-900">{label}</h2>
        <p className="text-sm text-muted mt-0.5">Uzunligini kiriting</p>
      </div>

      <WallElevationPreview
        wall={wall}
        ceilingHeight={ceilingHeight}
        wallLabel={label}
      />

      {/* Length slider + input */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-neutral-700">Uzunlik</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={lenM.toFixed(1)}
              min={1}
              max={12}
              step={0.1}
              disabled={isC && copyA}
              onChange={(e) => handleInput(e.target.value)}
              className="w-16 rounded-lg border border-neutral-300 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
            />
            <span className="text-sm text-muted">m</span>
          </div>
        </div>
        <input
          type="range"
          min={1}
          max={12}
          step={0.1}
          value={lenM}
          disabled={isC && copyA}
          onChange={(e) => handleSlider(parseFloat(e.target.value))}
          className="w-full accent-brand disabled:opacity-50"
        />
      </div>

      {/* Copy wall A checkbox (only for wall C) */}
      {isC && (
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={copyA}
            onChange={(e) => handleCopyA(e.target.checked)}
            className="w-4 h-4 accent-brand rounded"
          />
          <span className="text-sm text-neutral-700">A devor bilan bir xil ({(wallA.length / 1000).toFixed(1)} m)</span>
        </label>
      )}

      {/* Element chips */}
      {wall.elements.length > 0 && (
        <div className="flex flex-col gap-2">
          {wall.elements.map((el) => (
            <ElementChip
              key={el.id}
              element={el}
              wallLengthMm={wall.length}
              onRemove={() => onRemoveElement(wall.id, el.id)}
              onPositionChange={(mm) => onMoveElement(wall.id, el.id, mm)}
            />
          ))}
          {wall.elements.length === 2 && (
            <button
              type="button"
              onClick={() => onSwapElements(wall.id)}
              className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 py-2 text-xs text-neutral-500 hover:border-brand hover:text-brand transition-colors"
            >
              ⇄ Eshik va derazani almashtirish
            </button>
          )}
        </div>
      )}

      {/* Add element button */}
      <button
        onClick={() => setSheetOpen(true)}
        className="flex items-center gap-2 text-sm font-medium text-brand hover:text-brand/80 transition-colors"
      >
        <span className="text-lg leading-none">+</span>
        Eshik / Deraza qo'shish
      </button>

      <BottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Element qo'shish"
        defaultSnap="half"
      >
        <AddElementSheet
          onAdd={(el) => onAddElement(wall.id, el)}
          onClose={() => setSheetOpen(false)}
        />
      </BottomSheet>
    </div>
  )
}

// ─── Step 5: Results ──────────────────────────────────────────────────────────

interface Step5Props {
  roomId: string | null
  geometry: RoomGeometry
  ceilingHeight: number
  onNewRoom(): void
}

function Step5({ roomId, geometry, ceilingHeight, onNewRoom }: Step5Props) {
  const navigate = useNavigate()

  const floorMm2 = computeFloorArea(geometry)
  const wallMm2 = computeNetWallArea(geometry, ceilingHeight)
  const perimMm = computePerimeter(geometry)
  const openings = computeOpeningsCount(geometry)

  return (
    <div className="space-y-5">
      {/* Success animation */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className="flex justify-center"
      >
        <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center">
          <svg className="w-8 h-8 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </motion.div>

      <div className="text-center">
        <h2 className="text-xl font-bold text-neutral-900">O'lchamlar saqlandi!</h2>
        <p className="text-sm text-muted mt-1">Xona parametrlari muvaffaqiyatli qayd etildi</p>
      </div>

      {/* Metric cards 2×2 */}
      <motion.div
        className="grid grid-cols-2 gap-3"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.12 } },
        }}
      >
        {[
          { label: 'Pol maydoni', value: floorMm2 / 1e6, unit: 'm²', decimals: 1 },
          { label: 'Devor maydoni (netto)', value: wallMm2 / 1e6, unit: 'm²', decimals: 1 },
          { label: 'Perimetr', value: perimMm / 1000, unit: 'm', decimals: 1 },
          { label: 'Eshik/derazalar', value: openings, unit: 'ta', decimals: 0 },
        ].map((card) => (
          <motion.div
            key={card.label}
            variants={{
              hidden: { y: 16, opacity: 0 },
              visible: { y: 0, opacity: 1, transition: { duration: 0.4 } },
            }}
          >
            <MetricCard
              label={card.label}
              value={card.value}
              unit={card.unit}
              decimals={card.decimals}
            />
          </motion.div>
        ))}
      </motion.div>

      {/* CTA buttons */}
      <div className="flex flex-col gap-3 pt-2">
        <button
          onClick={() => roomId && navigate(`/smeta/${roomId}`)}
          disabled={!roomId}
          className="w-full bg-brand text-white rounded-xl py-3 text-sm font-semibold hover:bg-brand/90 transition-colors disabled:opacity-50"
        >
          Smeta ko'rish
        </button>
        <button
          onClick={() => roomId && navigate(`/studio/${roomId}`)}
          disabled={!roomId}
          className="w-full border-2 border-brand text-brand rounded-xl py-3 text-sm font-semibold hover:bg-brand/5 transition-colors disabled:opacity-50"
        >
          Bezashni boshlash
        </button>
        <button
          onClick={onNewRoom}
          className="w-full text-sm text-neutral-500 hover:text-neutral-800 transition-colors py-2"
        >
          + Yangi xona qo'shish
        </button>
      </div>
    </div>
  )
}

// ─── WizardPage ───────────────────────────────────────────────────────────────

export default function WizardPage() {
  const {
    draftId,
    ceilingHeight,
    geometry,
    roomId,
    wizardStep,
    designState,
    setDraftId,
    setCeilingHeight,
    setWallLength,
    addElement,
    removeElement,
    updateElement,
    swapElements,
    setRoomId,
    setWizardStep,
    loadDraftState,
    resetRoom,
  } = useRoomStore()

  const [searchParams] = useSearchParams()
  const existingApartmentId = searchParams.get('apartmentId') ?? null

  const [step, setStep] = React.useState(0)
  const [dir, setDir] = React.useState(1)
  const [saving, setSaving] = React.useState(false)
  const [resumePrompt, setResumePrompt] = React.useState(false)
  const [draftLoaded, setDraftLoaded] = React.useState(false)

  // ── On mount: fetch existing draft or create a new one ──────────────────
  React.useEffect(() => {
    async function initDraft() {
      // The wizard only creates NEW rooms. A roomId left in the store (e.g.
      // arriving via "+ add room" from the studio) would make handleSave()
      // bail out early and the new room would never be created.
      if (roomId) {
        resetRoom()
        const draft = await createDraftRoom({})
        setDraftId(draft.id)
        setDraftLoaded(true)
        return
      }
      if (draftId) {
        try {
          const draft = await getDraftRoom(draftId)
          const s = draft.state as { wizardStep?: number }
          if ((s.wizardStep ?? 0) > 0) {
            loadDraftState(draft.state)
            setResumePrompt(true)
          } else {
            setStep(0)
          }
        } catch {
          // Draft deleted or not found — create fresh
          const draft = await createDraftRoom({})
          setDraftId(draft.id)
        }
      } else {
        const draft = await createDraftRoom({})
        setDraftId(draft.id)
      }
      setDraftLoaded(true)
    }
    void initDraft()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Auto-save to DB on every wizard state change (debounced 800ms) ──────
  React.useEffect(() => {
    if (!draftLoaded || !draftId || step >= geometry.walls.length + 1) return
    const timer = setTimeout(() => {
      void updateDraftRoom(draftId, {
        ceilingHeight,
        geometry,
        wizardStep: step,
        designState,
        roomId,
      })
    }, 800)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ceilingHeight, geometry, step, designState, draftId, draftLoaded])

  // Keep first-wall lookup for the "link to A" feature in WallStep
  const wallA = geometry.walls.find((w) => w.id === 'A') ?? geometry.walls[0]!
  const walls = geometry.walls

  // Step 0 = ceiling, Steps 1–N = walls, Step N+1 = results
  const totalSteps = geometry.walls.length + 2
  const activeWall: string | null =
    step >= 1 && step <= geometry.walls.length ? geometry.walls[step - 1].id : null

  // Auto-save to DB when geometry changes (debounced 1.5s)
  React.useEffect(() => {
    if (step === 0 || step >= totalSteps - 1) return  // only during wall steps
    const timer = setTimeout(() => {
      void handleSave()
    }, 1500)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, ceilingHeight, step])

  async function handleSave() {
    if (roomId) return  // already saved (local or real)
    // Assign a local ID immediately so navigation is never blocked
    const localId = crypto.randomUUID()
    setRoomId(localId)
    setSaving(true)
    try {
      const aptId = existingApartmentId ?? (await createApartment({ name: 'Mening kvartiram' })).id
      const room = await createRoom(aptId, {
        name: 'Xona',
        ceiling_h: ceilingHeight / 1000,
        geometry: {
          walls: geometry.walls.map((w) => ({
            id: w.id,
            length: w.length / 1000,
            elements: w.elements.map((e) => ({
              type: e.type,
              width: e.width / 1000,
              height: e.height / 1000,
              sill_height: (e.sill_height ?? 0) / 1000,
              position: e.position > 0 ? Math.min(1, e.position / w.length) : 0.5,
            })),
          })),
        },
      })
      setRoomId(room.id)  // upgrade to real server ID if save succeeds
      // Draft fulfilled — clean up
      if (draftId) {
        try { await deleteDraftRoom(draftId) } catch { /* ignore */ }
        setDraftId(null)
      }
    } catch {
      // keep the local ID — studio/smeta work in offline mode
    } finally {
      setSaving(false)
    }
  }

  // Directional "+ add room": place the new room on the side of the anchor
  // room that the user pressed. Runs at the results step, when the entered
  // dimensions are final (the room row itself may be created earlier by
  // autosave, before the user finishes editing wall lengths).
  async function persistLayoutPos() {
    const side = searchParams.get('side')
    if (!side) return
    const s = useRoomStore.getState()
    if (!s.roomId) return
    const ax = parseFloat(searchParams.get('ax') ?? '0')
    const az = parseFloat(searchParams.get('az') ?? '0')
    const aw = parseFloat(searchParams.get('aw') ?? '0')
    const ad = parseFloat(searchParams.get('ad') ?? '0')
    const newW = (s.geometry.walls.find((w) => w.id === 'B')?.length ?? 3000) / 1000
    const newD = (s.geometry.walls.find((w) => w.id === 'A')?.length ?? 4000) / 1000
    const GAP = 0.15
    const pos =
      side === 'east'  ? { x: ax + aw / 2 + GAP + newW / 2, z: az } :
      side === 'west'  ? { x: ax - aw / 2 - GAP - newW / 2, z: az } :
      side === 'north' ? { x: ax, z: az - ad / 2 - GAP - newD / 2 } :
                         { x: ax, z: az + ad / 2 + GAP + newD / 2 }
    s.setLayoutPos(pos)
    try {
      await updateRoom(s.roomId, { state: { layoutPos: pos } })
    } catch { /* offline / local-only room — position still kept in the store */ }
  }

  function goNext() {
    const nextStep = step + 1
    setDir(1)
    setStep(nextStep)
    setWizardStep(nextStep)
    if (nextStep === totalSteps - 1) {
      void handleSave().then(() => void persistLayoutPos())
    }
  }

  function goBack() {
    setDir(-1)
    const prevStep = Math.max(step - 1, 0)
    setStep(prevStep)
    setWizardStep(prevStep)
  }

  function handleResume() {
    setStep(wizardStep)
    setResumePrompt(false)
  }

  async function handleRestart() {
    // Delete old draft and create a fresh one
    if (draftId) {
      try { await deleteDraftRoom(draftId) } catch { /* ignore */ }
    }
    resetRoom()
    const draft = await createDraftRoom({})
    setDraftId(draft.id)
    setStep(0)
    setResumePrompt(false)
  }

  const progressPct = totalSteps > 1 ? (step / (totalSteps - 1)) * 100 : 0

  return (
    <div className="min-h-screen bg-paper flex flex-col">

      {/* Draft resume banner */}
      {resumePrompt && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 animate-fade-slide">
            <div className="text-2xl mb-3">🏗️</div>
            <h2 className="text-base font-bold text-gray-900 mb-1">
              Saqlangan loyiha bor
            </h2>
            <p className="text-sm text-muted mb-5">
              Siz ilgari xona o'lchamlarini kiritayotgan edingiz. Davom etasizmi?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleRestart}
                className="flex-1 border-2 border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:border-red-300 hover:text-red-600 transition-colors"
              >
                Yangi boshlash
              </button>
              <button
                onClick={handleResume}
                className="flex-1 bg-brand text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-brand/90 transition-colors"
              >
                Davom etish
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Isometric preview — pinned top, ~40vh */}
      <div
        className="w-full bg-white border-b border-neutral-100 flex items-center justify-center px-4 py-3"
        style={{ height: '40vh', maxHeight: 320 }}
      >
        <IsometricRoomPreview
          geometry={geometry}
          ceilingHeight={ceilingHeight}
          activeWall={activeWall as 'A' | 'B' | 'C' | 'D' | null}
        />
      </div>

      {/* Progress bar */}
      <div className="w-full h-1 bg-neutral-200">
        <motion.div
          className="h-full bg-brand"
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>

      {/* Step area */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-5">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={step}
              custom={dir}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={stepTransition}
            >
              {step === 0 && (
                <Step0
                  ceilingHeight={ceilingHeight}
                  onChange={setCeilingHeight}
                  onNext={goNext}
                />
              )}

              {step >= 1 && step <= geometry.walls.length && (
                <WallStep
                  wallIndex={step - 1}
                  wall={walls[step - 1] ?? walls[0]}
                  wallA={wallA}
                  ceilingHeight={ceilingHeight}
                  onLengthChange={setWallLength}
                  onAddElement={addElement}
                  onRemoveElement={removeElement}
                  onMoveElement={(wallId, elId, mm) => updateElement(wallId, elId, { position: mm })}
                  onSwapElements={swapElements}
                />
              )}

              {step === totalSteps - 1 && (
                <Step5
                  roomId={roomId}
                  geometry={geometry}
                  ceilingHeight={ceilingHeight}
                  onNewRoom={handleRestart}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        {step < totalSteps - 1 && (
          <div className="px-4 pb-6 pt-2 flex items-center gap-3 border-t border-neutral-100 bg-white">
            {step > 0 && (
              <button
                onClick={goBack}
                className="text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors px-2 py-2"
              >
                Ortga
              </button>
            )}
            <button
              onClick={goNext}
              disabled={saving}
              className="flex-1 bg-brand text-white rounded-xl py-3 text-sm font-semibold hover:bg-brand/90 transition-colors disabled:opacity-60"
            >
              {saving ? 'Saqlanmoqda...' : 'Keyingi'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
