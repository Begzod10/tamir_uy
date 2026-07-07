import * as THREE from 'three'

// ─── Pattern registry ─────────────────────────────────────────────────────────

export const OBOY_PATTERNS = [
  { id: 'yolli',     label: "Yo'lli" },
  { id: 'damask',    label: 'Damask' },
  { id: 'geometrik', label: 'Geometrik' },
  { id: 'gul',       label: 'Gul' },
  { id: 'tekstura',  label: 'Tekstura' },
  { id: 'bolalar',   label: 'Bolalar' },
] as const

export type OboyPatternId = typeof OBOY_PATTERNS[number]['id']

// ─── Draw functions ───────────────────────────────────────────────────────────

type DrawFn = (ctx: CanvasRenderingContext2D, size: number, base: string, accent: string) => void

function drawYolli(ctx: CanvasRenderingContext2D, size: number, base: string, accent: string) {
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)
  const unit = size / 6.4
  for (let x = -unit; x < size + unit; x += unit) {
    ctx.fillStyle = accent
    ctx.fillRect(x, 0, unit * 0.28, size)
  }
}

function drawDamaskMotif(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.strokeStyle = color
  ctx.lineWidth = r * 0.08
  ctx.fillStyle = color + '22'
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.35, r * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.18, r * 0.32, 0, 0, Math.PI * 2); ctx.stroke()
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 3 / 2]) {
    ctx.save()
    ctx.rotate(angle)
    ctx.beginPath(); ctx.ellipse(0, -r * 0.6, r * 0.12, r * 0.18, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.restore()
  }
  ctx.restore()
}

function drawDamask(ctx: CanvasRenderingContext2D, size: number, base: string, accent: string) {
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)
  const half = size / 2
  for (const [ox, oy] of [[0, 0], [half, 0], [0, half], [half, half]] as [number, number][]) {
    drawDamaskMotif(ctx, ox + half / 2, oy + half / 2, half * 0.42, accent)
  }
}

function drawGeometrik(ctx: CanvasRenderingContext2D, size: number, base: string, accent: string) {
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)
  const cols = 4, rows = 4
  const cw = size / cols, ch = size / rows
  for (let r = -1; r <= rows + 1; r++) {
    for (let c = -1; c <= cols + 1; c++) {
      const px = (c + (r % 2 === 0 ? 0 : 0.5)) * cw
      const py = r * ch
      ctx.beginPath()
      ctx.moveTo(px, py - ch * 0.42)
      ctx.lineTo(px + cw * 0.42, py)
      ctx.lineTo(px, py + ch * 0.42)
      ctx.lineTo(px - cw * 0.42, py)
      ctx.closePath()
      ctx.strokeStyle = accent
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }
}

function drawFlower(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.fillStyle = color
  for (let i = 0; i < 6; i++) {
    ctx.save()
    ctx.rotate((i * Math.PI * 2) / 6)
    ctx.beginPath()
    ctx.ellipse(0, -r * 0.55, r * 0.22, r * 0.38, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

function drawGul(ctx: CanvasRenderingContext2D, size: number, base: string, accent: string) {
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)
  const spacing = size / 5
  for (let r = -1; r <= 6; r++) {
    for (let c = -1; c <= 6; c++) {
      const cx = (c + (r % 2 === 0 ? 0 : 0.5)) * spacing
      const cy = r * spacing
      drawFlower(ctx, cx, cy, spacing * 0.28, accent)
    }
  }
}

function drawTekstura(ctx: CanvasRenderingContext2D, size: number, base: string, accent: string) {
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = accent + '55'
  ctx.lineWidth = 0.8
  for (let y = 0; y < size; y += 4) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke()
  }
  for (let x = 0; x < size; x += 4) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke()
  }
  for (let i = 0; i < 800; i++) {
    const px = (Math.sin(i * 2.1) * 0.5 + 0.5) * size
    const py = (Math.cos(i * 3.7) * 0.5 + 0.5) * size
    ctx.fillStyle = accent + '18'
    ctx.fillRect(px, py, 1, 1)
  }
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.fillStyle = color
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const outerA = (i * 4 * Math.PI) / 5 - Math.PI / 2
    const innerA = outerA + (2 * Math.PI) / 10
    if (i === 0) ctx.moveTo(Math.cos(outerA) * r, Math.sin(outerA) * r)
    else ctx.lineTo(Math.cos(outerA) * r, Math.sin(outerA) * r)
    ctx.lineTo(Math.cos(innerA) * r * 0.45, Math.sin(innerA) * r * 0.45)
  }
  ctx.closePath(); ctx.fill()
  ctx.restore()
}

function drawBolalar(ctx: CanvasRenderingContext2D, size: number, base: string, accent: string) {
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)
  const spacing = size / 5
  for (let r = -1; r <= 6; r++) {
    for (let c = -1; c <= 6; c++) {
      const cx = (c + (r % 2 === 0 ? 0 : 0.5)) * spacing
      const cy = r * spacing
      if ((r + c) % 3 === 0) {
        drawStar(ctx, cx, cy, spacing * 0.18, accent)
      } else {
        ctx.fillStyle = accent
        ctx.beginPath(); ctx.arc(cx, cy, spacing * 0.1, 0, Math.PI * 2); ctx.fill()
      }
    }
  }
}

const DRAW_FNS: Record<OboyPatternId, DrawFn> = {
  yolli: drawYolli,
  damask: drawDamask,
  geometrik: drawGeometrik,
  gul: drawGul,
  tekstura: drawTekstura,
  bolalar: drawBolalar,
}

// ─── Texture cache ────────────────────────────────────────────────────────────

const textureCache = new Map<string, THREE.CanvasTexture>()

export function createOboyTexture(patternId: OboyPatternId, base: string, accent: string): THREE.CanvasTexture {
  const key = `${patternId}|${base}|${accent}`
  if (textureCache.has(key)) return textureCache.get(key)!

  const canvas = document.createElement('canvas')
  canvas.width = 512; canvas.height = 512
  const ctx = canvas.getContext('2d')!
  DRAW_FNS[patternId](ctx, 512, base, accent)

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace

  if (textureCache.size > 50) {
    const first = textureCache.keys().next().value
    if (first !== undefined) {
      textureCache.get(first)!.dispose()
      textureCache.delete(first)
    }
  }
  textureCache.set(key, tex)
  return tex
}

// ─── SVG pattern strings for isometric preview ───────────────────────────────

export function getOboySvgPattern(patternId: OboyPatternId, base: string, accent: string, uid: string): string {
  switch (patternId) {
    case 'yolli':
      return `<pattern id="${uid}" patternUnits="userSpaceOnUse" width="20" height="40">
        <rect width="20" height="40" fill="${base}"/>
        <rect x="0" width="5" height="40" fill="${accent}" opacity="0.5"/>
      </pattern>`
    case 'damask':
      return `<pattern id="${uid}" patternUnits="userSpaceOnUse" width="40" height="40">
        <rect width="40" height="40" fill="${base}"/>
        <ellipse cx="20" cy="20" rx="8" ry="14" fill="none" stroke="${accent}" stroke-width="1.5" opacity="0.6"/>
        <ellipse cx="20" cy="20" rx="4" ry="7" fill="${accent}" opacity="0.2"/>
      </pattern>`
    case 'geometrik':
      return `<pattern id="${uid}" patternUnits="userSpaceOnUse" width="30" height="30">
        <rect width="30" height="30" fill="${base}"/>
        <polygon points="15,3 27,15 15,27 3,15" fill="none" stroke="${accent}" stroke-width="1.5" opacity="0.6"/>
      </pattern>`
    case 'gul':
      return `<pattern id="${uid}" patternUnits="userSpaceOnUse" width="24" height="24">
        <rect width="24" height="24" fill="${base}"/>
        <circle cx="12" cy="12" r="3" fill="${accent}" opacity="0.7"/>
        <circle cx="12" cy="5" r="2" fill="${accent}" opacity="0.5"/>
        <circle cx="12" cy="19" r="2" fill="${accent}" opacity="0.5"/>
        <circle cx="5" cy="12" r="2" fill="${accent}" opacity="0.5"/>
        <circle cx="19" cy="12" r="2" fill="${accent}" opacity="0.5"/>
      </pattern>`
    case 'tekstura':
      return `<pattern id="${uid}" patternUnits="userSpaceOnUse" width="8" height="8">
        <rect width="8" height="8" fill="${base}"/>
        <line x1="0" y1="4" x2="8" y2="4" stroke="${accent}" stroke-width="0.5" opacity="0.3"/>
        <line x1="4" y1="0" x2="4" y2="8" stroke="${accent}" stroke-width="0.5" opacity="0.3"/>
      </pattern>`
    case 'bolalar':
      return `<pattern id="${uid}" patternUnits="userSpaceOnUse" width="30" height="30">
        <rect width="30" height="30" fill="${base}"/>
        <circle cx="8" cy="8" r="3" fill="${accent}" opacity="0.7"/>
        <circle cx="22" cy="22" r="3" fill="${accent}" opacity="0.7"/>
        <polygon points="22,5 24,11 18,11" fill="${accent}" opacity="0.6"/>
        <circle cx="8" cy="22" r="2" fill="${accent}" opacity="0.5"/>
      </pattern>`
  }
}
