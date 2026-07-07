import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { nanoid } from 'nanoid'

// ─── Domain types ────────────────────────────────────────────────────────────

export interface WallElement {
  id: string
  type: 'eshik' | 'deraza' | 'balkon'
  width: number
  height: number
  sill_height: number
  position: number
}

export interface Wall {
  id: 'A' | 'B' | 'C' | 'D'
  length: number
  elements: WallElement[]
}

export interface RoomGeometry {
  walls: Wall[]
}

export interface AppliedSurfaces {
  A?: string
  B?: string
  C?: string
  D?: string
  floor?: string
}

export interface PlacedFurniture {
  id: string
  furniture_id: string
  x: number
  y: number
  rotation: number
}

export type FloorType = 'parquet' | 'tile' | 'laminate' | 'concrete'

export type WallCovering =
  | { kind: 'paint'; color: string }
  | { kind: 'oboy'; patternId: string; baseColor: string; accentColor: string }

export interface DesignState {
  wallCoverings: { ALL: WallCovering } & Partial<Record<'A' | 'B' | 'C' | 'D', WallCovering>>
  floorType: FloorType
}

/** Resolve the effective WallCovering for a given wall (falls back to ALL). */
export function resolveWallCovering(
  coverings: DesignState['wallCoverings'],
  wallId?: 'A' | 'B' | 'C' | 'D',
): WallCovering {
  return (wallId ? coverings[wallId] : undefined) ?? coverings.ALL
}

/** Resolve just the paint color (or baseColor for oboy) for a wall. */
export function resolveWallColor(
  coverings: DesignState['wallCoverings'],
  wallId?: 'A' | 'B' | 'C' | 'D',
): string {
  const c = resolveWallCovering(coverings, wallId)
  return c.kind === 'paint' ? c.color : c.baseColor
}

// ─── Payload shape from API ───────────────────────────────────────────────────

interface RoomPayload {
  id?: string
  apartment_id?: string
  name?: string
  ceiling_height?: number
  geometry?: RoomGeometry
  surfaces?: AppliedSurfaces
  furniture?: PlacedFurniture[]
}

// ─── Store interface ──────────────────────────────────────────────────────────

interface RoomStore {
  // State
  roomId: string | null
  apartmentId: string | null
  name: string
  ceilingHeight: number
  geometry: RoomGeometry
  surfaces: AppliedSurfaces
  furniture: PlacedFurniture[]
  isDirty: boolean
  wizardStep: number
  designState: DesignState

  // Actions
  setCeilingHeight(h: number): void
  setWallLength(wallId: string, length: number): void
  addElement(wallId: string, element: Omit<WallElement, 'id'>): void
  removeElement(wallId: string, elementId: string): void
  applySurface(wallId: string, materialId: string): void
  placeFurniture(item: PlacedFurniture): void
  moveFurniture(id: string, x: number, y: number, rotation: number): void
  removeFurniture(id: string): void
  loadRoom(room: RoomPayload): void
  setRoomId(id: string): void
  markSaved(): void
  setWizardStep(step: number): void
  setDesignState(patch: Partial<DesignState>): void
  setWallCovering(wallId: 'ALL' | 'A' | 'B' | 'C' | 'D', covering: WallCovering): void
  resetRoom(): void
}

// ─── Default geometry ─────────────────────────────────────────────────────────

const defaultGeometry = (): RoomGeometry => ({
  walls: [
    { id: 'A', length: 4000, elements: [] },
    { id: 'B', length: 3000, elements: [] },
    { id: 'C', length: 4000, elements: [] },
    { id: 'D', length: 3000, elements: [] },
  ],
})

// ─── Store ────────────────────────────────────────────────────────────────────

const DEFAULT_DESIGN_STATE: DesignState = {
  wallCoverings: { ALL: { kind: 'paint', color: '#F5F0E8' } },
  floorType: 'parquet',
}

export const useRoomStore = create<RoomStore>()(
  persist(
    (set) => ({
  roomId: null,
  apartmentId: null,
  name: 'Xona',
  ceilingHeight: 2700,
  geometry: defaultGeometry(),
  surfaces: {},
  furniture: [],
  isDirty: false,
  wizardStep: 0,
  designState: DEFAULT_DESIGN_STATE,

  setCeilingHeight(h) {
    set({ ceilingHeight: h, isDirty: true })
  },

  setWallLength(wallId, length) {
    set((state) => ({
      isDirty: true,
      geometry: {
        walls: state.geometry.walls.map((w) =>
          w.id === wallId ? { ...w, length } : w,
        ),
      },
    }))
  },

  addElement(wallId, element) {
    const newElement: WallElement = { ...element, id: nanoid() }
    set((state) => ({
      isDirty: true,
      geometry: {
        walls: state.geometry.walls.map((w) =>
          w.id === wallId
            ? { ...w, elements: [...w.elements, newElement] }
            : w,
        ),
      },
    }))
  },

  removeElement(wallId, elementId) {
    set((state) => ({
      isDirty: true,
      geometry: {
        walls: state.geometry.walls.map((w) =>
          w.id === wallId
            ? { ...w, elements: w.elements.filter((e) => e.id !== elementId) }
            : w,
        ),
      },
    }))
  },

  applySurface(wallId, materialId) {
    set((state) => ({
      isDirty: true,
      surfaces: { ...state.surfaces, [wallId]: materialId },
    }))
  },

  placeFurniture(item) {
    set((state) => ({
      isDirty: true,
      furniture: [...state.furniture, item],
    }))
  },

  moveFurniture(id, x, y, rotation) {
    set((state) => ({
      isDirty: true,
      furniture: state.furniture.map((f) =>
        f.id === id ? { ...f, x, y, rotation } : f,
      ),
    }))
  },

  removeFurniture(id) {
    set((state) => ({
      isDirty: true,
      furniture: state.furniture.filter((f) => f.id !== id),
    }))
  },

  loadRoom(room) {
    set({
      roomId: room.id ?? null,
      apartmentId: room.apartment_id ?? null,
      name: room.name ?? 'Xona',
      ceilingHeight: room.ceiling_height ?? 2700,
      geometry: room.geometry ?? defaultGeometry(),
      surfaces: room.surfaces ?? {},
      furniture: room.furniture ?? [],
      isDirty: false,
    })
  },

  setRoomId(id) {
    set({ roomId: id })
  },

  markSaved() {
    set({ isDirty: false })
  },

  setWizardStep(step) {
    set({ wizardStep: step })
  },

  setDesignState(patch) {
    set((state) => ({ designState: { ...state.designState, ...patch } }))
  },

  setWallCovering(wallId, covering) {
    set((state) => ({
      designState: {
        ...state.designState,
        wallCoverings: { ...state.designState.wallCoverings, [wallId]: covering },
      },
    }))
  },

  resetRoom() {
    set({
      roomId: null,
      apartmentId: null,
      name: 'Xona',
      ceilingHeight: 2700,
      geometry: defaultGeometry(),
      surfaces: {},
      furniture: [],
      isDirty: false,
      wizardStep: 0,
      designState: DEFAULT_DESIGN_STATE,
    })
  },
}),
    {
      name: 'uytamir-room-draft',
      version: 2,
      migrate(persisted: unknown, version: number) {
        if (version < 2) {
          const old = persisted as { designState?: { wallColor?: string; floorType?: string } }
          const wallColor = old?.designState?.wallColor ?? '#F5F0E8'
          const floorType = (old?.designState?.floorType ?? 'parquet') as FloorType
          return {
            ...(old as object),
            designState: {
              wallCoverings: { ALL: { kind: 'paint' as const, color: wallColor } },
              floorType,
            } satisfies DesignState,
          }
        }
        return persisted
      },
      partialize: (state) => ({
        ceilingHeight: state.ceilingHeight,
        geometry: state.geometry,
        surfaces: state.surfaces,
        furniture: state.furniture,
        isDirty: state.isDirty,
        wizardStep: state.wizardStep,
        designState: state.designState,
      }),
    },
  ),
)

// ─── Pure derived metric functions ───────────────────────────────────────────

/**
 * Floor area in mm² — multiply A×B (opposite wall pair averages).
 * Assumes a rectangular room where A/C are parallel and B/D are parallel.
 */
export function computeFloorArea(geometry: RoomGeometry): number {
  const wallA = geometry.walls.find((w) => w.id === 'A')
  const wallB = geometry.walls.find((w) => w.id === 'B')
  if (!wallA || !wallB) return 0
  const wallC = geometry.walls.find((w) => w.id === 'C')
  const wallD = geometry.walls.find((w) => w.id === 'D')
  const lenAC = ((wallA.length + (wallC?.length ?? wallA.length)) / 2)
  const lenBD = ((wallB.length + (wallD?.length ?? wallB.length)) / 2)
  return lenAC * lenBD // mm²
}

/** Perimeter in mm. */
export function computePerimeter(geometry: RoomGeometry): number {
  return geometry.walls.reduce((sum, w) => sum + w.length, 0)
}

/**
 * Net wall area in mm² — gross wall area minus opening areas.
 * @param ceilingH ceiling height in mm
 */
export function computeNetWallArea(
  geometry: RoomGeometry,
  ceilingH: number,
): number {
  return geometry.walls.reduce((sum, wall) => {
    const gross = wall.length * ceilingH
    const openings = wall.elements.reduce(
      (s, el) => s + el.width * el.height,
      0,
    )
    return sum + Math.max(0, gross - openings)
  }, 0)
}

/** Total count of all wall openings across every wall. */
export function computeOpeningsCount(geometry: RoomGeometry): number {
  return geometry.walls.reduce((sum, w) => sum + w.elements.length, 0)
}
