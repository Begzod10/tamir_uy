import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { startNativeScan, isNativeScanAvailable, type RoomScanErrorCode } from '@/lib/native/roomScan'
import { scanToStoreGeometry } from '@/lib/roomScanImport'
import { useRoomStore } from '@/store/roomStore'

type Phase = 'idle' | 'scanning' | 'error'

const ERROR_LABELS: Record<RoomScanErrorCode, string> = {
  LIDAR_UNAVAILABLE: "Bu qurilmada LiDAR sensori mavjud emas",
  USER_CANCELLED:    "Skanerlash bekor qilindi",
  CAPTURE_FAILED:    "Skanerlashda xatolik yuz berdi",
  BUILD_FAILED:      "Xona modelini qayta ishlashda xatolik",
  JSON_FAILED:       "Natijani o'qishda xatolik",
  UNSUPPORTED:       "LiDAR skaneri mavjud emas",
}

// ─── Non-LiDAR fallback ───────────────────────────────────────────────────────

function UnsupportedView() {
  const navigate = useNavigate()
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center px-8 gap-6"
      style={{ background: 'radial-gradient(ellipse at center, #1A2230 0%, #0B0E13 100%)' }}
    >
      <LidarIcon />
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-white text-[18px] font-semibold leading-snug">
          LiDAR skaneri faqat<br />iPhone/iPad Pro qurilmalarida mavjud
        </p>
        <p className="text-white/50 text-[14px]">
          Xona o'lchamlarini qo'lda kiritish uchun qadam-ustasidan foydalaning
        </p>
      </div>
      <button
        onClick={() => navigate('/wizard')}
        className="px-8 py-3 rounded-full text-[15px] font-semibold text-white"
        style={{ background: '#D85A30' }}
      >
        Qo'lda kiritish →
      </button>
      <button onClick={() => navigate(-1)} className="text-white/40 text-[13px]">
        Orqaga
      </button>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LidarPage() {
  const navigate = useNavigate()
  const loadRoom = useRoomStore(s => s.loadRoom)
  const [phase, setPhase] = useState<Phase>('idle')
  const [errorCode, setErrorCode] = useState<RoomScanErrorCode | null>(null)

  // Not running inside Capacitor on a LiDAR device → show persistent fallback
  if (!isNativeScanAvailable()) return <UnsupportedView />

  const startScan = useCallback(async () => {
    setPhase('scanning')
    try {
      // startNativeScan() opens the RoomCaptureView (the full-screen Apple UI).
      // The promise only resolves when the user taps "Done" and RoomPlan finishes
      // building the CapturedRoom model — this typically takes 3–10 seconds.
      const scanned = await startNativeScan()

      // Convert to store-compatible geometry (all values in mm, 4-wall rectangle).
      // Note: this snap-to-rectangle step will be replaced when N-wall polygon
      // support lands (Phase 3 of the N-wall roadmap).
      const { geometry, ceilingMm } = scanToStoreGeometry(scanned)

      // Load into store WITHOUT saving to the API yet — the user edits and
      // confirms in the wizard, and the wizard's "Save" button writes to the backend.
      loadRoom({ geometry, ceiling_height: ceilingMm / 1000 })

      navigate('/wizard')
    } catch (err: unknown) {
      const code = (err as { code?: RoomScanErrorCode }).code ?? 'CAPTURE_FAILED'
      if (code === 'USER_CANCELLED') {
        // Silent: the user backed out of the native UI intentionally.
        setPhase('idle')
      } else {
        setErrorCode(code)
        setPhase('error')
      }
    }
  }, [loadRoom, navigate])

  // ── Scanning (native UI is on screen — this screen is behind it) ──
  if (phase === 'scanning') {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center gap-4"
        style={{ background: 'radial-gradient(ellipse at center, #1A2230 0%, #0B0E13 100%)' }}
      >
        <p className="text-white text-[18px] font-bold" style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>
          Skanerlanyapti…
        </p>
        <p className="text-white/50 text-[13px]">Telefonni sekin harakatlantiring</p>
      </div>
    )
  }

  // ── Error ──
  if (phase === 'error' && errorCode) {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center px-8 gap-6"
        style={{ background: 'radial-gradient(ellipse at center, #1A2230 0%, #0B0E13 100%)' }}
      >
        <p className="text-red-400 text-[17px] font-semibold text-center">
          {ERROR_LABELS[errorCode]}
        </p>
        <button
          onClick={() => setPhase('idle')}
          className="px-8 py-3 rounded-full text-[15px] font-semibold text-white"
          style={{ background: '#D85A30' }}
        >
          Qayta urinish
        </button>
        <button onClick={() => navigate('/wizard')} className="text-white/40 text-[13px]">
          Qo'lda kiritish
        </button>
      </div>
    )
  }

  // ── Idle ──
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center gap-8"
      style={{ background: 'radial-gradient(ellipse at center, #1A2230 0%, #0B0E13 100%)' }}
    >
      {/* Faint grid */}
      <svg className="absolute inset-0 w-full h-full opacity-10" aria-hidden="true">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#34D399" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)"/>
      </svg>

      <button
        onClick={() => navigate(-1)}
        className="absolute top-14 left-5 w-10 h-10 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}
        aria-label="Yopish"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
          <path d="M2 2l12 12M14 2L2 14"/>
        </svg>
      </button>

      <LidarIcon />

      <div className="flex flex-col items-center gap-2 z-10 text-center px-8">
        <p className="text-white text-[20px] font-bold">LiDAR Skanerlash</p>
        <p className="text-white/60 text-[14px]">
          Apple RoomPlan devorlar, eshiklar va derazalarni avtomatik aniqlaydi.
          Xonani sekin aylanib chiqing.
        </p>
      </div>

      <button
        onClick={startScan}
        className="z-10 px-10 py-4 rounded-full text-[16px] font-bold text-white shadow-lg"
        style={{ background: '#D85A30' }}
      >
        Skanerlashni boshlash
      </button>

      <button onClick={() => navigate('/wizard')} className="text-white/40 text-[13px] z-10">
        Qo'lda kiritish
      </button>
    </div>
  )
}

function LidarIcon() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden="true">
      <circle cx="36" cy="36" r="34" stroke="#34D399" strokeWidth="1.5" strokeDasharray="4 4"/>
      <circle cx="36" cy="36" r="20" stroke="#34D399" strokeWidth="2"/>
      <circle cx="36" cy="36" r="6" fill="#34D399"/>
      <line x1="36" y1="4"  x2="36" y2="16" stroke="#34D399" strokeWidth="2" strokeLinecap="round"/>
      <line x1="36" y1="56" x2="36" y2="68" stroke="#34D399" strokeWidth="2" strokeLinecap="round"/>
      <line x1="4"  y1="36" x2="16" y2="36" stroke="#34D399" strokeWidth="2" strokeLinecap="round"/>
      <line x1="56" y1="36" x2="68" y2="36" stroke="#34D399" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}
