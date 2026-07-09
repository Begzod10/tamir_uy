import type { WallElement } from '@/store/roomStore'

const GAP_MM = 400

/**
 * Returns a new array of elements with their positions resolved.
 * - 1 element: centered on the wall.
 * - 2 elements: the pair is centered together with a 400mm gap between them.
 *   If both already have explicit (>0) positions they are kept as-is.
 * - 3+ elements: evenly distributed; explicit positions are kept.
 */
export function resolveElementPositions(
  elements: WallElement[],
  wallLenMm: number,
): WallElement[] {
  const n = elements.length
  if (n === 0) return elements

  if (n === 1) {
    const el = elements[0]
    if (el.position > 0) return elements
    return [{ ...el, position: Math.max(0, Math.round((wallLenMm - el.width) / 2)) }]
  }

  if (n === 2) {
    if (elements.every(e => e.position > 0)) return elements
    const totalGroup = elements[0].width + GAP_MM + elements[1].width
    const groupStart = Math.max(0, Math.round((wallLenMm - totalGroup) / 2))
    return [
      { ...elements[0], position: groupStart },
      { ...elements[1], position: groupStart + elements[0].width + GAP_MM },
    ]
  }

  // 3+ elements
  return elements.map((el, i) => ({
    ...el,
    position: el.position > 0
      ? el.position
      : Math.round((wallLenMm / (n + 1)) * (i + 1) - el.width / 2),
  }))
}
