import { useState } from 'react'
import { convertImageTo3D, waitForMeshyTask, type ConvertImageTo3DResponse } from '@/lib/api'

interface Image3DConverterProps {
  onModelReady?: (modelUrl: string, format: string) => void
  onError?: (error: string) => void
}

type ConverterState = 'idle' | 'uploading' | 'processing' | 'complete' | 'error'

export function Image3DConverter({ onModelReady, onError }: Image3DConverterProps) {
  const [state, setState] = useState<ConverterState>('idle')
  const [imageUrl, setImageUrl] = useState('')
  const [taskId, setTaskId] = useState('')
  const [result, setResult] = useState<ConvertImageTo3DResponse | null>(null)
  const [error, setError] = useState('')

  async function handleConvert() {
    if (!imageUrl.trim()) {
      setError('Rasm URL kiriting')
      onError?.('Rasm URL kiriting')
      return
    }

    setState('uploading')
    setError('')

    try {
      // Start conversion (non-blocking)
      const response = await convertImageTo3D({
        image_url: imageUrl,
        enable_pbr: true,
        wait_for_completion: false,
      })

      setTaskId(response.task_id)
      setState('processing')

      // Poll for completion
      const completed = await waitForMeshyTask(response.task_id)
      setResult(completed)

      if (completed.status === 'SUCCEEDED' && completed.model_urls) {
        setState('complete')
        const glbUrl = completed.model_urls.glb || Object.values(completed.model_urls)[0]
        if (glbUrl) {
          onModelReady?.(glbUrl, 'glb')
        }
      } else {
        setError(completed.message || '3D modeli yaratishda xatolik')
        setState('error')
        onError?.(completed.message || 'Konversiya xatosi')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Noma\'lum xatolik'
      setError(message)
      setState('error')
      onError?.(message)
    }
  }

  function handleReset() {
    setState('idle')
    setImageUrl('')
    setTaskId('')
    setResult(null)
    setError('')
  }

  return (
    <div className="space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
      <div>
        <label className="block text-sm font-semibold text-gray-900 mb-2">
          📸 Rasm URL (Xona yoki mebel)
        </label>
        <input
          type="url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          disabled={state !== 'idle'}
          placeholder="https://example.com/room.jpg"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-50"
        />
        <p className="text-xs text-gray-500 mt-1">
          Public URL ga ega bo'lgan xona yoki mebel rasmini kiriting
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {state === 'processing' && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded">
          <div className="text-sm text-blue-700 font-medium mb-2">
            ⏳ 3D model yaratilmoqda...
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full animate-pulse"
              style={{ width: '60%' }}
            />
          </div>
        </div>
      )}

      {state === 'complete' && result && (
        <div className="p-3 bg-green-50 border border-green-200 rounded">
          <div className="text-sm text-green-700 font-medium mb-2">
            ✅ 3D model tayyor!
          </div>
          {result.model_urls && (
            <div className="space-y-2">
              {Object.entries(result.model_urls).map(([format, url]) => (
                <a
                  key={format}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-green-600 hover:text-green-700 underline block truncate"
                >
                  {format.toUpperCase()} yuklash
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleConvert}
          disabled={state !== 'idle' || !imageUrl.trim()}
          className="flex-1 bg-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {state === 'processing' ? 'Ishlanmoqda...' : '3D yaratish'}
        </button>

        {state !== 'idle' && (
          <button
            onClick={handleReset}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Tozalash
          </button>
        )}
      </div>
    </div>
  )
}

export default Image3DConverter
