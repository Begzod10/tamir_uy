import type { RoomGeometry, DesignState, WallCovering } from '@/store/roomStore'

const ROLL_WIDTH_M = 1.06
const ROLL_LENGTH_M = 10
const ROLL_AREA_M2 = ROLL_WIDTH_M * ROLL_LENGTH_M // 10.6 m²

const WASTE_FACTORS: Record<string, number> = {
  tekstura:  1.05,
  yolli:     1.10,
  damask:    1.15,
  geometrik: 1.15,
  gul:       1.15,
  bolalar:   1.15,
}

export interface PerWallResult {
  wallId: 'A' | 'B' | 'C' | 'D'
  areaM2: number
  rolls: number
  covering: WallCovering
}

export interface OboySmeta {
  totalRolls: number
  totalAreaM2: number
  perWall: PerWallResult[]
}

export function computeOboyRolls(
  geometry: RoomGeometry,
  coverings: DesignState['wallCoverings'],
  ceilingHeightMm: number,
): OboySmeta {
  const perWall: PerWallResult[] = []
  let totalAreaM2 = 0
  let totalRolls = 0

  for (const wall of geometry.walls) {
    const covering = coverings[wall.id as 'A' | 'B' | 'C' | 'D'] ?? coverings.ALL
    if (covering.kind !== 'oboy') continue

    const wallWidthM = wall.length / 1000
    const wallHeightM = ceilingHeightMm / 1000
    const grossM2 = wallWidthM * wallHeightM

    const openingsM2 = wall.elements.reduce((sum, el) => {
      return sum + (el.width / 1000) * (el.height / 1000)
    }, 0)

    const netM2 = Math.max(0, grossM2 - openingsM2)
    const wasteFactor = WASTE_FACTORS[covering.patternId] ?? 1.10
    const areaWithWaste = netM2 * wasteFactor
    const rolls = Math.ceil(areaWithWaste / ROLL_AREA_M2)

    perWall.push({ wallId: wall.id as 'A' | 'B' | 'C' | 'D', areaM2: netM2, rolls, covering })
    totalAreaM2 += netM2
    totalRolls += rolls
  }

  return { totalRolls, totalAreaM2, perWall }
}
