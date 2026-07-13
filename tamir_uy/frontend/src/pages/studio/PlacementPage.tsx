import { Suspense, useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { nanoid } from 'nanoid'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'
import { useRoomStore } from '@/store/roomStore'
import type { ElectricalType, PlacedElectrical, PlacedLight, RoomGeometry, DesignState } from '@/store/roomStore'
import { resolveElementPositions } from '@/lib/wallPositions'
import { RoomScene } from './ThreeDPage'
import type { Room } from '@/lib/api'
import * as THREE from 'three'

interface StudioContext { room: Room }
type TabId = 'elektr' | 'chiroq' | 'olchamlar'
type WallId = 'A' | 'B' | 'C' | 'D'

// ─── Layout constants ─────────────────────────────────────────────────────────

const NAVY = '#1B3784'
const WIRE = '#DC2626'
const SCALE = 88        // SVG px per metre
const PAD   = 48        // padding around room

// ─── Device catalog ───────────────────────────────────────────────────────────

interface CatalogEntry { type: ElectricalType; label: string; height: number; oneTime?: boolean }

const CATALOG: CatalogEntry[] = [
  { type: 'panel',        label: 'Elektr qutisi',        height: 1500, oneTime: true },
  { type: 'switch1',      label: 'Bitta kalit',          height: 900 },
  { type: 'switch2',      label: 'Ikkita kalit',         height: 900 },
  { type: 'socket1',      label: 'Bitta rozetka',        height: 300 },
  { type: 'socket2',      label: 'Ikkita rozetka',       height: 300 },
  { type: 'socket_media', label: 'TV + Ethernet + Ant.', height: 1200 },
]

// ─── Sidebar SVG icons (navy blue, 44px tall) ─────────────────────────────────

function ElectricalIcon({ type }: { type: ElectricalType }) {
  const C = NAVY
  switch (type) {
    case 'panel':
      return (
        <svg width="44" height="56" viewBox="0 0 44 56">
          {/* Cabinet body */}
          <rect x="2" y="2" width="40" height="52" rx="3" fill="white" stroke={C} strokeWidth="2.2"/>
          {/* Door panel inset */}
          <rect x="6" y="6" width="32" height="40" rx="2" fill={C} fillOpacity="0.08" stroke={C} strokeWidth="1.2"/>
          {/* Circuit breakers — 3 rows of 2 */}
          {[0, 1, 2].map(row => [0, 1].map(col => (
            <rect key={`${row}-${col}`}
              x={9 + col * 14} y={10 + row * 12}
              width="10" height="8" rx="1.5"
              fill={C} fillOpacity={col === 0 ? 1 : 0.55}/>
          )))}
          {/* Ground rail */}
          <line x1="8" y1="46" x2="36" y2="46" stroke={C} strokeWidth="2" strokeLinecap="round"/>
          {/* Label */}
          <text x="22" y="54" textAnchor="middle" fontSize="7.5" fontFamily="sans-serif"
            fontWeight="700" fill={C} letterSpacing="0.3">ЩИТ</text>
        </svg>
      )
    case 'switch1':
      return (
        <svg width="36" height="44" viewBox="0 0 36 44">
          <rect x="1.5" y="1.5" width="33" height="41" rx="4" fill="white" stroke={C} strokeWidth="2"/>
          <rect x="6" y="6" width="24" height="16" rx="2.5" fill={C}/>
          <circle cx="18" cy="34" r="5" fill={C}/>
        </svg>
      )
    case 'switch2':
      return (
        <svg width="56" height="44" viewBox="0 0 56 44">
          <rect x="1.5" y="1.5" width="53" height="41" rx="4" fill="white" stroke={C} strokeWidth="2"/>
          <rect x="5" y="6" width="20" height="16" rx="2.5" fill={C}/>
          <rect x="31" y="6" width="20" height="16" rx="2.5" fill={C}/>
          <circle cx="15" cy="34" r="4" fill={C}/>
          <circle cx="41" cy="34" r="4" fill={C}/>
        </svg>
      )
    case 'socket1':
      return (
        <svg width="44" height="44" viewBox="0 0 44 44">
          <circle cx="22" cy="22" r="19.5" fill="white" stroke={C} strokeWidth="2"/>
          <rect x="17" y="11" width="4" height="10" rx="2" fill={C}/>
          <rect x="23" y="11" width="4" height="10" rx="2" fill={C}/>
          <circle cx="22" cy="32" r="3.5" fill={C}/>
        </svg>
      )
    case 'socket2':
      return (
        <svg width="72" height="44" viewBox="0 0 72 44">
          {([15, 57] as const).map(cx => (
            <g key={cx}>
              <circle cx={cx} cy="22" r="13.5" fill="white" stroke={C} strokeWidth="2"/>
              <rect x={cx - 5} y="13" width="3.5" height="7" rx="1.75" fill={C}/>
              <rect x={cx + 1.5} y="13" width="3.5" height="7" rx="1.75" fill={C}/>
              <circle cx={cx} cy="31" r="2.5" fill={C}/>
            </g>
          ))}
        </svg>
      )
    case 'socket_media':
      return (
        <svg width="100" height="44" viewBox="0 0 100 44">
          <rect x="1.5" y="1.5" width="97" height="41" rx="4" fill="white" stroke={C} strokeWidth="2"/>
          {/* TV */}
          <rect x="6" y="8" width="24" height="16" rx="2" fill="none" stroke={C} strokeWidth="1.5"/>
          <rect x="14" y="24" width="8" height="4" fill={C}/>
          <text x="18" y="19" fontSize="8" fill={C} textAnchor="middle" fontFamily="sans-serif" fontWeight="bold">TV</text>
          {/* Ethernet */}
          <rect x="38" y="9" width="22" height="14" rx="2" fill="none" stroke={C} strokeWidth="1.5"/>
          <line x1="41" y1="13" x2="57" y2="13" stroke={C} strokeWidth="1.2"/>
          <line x1="41" y1="16" x2="57" y2="16" stroke={C} strokeWidth="1.2"/>
          <line x1="41" y1="19" x2="57" y2="19" stroke={C} strokeWidth="1.2"/>
          <text x="49" y="34" fontSize="7" fill={C} textAnchor="middle" fontFamily="sans-serif">ETH</text>
          {/* Antenna coax */}
          <circle cx="82" cy="15" r="9" fill="none" stroke={C} strokeWidth="1.5"/>
          <circle cx="82" cy="15" r="3.5" fill={C}/>
          <text x="82" y="34" fontSize="7" fill={C} textAnchor="middle" fontFamily="sans-serif">ANT</text>
        </svg>
      )
  }
}

// ─── Floor-plan mini symbol (drawn on the SVG plan) ───────────────────────────

function MiniSymbol({ type, wallId }: { type: ElectricalType; wallId: WallId }) {
  // "Up" = pointing into room from that wall
  const rotMap: Record<WallId, number> = { A: 90, C: -90, D: 0, B: 180 }
  const rot = rotMap[wallId]
  const C = NAVY

  const inner = (() => {
    switch (type) {
      case 'panel':
        // Electrical panel: filled rectangle with internal grid lines
        return <>
          <rect x="-9" y="-12" width="18" height="16" rx="1.5" fill={C}/>
          <rect x="-7" y="-10" width="14" height="12" rx="1" fill="white" fillOpacity="0.18"/>
          <line x1="-7" y1="-5" x2="7" y2="-5" stroke="white" strokeWidth="1" opacity="0.6"/>
          <line x1="0" y1="-10" x2="0" y2="4" stroke="white" strokeWidth="1" opacity="0.6"/>
          <text y="10" textAnchor="middle" fontSize="5" fill={C} fontFamily="sans-serif" fontWeight="bold">ЩИТ</text>
        </>
      case 'switch1':
        return <>
          <circle r="5" fill={C}/>
          <line x1="0" y1="-5" x2="0" y2="-13" stroke={C} strokeWidth="1.8"/>
          <line x1="0" y1="-13" x2="7" y2="-13" stroke={C} strokeWidth="1.8"/>
        </>
      case 'switch2':
        return <>
          <circle r="5" fill={C}/>
          <line x1="0" y1="-5" x2="0" y2="-13" stroke={C} strokeWidth="1.8"/>
          <line x1="0" y1="-13" x2="6" y2="-13" stroke={C} strokeWidth="1.8"/>
          <line x1="0" y1="-13" x2="6" y2="-9" stroke={C} strokeWidth="1.8"/>
        </>
      case 'socket1':
        return <>
          <circle r="6" fill="none" stroke={C} strokeWidth="1.8"/>
          <line x1="-3" y1="-2" x2="-3" y2="-7" stroke={C} strokeWidth="1.5"/>
          <line x1="3" y1="-2" x2="3" y2="-7" stroke={C} strokeWidth="1.5"/>
        </>
      case 'socket2':
        return <>
          <circle cx="-5" r="5" fill="none" stroke={C} strokeWidth="1.5"/>
          <circle cx="5" r="5" fill="none" stroke={C} strokeWidth="1.5"/>
          <line x1="-7" y1="-1" x2="-7" y2="-5" stroke={C} strokeWidth="1.2"/>
          <line x1="-3" y1="-1" x2="-3" y2="-5" stroke={C} strokeWidth="1.2"/>
          <line x1="3" y1="-1" x2="3" y2="-5" stroke={C} strokeWidth="1.2"/>
          <line x1="7" y1="-1" x2="7" y2="-5" stroke={C} strokeWidth="1.2"/>
        </>
      case 'socket_media':
        return <>
          <rect x="-10" y="-7" width="20" height="12" rx="2" fill="none" stroke={C} strokeWidth="1.5"/>
          <text y="1" textAnchor="middle" dominantBaseline="middle" fontSize="5.5"
            fill={C} fontFamily="sans-serif" fontWeight="bold">M</text>
        </>
    }
  })()

  return <g transform={`rotate(${rot})`}>{inner}</g>
}

// ─── SVG coordinate helpers ────────────────────────────────────────────────────

function svgPt(svg: SVGSVGElement, e: React.MouseEvent): { x: number; y: number } {
  const pt = svg.createSVGPoint()
  pt.x = e.clientX
  pt.y = e.clientY
  const m = svg.getScreenCTM()
  if (!m) return { x: 0, y: 0 }
  const t = pt.matrixTransform(m.inverse())
  return { x: t.x, y: t.y }
}

function detectWall(
  x: number, y: number, W: number, D: number,
  thresh = 22,
): { wallId: WallId; positionMm: number; sx: number; sy: number } | null {
  const rW = W * SCALE
  const rD = D * SCALE
  const rx = x - PAD
  const ry = y - PAD

  const candidates = [
    { wallId: 'A' as WallId, dist: Math.abs(ry),      valid: rx >= 0 && rx <= rW, px: rx,  py: 0  },
    { wallId: 'C' as WallId, dist: Math.abs(ry - rD), valid: rx >= 0 && rx <= rW, px: rx,  py: rD },
    { wallId: 'D' as WallId, dist: Math.abs(rx),      valid: ry >= 0 && ry <= rD, px: 0,   py: ry },
    { wallId: 'B' as WallId, dist: Math.abs(rx - rW), valid: ry >= 0 && ry <= rD, px: rW,  py: ry },
  ].filter(c => c.valid && c.dist <= thresh).sort((a, b) => a.dist - b.dist)

  if (!candidates.length) return null
  const c = candidates[0]
  const lenM = (c.wallId === 'A' || c.wallId === 'C') ? W : D
  const rawM = (c.wallId === 'A' || c.wallId === 'C') ? rx / SCALE : ry / SCALE
  const posM = Math.max(0.1, Math.min(lenM - 0.1, rawM))
  return { wallId: c.wallId, positionMm: Math.round(posM * 1000), sx: PAD + c.px, sy: PAD + c.py }
}

function wallDeviceSvgPos(e: PlacedElectrical, W: number, D: number): { x: number; y: number } {
  const p = e.positionMm / 1000 * SCALE
  switch (e.wallId) {
    case 'A': return { x: PAD + p, y: PAD }
    case 'C': return { x: PAD + p, y: PAD + D * SCALE }
    case 'D': return { x: PAD,     y: PAD + p }
    case 'B': return { x: PAD + W * SCALE, y: PAD + p }
  }
}


// ─── Wire routing (wall-surface only) ────────────────────────────────────────

const WIRE_INSET = 5        // px inset from wall edge so wires are visible
const WIRE_PALETTE = ['#DC2626','#2563EB','#16A34A','#D97706','#7C3AED','#DB2777','#0891B2','#EA580C']

type WireConfig = { color: string; cw: boolean }

// Perimeter coordinate (metres, clockwise from AD/top-left corner)
//   Wall A (top):    0 → W         (left to right)
//   Wall B (right):  W → W+D       (top to bottom)
//   Wall C (bottom): W+D → 2W+D    (right to left)
//   Wall D (left):   2W+D → 2W+2D  (bottom to top)
function wirePerimCoord(wallId: WallId, posMm: number, W: number, D: number): number {
  const p = posMm / 1000
  switch (wallId) {
    case 'A': return p
    case 'B': return W + p
    case 'C': return 2*W + D - p
    case 'D': return 2*W + 2*D - p
  }
}

// Wall-surface SVG point with inward offset so wire is visible inside room
function perimToSvgPt(c: number, W: number, D: number): [number, number] {
  const perim = 2*(W+D)
  c = ((c % perim) + perim) % perim
  const rW = W*SCALE, rD = D*SCALE
  const WI = WIRE_INSET
  if (c <= W)     return [PAD + c*SCALE,             PAD + WI]
  if (c <= W+D)   return [PAD + rW - WI,             PAD + (c-W)*SCALE]
  if (c <= 2*W+D) return [PAD + (2*W+D-c)*SCALE,    PAD + rD - WI]
  return               [PAD + WI,                   PAD + (2*W+2*D-c)*SCALE]
}

// Corner point — intersection of two adjacent inset wall wires
function cornerInsetSvg(cornerCoord: number, W: number, D: number): [number, number] {
  const rW = W*SCALE, rD = D*SCALE, WI = WIRE_INSET
  const perim = 2*(W+D)
  const c = ((cornerCoord % perim) + perim) % perim
  if (c < 1e-4 || c > perim - 1e-4)     return [PAD + WI,       PAD + WI]      // AD
  if (Math.abs(c - W) < 1e-4)            return [PAD + rW - WI,  PAD + WI]      // AB
  if (Math.abs(c - (W+D)) < 1e-4)        return [PAD + rW - WI,  PAD + rD - WI] // CB
  if (Math.abs(c - (2*W+D)) < 1e-4)      return [PAD + WI,       PAD + rD - WI] // CD
  return perimToSvgPt(c, W, D)
}

// 3D wall-surface point at height h, 1.5 cm inward so the wire renders in front of the wall plane (avoids z-fighting)
const WIRE_OFS = 0.015
function perimTo3DPt(c: number, W: number, D: number, h: number): THREE.Vector3 {
  const perim = 2*(W+D)
  c = ((c % perim) + perim) % perim
  if (c <= W)     return new THREE.Vector3(c - W/2,           h, -D/2 + WIRE_OFS)
  if (c <= W+D)   return new THREE.Vector3(W/2 - WIRE_OFS,   h, (c-W) - D/2)
  if (c <= 2*W+D) return new THREE.Vector3((2*W+D-c) - W/2,  h, D/2 - WIRE_OFS)
  return               new THREE.Vector3(-W/2 + WIRE_OFS,    h, D/2 - (c - 2*W - D))
}

// Is the clockwise direction (increasing coord) the shorter route?
function shortestCW(devC: number, panC: number, W: number, D: number): boolean {
  const perim = 2*(W+D)
  return (panC - devC + perim) % perim <= perim / 2
}

// Corner coords encountered going CW from `from` to `to`
function cwCorners(from: number, to: number, W: number, D: number): number[] {
  const perim = 2*(W+D)
  const dist = (to - from + perim) % perim
  return [0, W, W+D, 2*W+D]
    .map(c => ({ c, d: (c - from + perim) % perim }))
    .filter(x => x.d > 1e-6 && x.d < dist - 1e-6)
    .sort((a, b) => a.d - b.d)
    .map(x => x.c)
}

// Corner coords encountered going CCW from `from` to `to`
function ccwCorners(from: number, to: number, W: number, D: number): number[] {
  const perim = 2*(W+D)
  const dist = (from - to + perim) % perim
  return [0, W, W+D, 2*W+D]
    .map(c => ({ c, d: (from - c + perim) % perim }))
    .filter(x => x.d > 1e-6 && x.d < dist - 1e-6)
    .sort((a, b) => a.d - b.d)
    .map(x => x.c)
}

// 2D wall-perimeter SVG waypoints for one wire
function routeSvgPts(dev: PlacedElectrical, panel: PlacedElectrical, W: number, D: number, cw: boolean): [number, number][] {
  const devC = wirePerimCoord(dev.wallId,   dev.positionMm,   W, D)
  const panC = wirePerimCoord(panel.wallId, panel.positionMm, W, D)
  const corners = cw ? cwCorners(devC, panC, W, D) : ccwCorners(devC, panC, W, D)
  return [
    perimToSvgPt(devC, W, D),
    ...corners.map(c => cornerInsetSvg(c, W, D)),
    perimToSvgPt(panC, W, D),
  ]
}

// 3D wall-surface waypoints: vertical up from device → horizontal at wire channel → vertical down to panel
// wireH is pre-computed by ElektrScene to sit above all opening tops in the room
function routeWire3D(dev: PlacedElectrical, panel: PlacedElectrical, W: number, D: number, wireH: number, cw: boolean): THREE.Vector3[] {
  const dim  = ELEC_DIMS_3D[dev.type]
  const pdim = ELEC_DIMS_3D[panel.type]
  const devH = dev.heightMm   / 1000 + dim.h  / 2
  const panH = panel.heightMm / 1000 + pdim.h / 2
  const devC = wirePerimCoord(dev.wallId,   dev.positionMm,   W, D)
  const panC = wirePerimCoord(panel.wallId, panel.positionMm, W, D)
  const corners = cw ? cwCorners(devC, panC, W, D) : ccwCorners(devC, panC, W, D)
  return [
    perimTo3DPt(devC, W, D, devH),
    perimTo3DPt(devC, W, D, wireH),
    ...corners.map(c => perimTo3DPt(c, W, D, wireH)),
    perimTo3DPt(panC, W, D, wireH),
    perimTo3DPt(panC, W, D, panH),
  ]
}

// ─── Wall openings (doors / windows) ─────────────────────────────────────────

const WALL_STROKE = 8   // must match strokeWidth on the wall rect

interface OpeningProps {
  W: number   // room width in metres
  D: number   // room depth in metres
}

function WallOpenings({ W, D }: OpeningProps) {
  const geometry = useRoomStore((s) => s.geometry)
  const rW = W * SCALE
  const rD = D * SCALE
  const hs = WALL_STROKE / 2   // half stroke — extends this far each side from wall centre

  const wallDefs: Array<{ id: string; axis: 'H' | 'V'; wallLenMm: number; svgBase: number; roomSide: 1 | -1 }> = [
    { id: 'A', axis: 'H', wallLenMm: W * 1000, svgBase: PAD,        roomSide:  1 },  // top, room below (+y)
    { id: 'C', axis: 'H', wallLenMm: W * 1000, svgBase: PAD + rD,   roomSide: -1 },  // bottom, room above (-y)
    { id: 'D', axis: 'V', wallLenMm: D * 1000, svgBase: PAD,        roomSide:  1 },  // left, room right (+x)
    { id: 'B', axis: 'V', wallLenMm: D * 1000, svgBase: PAD + rW,   roomSide: -1 },  // right, room left (-x)
  ]

  const els: React.ReactElement[] = []

  for (const wd of wallDefs) {
    const wall = geometry.walls.find(w => w.id === wd.id)
    if (!wall) continue

    const resolved = resolveElementPositions(wall.elements, wd.wallLenMm)
    const s = SCALE / 1000   // px per mm

    for (const el of resolved) {
      const p1 = el.position * s          // start px along wall
      const ew = el.width * s             // element width in px

      if (wd.axis === 'H') {
        const x1 = PAD + p1
        const x2 = x1 + ew
        const wy = wd.svgBase

        if (el.type === 'eshik') {
          // Door: white gap + hinge line + quarter-circle arc
          const arcR = ew
          const swingY = wy + arcR * wd.roomSide
          els.push(
            <g key={`${wd.id}-${el.id}`}>
              {/* White gap over wall stroke */}
              <rect x={x1} y={wy - hs} width={ew} height={WALL_STROKE}
                fill="#F9F7F4" stroke="none"/>
              {/* Hinge vertical line */}
              <line x1={x1} y1={wy - hs} x2={x1} y2={wy + hs * wd.roomSide * 3}
                stroke="#3A3020" strokeWidth="1.5"/>
              {/* Door leaf (shows at 90° open) */}
              <line x1={x1} y1={wy} x2={x1} y2={swingY}
                stroke="#3A3020" strokeWidth="1.2"/>
              {/* Arc */}
              <path
                d={`M ${x1} ${swingY} A ${arcR} ${arcR} 0 0 ${wd.roomSide > 0 ? 1 : 0} ${x2} ${wy}`}
                fill="none" stroke="#3A3020" strokeWidth="1" strokeDasharray="3 2"/>
            </g>
          )
        } else {
          // Window / balcony: white gap + glazing lines
          els.push(
            <g key={`${wd.id}-${el.id}`}>
              <rect x={x1} y={wy - hs} width={ew} height={WALL_STROKE}
                fill="#F9F7F4" stroke="none"/>
              {/* Outer frame lines */}
              <line x1={x1} y1={wy - hs} x2={x1} y2={wy + hs} stroke="#3A3020" strokeWidth="1.5"/>
              <line x1={x2} y1={wy - hs} x2={x2} y2={wy + hs} stroke="#3A3020" strokeWidth="1.5"/>
              {/* Glazing — three thin parallel lines */}
              <line x1={x1} y1={wy - 2.5} x2={x2} y2={wy - 2.5} stroke="#5090C0" strokeWidth="1.2" opacity="0.8"/>
              <line x1={x1} y1={wy}       x2={x2} y2={wy}       stroke="#5090C0" strokeWidth="1.2" opacity="0.8"/>
              <line x1={x1} y1={wy + 2.5} x2={x2} y2={wy + 2.5} stroke="#5090C0" strokeWidth="1.2" opacity="0.8"/>
            </g>
          )
        }
      } else {
        // Vertical wall (D or B)
        const y1 = PAD + p1
        const y2 = y1 + ew
        const wx = wd.svgBase

        if (el.type === 'eshik') {
          const arcR = ew
          const swingX = wx + arcR * wd.roomSide
          els.push(
            <g key={`${wd.id}-${el.id}`}>
              <rect x={wx - hs} y={y1} width={WALL_STROKE} height={ew}
                fill="#F9F7F4" stroke="none"/>
              <line x1={wx - hs * wd.roomSide * 3} y1={y1} x2={wx + hs * wd.roomSide * 3} y2={y1}
                stroke="#3A3020" strokeWidth="1.5"/>
              <line x1={wx} y1={y1} x2={swingX} y2={y1}
                stroke="#3A3020" strokeWidth="1.2"/>
              <path
                d={`M ${swingX} ${y1} A ${arcR} ${arcR} 0 0 ${wd.roomSide > 0 ? 0 : 1} ${wx} ${y2}`}
                fill="none" stroke="#3A3020" strokeWidth="1" strokeDasharray="3 2"/>
            </g>
          )
        } else {
          els.push(
            <g key={`${wd.id}-${el.id}`}>
              <rect x={wx - hs} y={y1} width={WALL_STROKE} height={ew}
                fill="#F9F7F4" stroke="none"/>
              <line x1={wx - hs} y1={y1} x2={wx + hs} y2={y1} stroke="#3A3020" strokeWidth="1.5"/>
              <line x1={wx - hs} y1={y2} x2={wx + hs} y2={y2} stroke="#3A3020" strokeWidth="1.5"/>
              <line x1={wx - 2.5} y1={y1} x2={wx - 2.5} y2={y2} stroke="#5090C0" strokeWidth="1.2" opacity="0.8"/>
              <line x1={wx}       y1={y1} x2={wx}       y2={y2} stroke="#5090C0" strokeWidth="1.2" opacity="0.8"/>
              <line x1={wx + 2.5} y1={y1} x2={wx + 2.5} y2={y2} stroke="#5090C0" strokeWidth="1.2" opacity="0.8"/>
            </g>
          )
        }
      }
    }
  }

  return <>{els}</>
}

// Black mask rects at every door/window opening — clips wires there so they appear to route around them
function WallOpeningsMask({ W, D, rW, rD }: { W: number; D: number; rW: number; rD: number }) {
  const geometry = useRoomStore(s => s.geometry)
  const hs = WALL_STROKE / 2   // 4px
  const WI = WIRE_INSET        // 5px
  const ext = 2
  const sc = SCALE / 1000

  const rects: React.ReactElement[] = []

  const wallA = geometry.walls.find(w => w.id === 'A')
  if (wallA) resolveElementPositions(wallA.elements, W * 1000).forEach((el, i) => {
    rects.push(<rect key={`A-${i}`} x={PAD + el.position * sc - 1} y={PAD - hs - ext} width={el.width * sc + 2} height={hs + WI + ext * 2} fill="black"/>)
  })

  const wallC = geometry.walls.find(w => w.id === 'C')
  if (wallC) resolveElementPositions(wallC.elements, W * 1000).forEach((el, i) => {
    rects.push(<rect key={`C-${i}`} x={PAD + el.position * sc - 1} y={PAD + rD - WI - ext} width={el.width * sc + 2} height={WI + hs + ext * 2} fill="black"/>)
  })

  const wallD = geometry.walls.find(w => w.id === 'D')
  if (wallD) resolveElementPositions(wallD.elements, D * 1000).forEach((el, i) => {
    rects.push(<rect key={`D-${i}`} x={PAD - hs - ext} y={PAD + el.position * sc - 1} width={hs + WI + ext * 2} height={el.width * sc + 2} fill="black"/>)
  })

  const wallB = geometry.walls.find(w => w.id === 'B')
  if (wallB) resolveElementPositions(wallB.elements, D * 1000).forEach((el, i) => {
    rects.push(<rect key={`B-${i}`} x={PAD + rW - WI - ext} y={PAD + el.position * sc - 1} width={WI + hs + ext * 2} height={el.width * sc + 2} fill="black"/>)
  })

  return <>{rects}</>
}

// ─── Dimension overlay ────────────────────────────────────────────────────────

const DIM_C = '#2A4A7A'
const DIM_TICK = 5   // half-length of tick cross

function fmtM(mm: number): string {
  const m = mm / 1000
  return m < 0.01 ? `${mm}mm` : `${m.toFixed(2).replace(/\.?0+$/, '')}m`
}

function HDim({ xa, xb, y, extY, label }: { xa: number; xb: number; y: number; extY: number; label: string }) {
  if (Math.abs(xb - xa) < 6) return null
  const mx = (xa + xb) / 2
  return (
    <g stroke={DIM_C} fill="none" strokeWidth="0.7" style={{ pointerEvents: 'none' }}>
      <line x1={xa} y1={extY} x2={xa} y2={y}/>
      <line x1={xb} y1={extY} x2={xb} y2={y}/>
      <line x1={xa} y1={y} x2={xb} y2={y}/>
      {/* 45° ticks */}
      <line x1={xa - DIM_TICK} y1={y + DIM_TICK} x2={xa + DIM_TICK} y2={y - DIM_TICK}/>
      <line x1={xb - DIM_TICK} y1={y + DIM_TICK} x2={xb + DIM_TICK} y2={y - DIM_TICK}/>
      <rect x={mx - label.length * 2.5} y={y - 11} width={label.length * 5} height={9}
        fill="#F9F7F4" stroke="none"/>
      <text x={mx} y={y - 4} textAnchor="middle" fontSize="7.5"
        fontFamily="system-ui,sans-serif" fill={DIM_C} stroke="none" fontWeight="600">{label}</text>
    </g>
  )
}

function VDim({ ya, yb, x, extX, label }: { ya: number; yb: number; x: number; extX: number; label: string }) {
  if (Math.abs(yb - ya) < 6) return null
  const my = (ya + yb) / 2
  const leftSide = x < extX
  return (
    <g stroke={DIM_C} fill="none" strokeWidth="0.7" style={{ pointerEvents: 'none' }}>
      <line x1={extX} y1={ya} x2={x} y2={ya}/>
      <line x1={extX} y1={yb} x2={x} y2={yb}/>
      <line x1={x} y1={ya} x2={x} y2={yb}/>
      <line x1={x - DIM_TICK} y1={ya - DIM_TICK} x2={x + DIM_TICK} y2={ya + DIM_TICK}/>
      <line x1={x - DIM_TICK} y1={yb - DIM_TICK} x2={x + DIM_TICK} y2={yb + DIM_TICK}/>
      <rect x={leftSide ? x - label.length * 5 - 2 : x + 2} y={my - 5}
        width={label.length * 5} height={9} fill="#F9F7F4" stroke="none"/>
      <text x={leftSide ? x - 3 : x + 3} y={my}
        dominantBaseline="middle" textAnchor={leftSide ? 'end' : 'start'} fontSize="7.5"
        fontFamily="system-ui,sans-serif" fill={DIM_C} stroke="none" fontWeight="600">{label}</text>
    </g>
  )
}

function DimensionOverlay({ electricals, W, D }: { electricals: PlacedElectrical[]; W: number; D: number }) {
  const rW = W * SCALE, rD = D * SCALE
  const hs = WALL_STROKE / 2
  const byWall: Record<WallId, PlacedElectrical[]> = { A: [], B: [], C: [], D: [] }
  for (const el of electricals) byWall[el.wallId as WallId].push(el)

  const dims: React.ReactElement[] = []
  let k = 0

  // Horizontal chain: wall A (above) or C (below)
  for (const wallId of ['A', 'C'] as const) {
    const devs = [...byWall[wallId]].sort((a, b) => a.positionMm - b.positionMm)
    const lenMm = W * 1000
    const mms = [0, ...devs.map(d => d.positionMm), lenMm]
    const xs  = mms.map(mm => PAD + (mm / 1000) * SCALE)
    const dimY  = wallId === 'A' ? PAD - hs - 20 : PAD + rD + hs + 20
    const extY  = wallId === 'A' ? PAD - hs - 2  : PAD + rD + hs + 2
    for (let i = 0; i < xs.length - 1; i++)
      dims.push(<HDim key={k++} xa={xs[i]} xb={xs[i+1]} y={dimY} extY={extY} label={fmtM(mms[i+1]-mms[i])}/>)
  }

  // Vertical chain: wall D (left) or B (right)
  for (const wallId of ['D', 'B'] as const) {
    const devs = [...byWall[wallId]].sort((a, b) => a.positionMm - b.positionMm)
    const lenMm = D * 1000
    const mms = [0, ...devs.map(d => d.positionMm), lenMm]
    const ys  = mms.map(mm => PAD + (mm / 1000) * SCALE)
    const dimX  = wallId === 'D' ? PAD - hs - 28 : PAD + rW + hs + 28
    const extX  = wallId === 'D' ? PAD - hs - 2  : PAD + rW + hs + 2
    for (let i = 0; i < ys.length - 1; i++)
      dims.push(<VDim key={k++} ya={ys[i]} yb={ys[i+1]} x={dimX} extX={extX} label={fmtM(mms[i+1]-mms[i])}/>)
  }

  // Height callouts inside room near each device
  const labels = electricals.map((el, i) => {
    const dp = wallDeviceSvgPos(el, W, D)
    const hLabel = `↕${fmtM(el.heightMm)}`
    const INS = 20
    let lx = dp.x, ly = dp.y
    switch (el.wallId as WallId) {
      case 'A': ly += INS; break
      case 'C': ly -= INS; break
      case 'D': lx += INS; break
      case 'B': lx -= INS; break
    }
    return (
      <text key={`hl-${i}`} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
        fontSize="7" fontFamily="system-ui,sans-serif" fill={DIM_C} fontWeight="700"
        style={{ pointerEvents: 'none' }}>
        {hLabel}
      </text>
    )
  })

  return <>{dims}{labels}</>
}

// ─── Floor plan SVG ────────────────────────────────────────────────────────────

interface FloorPlanProps {
  room: Room
  geometry: RoomGeometry
  electricals: PlacedElectrical[]
  lights: PlacedLight[]
  tab: TabId
  activeTool: ElectricalType | null
  wireConfigs: Record<string, WireConfig>
  onPlaceElectrical: (e: PlacedElectrical) => void
  onMoveElectrical: (id: string, positionMm: number) => void
  onRemoveElectrical: (id: string) => void
  onPlaceLight: (l: PlacedLight) => void
  onRemoveLight: (id: string) => void
}

function FloorPlan({
  room, geometry, electricals, lights, tab, activeTool, wireConfigs,
  onPlaceElectrical, onMoveElectrical, onPlaceLight, onRemoveLight,
}: FloorPlanProps) {
  const W = room.width  > 0 ? room.width  : (geometry.walls.find(w => w.id === 'B')?.length ?? 3000) / 1000
  const D = room.length > 0 ? room.length : (geometry.walls.find(w => w.id === 'A')?.length ?? 4000) / 1000
  const svgW = W * SCALE + PAD * 2
  const svgH = D * SCALE + PAD * 2
  const rW = W * SCALE
  const rD = D * SCALE

  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<{ wallId: WallId; positionMm: number; sx: number; sy: number } | null>(null)
  const [hoverLight, setHoverLight] = useState<{ x: number; y: number } | null>(null)

  // ── 2D drag state for placed electricals ──────────────────────────────────
  const [draggingEl, setDraggingEl] = useState<{
    id: string; wallId: WallId; posMm: number
  } | null>(null)
  const dragStartClient = useRef({ x: 0, y: 0 })
  const dragHasMoved = useRef(false)
  const lastGestureWasDrag = useRef(false)

  useEffect(() => {
    function onPointerUp() {
      if (!draggingEl) return
      if (dragHasMoved.current) {
        onMoveElectrical(draggingEl.id, draggingEl.posMm)
        lastGestureWasDrag.current = true
      }
      setDraggingEl(null)
      dragHasMoved.current = false
    }
    window.addEventListener('pointerup', onPointerUp)
    return () => window.removeEventListener('pointerup', onPointerUp)
  }, [draggingEl, onMoveElectrical])

  // Panel is a special one-time device — derive its SVG position from placed electricals
  const panelEl = electricals.find(e => e.type === 'panel')
  const panelPos = panelEl ? wallDeviceSvgPos(
    draggingEl?.id === panelEl.id ? { ...panelEl, positionMm: draggingEl.posMm } : panelEl, W, D
  ) : null

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return
    const { x, y } = svgPt(svgRef.current, e)

    // ── Handle dragging a placed electrical ──
    if (draggingEl) {
      const isH = draggingEl.wallId === 'A' || draggingEl.wallId === 'C'
      const wallLenMm = isH ? W * 1000 : D * 1000
      let newPosMm = isH
        ? Math.round((x - PAD) / SCALE * 1000)
        : Math.round((y - PAD) / SCALE * 1000)
      newPosMm = Math.max(80, Math.min(wallLenMm - 80, newPosMm))
      const dx = e.clientX - dragStartClient.current.x
      const dy = e.clientY - dragStartClient.current.y
      if (Math.abs(dx) + Math.abs(dy) > 4) dragHasMoved.current = true
      setDraggingEl(prev => prev ? { ...prev, posMm: newPosMm } : null)
      return
    }

    if (tab === 'elektr' && activeTool) {
      const hit = detectWall(x, y, W, D)
      setHover(hit)
      setHoverLight(null)
    } else if (tab === 'chiroq') {
      const rx = x - PAD, ry = y - PAD
      setHover(null)
      if (rx >= 0 && rx <= rW && ry >= 0 && ry <= rD) {
        setHoverLight({ x, y })
      } else {
        setHoverLight(null)
      }
    } else {
      setHover(null)
      setHoverLight(null)
    }
  }, [tab, activeTool, W, D, rW, rD, draggingEl])

  const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (lastGestureWasDrag.current) { lastGestureWasDrag.current = false; return }
    if (!svgRef.current) return
    const { x, y } = svgPt(svgRef.current, e)
    if (tab === 'elektr' && activeTool) {
      const hit = detectWall(x, y, W, D)
      if (hit) {
        const cat = CATALOG.find(c => c.type === activeTool)!
        onPlaceElectrical({ id: nanoid(), type: activeTool, wallId: hit.wallId, positionMm: hit.positionMm, heightMm: cat.height })
      }
    } else if (tab === 'chiroq') {
      const rx = x - PAD, ry = y - PAD
      if (rx >= 0 && rx <= rW && ry >= 0 && ry <= rD) {
        onPlaceLight({ id: nanoid(), xMm: Math.round((rx / SCALE) * 1000), zMm: Math.round((ry / SCALE) * 1000) })
      }
    }
  }, [tab, activeTool, W, D, rW, rD, onPlaceElectrical, onPlaceLight])

  const cursor = draggingEl
    ? 'grabbing'
    : tab === 'elektr'
      ? (activeTool ? 'crosshair' : 'default')
      : 'crosshair'

  const lightR = 32  // glow radius px

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${svgW} ${svgH}`}
      className="w-full drop-shadow-md select-none"
      style={{ cursor, maxHeight: 'calc(100vh - 180px)' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { setHover(null); setHoverLight(null) }}
      onClick={handleClick}
    >
      <defs>
        <radialGradient id="lightGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#E0F0FF" stopOpacity="0.95"/>
          <stop offset="45%" stopColor="#C8E4FF" stopOpacity="0.55"/>
          <stop offset="100%" stopColor="#C8E4FF" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="lightGlowHover" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#E0F0FF" stopOpacity="0.6"/>
          <stop offset="100%" stopColor="#C8E4FF" stopOpacity="0"/>
        </radialGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        {/* Wire mask: white everywhere except door/window openings (black) */}
        <mask id="wireMask">
          <rect x="0" y="0" width={svgW} height={svgH} fill="white"/>
          <WallOpeningsMask W={W} D={D} rW={rW} rD={rD}/>
        </mask>
      </defs>

      {/* Paper background */}
      <rect x="0" y="0" width={svgW} height={svgH} fill="#F9F7F4"/>

      {/* Room floor */}
      <rect x={PAD} y={PAD} width={rW} height={rD} fill="#F0EBE0" stroke="none"/>

      {/* Grid (subtle) */}
      {Array.from({ length: Math.ceil(W) + 1 }).map((_, i) => (
        <line key={`gx${i}`}
          x1={PAD + i * SCALE} y1={PAD}
          x2={PAD + i * SCALE} y2={PAD + rD}
          stroke="#D8D0C0" strokeWidth="0.5" strokeDasharray="3 4"/>
      ))}
      {Array.from({ length: Math.ceil(D) + 1 }).map((_, i) => (
        <line key={`gz${i}`}
          x1={PAD} y1={PAD + i * SCALE}
          x2={PAD + rW} y2={PAD + i * SCALE}
          stroke="#D8D0C0" strokeWidth="0.5" strokeDasharray="3 4"/>
      ))}

      {/* Dimension labels */}
      <text x={PAD + rW / 2} y={PAD - 10} textAnchor="middle" fontSize="11" fill="#888" fontFamily="sans-serif">
        {W.toFixed(1)} m
      </text>
      <text x={PAD - 10} y={PAD + rD / 2} textAnchor="middle" fontSize="11" fill="#888"
        fontFamily="sans-serif" transform={`rotate(-90, ${PAD - 10}, ${PAD + rD / 2})`}>
        {D.toFixed(1)} m
      </text>

      {/* Wall lines */}
      <rect x={PAD} y={PAD} width={rW} height={rD}
        fill="none" stroke="#3A3020" strokeWidth="8" strokeLinejoin="miter"/>

      {/* Doors and windows from room geometry */}
      <WallOpenings W={W} D={D} />

      {/* Wall labels */}
      {[
        { label: 'A', x: PAD + rW / 2, y: PAD - 22 },
        { label: 'C', x: PAD + rW / 2, y: PAD + rD + 22 },
        { label: 'D', x: PAD - 22, y: PAD + rD / 2 },
        { label: 'B', x: PAD + rW + 22, y: PAD + rD / 2 },
      ].map(l => (
        <text key={l.label} x={l.x} y={l.y} textAnchor="middle" dominantBaseline="middle"
          fontSize="12" fill="#888" fontFamily="sans-serif" fontWeight="bold">{l.label}</text>
      ))}

      {/* ── LIGHTS (Chiroq tab) ─────────────────────────────────────────────── */}
      {tab === 'chiroq' && lights.map(light => {
        const lx = PAD + light.xMm / 1000 * SCALE
        const ly = PAD + light.zMm / 1000 * SCALE
        return (
          <g key={light.id} style={{ cursor: 'pointer' }}
            onClick={(e) => { e.stopPropagation(); onRemoveLight(light.id) }}>
            <circle cx={lx} cy={ly} r={lightR} fill="url(#lightGlow)"/>
            <circle cx={lx} cy={ly} r="7" fill="#E8F2FF" stroke="#7BB8F0" strokeWidth="1.5" filter="url(#glow)"/>
            <line x1={lx - 4} y1={ly} x2={lx + 4} y2={ly} stroke="#7BB8F0" strokeWidth="1.2"/>
            <line x1={lx} y1={ly - 4} x2={lx} y2={ly + 4} stroke="#7BB8F0" strokeWidth="1.2"/>
          </g>
        )
      })}
      {tab === 'chiroq' && hoverLight && (
        <g style={{ pointerEvents: 'none' }}>
          <circle cx={hoverLight.x} cy={hoverLight.y} r={lightR} fill="url(#lightGlowHover)"/>
          <circle cx={hoverLight.x} cy={hoverLight.y} r="7" fill="#E8F2FF"
            stroke="#7BB8F0" strokeWidth="1.5" opacity="0.6"/>
        </g>
      )}

      {/* ── ELECTRICALS (Elektr tab) ────────────────────────────────────────── */}
      {tab === 'elektr' && (
        <>
          {/* Wires routed along wall surfaces to panel */}
          {panelPos && panelEl && electricals.filter(e => e.type !== 'panel').map(el => {
            const cfg = wireConfigs[el.id]
            if (!cfg) return null
            const displayEl = draggingEl?.id === el.id ? { ...el, positionMm: draggingEl.posMm } : el
            const pts = routeSvgPts(displayEl, panelEl, W, D, cfg.cw)
            const pointsStr = pts.map(([x, y]) => `${x},${y}`).join(' ')
            return (
              <polyline key={`w-${el.id}`}
                points={pointsStr}
                fill="none"
                stroke={cfg.color}
                strokeWidth="1.8"
                strokeDasharray="6 3"
                opacity="0.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                mask="url(#wireMask)"/>
            )
          })}

          {/* Placed devices — draggable along their wall */}
          {electricals.map(el => {
            const isDragged = draggingEl?.id === el.id
            const displayEl = isDragged ? { ...el, positionMm: draggingEl!.posMm } : el
            const dp = wallDeviceSvgPos(displayEl, W, D)

            function startElDrag(e: React.PointerEvent) {
              e.stopPropagation()
              dragStartClient.current = { x: e.clientX, y: e.clientY }
              dragHasMoved.current = false
              setDraggingEl({ id: el.id, wallId: el.wallId, posMm: el.positionMm })
            }

            if (el.type === 'panel') {
              return (
                <g key={el.id}
                  transform={`translate(${dp.x}, ${dp.y})`}
                  style={{ cursor: isDragged ? 'grabbing' : 'grab' }}
                  onPointerDown={startElDrag}>
                  <rect x="-11" y="-15" width="22" height="28" rx="2.5"
                    fill={NAVY} stroke="#0D2560" strokeWidth="1.2"
                    opacity={isDragged ? 0.75 : 1}/>
                  <rect x="-8" y="-12" width="16" height="20" rx="1.5"
                    fill="white" fillOpacity="0.12"/>
                  {[-1, 1].map(col => [-8, -2, 4].map(rowY => (
                    <rect key={`${col}-${rowY}`}
                      x={col * 5 - 3} y={rowY} width="5" height="4" rx="1"
                      fill="white" fillOpacity={col === -1 ? 0.9 : 0.5}/>
                  )))}
                  <line x1="-8" y1="12" x2="8" y2="12" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                  <text y="19" textAnchor="middle" fontSize="5" fill="white"
                    fontFamily="sans-serif" fontWeight="bold">ЩИТ</text>
                  {/* Drag handle hint */}
                  {isDragged && <circle r="14" fill="none" stroke="white" strokeWidth="1" strokeDasharray="3 2" opacity="0.6"/>}
                </g>
              )
            }
            return (
              <g key={el.id}
                transform={`translate(${dp.x}, ${dp.y})`}
                style={{ cursor: isDragged ? 'grabbing' : 'grab' }}
                onPointerDown={startElDrag}>
                <circle r="12" fill="white" opacity={isDragged ? 0.5 : 0.8}/>
                <MiniSymbol type={el.type} wallId={el.wallId}/>
                {isDragged && <circle r="14" fill="none" stroke={NAVY} strokeWidth="1" strokeDasharray="3 2" opacity="0.5"/>}
                <circle r="12" fill="transparent"/>
              </g>
            )
          })}

          {/* Ghost preview on hover */}
          {hover && activeTool && (
            <g transform={`translate(${hover.sx}, ${hover.sy})`} opacity="0.45" style={{ pointerEvents: 'none' }}>
              <circle r="10" fill="white" opacity="0.8"/>
              <MiniSymbol type={activeTool} wallId={hover.wallId}/>
            </g>
          )}

          {/* Hover wall highlight */}
          {hover && activeTool && (() => {
            const hw = 6
            const hl = 40
            switch (hover.wallId) {
              case 'A': case 'C': return (
                <rect x={hover.sx - hl / 2} y={hover.sy - hw / 2}
                  width={hl} height={hw} rx="2" fill={NAVY} opacity="0.2" style={{ pointerEvents: 'none' }}/>
              )
              case 'D': case 'B': return (
                <rect x={hover.sx - hw / 2} y={hover.sy - hl / 2}
                  width={hw} height={hl} rx="2" fill={NAVY} opacity="0.2" style={{ pointerEvents: 'none' }}/>
              )
            }
          })()}
        </>
      )}

      {/* ── DIMENSION OVERLAY (O'lchamlar tab) ─────────────────────────────── */}
      {tab === 'olchamlar' && (
        <DimensionOverlay electricals={electricals} W={W} D={D}/>
      )}
    </svg>
  )
}

// ─── Sidebar: Elektr panel ─────────────────────────────────────────────────────

function ElektrSidebar({
  activeTool, onSelectTool, electricals, onRemoveElectrical,
}: {
  activeTool: ElectricalType | null
  onSelectTool: (t: ElectricalType | null) => void
  electricals: PlacedElectrical[]
  onRemoveElectrical: (id: string) => void
}) {
  return (
    <aside className="w-64 shrink-0 border-l border-gray-100 bg-white overflow-y-auto flex flex-col">
      {/* Instructions */}
      <div className="px-3 py-2.5 border-b border-gray-100 bg-blue-50">
        <p className="text-xs text-blue-700 font-medium">
          {activeTool === 'panel'
            ? 'Elektr qutisini devorga bosib joylashtiring'
            : activeTool
              ? `"${CATALOG.find(c => c.type === activeTool)?.label}" tanlandi — devorda bosing`
              : 'Avval elektr qutisini joylashtiring, keyin boshqa qurilmalarni'}
        </p>
      </div>

      {/* Device palette */}
      <div className="p-3 space-y-1.5 border-b border-gray-100">
        {/* Panel — one-time device, shown at top with distinct style */}
        {(() => {
          const panelPlaced = electricals.some(e => e.type === 'panel')
          return (
            <div className="mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Asosiy qurilma</p>
              <button
                disabled={panelPlaced}
                onClick={() => !panelPlaced && onSelectTool(activeTool === 'panel' ? null : 'panel')}
                title={panelPlaced ? 'Allaqachon joylashtirilgan' : 'Elektr qutisini joylashtiring'}
                className={`w-full flex items-center gap-3 p-2 rounded-lg border-2 text-left transition-all ${
                  panelPlaced
                    ? 'border-green-200 bg-green-50 opacity-70 cursor-not-allowed'
                    : activeTool === 'panel'
                      ? 'border-[#1B3784] bg-blue-50 cursor-pointer'
                      : 'border-dashed border-gray-300 hover:border-[#1B3784] hover:bg-blue-50 cursor-pointer'
                }`}
              >
                <div className="shrink-0 flex items-center justify-center" style={{ minWidth: 48 }}>
                  <ElectricalIcon type="panel"/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800">Elektr qutisi</p>
                  {panelPlaced ? (
                    <p className="text-xs text-green-600 font-medium flex items-center gap-1 mt-0.5">
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                        <path d="M10 3L5 9 2 6l-1 1 4 4 6-7z"/>
                      </svg>
                      Joylashtirildi
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400 mt-0.5">Faqat bir marta</p>
                  )}
                </div>
              </button>
            </div>
          )
        })()}

        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Qurilmalar</p>
        {CATALOG.filter(c => c.type !== 'panel').map(({ type, label }) => (
          <button
            key={type}
            onClick={() => onSelectTool(activeTool === type ? null : type)}
            className={`w-full flex items-center gap-3 p-2 rounded-lg border-2 text-left transition-all ${
              activeTool === type
                ? 'border-[#1B3784] bg-blue-50'
                : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
            }`}
          >
            <div className="shrink-0 flex items-center justify-center" style={{ minWidth: 48 }}>
              <ElectricalIcon type={type}/>
            </div>
            <span className="text-xs font-medium text-gray-800 leading-tight">{label}</span>
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="px-3 py-2 border-b border-gray-100 space-y-1.5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Belgilar</p>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <div className="w-8 border-t-2 border-dashed border-red-500"/>
          <span>Sim trassasi</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">Qurilmani o'chirish: unga bosing</p>
      </div>

      {/* Placed list */}
      {electricals.length > 0 && (
        <div className="px-3 py-2 flex-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Joylashtirilgan</p>
          <div className="space-y-1">
            {electricals.map(el => {
              const cat = CATALOG.find(c => c.type === el.type)!
              return (
                <div key={el.id} className="flex items-center gap-2 text-xs py-1 border-b border-gray-50">
                  <span className="flex-1 text-gray-700">
                    {cat.label} — {el.wallId} devor
                  </span>
                  <span className="text-gray-400">{(el.heightMm / 1000).toFixed(1)}m</span>
                  <button
                    onClick={() => onRemoveElectrical(el.id)}
                    className="text-gray-300 hover:text-red-400 text-sm leading-none transition-colors"
                  >✕</button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {electricals.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-6 px-3">
          Hali qurilma qo'shilmagan
        </p>
      )}
    </aside>
  )
}

// ─── Sidebar: Chiroq panel ─────────────────────────────────────────────────────

function ChiroqSidebar({
  lights, onClearLights,
}: {
  lights: PlacedLight[]
  onClearLights: () => void
}) {
  return (
    <aside className="w-64 shrink-0 border-l border-gray-100 bg-white overflow-y-auto flex flex-col">
      {/* Light spec */}
      <div className="p-3 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Chiroq xususiyatlari</p>
        <div className="space-y-2">
          <div className="flex items-center gap-2.5 p-2.5 bg-blue-50 rounded-lg">
            <div className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center"
              style={{ background: 'radial-gradient(circle, #E0F0FF 0%, #7BB8F0 60%, #4A90D9 100%)' }}>
              <div className="w-4 h-4 rounded-full bg-white opacity-90"/>
            </div>
            <div>
              <p className="text-xs font-bold text-blue-900">5500 K</p>
              <p className="text-xs text-blue-700">Kunduzi (Daylight)</p>
              <p className="text-xs text-blue-500">O'rta keng burchak (IES)</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <div className="bg-gray-50 rounded p-2">
              <p className="text-gray-400">Rang harorat</p>
              <p className="font-semibold text-gray-800">5500 K</p>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <p className="text-gray-400">Burchak</p>
              <p className="font-semibold text-gray-800">60°</p>
            </div>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="px-3 py-2.5 bg-blue-50 border-b border-gray-100">
        <p className="text-xs text-blue-700 font-medium">
          Chiroq qo'shish uchun xona ichida istagan joyga bosing
        </p>
        <p className="text-xs text-blue-500 mt-0.5">O'chirish: chiroqqa bosing</p>
      </div>

      {/* Placed count */}
      <div className="px-3 py-2 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-700">
            Jami: {lights.length} ta chiroq
          </span>
          {lights.length > 0 && (
            <button
              onClick={onClearLights}
              className="text-xs text-red-400 hover:text-red-600 transition-colors"
            >Hammasini o'chir</button>
          )}
        </div>
      </div>

      {lights.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-6 px-3">
          Hali chiroq qo'shilmagan
        </p>
      )}
    </aside>
  )
}

// ─── Sidebar: O'lchamlar panel ────────────────────────────────────────────────

const TYPE_LABEL: Record<ElectricalType, string> = {
  panel: 'Elektr qutisi', switch1: 'Bitta kalit', switch2: 'Ikkita kalit',
  socket1: 'Bitta rozetka', socket2: 'Ikkita rozetka', socket_media: 'TV+ETH+ANT',
}

type InnerTab = 'olchamlar' | 'simlar'

const SOCKET_TYPES = new Set<ElectricalType>(['socket1', 'socket2', 'socket_media'])
const SWITCH_TYPES = new Set<ElectricalType>(['switch1', 'switch2'])

function OlchamlarSidebar({ electricals, wireLengths }: {
  electricals: PlacedElectrical[]
  wireLengths: Record<string, number>
}) {
  const [inner, setInner] = useState<InnerTab>('olchamlar')
  const hasPanel = electricals.some(e => e.type === 'panel')

  return (
    <aside className="w-64 shrink-0 border-l border-gray-100 bg-white flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">O'lchamlar jadvali</p>
      </div>

      {/* Mini tabs */}
      <div className="flex border-b border-gray-100 px-2 pt-1.5 gap-1 shrink-0">
        {([
          ['olchamlar', '📐 Qurilmalar'],
          ['simlar',    '🔌 Sim uzunligi'],
        ] as [InnerTab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setInner(t)}
            className={`px-2.5 py-1 text-[11px] rounded-t font-medium border-b-2 transition-colors ${
              inner === t
                ? 'border-brand text-brand bg-white'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Qurilmalar ──────────────────────────────────────────────── */}
      {inner === 'olchamlar' && (
        electricals.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8 px-3">Hali qurilma qo'shilmagan</p>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2 text-left text-gray-500 font-semibold">Qurilma</th>
                  <th className="px-2 py-2 text-center text-gray-500 font-semibold">Devor</th>
                  <th className="px-2 py-2 text-right text-gray-500 font-semibold">Pos.</th>
                  <th className="px-2 py-2 text-right text-gray-500 font-semibold">↕ H</th>
                </tr>
              </thead>
              <tbody>
                {electricals.map(el => (
                  <tr key={el.id} className="border-b border-gray-50 hover:bg-blue-50/40 transition-colors">
                    <td className="px-3 py-2 text-gray-700 truncate max-w-[80px]">{TYPE_LABEL[el.type]}</td>
                    <td className="px-2 py-2 text-center">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-blue-100 text-[10px] font-bold text-blue-800">{el.wallId}</span>
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-gray-700">{(el.positionMm/1000).toFixed(2)}m</td>
                    <td className="px-2 py-2 text-right font-mono text-blue-700 font-semibold">{(el.heightMm/1000).toFixed(2)}m</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-3 py-2 border-t border-gray-100">
              <p className="text-xs text-gray-400">Jami: <span className="font-semibold text-gray-600">{electricals.length}</span> ta qurilma</p>
            </div>
          </div>
        )
      )}

      {/* ── Tab: Sim uzunligi ────────────────────────────────────────────── */}
      {inner === 'simlar' && (() => {
        if (!hasPanel) return (
          <p className="text-xs text-gray-400 text-center py-8 px-3">
            Avval elektr qutisini qo'ying — sim uzunligi hisoblanadi
          </p>
        )

        const sockets = electricals.filter(e => SOCKET_TYPES.has(e.type))
        const switches = electricals.filter(e => SWITCH_TYPES.has(e.type))
        const socketTotal = sockets.reduce((s, e) => s + (wireLengths[e.id] ?? 0), 0)
        const switchTotal = switches.reduce((s, e) => s + (wireLengths[e.id] ?? 0), 0)
        const grandTotal = socketTotal + switchTotal

        function WireGroup({ title, items, total, color }: {
          title: string; items: PlacedElectrical[]; total: number; color: string
        }) {
          if (items.length === 0) return null
          return (
            <div className="border-b border-gray-100">
              <div className={`px-3 py-1.5 flex items-center justify-between ${color}`}>
                <span className="text-[11px] font-bold">{title}</span>
                <span className="text-[11px] font-mono font-bold">{total.toFixed(2)} m</span>
              </div>
              {items.map(el => (
                <div key={el.id} className="flex items-center justify-between px-3 py-1.5 hover:bg-gray-50 border-t border-gray-50">
                  <span className="text-xs text-gray-600 truncate max-w-[110px]">{TYPE_LABEL[el.type]}</span>
                  <span className="text-xs font-mono text-gray-800 font-semibold shrink-0 ml-2">
                    {(wireLengths[el.id] ?? 0).toFixed(2)} m
                  </span>
                </div>
              ))}
            </div>
          )
        }

        return (
          <div className="flex-1 overflow-y-auto flex flex-col">
            <WireGroup title="🔌 Rozetka simlari" items={sockets} total={socketTotal} color="bg-orange-50 text-orange-800"/>
            <WireGroup title="💡 Kalit simlari"   items={switches} total={switchTotal} color="bg-yellow-50 text-yellow-800"/>
            {sockets.length === 0 && switches.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6 px-3">Rozetka yoki kalit qo'shilmagan</p>
            )}
            <div className="mt-auto border-t border-gray-200 px-3 py-2.5 bg-blue-50">
              <div className="flex justify-between text-xs font-bold text-blue-900">
                <span>Jami sim:</span>
                <span className="font-mono">{grandTotal.toFixed(2)} m</span>
              </div>
              <div className="flex justify-between text-xs text-blue-700 mt-0.5">
                <span>+10% zaxira:</span>
                <span className="font-mono">{(grandTotal * 1.1).toFixed(2)} m</span>
              </div>
            </div>
          </div>
        )
      })()}
    </aside>
  )
}

// ─── 3D Elektr view ───────────────────────────────────────────────────────────

const ELEC_DIMS_3D: Record<ElectricalType, { w: number; h: number }> = {
  switch1:      { w: 0.08, h: 0.08 },
  switch2:      { w: 0.14, h: 0.08 },
  socket1:      { w: 0.08, h: 0.08 },
  socket2:      { w: 0.14, h: 0.08 },
  socket_media: { w: 0.18, h: 0.08 },
  panel:        { w: 0.40, h: 0.50 },
}

function elecPos3D(el: PlacedElectrical, W: number, D: number) {
  const isPanel = el.type === 'panel'
  const dim = ELEC_DIMS_3D[el.type]
  const depth = isPanel ? 0.12 : 0.018
  const T = 0.004
  const cy = el.heightMm / 1000 + dim.h / 2
  const pos = el.positionMm / 1000
  switch (el.wallId as WallId) {
    case 'A': return { px: pos - W/2, py: cy, pz: -(D/2) + depth/2 + T, ry: 0 }
    case 'C': return { px: pos - W/2, py: cy, pz: D/2 - depth/2 - T, ry: Math.PI }
    case 'D': return { px: -(W/2) + depth/2 + T, py: cy, pz: pos - D/2, ry: Math.PI/2 }
    case 'B': return { px: W/2 - depth/2 - T, py: cy, pz: pos - D/2, ry: -Math.PI/2 }
  }
}

function StaticElectrical3D({ el, W, D }: { el: PlacedElectrical; W: number; D: number }) {
  const isPanel = el.type === 'panel'
  const dim = ELEC_DIMS_3D[el.type]
  const depth = isPanel ? 0.12 : 0.018
  const p = elecPos3D(el, W, D)!
  const isSwitch = el.type.startsWith('switch')
  if (isPanel) {
    return (
      <group position={[p.px, p.py, p.pz]} rotation={[0, p.ry, 0]}>
        <mesh castShadow>
          <boxGeometry args={[dim.w, dim.h, depth]}/>
          <meshStandardMaterial color="#E8E4DC" roughness={0.6} metalness={0.1}/>
        </mesh>
        <mesh position={[0, 0, depth/2 + 0.002]}>
          <boxGeometry args={[dim.w - 0.02, dim.h - 0.02, 0.01]}/>
          <meshStandardMaterial color="#1B3784" roughness={0.4} metalness={0.15}/>
        </mesh>
        {[-0.08, 0, 0.08].map((rowY, ri) =>
          [-0.08, 0.08].map((colX, ci) => (
            <mesh key={`${ri}-${ci}`} position={[colX, rowY, depth/2 + 0.008]}>
              <boxGeometry args={[0.06, 0.04, 0.006]}/>
              <meshStandardMaterial color="#F0F0F0" roughness={0.5}/>
            </mesh>
          ))
        )}
        <mesh position={[dim.w/2 - 0.03, 0, depth/2 + 0.012]}>
          <boxGeometry args={[0.012, 0.04, 0.008]}/>
          <meshStandardMaterial color="#C0B8A8" metalness={0.6} roughness={0.3}/>
        </mesh>
      </group>
    )
  }
  return (
    <group position={[p.px, p.py, p.pz]} rotation={[0, p.ry, 0]}>
      <mesh castShadow>
        <boxGeometry args={[dim.w, dim.h, depth]}/>
        <meshStandardMaterial color="#F5F5F0" roughness={0.5} metalness={0.05}/>
      </mesh>
      {isSwitch ? (
        <mesh position={[0, 0.005, depth/2 + 0.001]}>
          <boxGeometry args={[dim.w * 0.7, dim.h * 0.55, 0.004]}/>
          <meshStandardMaterial color="#1B3784" roughness={0.4} metalness={0.1}/>
        </mesh>
      ) : (
        <>
          <mesh position={[-0.012, 0.008, depth/2 + 0.001]}>
            <cylinderGeometry args={[0.004, 0.004, 0.003, 12]}/>
            <meshStandardMaterial color="#1B3784"/>
          </mesh>
          <mesh position={[0.012, 0.008, depth/2 + 0.001]}>
            <cylinderGeometry args={[0.004, 0.004, 0.003, 12]}/>
            <meshStandardMaterial color="#1B3784"/>
          </mesh>
        </>
      )}
    </group>
  )
}

function WireLine3D({ el, panel, W, D, wireH, cw, color }: {
  el: PlacedElectrical; panel: PlacedElectrical
  W: number; D: number; wireH: number
  cw: boolean; color: string
}) {
  const lineObj = useMemo(() => {
    const pts = routeWire3D(el, panel, W, D, wireH, cw)
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const mat = new THREE.LineBasicMaterial({ color })
    return new THREE.Line(geo, mat)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el.id, el.positionMm, el.wallId, panel.positionMm, panel.wallId, W, D, wireH, cw, color])

  return <primitive object={lineObj}/>
}

function ElektrScene({ room, geometry, designState, electricals, lights, wireConfigs }: {
  room: Room
  geometry: RoomGeometry
  designState: DesignState
  electricals: PlacedElectrical[]
  lights: PlacedLight[]
  wireConfigs: Record<string, WireConfig>
}) {
  const W = room.width  > 0 ? room.width  : (geometry.walls.find(w => w.id === 'B')?.length ?? 3000) / 1000
  const D = room.length > 0 ? room.length : (geometry.walls.find(w => w.id === 'A')?.length ?? 4000) / 1000
  const H = room.ceiling_height > 0 ? room.ceiling_height : 2.7
  const panel = electricals.find(e => e.type === 'panel')

  // Wire channel height: 0.22m above the tallest door/window top, minimum 2.25m, max ceiling-10cm
  const maxOpeningTopM = geometry.walls.reduce((acc, wall) =>
    wall.elements.reduce((wAcc, el) => Math.max(wAcc, (el.sill_height ?? 0) + el.height) / 1000, acc)
  , 0)
  const wireChannelH = Math.min(H - 0.1, Math.max(maxOpeningTopM + 0.22, 2.25))

  return (
    <>
      <RoomScene
        room={room}
        geometry={geometry}
        topView={false}
        designState={designState}
        showContactShadows={false}
        userLights={lights}
      />
      {electricals.map(el => (
        <StaticElectrical3D key={el.id} el={el} W={W} D={D}/>
      ))}
      {panel && electricals.filter(e => e.type !== 'panel').map(el => {
        const cfg = wireConfigs[el.id]
        if (!cfg) return null
        return <WireLine3D key={el.id} el={el} panel={panel} W={W} D={D} wireH={wireChannelH} cw={cfg.cw} color={cfg.color}/>
      })}
      <Environment preset="apartment" environmentIntensity={0.35}/>
    </>
  )
}

function ElektrThreeDView({ room, geometry, designState, electricals, lights, wireConfigs }: {
  room: Room
  geometry: RoomGeometry
  designState: DesignState
  electricals: PlacedElectrical[]
  lights: PlacedLight[]
  wireConfigs: Record<string, WireConfig>
}) {
  const W = room.width  > 0 ? room.width  : (geometry.walls.find(w => w.id === 'B')?.length ?? 3000) / 1000
  const D = room.length > 0 ? room.length : (geometry.walls.find(w => w.id === 'A')?.length ?? 4000) / 1000
  const H = room.ceiling_height > 0 ? room.ceiling_height : 2.7
  const initPos: [number, number, number] = [-W * 0.3, H * 0.55, D * 0.35]
  const initTarget: [number, number, number] = [0, H * 0.4, 0]

  return (
    <div className="relative w-full h-full">
      <Canvas
        camera={{ position: initPos, fov: 65, near: 0.05, far: 100 }}
        shadows
        gl={{ powerPreference: 'default', antialias: false }}
        frameloop="demand"
      >
        <Suspense fallback={null}>
          <ElektrScene
            room={room} geometry={geometry} designState={designState}
            electricals={electricals} lights={lights} wireConfigs={wireConfigs}
          />
          <OrbitControls
            target={initTarget}
            enableDamping dampingFactor={0.06}
            rotateSpeed={-0.45} zoomSpeed={0.8}
            minDistance={0.25}
            maxDistance={Math.max(W, D) * 4}
          />
        </Suspense>
      </Canvas>
      <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/40 rounded text-white text-[10px] font-medium pointer-events-none select-none">
        3D Ko'rinish
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlacementPage() {
  const { room } = useOutletContext<StudioContext>()
  const { electricals, lights, geometry, designState, addElectrical, moveElectrical, removeElectrical, addLight, removeLight, clearLights } = useRoomStore()

  const [tab, setTab] = useState<TabId>('elektr')
  const [activeTool, setActiveTool] = useState<ElectricalType | null>(null)
  const [wireColors, setWireColors] = useState<Record<string, string>>({})
  const [wireRoutes, setWireRoutes] = useState<Record<string, boolean>>({})

  const panel = electricals.find(e => e.type === 'panel')
  // Fall back to geometry wall lengths (in mm→m) when room metadata is 0/missing
  const W = (room.width  > 0 ? room.width  : (geometry.walls.find(w => w.id === 'B')?.length ?? 3000) / 1000)
  const D = (room.length > 0 ? room.length : (geometry.walls.find(w => w.id === 'A')?.length ?? 4000) / 1000)

  // Compute effective wire config for each non-panel device
  const wireConfigs = useMemo<Record<string, WireConfig>>(() => {
    if (!panel) return {}
    const panC = wirePerimCoord(panel.wallId, panel.positionMm, W, D)
    const out: Record<string, WireConfig> = {}
    for (const el of electricals) {
      if (el.type === 'panel') continue
      const devC = wirePerimCoord(el.wallId, el.positionMm, W, D)
      out[el.id] = {
        color: wireColors[el.id] ?? WIRE,
        cw:    wireRoutes[el.id] !== undefined ? wireRoutes[el.id] : shortestCW(devC, panC, W, D),
      }
    }
    return out
  }, [electricals, panel, wireColors, wireRoutes, W, D])

  // Compute wire length (metres) for each non-panel device
  const wireLengths = useMemo<Record<string, number>>(() => {
    if (!panel) return {}
    const H = room.ceiling_height ?? 2.7
    const maxOpeningTopM = geometry.walls.reduce((acc, wall) =>
      wall.elements.reduce((wAcc, el) => Math.max(wAcc, ((el.sill_height ?? 0) + el.height) / 1000), acc)
    , 0)
    const wireChannelH = Math.min(H - 0.1, Math.max(maxOpeningTopM + 0.22, 2.25))
    const pdim = ELEC_DIMS_3D[panel.type]
    const panH = panel.heightMm / 1000 + pdim.h / 2
    const panC = wirePerimCoord(panel.wallId, panel.positionMm, W, D)
    const perim = 2 * (W + D)
    const out: Record<string, number> = {}
    for (const el of electricals) {
      if (el.type === 'panel') continue
      const cfg = wireConfigs[el.id]
      if (!cfg) continue
      const dim = ELEC_DIMS_3D[el.type]
      const devH = el.heightMm / 1000 + dim.h / 2
      const devC = wirePerimCoord(el.wallId, el.positionMm, W, D)
      const perimDist = cfg.cw
        ? (panC - devC + perim) % perim
        : (devC - panC + perim) % perim
      const vertUp   = Math.max(0, wireChannelH - devH)
      const vertDown = Math.max(0, wireChannelH - panH)
      out[el.id] = Math.round((vertUp + perimDist + vertDown) * 100) / 100
    }
    return out
  }, [electricals, panel, wireConfigs, W, D, room.ceiling_height, geometry])

  function handleRandomize() {
    const newColors: Record<string, string> = {}
    const newRoutes: Record<string, boolean> = {}
    for (const el of electricals) {
      if (el.type === 'panel') continue
      newColors[el.id] = WIRE_PALETTE[Math.floor(Math.random() * WIRE_PALETTE.length)]
      newRoutes[el.id] = Math.random() < 0.5
    }
    setWireColors(newColors)
    setWireRoutes(newRoutes)
  }

  function resetWires() {
    setWireColors({})
    setWireRoutes({})
  }

  function handleTabChange(t: TabId) {
    setTab(t)
    setActiveTool(null)
  }

  function handlePlaceElectrical(e: PlacedElectrical) {
    addElectrical(e)
    const cat = CATALOG.find(c => c.type === e.type)
    if (cat?.oneTime) setActiveTool(null)
  }

  const hasDevices = electricals.some(e => e.type !== 'panel')

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 108px)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-surface border-b border-gray-200 text-xs shrink-0">
        {([
          ['elektr',    '⚡ Elektr qurilmalar'],
          ['chiroq',    '💡 Chiroqlar'],
          ['olchamlar', '📐 O\'lchamlar'],
        ] as [TabId, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => handleTabChange(t)}
            className={`px-3 py-1 rounded-full font-medium transition-colors ${
              tab === t ? 'bg-brand text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
        {tab === 'elektr' && hasDevices && panel && (
          <div className="flex items-center gap-1.5 ml-2">
            <button
              onClick={handleRandomize}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full font-medium bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
              title="Simlarni tasodifiy ranglash va yo'nalish o'zgartirish"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
                <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
              </svg>
              Simlarni aralash
            </button>
            {Object.keys(wireColors).length > 0 && (
              <button
                onClick={resetWires}
                className="px-2 py-1 rounded-full font-medium bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                title="Standart rangga qaytarish"
              >Tiklash</button>
            )}
          </div>
        )}
        <span className="ml-auto text-gray-400">
          {tab === 'elektr' ? `${electricals.length} ta qurilma`
            : tab === 'chiroq' ? `${lights.length} ta chiroq`
            : `${electricals.length} ta o'lcham`}
        </span>
      </div>

      {/* Main area */}
      <div className="flex flex-1 min-h-0">
        {/* Left: 2D floor plan */}
        <div className="flex-1 min-h-0 overflow-auto flex items-start justify-center bg-paper p-4">
          <FloorPlan
            room={room}
            geometry={geometry}
            electricals={electricals}
            lights={lights}
            tab={tab}
            activeTool={activeTool}
            wireConfigs={wireConfigs}
            onPlaceElectrical={handlePlaceElectrical}
            onMoveElectrical={moveElectrical}
            onRemoveElectrical={removeElectrical}
            onPlaceLight={addLight}
            onRemoveLight={removeLight}
          />
        </div>

        {/* Divider */}
        <div className="w-px bg-gray-200 shrink-0"/>

        {/* Right: 3D view */}
        <div className="flex-1 min-h-0">
          <ElektrThreeDView
            room={room}
            geometry={geometry}
            designState={designState}
            electricals={electricals}
            lights={lights}
            wireConfigs={wireConfigs}
          />
        </div>

        {/* Sidebar */}
        {tab === 'elektr' ? (
          <ElektrSidebar
            activeTool={activeTool}
            onSelectTool={setActiveTool}
            electricals={electricals}
            onRemoveElectrical={removeElectrical}
          />
        ) : tab === 'chiroq' ? (
          <ChiroqSidebar lights={lights} onClearLights={clearLights}/>
        ) : (
          <OlchamlarSidebar electricals={electricals} wireLengths={wireLengths}/>
        )}
      </div>
    </div>
  )
}
