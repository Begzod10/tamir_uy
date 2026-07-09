import type { RoomGeometry, WallElement } from '@/store/roomStore'
import { resolveElementPositions } from '@/lib/wallPositions'

// ─── Types ────────────────────────────────────────────────────────────────────

interface IsometricRoomPreviewProps {
  geometry: RoomGeometry
  ceilingHeight: number
  activeWall: 'A' | 'B' | 'C' | 'D' | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COS30 = Math.cos(Math.PI / 6)
const SIN30 = Math.sin(Math.PI / 6)
const SCALE = 0.044           // SVG units per mm
const PARAPET_MM = 300        // 0.3 m parapet for walls C & D
const COLOR_ACTIVE = '#D85A30'
const COLOR_DONE = '#1D9E75'
const COLOR_IDLE = '#CBD5E1'
const COLOR_FLOOR = '#E2E8F0'
const COLOR_BLUEPRINT = '#185FA5'
const COLOR_ELEMENT = '#94A3B8'

// ─── Projection helpers ───────────────────────────────────────────────────────

/** Convert 3-D room coordinates (mm) to SVG 2-D screen coordinates. */
function iso(x: number, y: number, z: number): [number, number] {
  return [
    (x - y) * COS30 * SCALE,
    (x + y) * SIN30 * SCALE - z * SCALE,
  ]
}

function pts(coords: [number, number][]): string {
  return coords.map(([x, y]) => `${x},${y}`).join(' ')
}

// ─── Wall face polygon ────────────────────────────────────────────────────────

interface WallFaceProps {
  wx0: number
  wy0: number
  wx1: number
  wy1: number
  height: number
  parapetOnly?: boolean
  fill: string
  stroke: string
  active?: boolean
}

function WallFace({
  wx0, wy0, wx1, wy1, height, parapetOnly = false, fill, stroke, active = false,
}: WallFaceProps) {
  const h = parapetOnly ? PARAPET_MM : height
  const bl = iso(wx0, wy0, 0)
  const br = iso(wx1, wy1, 0)
  const tr = iso(wx1, wy1, h)
  const tl = iso(wx0, wy0, h)

  return (
    <polygon
      points={pts([bl, br, tr, tl])}
      fill={fill}
      fillOpacity={0.35}
      stroke={stroke}
      strokeWidth={1.2}
    >
      {active && (
        <animate
          attributeName="fill-opacity"
          values="0.35;0.7;0.35"
          dur="1.4s"
          repeatCount="indefinite"
        />
      )}
    </polygon>
  )
}

// ─── Element on wall face ─────────────────────────────────────────────────────

interface WallElementShapeProps {
  element: WallElement
  wallAxis: 'x' | 'y'      // 'x' → Wall A/C, 'y' → Wall B/D
  wallFixed: number         // fixed coordinate value (e.g. y=0 for Wall A)
}

function WallElementShape({ element, wallAxis, wallFixed }: WallElementShapeProps) {
  const pos = element.position
  const sill = element.sill_height

  function corner(along: number, up: number): [number, number] {
    if (wallAxis === 'x') {
      return iso(along, wallFixed, up)
    }
    return iso(wallFixed, along, up)
  }

  const bl = corner(pos, sill)
  const br = corner(pos + element.width, sill)
  const tr = corner(pos + element.width, sill + element.height)
  const tl = corner(pos, sill + element.height)

  const isWindow = element.type === 'deraza'
  const midL = corner(pos, sill + element.height / 2)
  const midR = corner(pos + element.width, sill + element.height / 2)

  return (
    <g>
      <polygon
        points={pts([bl, br, tr, tl])}
        fill={isWindow ? '#BAE6FD' : '#F8FAFC'}
        fillOpacity={0.85}
        stroke={COLOR_ELEMENT}
        strokeWidth={1}
      />
      {/* Window horizontal divider */}
      {isWindow && (
        <line
          x1={midL[0]} y1={midL[1]}
          x2={midR[0]} y2={midR[1]}
          stroke={COLOR_ELEMENT}
          strokeWidth={0.8}
        />
      )}
      {/* Door arch suggestion */}
      {element.type === 'eshik' && (
        <polyline
          points={pts([tl, tr])}
          fill="none"
          stroke="#D85A30"
          strokeWidth={1}
          strokeDasharray="2 2"
        />
      )}
    </g>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function IsometricRoomPreview({
  geometry,
  ceilingHeight,
  activeWall,
}: IsometricRoomPreviewProps) {
  const wallA = geometry.walls.find((w) => w.id === 'A')
  const wallB = geometry.walls.find((w) => w.id === 'B')

  const lenA = wallA?.length ?? 4000
  const lenB = wallB?.length ?? 3000
  const h = ceilingHeight

  // ── compute viewBox by projecting all corner points ──
  const allPoints: [number, number][] = [
    iso(0, 0, 0),
    iso(lenA, 0, 0),
    iso(lenA, lenB, 0),
    iso(0, lenB, 0),
    iso(0, 0, h),
    iso(lenA, 0, h),
    iso(lenA, lenB, h),
    iso(0, lenB, h),
  ]
  const xs = allPoints.map(([x]) => x)
  const ys = allPoints.map(([, y]) => y)
  const PAD = 8
  const minX = Math.min(...xs) - PAD
  const minY = Math.min(...ys) - PAD
  const width = Math.max(...xs) - minX + PAD
  const height = Math.max(...ys) - minY + PAD

  function wallFill(id: 'A' | 'B' | 'C' | 'D'): string {
    const wall = geometry.walls.find((w) => w.id === id)
    if (id === activeWall) return COLOR_ACTIVE
    if (wall && wall.length > 0) return COLOR_DONE
    return COLOR_IDLE
  }

  function wallStroke(id: 'A' | 'B' | 'C' | 'D'): string {
    if (id === activeWall) return COLOR_ACTIVE
    return '#94A3B8'
  }

  // Floor parallelogram corners
  const fl0 = iso(0, 0, 0)
  const fl1 = iso(lenA, 0, 0)
  const fl2 = iso(lenA, lenB, 0)
  const fl3 = iso(0, lenB, 0)

  // Ceiling outline corners
  const cl0 = iso(0, 0, h)
  const cl1 = iso(lenA, 0, h)
  const cl2 = iso(lenA, lenB, h)
  const cl3 = iso(0, lenB, h)

  return (
    <svg
      viewBox={`${minX} ${minY} ${width} ${height}`}
      width="100%"
      style={{ maxHeight: 300, display: 'block' }}
      aria-label="Xona izometrik ko'rinishi"
    >
      {/* Floor */}
      <polygon
        points={pts([fl0, fl1, fl2, fl3])}
        fill={COLOR_FLOOR}
        stroke="#94A3B8"
        strokeWidth={0.8}
      />

      {/* Wall D parapet (x=0) — back-left */}
      <WallFace
        wx0={0} wy0={lenB} wx1={0} wy1={0}
        height={h}
        parapetOnly
        fill={wallFill('D')}
        stroke={wallStroke('D')}
        active={activeWall === 'D'}
      />

      {/* Wall C parapet (y=lenB) — back-right */}
      <WallFace
        wx0={lenA} wy0={lenB} wx1={0} wy1={lenB}
        height={h}
        parapetOnly
        fill={wallFill('C')}
        stroke={wallStroke('C')}
        active={activeWall === 'C'}
      />

      {/* Wall B full face (x=lenA) — right */}
      <WallFace
        wx0={lenA} wy0={0} wx1={lenA} wy1={lenB}
        height={h}
        fill={wallFill('B')}
        stroke={wallStroke('B')}
        active={activeWall === 'B'}
      />

      {/* Wall B elements */}
      {wallB && resolveElementPositions(wallB.elements, lenB).map((el) => (
        <WallElementShape key={el.id} element={el} wallAxis="y" wallFixed={lenA} />
      ))}

      {/* Wall A full face (y=0) — front */}
      <WallFace
        wx0={0} wy0={0} wx1={lenA} wy1={0}
        height={h}
        fill={wallFill('A')}
        stroke={wallStroke('A')}
        active={activeWall === 'A'}
      />

      {/* Wall A elements */}
      {wallA && resolveElementPositions(wallA.elements, lenA).map((el) => (
        <WallElementShape key={el.id} element={el} wallAxis="x" wallFixed={0} />
      ))}

      {/* Ceiling outline */}
      <polyline
        points={pts([cl0, cl1, cl2, cl3, cl0])}
        fill="none"
        stroke={COLOR_BLUEPRINT}
        strokeWidth={1}
        strokeDasharray="4 3"
        opacity={0.7}
      />
      {/* Ceiling verticals */}
      {[
        [cl0, iso(0, 0, 0)] as [[number,number],[number,number]],
        [cl1, iso(lenA, 0, 0)] as [[number,number],[number,number]],
      ].map(([top, bot], i) => (
        <line
          key={i}
          x1={top[0]} y1={top[1]}
          x2={bot[0]} y2={bot[1]}
          stroke={COLOR_BLUEPRINT}
          strokeWidth={0.8}
          strokeDasharray="3 3"
          opacity={0.5}
        />
      ))}

      {/* Wall labels */}
      {(['A', 'B', 'C', 'D'] as const).map((id) => {
        const labelPos: Record<string, [number, number]> = {
          A: iso(lenA / 2, 0, h / 2),
          B: iso(lenA, lenB / 2, h / 2),
          C: iso(lenA / 2, lenB, PARAPET_MM / 2),
          D: iso(0, lenB / 2, PARAPET_MM / 2),
        }
        const [lx, ly] = labelPos[id]
        return (
          <text
            key={id}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={6}
            fontWeight="bold"
            fill={id === activeWall ? COLOR_ACTIVE : '#64748B'}
            opacity={0.9}
          >
            {id}
          </text>
        )
      })}
    </svg>
  )
}
