import * as THREE from 'three'

// ─── Texture key registry ─────────────────────────────────────────────────────

export type MaterialTextureKey =
  | 'parquet'
  | 'parquet_herringbone'
  | 'tile_ceramic'
  | 'tile_marble'
  | 'plaster'
  | 'concrete'
  | 'paint'

export interface TextureSet {
  map: THREE.CanvasTexture
  roughnessMap: THREE.CanvasTexture
  normalMap: THREE.CanvasTexture
  roughness: number
  metalness: number
  repeat: [number, number]
}

// ─── Canvas draw helpers ──────────────────────────────────────────────────────

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  return [c, ctx]
}

function canvasToTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

// ─── Sobel normal map generator ──────────────────────────────────────────────

function normalMapFromHeight(
  drawHeight: (ctx: CanvasRenderingContext2D, size: number) => void,
  size: number,
  scale = 3.0,
): THREE.CanvasTexture {
  const [, hctx] = makeCanvas(size)
  drawHeight(hctx, size)
  const src = hctx.getImageData(0, 0, size, size).data

  const [oc, octx] = makeCanvas(size)
  const out = octx.createImageData(size, size)

  const get = (x: number, y: number) => {
    const px = ((x % size) + size) % size
    const py = ((y % size) + size) % size
    return src[(py * size + px) * 4] / 255
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = get(x - 1, y - 1); const tc = get(x, y - 1); const tr = get(x + 1, y - 1)
      const ml = get(x - 1, y);                                  const mr = get(x + 1, y)
      const bl = get(x - 1, y + 1); const bc = get(x, y + 1); const br = get(x + 1, y + 1)

      const gx = (-tl - 2 * ml - bl + tr + 2 * mr + br) * scale
      const gy = (-tl - 2 * tc - tr + bl + 2 * bc + br) * scale

      const i = (y * size + x) * 4
      out.data[i]     = Math.max(0, Math.min(255, Math.round(gx * 127.5 + 128)))
      out.data[i + 1] = Math.max(0, Math.min(255, Math.round(gy * 127.5 + 128)))
      out.data[i + 2] = 255
      out.data[i + 3] = 255
    }
  }
  octx.putImageData(out, 0, 0)

  const tex = new THREE.CanvasTexture(oc)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

// Subtle grain noise overlay
function addGrain(ctx: CanvasRenderingContext2D, size: number, opacity: number) {
  for (let i = 0; i < size * size * 0.04; i++) {
    const x = (Math.sin(i * 127.1) * 0.5 + 0.5) * size
    const y = (Math.sin(i * 311.7) * 0.5 + 0.5) * size
    const v = Math.floor((Math.sin(i * 73.3) * 0.5 + 0.5) * 255)
    ctx.fillStyle = `rgba(${v},${v},${v},${opacity})`
    ctx.fillRect(x, y, 1, 1)
  }
}

// ─── Draw functions ───────────────────────────────────────────────────────────

function drawParquetMap(size: number, color: string): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(size)
  const plankW = size / 4
  const plankH = size / 2
  const light = lightenHex(color, 15)
  const dark = darkenHex(color, 12)

  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const offset = row % 2 === 0 ? 0 : plankH / 2
      const x = col * plankW
      const y = row * (plankH / 2) - offset
      ctx.fillStyle = (row + col) % 2 === 0 ? color : (row % 3 === 0 ? dark : light)
      ctx.fillRect(x, y, plankW - 1.5, plankH - 1)
      // Wood grain lines
      ctx.strokeStyle = darkenHex(color, 25) + '55'
      ctx.lineWidth = 0.5
      for (let g = 0; g < 4; g++) {
        const gx = x + (g / 4) * plankW
        ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx + 3, y + plankH); ctx.stroke()
      }
    }
  }
  addGrain(ctx, size, 0.04)
  return canvasToTexture(c)
}

function drawParquetRoughness(size: number): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(size)
  ctx.fillStyle = '#888888'
  ctx.fillRect(0, 0, size, size)
  addGrain(ctx, size, 0.15)
  return canvasToTexture(c)
}

function drawParquetHerringboneMap(size: number): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(size)
  ctx.fillStyle = '#A0784A'
  ctx.fillRect(0, 0, size, size)
  const w = size / 8
  const h = size / 4
  const palette = ['#C4945A', '#A0784A', '#B8895A', '#8C6840']
  for (let row = -1; row < 6; row++) {
    for (let col = -1; col < 6; col++) {
      const x = col * w * 2 + (row % 2 === 0 ? 0 : w)
      const y = row * h * 0.5

      ctx.save()
      ctx.translate(x + w / 2, y + h / 2)
      ctx.rotate(Math.PI / 4)
      ctx.fillStyle = palette[(row * 3 + col * 2) % palette.length]
      ctx.fillRect(-w / 2, -h / 2, w - 1, h - 1)
      // grain
      ctx.strokeStyle = 'rgba(0,0,0,0.08)'
      ctx.lineWidth = 0.5
      for (let g = 1; g < 4; g++) {
        ctx.beginPath(); ctx.moveTo(-w / 2 + g * (w / 4), -h / 2); ctx.lineTo(-w / 2 + g * (w / 4), h / 2); ctx.stroke()
      }
      ctx.restore()
    }
  }
  addGrain(ctx, size, 0.04)
  return canvasToTexture(c)
}

function drawTileCeramicMap(size: number): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(size)
  const tileSize = size / 4
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const v = 220 + Math.floor((Math.sin(row * 7.3 + col * 13.1) * 0.5 + 0.5) * 20)
      ctx.fillStyle = `rgb(${v},${v - 2},${v - 5})`
      ctx.fillRect(col * tileSize, row * tileSize, tileSize - 2, tileSize - 2)
    }
  }
  ctx.fillStyle = '#C8C8C5'
  // Grout lines
  for (let i = 0; i <= 5; i++) {
    ctx.fillRect(i * tileSize - 1, 0, 2, size)
    ctx.fillRect(0, i * tileSize - 1, size, 2)
  }
  addGrain(ctx, size, 0.02)
  return canvasToTexture(c)
}

function drawTileCeramicRoughness(size: number): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(size)
  const tileSize = size / 4
  ctx.fillStyle = '#333333'
  ctx.fillRect(0, 0, size, size)
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      ctx.fillStyle = '#444444'
      ctx.fillRect(col * tileSize + 1, row * tileSize + 1, tileSize - 3, tileSize - 3)
    }
  }
  return canvasToTexture(c)
}

function drawTileMarbleMap(size: number): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(size)
  ctx.fillStyle = '#F0EDE8'
  ctx.fillRect(0, 0, size, size)
  // Veins
  ctx.strokeStyle = 'rgba(180,170,165,0.4)'
  ctx.lineWidth = 1
  for (let v = 0; v < 12; v++) {
    ctx.beginPath()
    const sx = (Math.sin(v * 31.3) * 0.5 + 0.5) * size
    const sy = (Math.cos(v * 17.7) * 0.5 + 0.5) * size
    ctx.moveTo(sx, sy)
    for (let s = 0; s < 8; s++) {
      const cx = sx + Math.sin(v * 7.1 + s * 2.3) * size * 0.3
      const cy = sy + Math.cos(v * 3.7 + s * 1.9) * size * 0.15
      ctx.lineTo(cx, cy)
    }
    ctx.lineWidth = 0.5 + (v % 3) * 0.5
    ctx.strokeStyle = `rgba(160,150,145,${0.15 + (v % 4) * 0.06})`
    ctx.stroke()
  }
  addGrain(ctx, size, 0.015)
  return canvasToTexture(c)
}

function drawPlasterMap(size: number): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(size)
  ctx.fillStyle = '#F2EEE8'
  ctx.fillRect(0, 0, size, size)
  addGrain(ctx, size, 0.07)
  return canvasToTexture(c)
}

function drawPlasterRoughness(size: number): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(size)
  ctx.fillStyle = '#AAAAAA'
  ctx.fillRect(0, 0, size, size)
  addGrain(ctx, size, 0.3)
  return canvasToTexture(c)
}

function drawConcreteMap(size: number): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(size)
  ctx.fillStyle = '#C0BDB8'
  ctx.fillRect(0, 0, size, size)
  addGrain(ctx, size, 0.12)
  // Subtle horizontal streaks
  for (let i = 0; i < 20; i++) {
    const y = (Math.sin(i * 43.3) * 0.5 + 0.5) * size
    ctx.strokeStyle = `rgba(100,98,96,${0.04 + (i % 3) * 0.02})`
    ctx.lineWidth = 0.5 + Math.sin(i * 7.3) * 0.5
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y + 3); ctx.stroke()
  }
  return canvasToTexture(c)
}

function drawPaintMap(size: number): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(size)
  ctx.fillStyle = '#F5F2EE'
  ctx.fillRect(0, 0, size, size)
  addGrain(ctx, size, 0.03)
  return canvasToTexture(c)
}

function drawPaintRoughness(size: number): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(size)
  ctx.fillStyle = '#BBBBBB'
  ctx.fillRect(0, 0, size, size)
  addGrain(ctx, size, 0.08)
  return canvasToTexture(c)
}

// ─── Height-map drawers for normal-map generation ────────────────────────────

function heightParquet(ctx: CanvasRenderingContext2D, size: number) {
  ctx.fillStyle = '#CCCCCC'
  ctx.fillRect(0, 0, size, size)
  const plankW = size / 4
  const plankH = size / 2
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const offset = row % 2 === 0 ? 0 : plankH / 2
      const x = col * plankW
      const y = row * (plankH / 2) - offset
      ctx.fillStyle = '#BBBBBB'
      ctx.fillRect(x + 1, y + 1, plankW - 2, plankH - 2)
      ctx.fillStyle = '#888888'
      ctx.fillRect(x, y, plankW, 1)
      ctx.fillRect(x, y, 1, plankH)
    }
  }
}

function heightTileCeramic(ctx: CanvasRenderingContext2D, size: number) {
  const tileSize = size / 4
  ctx.fillStyle = '#999999'
  ctx.fillRect(0, 0, size, size)
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      ctx.fillStyle = '#DDDDDD'
      ctx.fillRect(c * tileSize + 2, r * tileSize + 2, tileSize - 4, tileSize - 4)
    }
  }
}

function heightPlaster(ctx: CanvasRenderingContext2D, size: number) {
  ctx.fillStyle = '#AAAAAA'
  ctx.fillRect(0, 0, size, size)
  addGrain(ctx, size, 0.35)
}

function heightConcrete(ctx: CanvasRenderingContext2D, size: number) {
  ctx.fillStyle = '#999999'
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 18; i++) {
    const y = (Math.sin(i * 43.3) * 0.5 + 0.5) * size
    ctx.strokeStyle = `rgba(0,0,0,${0.06 + (i % 3) * 0.03})`
    ctx.lineWidth = 1 + Math.sin(i * 7.3) * 0.5
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y + 4); ctx.stroke()
  }
  addGrain(ctx, size, 0.12)
}

function heightPaint(ctx: CanvasRenderingContext2D, size: number) {
  ctx.fillStyle = '#BBBBBB'
  ctx.fillRect(0, 0, size, size)
  addGrain(ctx, size, 0.06)
}

// ─── Colour math ──────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function lightenHex(hex: string, pct: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgb(${Math.min(255, r + pct)},${Math.min(255, g + pct)},${Math.min(255, b + pct)})`
}

function darkenHex(hex: string, pct: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgb(${Math.max(0, r - pct)},${Math.max(0, g - pct)},${Math.max(0, b - pct)})`
}

// ─── Texture registry & cache ─────────────────────────────────────────────────

const SIZE = 512

const textureCache = new Map<MaterialTextureKey, TextureSet>()

function buildTextureSet(key: MaterialTextureKey): TextureSet {
  switch (key) {
    case 'parquet':
      return {
        map: drawParquetMap(SIZE, '#B8894E'),
        roughnessMap: drawParquetRoughness(SIZE),
        normalMap: normalMapFromHeight(heightParquet, SIZE, 2.5),
        roughness: 0.48,
        metalness: 0.02,
        repeat: [2, 2],
      }
    case 'parquet_herringbone':
      return {
        map: drawParquetHerringboneMap(SIZE),
        roughnessMap: drawParquetRoughness(SIZE),
        normalMap: normalMapFromHeight(heightParquet, SIZE, 2.5),
        roughness: 0.48,
        metalness: 0.02,
        repeat: [2.5, 2.5],
      }
    case 'tile_ceramic':
      return {
        map: drawTileCeramicMap(SIZE),
        roughnessMap: drawTileCeramicRoughness(SIZE),
        normalMap: normalMapFromHeight(heightTileCeramic, SIZE, 4.0),
        roughness: 0.16,
        metalness: 0.02,
        repeat: [3, 3],
      }
    case 'tile_marble':
      return {
        map: drawTileMarbleMap(SIZE),
        roughnessMap: drawTileCeramicRoughness(SIZE),
        normalMap: normalMapFromHeight(heightTileCeramic, SIZE, 2.0),
        roughness: 0.10,
        metalness: 0.03,
        repeat: [2, 2],
      }
    case 'plaster':
      return {
        map: drawPlasterMap(SIZE),
        roughnessMap: drawPlasterRoughness(SIZE),
        normalMap: normalMapFromHeight(heightPlaster, SIZE, 1.5),
        roughness: 0.86,
        metalness: 0.0,
        repeat: [3, 2],
      }
    case 'concrete':
      return {
        map: drawConcreteMap(SIZE),
        roughnessMap: drawPlasterRoughness(SIZE),
        normalMap: normalMapFromHeight(heightConcrete, SIZE, 2.0),
        roughness: 0.90,
        metalness: 0.01,
        repeat: [2, 2],
      }
    case 'paint':
      return {
        map: drawPaintMap(SIZE),
        roughnessMap: drawPaintRoughness(SIZE),
        normalMap: normalMapFromHeight(heightPaint, SIZE, 0.8),
        roughness: 0.80,
        metalness: 0.0,
        repeat: [4, 3],
      }
  }
}

export function getMaterialTextures(key: MaterialTextureKey): TextureSet {
  if (!textureCache.has(key)) {
    textureCache.set(key, buildTextureSet(key))
  }
  return textureCache.get(key)!
}

export function disposeMaterialTextures(key: MaterialTextureKey) {
  const set = textureCache.get(key)
  if (!set) return
  set.map.dispose()
  set.roughnessMap.dispose()
  set.normalMap.dispose()
  textureCache.delete(key)
}

// Map common material names / colors to a texture key
const COLOR_KEY_MAP: Array<[RegExp, MaterialTextureKey]> = [
  [/parket|yog'|дерево/i, 'parquet'],
  [/herring/i, 'parquet_herringbone'],
  [/plitka|keramik|tile/i, 'tile_ceramic'],
  [/marble|marmar/i, 'tile_marble'],
  [/beton|concrete/i, 'concrete'],
  [/gips|plaster|shtukatur/i, 'plaster'],
]

export function inferTextureKey(
  explicitKey: string | null | undefined,
  materialName: string | null | undefined,
): MaterialTextureKey | null {
  if (explicitKey) return explicitKey as MaterialTextureKey
  if (!materialName) return null
  for (const [re, key] of COLOR_KEY_MAP) {
    if (re.test(materialName)) return key
  }
  return null
}
