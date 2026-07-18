import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

export interface ModelInfo {
  sizeM: { w: number; d: number; h: number }
  scale: number
  hasTextures: boolean
  materialCount: number
}

export const SUPPORTED_FORMATS = '.glb,.gltf,.obj,.fbx'

function extractSceneInfo(root: THREE.Object3D): ModelInfo {
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z) || 1

  // Auto-detect units: mm >100, cm >10, else metres
  const toM = maxDim > 100 ? 0.001 : maxDim > 10 ? 0.01 : 1

  let materialCount = 0
  let hasTextures = false
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    materialCount += mats.length
    for (const m of mats) {
      if (m instanceof THREE.MeshStandardMaterial && m.map) hasTextures = true
      if (m instanceof THREE.MeshBasicMaterial   && m.map) hasTextures = true
    }
  })

  return {
    sizeM: {
      w: parseFloat((size.x * toM).toFixed(2)),
      h: parseFloat((size.y * toM).toFixed(2)),
      d: parseFloat((size.z * toM).toFixed(2)),
    },
    scale: toM,
    hasTextures,
    materialCount,
  }
}

function toGlbBuffer(scene: THREE.Object3D): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(
      scene,
      (result) => resolve(result as ArrayBuffer),
      reject,
      { binary: true },
    )
  })
}

export async function convertToGlb(
  file: File,
): Promise<{ buffer: ArrayBuffer; info: ModelInfo }> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const url = URL.createObjectURL(file)

  try {
    if (ext === 'glb') {
      // GLB: load to extract scene info, but keep original bytes
      const [buffer, gltf] = await Promise.all([
        file.arrayBuffer(),
        new GLTFLoader().loadAsync(url),
      ])
      return { buffer, info: extractSceneInfo(gltf.scene) }
    }

    if (ext === 'gltf') {
      const gltf = await new GLTFLoader().loadAsync(url)
      const buffer = await toGlbBuffer(gltf.scene)
      return { buffer, info: extractSceneInfo(gltf.scene) }
    }

    if (ext === 'obj') {
      const scene = await new OBJLoader().loadAsync(url)
      const buffer = await toGlbBuffer(scene)
      return { buffer, info: extractSceneInfo(scene) }
    }

    if (ext === 'fbx') {
      const scene = await new FBXLoader().loadAsync(url)
      const buffer = await toGlbBuffer(scene)
      return { buffer, info: extractSceneInfo(scene) }
    }

    throw new Error(`Qo'llab-quvvatlanmaydigan format: .${ext}`)
  } finally {
    URL.revokeObjectURL(url)
  }
}
