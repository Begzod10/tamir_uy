/**
 * TypeScript wrapper for the native RoomScanPlugin (Capacitor).
 *
 * On web or non-LiDAR devices, startNativeScan() throws with code='UNSUPPORTED'
 * so that LidarPage can detect this and show the manual-wizard fallback instead
 * of crashing or hanging.
 */

import type { ScannedRoom } from '@/lib/roomScanImport'

export type RoomScanErrorCode =
  | 'LIDAR_UNAVAILABLE'   // device has no LiDAR sensor (iPad/iPhone non-Pro)
  | 'USER_CANCELLED'      // user dismissed the scan UI
  | 'CAPTURE_FAILED'      // ARSession or RoomPlan error
  | 'BUILD_FAILED'        // CapturedRoom builder step failed
  | 'JSON_FAILED'         // internal: CapturedRoom → JSON conversion error
  | 'UNSUPPORTED'         // running on web / non-native environment

export interface RoomScanError extends Error {
  code: RoomScanErrorCode
}

interface RoomScanPluginBridge {
  startScan(): Promise<ScannedRoom>
}

function getPlugin(): RoomScanPluginBridge | null {
  if (typeof window === 'undefined') return null
  const cap = (window as Record<string, unknown>).Capacitor as
    | { Plugins?: Record<string, unknown> }
    | undefined
  const plugin = cap?.Plugins?.['RoomScanPlugin']
  return plugin != null ? (plugin as RoomScanPluginBridge) : null
}

/** Returns true when running inside Capacitor on a device with LiDAR support. */
export function isNativeScanAvailable(): boolean {
  return getPlugin() !== null
}

/**
 * Launches the native Apple RoomPlan scanner and resolves with the raw
 * ScannedRoom (all distances in metres).
 *
 * Rejects with a RoomScanError whose `code` is one of RoomScanErrorCode.
 * The caller should always check the code before displaying an error message.
 */
export async function startNativeScan(): Promise<ScannedRoom> {
  const plugin = getPlugin()
  if (!plugin) {
    const err = Object.assign(
      new Error('RoomScanPlugin not available — not a native LiDAR device'),
      { code: 'UNSUPPORTED' as RoomScanErrorCode },
    )
    throw err as RoomScanError
  }

  try {
    return await plugin.startScan()
  } catch (raw: unknown) {
    // Capacitor rejects with { message, code } — re-wrap as typed error
    const rawObj = raw as Record<string, unknown>
    const code = (rawObj?.code as RoomScanErrorCode | undefined) ?? 'CAPTURE_FAILED'
    const msg = (rawObj?.message as string | undefined) ?? 'Skanerlashda xatolik'
    throw Object.assign(new Error(msg), { code }) as RoomScanError
  }
}
