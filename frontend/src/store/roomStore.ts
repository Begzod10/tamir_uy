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
  id: string
  length: number
  elements: WallElement[]
}

export interface RoomGeometry {
  walls: Wall[]
  /** Polygon vertices [x, z] in mm, counter-clockwise. Auto-populated for 4-wall rooms. */
  vertices?: [number, number][]
}

export type AppliedSurfaces = Record<string, string>

export type ElectricalType = 'switch1' | 'switch2' | 'socket1' | 'socket2' | 'socket_media' | 'panel'

export interface PlacedElectrical {
  id: string
  type: ElectricalType
  wallId: string
  positionMm: number
  heightMm: number
}

export interface PlacedLight {
  id: string
  xMm: number  // from left wall
  zMm: number  // from back wall
}

export interface PlacedFurniture {
  id: string
  furniture_id: string
  x: number
  y: number
  rotation: number
  /** Uniform scale multiplier (1.0 = catalog default size). */
  scaleOverride?: number
  /** Per-material color tints (material name → hex). '*' = wildcard for all materials. */
  colorOverrides?: Record<string, string>
}

export interface UserFurnitureEntry {
  id: string
  name: string
  emoji: string
  blobId: string
  modelPath: string  // blob URL — restored from IndexedDB on startup
  scale: number
  sizeM: { w: number; d: number; h: number }
  hasTextures: boolean
}

export type FloorType = 'parquet' | 'tile' | 'laminate' | 'concrete'

export type WallCovering =
  | { kind: 'paint'; color: string }
  | { kind: 'oboy'; patternId: string; baseColor: string; accentColor: string }
  | { kind: 'texture'; url: string; color: string; repeatX: number; repeatY: number; offsetX: number; offsetY: number; rotation: number }

export interface WallPanelSettings {
  enabled: boolean
  width: number    // mm
  height: number   // mm
  depth: number    // mm
  rotation: number // 0 = vertical (portrait), 90 = horizontal (landscape)
  gap: number      // mm between panels
  chamfer: number  // mm edge bevel radius (0 = sharp)
  color: string    // hex
}

export interface DesignState {
  wallCoverings: { ALL: WallCovering } & Partial<Record<string, WallCovering>>
  floorType: FloorType
  wallPanels?: Partial<Record<string, WallPanelSettings>>
  floorTexture?: string | null
}

/** Resolve the effective WallCovering for a given wall (falls back to ALL). */
export function resolveWallCovering(
  coverings: DesignState['wallCoverings'],
  wallId?: string,
): WallCovering {
  return (wallId ? coverings[wallId] : undefined) ?? coverings.ALL
}

/** Resolve the effective WallPanelSettings for a given wall (falls back to ALL). */
export function resolveWallPanel(
  panels: DesignState['wallPanels'],
  wallId?: string,
): WallPanelSettings | undefined {
  if (!panels) return undefined
  return (wallId ? panels[wallId] : undefined) ?? panels.ALL
}

/** Resolve just the paint color (or baseColor for oboy) for a wall. */
export function resolveWallColor(
  coverings: DesignState['wallCoverings'],
  wallId?: string,
): string {
  const c = resolveWallCovering(coverings, wallId)
  return c.kind === 'paint' ? c.color : c.kind === 'texture' ? c.color : c.baseColor
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
  draftId: string | null
  roomId: string | null
  apartmentId: string | null
  name: string
  ceilingHeight: number
  geometry: RoomGeometry
  surfaces: AppliedSurfaces
  furniture: PlacedFurniture[]
  electricals: PlacedElectrical[]
  lights: PlacedLight[]
  userFurniture: UserFurnitureEntry[]
  isDirty: boolean
  wizardStep: number
  designState: DesignState
  highQuality3d: boolean

  // Actions
  setDraftId(id: string | null): void
  setCeilingHeight(h: number): void
  setWallLength(wallId: string, length: number): void
  addElement(wallId: string, element: Omit<WallElement, 'id'>): void
  removeElement(wallId: string, elementId: string): void
  updateElement(wallId: string, elementId: string, patch: Partial<Omit<WallElement, 'id'>>): void
  swapElements(wallId: string): void
  swapAdjacentElements(wallId: string, id1: string, id2: string): void
  applySurface(wallId: string, materialId: string): void
  placeFurniture(item: PlacedFurniture): void
  moveFurniture(id: string, x: number, y: number, rotation: number): void
  resizeFurniture(id: string, scaleOverride: number): void
  removeFurniture(id: string): void
  setFurnitureColors(id: string, overrides: Record<string, string>): void
  addElectrical(e: PlacedElectrical): void
  moveElectrical(id: string, positionMm: number): void
  removeElectrical(id: string): void
  addLight(l: PlacedLight): void
  moveLight(id: string, xMm: number, zMm: number): void
  removeLight(id: string): void
  clearLights(): void
  addUserFurniture(entry: UserFurnitureEntry): void
  removeUserFurniture(id: string): void
  setUserFurniturePath(id: string, path: string): void
  loadRoom(room: RoomPayload): void
  loadDraftState(state: Record<string, unknown>): void
  setRoomId(id: string): void
  markSaved(): void
  setWizardStep(step: number): void
  setDesignState(patch: Partial<DesignState>): void
  setFloorTexture(url: string | null): void
  setWallCovering(wallId: string, covering: WallCovering): void
  setWallPanel(wallId: string, settings: WallPanelSettings): void
  setHighQuality3d(v: boolean): void
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
  draftId: null,
  roomId: null,
  apartmentId: null,
  name: 'Xona',
  ceilingHeight: 2700,
  geometry: defaultGeometry(),
  surfaces: {},
  furniture: [],
  electricals: [],
  lights: [],
  userFurniture: [],
  isDirty: false,
  wizardStep: 0,
  designState: DEFAULT_DESIGN_STATE,
  // Auto-detect mobile: no fine pointer = touch device → default off
  highQuality3d: typeof window !== 'undefined' && window.matchMedia('(pointer:fine)').matches,

  setDraftId(id) {
    set({ draftId: id })
  },

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

  updateElement(wallId, elementId, patch) {
    set((state) => ({
      isDirty: true,
      geometry: {
        walls: state.geometry.walls.map((w) =>
          w.id === wallId
            ? { ...w, elements: w.elements.map((e) => e.id === elementId ? { ...e, ...patch } : e) }
            : w,
        ),
      },
    }))
  },

  swapElements(wallId) {
    set((state) => ({
      isDirty: true,
      geometry: {
        walls: state.geometry.walls.map((w) =>
          w.id === wallId
            ? { ...w, elements: [...w.elements].reverse().map(e => ({ ...e, position: 0 })) }
            : w,
        ),
      },
    }))
  },

  swapAdjacentElements(wallId, id1, id2) {
    set((state) => ({
      isDirty: true,
      geometry: {
        walls: state.geometry.walls.map((w) => {
          if (w.id !== wallId) return w;
          const idx1 = w.elements.findIndex((e) => e.id === id1);
          const idx2 = w.elements.findIndex((e) => e.id === id2);
          if (idx1 === -1 || idx2 === -1) return w;
          const el1 = w.elements[idx1];
          const el2 = w.elements[idx2];
          const newElements = [...w.elements];
          if (el1.position > 0 && el2.position > 0) {
            // Both explicitly placed — swap their positions, leave everything else
            newElements[idx1] = { ...el1, position: el2.position };
            newElements[idx2] = { ...el2, position: el1.position };
          } else {
            // Auto-placed — swap the elements in the array so resolveElementPositions
            // lays them out in the new order; reset both positions to trigger re-layout
            newElements[idx1] = { ...el2, position: 0 };
            newElements[idx2] = { ...el1, position: 0 };
          }
          return { ...w, elements: newElements };
        }),
      },
    }));
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

  resizeFurniture(id, scaleOverride) {
    set((state) => ({
      isDirty: true,
      furniture: state.furniture.map((f) =>
        f.id === id ? { ...f, scaleOverride } : f,
      ),
    }))
  },

  removeFurniture(id) {
    set((state) => ({
      isDirty: true,
      furniture: state.furniture.filter((f) => f.id !== id),
    }))
  },

  setFurnitureColors(id, overrides) {
    set((state) => ({
      isDirty: true,
      furniture: state.furniture.map((f) =>
        f.id === id ? { ...f, colorOverrides: overrides } : f,
      ),
    }))
  },

  addElectrical(e) {
    set((state) => ({ electricals: [...state.electricals, e], isDirty: true }))
  },
  moveElectrical(id, positionMm) {
    set((state) => ({
      electricals: state.electricals.map(e => e.id === id ? { ...e, positionMm } : e),
      isDirty: true,
    }))
  },
  removeElectrical(id) {
    set((state) => ({ electricals: state.electricals.filter((e) => e.id !== id), isDirty: true }))
  },
  addLight(l) {
    set((state) => ({ lights: [...state.lights, l], isDirty: true }))
  },
  moveLight(id, xMm, zMm) {
    set((state) => ({
      lights: state.lights.map((l) => l.id === id ? { ...l, xMm, zMm } : l),
      isDirty: true,
    }))
  },
  removeLight(id) {
    set((state) => ({ lights: state.lights.filter((l) => l.id !== id), isDirty: true }))
  },
  clearLights() {
    set({ lights: [], isDirty: true })
  },

  addUserFurniture(entry) {
    set((state) => ({ userFurniture: [...state.userFurniture, entry] }))
  },

  removeUserFurniture(id) {
    set((state) => ({ userFurniture: state.userFurniture.filter((f) => f.id !== id) }))
  },

  setUserFurniturePath(id, path) {
    set((state) => ({
      userFurniture: state.userFurniture.map((f) => f.id === id ? { ...f, modelPath: path } : f),
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

  loadDraftState(state) {
    const s = state as {
      ceilingHeight?: number
      geometry?: RoomGeometry
      wizardStep?: number
      designState?: DesignState
      name?: string
      roomId?: string
      furniture?: PlacedFurniture[]
      electricals?: PlacedElectrical[]
      lights?: PlacedLight[]
      userFurniture?: UserFurnitureEntry[]
    }
    set({
      ceilingHeight: s.ceilingHeight ?? 2700,
      geometry: s.geometry ?? defaultGeometry(),
      wizardStep: s.wizardStep ?? 0,
      designState: s.designState ?? DEFAULT_DESIGN_STATE,
      name: s.name ?? 'Xona',
      roomId: s.roomId ?? null,
      furniture: s.furniture ?? [],
      electricals: s.electricals ?? [],
      lights: s.lights ?? [],
      userFurniture: s.userFurniture ?? [],
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

  setFloorTexture(url) {
    set((state) => ({ designState: { ...state.designState, floorTexture: url }, isDirty: true }))
  },

  setWallCovering(wallId, covering) {
    set((state) => ({
      designState: {
        ...state.designState,
        // Setting ALL clears per-wall overrides so it genuinely applies everywhere
        wallCoverings: wallId === 'ALL'
          ? { ALL: covering }
          : { ...state.designState.wallCoverings, [wallId]: covering },
      },
    }))
  },

  setWallPanel(wallId, settings) {
    set((state) => ({
      designState: {
        ...state.designState,
        wallPanels: wallId === 'ALL'
          ? { ALL: settings }
          : { ...state.designState.wallPanels, [wallId]: settings },
      },
    }))
  },

  setHighQuality3d(v) {
    set({ highQuality3d: v })
  },

  resetRoom() {
    set({
      draftId: null,
      roomId: null,
      apartmentId: null,
      name: 'Xona',
      ceilingHeight: 2700,
      geometry: defaultGeometry(),
      surfaces: {},
      furniture: [],
      electricals: [],
      lights: [],
      userFurniture: [],
      isDirty: false,
      wizardStep: 0,
      designState: DEFAULT_DESIGN_STATE,
    })
  },
}),
    {
      name: 'uytamir-room-draft',
      version: 3,
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
        // v2→v3: no-op (vertices is optional, AppliedSurfaces is backward-compatible)
        return persisted
      },
      // Persist local state so HMR / refreshes don't lose unsaved work.
      // DB draft is still written on every change as the reliable cross-device backup.
      partialize: (state) => ({
        draftId: state.draftId,
        geometry: state.geometry,
        ceilingHeight: state.ceilingHeight,
        designState: state.designState,
        wizardStep: state.wizardStep,
        name: state.name,
        furniture: state.furniture,
        electricals: state.electricals,
        lights: state.lights,
        // Persist metadata but clear modelPath (blob URLs don't survive refresh)
        userFurniture: state.userFurniture.map((f) => ({ ...f, modelPath: '' })),
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
  if (geometry.vertices && geometry.vertices.length >= 3) {
    // Shoelace formula — vertices in mm
    const verts = geometry.vertices
    const n = verts.length
    let area = 0
    for (let i = 0; i < n; i++) {
      const [x1, y1] = verts[i]
      const [x2, y2] = verts[(i + 1) % n]
      area += x1 * y2 - x2 * y1
    }
    return Math.abs(area) / 2  // mm²
  }
  // Legacy rectangle fallback
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
