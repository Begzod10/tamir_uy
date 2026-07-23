import type React from 'react'
import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconHome({ filled }: { filled?: boolean }) {
  return filled ? (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="#1E40AF" aria-hidden="true">
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
    </svg>
  ) : (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  )
}

function IconShop({ filled }: { filled?: boolean }) {
  return filled ? (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1E40AF" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
      <line x1="3" y1="6" x2="21" y2="6"/>
      <path d="M16 10a4 4 0 01-8 0"/>
    </svg>
  ) : (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
      <line x1="3" y1="6" x2="21" y2="6"/>
      <path d="M16 10a4 4 0 01-8 0"/>
    </svg>
  )
}

// ─── Bottom Sheet (screen 03) ─────────────────────────────────────────────────

function NewProjectSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()

  const options = [
    {
      icon: (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#1E40AF" strokeWidth="1.75" aria-hidden="true">
          <rect x="4" y="4" width="20" height="20" rx="4"/>
          <path d="M9 14h10M14 9v10"/>
          <circle cx="14" cy="14" r="3" strokeDasharray="2 2"/>
        </svg>
      ),
      bg: "#EEF2FF",
      title: "LiDAR skaner",
      desc: "Xonani LiDAR yordamida skanerlang va avtomatik 3D model oling",
      action: () => { onClose(); navigate("/scan/lidar") },
    },
    {
      icon: (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" strokeWidth="1.75" aria-hidden="true">
          <circle cx="14" cy="14" r="10" stroke="#F97316"/>
          <path d="M14 9v5l3 1.5" stroke="#F97316" strokeLinecap="round"/>
          <text x="8" y="20" fontSize="6" fill="#F97316" fontWeight="700" fontFamily="sans-serif">360°</text>
        </svg>
      ),
      bg: "#FFF1E7",
      title: "360° Foto skan",
      desc: "Xonani 360° rasmga oling — ilova nuqtalarni o'zi belgilaydi",
      action: () => { onClose(); navigate("/scan/360") },
    },
    {
      icon: (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#159C5B" strokeWidth="1.75" aria-hidden="true">
          <rect x="5" y="5" width="18" height="18" rx="2"/>
          <path d="M5 11h18M11 5v18"/>
        </svg>
      ),
      bg: "#EAF7F0",
      title: "Razmer / Plan yuklash",
      desc: "O'lchamlarni kiriting yoki floorplan rasmini yuklang",
      action: () => { onClose(); navigate("/wizard") },
    },
  ]

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-[rgba(17,24,39,.5)] backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-sheet pb-8 animate-slide-up">
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-11 h-1.5 rounded-full bg-gray-300" />
        </div>
        <div className="px-5 pb-2">
          <h2 className="text-[21px] font-extrabold text-gray-900">Yangi loyiha</h2>
          <p className="text-sm text-muted mt-0.5">Xonani qanday qo'shmoqchisiz?</p>
        </div>
        <div className="px-5 pt-3 flex flex-col gap-3">
          {options.map((opt) => (
            <button
              key={opt.title}
              onClick={opt.action}
              className="flex items-center gap-4 p-4 bg-[#F7F8FA] border border-[#EDEFF3] rounded-[20px] text-left hover:bg-gray-100 transition-colors active:scale-[0.98]"
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: opt.bg }}
              >
                {opt.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-gray-900">{opt.title}</p>
                <p className="text-[13px] text-muted mt-0.5 leading-snug">{opt.desc}</p>
              </div>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#9CA3AF" strokeWidth="1.5" className="flex-shrink-0">
                <path d="M7.5 5l5 5-5 5"/>
              </svg>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

// ─── Desktop Sidebar Icons ────────────────────────────────────────────────────

function IconWorkers() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
    </svg>
  )
}

function IconProfile() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  )
}

const SIDEBAR_NAV: Array<{ to: string; label: string; icon: (active: boolean) => React.ReactNode }> = [
  { to: '/projects', label: 'Uy',      icon: (a) => <IconHome filled={a} /> },
  { to: '/dokon',    label: "Do'kon",  icon: (a) => <IconShop filled={a} /> },
  { to: '/ustalar',  label: 'Ustalar', icon: () => <IconWorkers /> },
  { to: '/profile',  label: 'Profil',  icon: () => <IconProfile /> },
]

// ─── Desktop Sidebar ──────────────────────────────────────────────────────────

function DesktopSidebar({ onNew }: { onNew: () => void }) {
  return (
    <aside className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-60 bg-white border-r border-[#F0F1F4] z-30">
      {/* Logo */}
      <div className="px-5 pt-8 pb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand flex items-center justify-center text-lg flex-shrink-0">🏠</div>
          <span className="text-[17px] font-extrabold text-gray-900">UyVision</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 flex flex-col gap-1">
        {SIDEBAR_NAV.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-semibold transition-colors ${
                isActive
                  ? 'bg-brand-tint text-brand'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={isActive ? 'text-brand' : 'text-gray-400'}>
                  {icon(isActive)}
                </span>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* New project button */}
      <div className="p-4">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand text-white text-[14px] font-bold hover:bg-brand-light transition-colors"
          style={{ boxShadow: '0 14px 28px -10px rgba(30,64,175,.4)' }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 2v12M2 8h12" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          Yangi loyiha
        </button>
      </div>
    </aside>
  )
}

// ─── Mobile Bottom Nav ────────────────────────────────────────────────────────

function BottomNav({ onFab }: { onFab: () => void }) {
  return (
    <nav
      aria-label="Asosiy navigatsiya"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white h-[94px] border-t border-[#F0F1F4]"
      style={{
        boxShadow: '0 -10px 26px rgba(17,24,39,.06)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex items-center justify-around h-full">
        <NavLink
          to="/projects"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 min-w-[60px] pb-4 transition-colors ${
              isActive ? 'text-brand' : 'text-subtle'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <IconHome filled={isActive} />
              <span className={`text-[11px] ${isActive ? 'font-bold text-brand' : 'font-semibold text-subtle'}`}>
                Uy
              </span>
            </>
          )}
        </NavLink>

        {/* FAB — floats 22px above bar */}
        <div className="flex flex-col items-center" style={{ marginBottom: 44 }}>
          <button
            onClick={onFab}
            aria-label="Yangi loyiha qo'shish"
            className="w-16 h-16 rounded-full flex items-center justify-center border-4 border-white"
            style={{
              background: 'linear-gradient(160deg,#2952D6,#1E40AF)',
              boxShadow: '0 14px 26px -6px rgba(30,64,175,.6)',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <path d="M14 6v16M6 14h16" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <NavLink
          to="/dokon"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 min-w-[60px] pb-4 transition-colors ${
              isActive ? 'text-brand' : 'text-subtle'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <IconShop filled={isActive} />
              <span className={`text-[11px] ${isActive ? 'font-bold text-brand' : 'font-semibold text-subtle'}`}>
                Do'kon
              </span>
            </>
          )}
        </NavLink>
      </div>
    </nav>
  )
}

// ─── AppShell ─────────────────────────────────────────────────────────────────

export function AppShell() {
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-paper">
      {/* Desktop: fixed sidebar */}
      <DesktopSidebar onNew={() => setSheetOpen(true)} />

      {/* Content shifts right on desktop */}
      <div className="flex-1 lg:ml-60 flex flex-col min-h-screen">
        <main className="flex-1 pb-[94px] lg:pb-0">
          <Outlet />
        </main>
      </div>

      {/* Mobile: bottom nav */}
      <BottomNav onFab={() => setSheetOpen(true)} />

      {sheetOpen && (
        <NewProjectSheet onClose={() => setSheetOpen(false)} />
      )}
    </div>
  )
}
