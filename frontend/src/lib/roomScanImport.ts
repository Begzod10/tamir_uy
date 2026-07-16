/**
 * Types emitted by the native RoomPlan scanner and helpers to convert them
 * into the Zustand store's RoomGeometry.
 *
 * All distances in ScannedRoom are in **metres** (as RoomPlan produces them).
 * The store uses **millimetres**, so every value is ×1000 on the way in.
 */

import { nanoid } from 'nanoid'
import type { RoomGeometry, Wall, WallElement } from '@/store/roomStore'

// ─── Native scanner output types ─────────────────────────────────────────────

export interface ScannedOpening {
  type: 'eshik' | 'deraza' | 'balkon'
  /** Distance from the START vertex of this wall to the left edge of the opening, metres. */
  offsetM: number
  widthM: number
  heightM: number
  /** Floor-to-sill distance, metres. 0 for doors. */
  sillM: number
}

export interface ScannedWall {
  /** World-space floor-plane coordinates of the wall's two endpoints, metres. */
  startX: number
  startZ: number
  endX: number
  endZ: number
  heightM: number
  openings: ScannedOpening[]
}

export interface ScannedRoom {
  /** Ceiling height in metres. */
  ceilingHeight: number
  walls: ScannedWall[]
}

// ─── snapToFourWalls ─────────────────────────────────────────────────────────
/**
 * Snaps an arbitrary polygon of wall segments to an axis-aligned bounding rectangle
 * (walls A/B/C/D).  RoomPlan often returns 5-8 segments for a rectangular room because
 * it finds each stud-bay span separately; this collapses them to the 4 canonical sides.
 *
 * The function:
 *   1. Builds the bounding box of all wall endpoints.
 *   2. Classifies each raw wall segment to the nearest bounding edge (A/B/C/D).
 *   3. Re-projects every opening's world position onto its edge, measuring from the
 *      interior-left corner (the direction you see when standing inside facing the wall).
 *
 * Wall conventions (standing inside, looking at the wall):
 *   A – back  (z ≈ minZ) – runs left→right (increasing X)
 *   B – right (x ≈ maxX) – runs left→right (increasing Z)
 *   C – front (z ≈ maxZ) – runs left→right (decreasing X, i.e. rightmost X first)
 *   D – left  (x ≈ minX) – runs left→right (decreasing Z)
 */

const M_TO_MM = 1000

interface RectWall {
  id: 'A' | 'B' | 'C' | 'D'
  lengthMm: number
  openings: ScannedOpening[]   // offsetM measured from interior-left edge
}

export interface SnappedRect {
  widthMm: number   // length of walls A & C
  depthMm: number   // length of walls B & D
  ceilingMm: number
  rectWalls: RectWall[]
}

export function snapToFourWalls(room: ScannedRoom): SnappedRect {
  const xs = room.walls.flatMap(w => [w.startX, w.endX])
  const zs = room.walls.flatMap(w => [w.startZ, w.endZ])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)
  const widthM = maxX - minX
  const depthM = maxZ - minZ

  const classify = (mx: number, mz: number): 'A' | 'B' | 'C' | 'D' => {
    const dA = Math.abs(mz - minZ)
    const dC = Math.abs(mz - maxZ)
    const dB = Math.abs(mx - maxX)
    const dD = Math.abs(mx - minX)
    const m = Math.min(dA, dB, dC, dD)
    if (m === dA) return 'A'
    if (m === dC) return 'C'
    if (m === dB) return 'B'
    return 'D'
  }

  const grouped: Record<'A' | 'B' | 'C' | 'D', ScannedOpening[]> = { A: [], B: [], C: [], D: [] }

  for (const wall of room.walls) {
    const mx = (wall.startX + wall.endX) / 2
    const mz = (wall.startZ + wall.endZ) / 2
    const side = classify(mx, mz)

    const wallDirX = wall.endX - wall.startX
    const wallDirZ = wall.endZ - wall.startZ
    const wallLen = Math.sqrt(wallDirX ** 2 + wallDirZ ** 2)
    if (wallLen < 0.01) continue
    const unitX = wallDirX / wallLen
    const unitZ = wallDirZ / wallLen

    for (const op of wall.openings) {
      // World position of opening centre along the raw wall
      const centerAlong = op.offsetM + op.widthM / 2
      const ocX = wall.startX + unitX * centerAlong
      const ocZ = wall.startZ + unitZ * centerAlong

      // Convert to position from interior-left corner on the snapped rectangle
      let posM: number
      if (side === 'A') posM = ocX - minX - op.widthM / 2        // left = minX
      else if (side === 'B') posM = ocZ - minZ - op.widthM / 2   // left = minZ
      else if (side === 'C') posM = maxX - ocX - op.widthM / 2   // left = maxX
      else posM = maxZ - ocZ - op.widthM / 2                       // left = maxZ (D)

      grouped[side].push({ ...op, offsetM: Math.max(0, posM) })
    }
  }

  const rectWalls: RectWall[] = (
    [
      { id: 'A' as const, lengthM: widthM },
      { id: 'B' as const, lengthM: depthM },
      { id: 'C' as const, lengthM: widthM },
      { id: 'D' as const, lengthM: depthM },
    ]
  ).map(({ id, lengthM }) => ({
    id,
    lengthMm: Math.round(lengthM * M_TO_MM),
    openings: grouped[id],
  }))

  return {
    widthMm: Math.round(widthM * M_TO_MM),
    depthMm: Math.round(depthM * M_TO_MM),
    ceilingMm: Math.round(room.ceilingHeight * M_TO_MM),
    rectWalls,
  }
}

// ─── scanToStoreGeometry ─────────────────────────────────────────────────────
/**
 * Full pipeline: ScannedRoom (metres) → RoomGeometry (mm) ready for the Zustand store.
 *
 * Also returns the ceiling height in mm so callers can pass it to setCeilingHeight /
 * loadRoom independently.
 */
export function scanToStoreGeometry(room: ScannedRoom): { geometry: RoomGeometry; ceilingMm: number } {
  const { rectWalls, ceilingMm } = snapToFourWalls(room)

  const walls: Wall[] = rectWalls.map(rw => ({
    id: rw.id,
    length: rw.lengthMm,
    elements: rw.openings.map((op): WallElement => ({
      id: nanoid(),
      type: op.type,
      width: Math.round(op.widthM * M_TO_MM),
      height: Math.round(op.heightM * M_TO_MM),
      sill_height: Math.round(op.sillM * M_TO_MM),
      position: Math.round(op.offsetM * M_TO_MM),
    })),
  }))

  return { geometry: { walls }, ceilingMm }
}
