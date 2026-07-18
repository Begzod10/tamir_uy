import * as React from 'react'
import { nanoid } from 'nanoid'
import { convertToGlb, SUPPORTED_FORMATS } from '@/lib/modelConverter'
import { saveModelToDb, arrayBufferToBlobUrl } from '@/lib/modelDb'
import { useRoomStore } from '@/store/roomStore'
import { useGLTF } from '@react-three/drei'

export function ModelImportButton({ compact = false }: { compact?: boolean }) {
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [warn, setWarn] = React.useState<string | null>(null)
  const addUserFurniture = useRoomStore((s) => s.addUserFurniture)

  async function handleFile(file: File) {
    setStatus('loading')
    setWarn(null)
    try {
      const { buffer, info } = await convertToGlb(file)

      if (!info.hasTextures) {
        setWarn(
          `Bu model tekstura xaritalarisiz (${info.materialCount} material, faqat rang). ` +
          `Yaxshi ko'rinish uchun teksturalı GLB yuklang.`,
        )
      }

      const id = nanoid()
      await saveModelToDb(id, buffer)
      const modelPath = arrayBufferToBlobUrl(buffer)

      useGLTF.preload(modelPath)

      const baseName = file.name.replace(/\.(glb|gltf|obj|fbx)$/i, '').replace(/_/g, ' ')
      addUserFurniture({
        id,
        name: baseName,
        emoji: '📦',
        blobId: id,
        modelPath,
        scale: info.scale,
        sizeM: info.sizeM,
        hasTextures: info.hasTextures,
      })

      setStatus('done')
      setTimeout(() => setStatus('idle'), 1500)
    } catch (err) {
      setStatus('error')
      const msg = err instanceof Error ? err.message : ''
      setWarn(msg || 'Faylni o\'qishda xatolik yuz berdi.')
    }
  }

  const label =
    status === 'loading' ? 'Yuklanmoqda' :
    status === 'done'    ? 'Qo\'shildi'  :
                           'Model yuklash'

  if (compact) {
    return (
      <>
        <input
          ref={fileRef}
          type="file"
          accept={SUPPORTED_FORMATS}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) { handleFile(f); e.target.value = '' }
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={status === 'loading'}
          className="flex flex-col items-center gap-1 text-gray-400 hover:text-brand transition-colors px-3 py-2"
        >
          <span className="text-2xl">
            {status === 'loading' ? '⏳' : status === 'done' ? '✅' : '+'}
          </span>
          <span className="text-[10px] font-medium text-center leading-tight">{label}</span>
          <span className="text-[9px] text-gray-400 leading-tight">GLB · GLTF · OBJ · FBX</span>
        </button>
      </>
    )
  }

  return (
    <div className="space-y-1.5">
      <input
        ref={fileRef}
        type="file"
        accept={SUPPORTED_FORMATS}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) { handleFile(f); e.target.value = '' }
        }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={status === 'loading'}
        className={`w-full text-xs py-2 border-2 border-dashed rounded-lg transition-colors ${
          status === 'done'
            ? 'border-green-400 text-green-600'
            : status === 'error'
            ? 'border-red-300 text-red-500'
            : 'border-gray-300 text-gray-500 hover:border-brand/50 hover:text-brand'
        }`}
      >
        {status === 'loading' ? 'Yuklanmoqda...' :
         status === 'done'    ? '✓ Qo\'shildi'  :
                                '+ Model qo\'shish (GLB · GLTF · OBJ · FBX)'}
      </button>
      {warn && <p className="text-xs text-amber-600 leading-snug">{warn}</p>}
    </div>
  )
}
