import * as THREE from 'three'

/**
 * Capture a color frame + linear depth frame from the current scene.
 * Returns both as PNG Blobs so they can be downloaded or fed to enhanceFrame.
 */
export async function captureFrame(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): Promise<{ colorPNG: Blob; depthPNG: Blob }> {
  const { width, height } = gl.domElement

  // ── Color pass ─────────────────────────────────────────────────────────────
  const colorTarget = new THREE.WebGLRenderTarget(width, height, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
  })
  gl.setRenderTarget(colorTarget)
  gl.render(scene, camera)
  gl.setRenderTarget(null)

  const colorBuf = new Uint8Array(width * height * 4)
  gl.readRenderTargetPixels(colorTarget, 0, 0, width, height, colorBuf)
  colorTarget.dispose()

  // ── Depth pass (linear depth written to R channel via a depth material) ────
  const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
  const depthTarget = new THREE.WebGLRenderTarget(width, height, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
  })
  const prevOverride = scene.overrideMaterial
  scene.overrideMaterial = depthMat
  gl.setRenderTarget(depthTarget)
  gl.render(scene, camera)
  gl.setRenderTarget(null)
  scene.overrideMaterial = prevOverride

  const depthBuf = new Uint8Array(width * height * 4)
  gl.readRenderTargetPixels(depthTarget, 0, 0, width, height, depthBuf)
  depthTarget.dispose()
  depthMat.dispose()

  // ── Convert pixel buffers → flipped PNG Blobs ──────────────────────────────
  const colorPNG = await bufferToPng(colorBuf, width, height, true)
  const depthPNG = await bufferToPng(depthBuf, width, height, true)

  return { colorPNG, depthPNG }
}

/**
 * Stub for AI-based photo enhancement.
 * Implement by calling a backend image API that accepts color+depth pair.
 *
 * @param color  PNG Blob from captureFrame (color pass)
 * @param depth  PNG Blob from captureFrame (depth pass)
 * @param stylePrompt  Description of desired style, e.g. "warm afternoon light, DSLR bokeh"
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function enhanceFrame(
  _color: Blob,
  _depth: Blob,
  _stylePrompt: string,
): Promise<Blob> {
  // TODO: POST to /api/v1/photo/enhance with multipart form containing color + depth
  throw new Error('enhanceFrame not yet implemented — wire up the AI backend endpoint')
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function bufferToPng(
  buf: Uint8Array,
  width: number,
  height: number,
  flipY: boolean,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!

    const imageData = ctx.createImageData(width, height)
    if (flipY) {
      // WebGL pixel rows are bottom-to-top; flip for correct PNG orientation
      for (let row = 0; row < height; row++) {
        const srcRow = height - 1 - row
        imageData.data.set(buf.subarray(srcRow * width * 4, (srcRow + 1) * width * 4), row * width * 4)
      }
    } else {
      imageData.data.set(buf)
    }
    ctx.putImageData(imageData, 0, 0)

    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('canvas.toBlob returned null'))
    }, 'image/png')
  })
}
