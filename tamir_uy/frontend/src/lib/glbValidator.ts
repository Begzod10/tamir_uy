export interface GlbInfo {
  valid: boolean
  textureCount: number
  materialCount: number
  meshCount: number
  hasTextures: boolean
  sizeM: { w: number; d: number; h: number }
  scale: number
}

/** Parse a GLB ArrayBuffer and return metadata without loading Three.js. */
export function parseGlbInfo(buffer: ArrayBuffer): GlbInfo {
  const bad: GlbInfo = { valid: false, textureCount: 0, materialCount: 0, meshCount: 0, hasTextures: false, sizeM: { w: 1, d: 1, h: 1 }, scale: 1 }
  try {
    const view = new DataView(buffer)
    const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))
    if (magic !== 'glTF') return bad

    const chunk0Length = view.getUint32(12, true)
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, chunk0Length))) as {
      meshes?: { primitives?: { attributes?: { POSITION?: number } }[] }[]
      materials?: unknown[]
      textures?: unknown[]
    }

    const textureCount = json.textures?.length ?? 0
    const materialCount = json.materials?.length ?? 0
    const meshCount = json.meshes?.length ?? 0

    // Compute bounding box from accessor min/max (GLTF spec requires these for POSITION)
    const accs = (json as Record<string, unknown>).accessors as { min?: number[]; max?: number[] }[] | undefined
    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

    for (const mesh of json.meshes ?? []) {
      for (const prim of mesh.primitives ?? []) {
        const posIdx = prim.attributes?.POSITION
        if (posIdx === undefined) continue
        const acc = accs?.[posIdx]
        if (!acc?.min || !acc?.max) continue
        minX = Math.min(minX, acc.min[0]); maxX = Math.max(maxX, acc.max[0])
        minY = Math.min(minY, acc.min[1]); maxY = Math.max(maxY, acc.max[1])
        minZ = Math.min(minZ, acc.min[2]); maxZ = Math.max(maxZ, acc.max[2])
      }
    }

    let sizeM = { w: 1, d: 1, h: 1 }
    let scale = 1
    if (isFinite(minX)) {
      const rawW = maxX - minX
      const rawH = maxY - minY
      const rawD = maxZ - minZ
      const maxDim = Math.max(rawW, rawH, rawD)
      // Auto-detect units: mm if >100, cm if >10, else meters
      const toM = maxDim > 100 ? 0.001 : maxDim > 10 ? 0.01 : 1
      scale = toM
      sizeM = {
        w: parseFloat((rawW * toM).toFixed(2)),
        h: parseFloat((rawH * toM).toFixed(2)),
        d: parseFloat((rawD * toM).toFixed(2)),
      }
    }

    return { valid: true, textureCount, materialCount, meshCount, hasTextures: textureCount > 0, sizeM, scale }
  } catch {
    return bad
  }
}
