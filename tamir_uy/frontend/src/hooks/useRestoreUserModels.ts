import { useEffect } from 'react'
import { useRoomStore } from '@/store/roomStore'
import { getModelFromDb, arrayBufferToBlobUrl } from '@/lib/modelDb'
import { useGLTF } from '@react-three/drei'

/** On startup, recreate blob URLs for any user-imported models (they expire on page refresh). */
export function useRestoreUserModels() {
  const userFurniture = useRoomStore((s) => s.userFurniture)
  const setUserFurniturePath = useRoomStore((s) => s.setUserFurniturePath)

  useEffect(() => {
    for (const entry of userFurniture) {
      if (entry.modelPath) continue  // already live
      getModelFromDb(entry.blobId).then((buffer) => {
        if (!buffer) return
        const url = arrayBufferToBlobUrl(buffer)
        useGLTF.preload(url)
        setUserFurniturePath(entry.id, url)
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
