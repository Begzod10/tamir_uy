import type { Wall, WallElement } from '@/store/roomStore'
import { resolveElementPositions } from '@/lib/wallPositions'

// ─── Types ────────────────────────────────────────────────────────────────────

interface WallElevationPreviewProps {
  wall: Wall
  ceilingHeight: number  // mm
  wallLabel: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TARGET_W = 280   // SVG target width in user units
const PAD_L = 28       // left padding (for ruler)
const PAD_R = 8
const PAD_T = 8
const PAD_B = 24       // bottom padding (ruler)
const RULER_TICK = 4
const SILHOUETTE_H_MM = 1700

// ─── Human silhouette ────────────────────────────────────────────────────────

function HumanSilhouette({ x, floorY, scale }: { x: number; floorY: number; scale: number }) {
  const h = SILHOUETTE_H_MM * scale
  const cx = x
  const headR = h * 0.08
  const bodyW = h * 0.14
  const bodyH = h * 0.38
  const legH = h * 0.42
  const armH = h * 0.30

  const headCY = floorY - legH - bodyH - headR
  const bodyTop = floorY - legH - bodyH
  const bodyBot = floorY - legH
  const shoulderY = bodyTop + h * 0.05

  return (
    <g fill="#94A3B8" opacity={0.6} aria-hidden="true">
      {/* Head */}
      <circle cx={cx} cy={headCY} r={headR} />
      {/* Body */}
      <rect
        x={cx - bodyW / 2}
        y={bodyTop}
        width={bodyW}
        height={bodyH}
        rx={bodyW * 0.2}
      />
      {/* Left leg */}
      <rect
        x={cx - bodyW / 2}
        y={bodyBot}
        width={bodyW * 0.4}
        height={legH}
        rx={2}
      />
      {/* Right leg */}
      <rect
        x={cx + bodyW * 0.1}
        y={bodyBot}
        width={bodyW * 0.4}
        height={legH}
        rx={2}
      />
      {/* Left arm */}
      <rect
        x={cx - bodyW / 2 - bodyW * 0.35}
        y={shoulderY}
        width={bodyW * 0.3}
        height={armH}
        rx={2}
      />
      {/* Right arm */}
      <rect
        x={cx + bodyW / 2 + bodyW * 0.05}
        y={shoulderY}
        width={bodyW * 0.3}
        height={armH}
        rx={2}
      />
    </g>
  )
}

// ─── Element shape ────────────────────────────────────────────────────────────

function ElementShape({
  element,
  floorY,
  scale,
}: {
  element: WallElement
  floorY: number
  scale: number
}) {
  const x = PAD_L + element.position * scale
  const y = floorY - (element.sill_height + element.height) * scale
  const w = element.width * scale
  const h = element.height * scale
  const sillY = floorY - element.sill_height * scale

  const isWindow = element.type === 'deraza'
  const isBalkon = element.type === 'balkon'

  const fillColor = isWindow ? '#BAE6FD' : isBalkon ? '#BBF7D0' : '#FEF9C3'
  const strokeColor = isWindow ? '#38BDF8' : isBalkon ? '#34D399' : '#FBBF24'

  return (
    <g>
      {/* Sill line */}
      {element.sill_height > 0 && (
        <line
          x1={x}
          y1={sillY}
          x2={x + w}
          y2={sillY}
          stroke={strokeColor}
          strokeWidth={1}
          strokeDasharray="3 2"
          opacity={0.6}
        />
      )}
      {/* Opening rectangle */}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={fillColor}
        fillOpacity={0.6}
        stroke={strokeColor}
        strokeWidth={1.2}
        rx={element.type === 'eshik' ? 0 : 2}
      />
      {/* Window horizontal divider */}
      {isWindow && (
        <line
          x1={x}
          y1={y + h / 2}
          x2={x + w}
          y2={y + h / 2}
          stroke={strokeColor}
          strokeWidth={0.8}
        />
      )}
      {/* Door arch */}
      {element.type === 'eshik' && (
        <path
          d={`M ${x} ${y} Q ${x + w / 2} ${y - w / 3} ${x + w} ${y}`}
          fill="none"
          stroke={strokeColor}
          strokeWidth={1}
        />
      )}
      {/* Label */}
      <text
        x={x + w / 2}
        y={y - 4}
        textAnchor="middle"
        fontSize={7}
        fill="#64748B"
      >
        {(element.width / 1000).toFixed(2)}×{(element.height / 1000).toFixed(2)}m
      </text>
    </g>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function WallElevationPreview({ wall, ceilingHeight, wallLabel }: WallElevationPreviewProps) {
  const wallLenMm = wall.length > 0 ? wall.length : 4000
  const ceilMm = ceilingHeight > 0 ? ceilingHeight : 2700

  // Scale: fit wall width into TARGET_W user units
  const drawW = TARGET_W - PAD_L - PAD_R
  const scale = drawW / wallLenMm  // user units per mm

  const drawH = ceilMm * scale
  const totalH = drawH + PAD_T + PAD_B

  const floorY = PAD_T + drawH  // y-coordinate of floor line

  // Ruler increment: every 500mm
  const tickStep = 500
  const numTicks = Math.floor(wallLenMm / tickStep)

  return (
    <svg
      viewBox={`0 0 ${TARGET_W} ${totalH}`}
      width="100%"
      style={{ maxHeight: 220, display: 'block' }}
      aria-label={`${wallLabel} devor ko'rinishi`}
    >
      {/* Wall rectangle */}
      <rect
        x={PAD_L}
        y={PAD_T}
        width={drawW}
        height={drawH}
        fill="#F1F5F9"
        stroke="#94A3B8"
        strokeWidth={1.5}
      />

      {/* Elements — resolve positions (center solo, group pair with 400mm gap) */}
      {resolveElementPositions(wall.elements, wallLenMm).map((el) => (
        <ElementShape
          key={el.id}
          element={el}
          floorY={floorY}
          scale={scale}
        />
      ))}

      {/* Human silhouette — positioned at 20% from left */}
      <HumanSilhouette
        x={PAD_L + wallLenMm * 0.2 * scale}
        floorY={floorY}
        scale={scale}
      />

      {/* Floor line */}
      <line
        x1={PAD_L}
        y1={floorY}
        x2={PAD_L + drawW}
        y2={floorY}
        stroke="#78716C"
        strokeWidth={2}
      />

      {/* Ceiling line */}
      <line
        x1={PAD_L}
        y1={PAD_T}
        x2={PAD_L + drawW}
        y2={PAD_T}
        stroke="#185FA5"
        strokeWidth={1}
        strokeDasharray="4 3"
      />

      {/* Height measurement */}
      <line
        x1={PAD_L - 6}
        y1={PAD_T}
        x2={PAD_L - 6}
        y2={floorY}
        stroke="#94A3B8"
        strokeWidth={0.8}
      />
      <text
        x={PAD_L - 9}
        y={(PAD_T + floorY) / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={7}
        fill="#64748B"
        transform={`rotate(-90, ${PAD_L - 9}, ${(PAD_T + floorY) / 2})`}
      >
        {(ceilMm / 1000).toFixed(1)}m
      </text>

      {/* Width measurement */}
      <line
        x1={PAD_L}
        y1={floorY + 8}
        x2={PAD_L + drawW}
        y2={floorY + 8}
        stroke="#94A3B8"
        strokeWidth={0.8}
      />
      <text
        x={PAD_L + drawW / 2}
        y={floorY + 16}
        textAnchor="middle"
        fontSize={7}
        fill="#64748B"
      >
        {(wallLenMm / 1000).toFixed(1)}m
      </text>

      {/* Scale ruler ticks */}
      {Array.from({ length: numTicks + 1 }).map((_, i) => {
        const rx = PAD_L + i * tickStep * scale
        const isMajor = i % 2 === 0
        return (
          <g key={i}>
            <line
              x1={rx}
              y1={floorY + PAD_B * 0.3}
              x2={rx}
              y2={floorY + PAD_B * 0.3 + (isMajor ? RULER_TICK : RULER_TICK * 0.6)}
              stroke="#94A3B8"
              strokeWidth={0.8}
            />
            {isMajor && (
              <text
                x={rx}
                y={floorY + PAD_B * 0.3 + RULER_TICK + 5}
                textAnchor="middle"
                fontSize={5.5}
                fill="#94A3B8"
              >
                {(i * tickStep) / 1000}
              </text>
            )}
          </g>
        )
      })}

      {/* Wall label */}
      <text
        x={PAD_L + drawW / 2}
        y={PAD_T - 2}
        textAnchor="middle"
        fontSize={9}
        fontWeight="bold"
        fill="#185FA5"
      >
        {wallLabel}
      </text>
    </svg>
  )
}
