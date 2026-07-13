import { get, set, del } from 'idb-keyval'

const PREFIX = 'model_'

export async function saveModelToDb(id: string, data: ArrayBuffer): Promise<void> {
  await set(PREFIX + id, data)
}

export async function getModelFromDb(id: string): Promise<ArrayBuffer | undefined> {
  return get<ArrayBuffer>(PREFIX + id)
}

export async function deleteModelFromDb(id: string): Promise<void> {
  await del(PREFIX + id)
}

export function arrayBufferToBlobUrl(buffer: ArrayBuffer): string {
  return URL.createObjectURL(new Blob([buffer], { type: 'model/gltf-binary' }))
}
