import * as React from 'react'
import { Outlet, NavLink } from 'react-router-dom'

// ─── Tab configuration ────────────────────────────────────────────────────────

interface TabItem {
  to: string
  label: string
  icon: React.ReactNode
}

// SVG icons — named for what they represent, not generic labels
const IconProjects = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
)

const IconWizard = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="21" y1="2" x2="2" y2="21" />
    <path d="M6.27 18.68a5 5 0 006.36.32M17.73 5.32a5 5 0 00-6.36-.32" />
    <path d="M4 4l1 1M20 20l-1-1M4 20l1-1M20 4l-1 1" />
  </svg>
)

const IconMasters = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
  </svg>
)

const IconMaterials = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
  </svg>
)

const IconProfile = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)

const TABS: TabItem[] = [
  { to: '/loyihalar', label: 'Loyihalar', icon: <IconProjects /> },
  { to: '/wizard', label: 'Hisob-kitob', icon: <IconWizard /> },
  { to: '/ustalar', label: 'Ustalar', icon: <IconMasters /> },
  { to: '/materiallar', label: 'Materiallar', icon: <IconMaterials /> },
  { to: '/profil', label: 'Profil', icon: <IconProfile /> },
]

// ─── Running Total Bar ────────────────────────────────────────────────────────

interface RunningTotalBarProps {
  total: number | null
}

function RunningTotalBar({ total }: RunningTotalBarProps) {
  if (total === null) return null

  const formatted = new Intl.NumberFormat('uz-UZ').format(total)

  return (
    <div
      className={[
        'w-full bg-brand text-white',
        'flex items-center justify-between',
        'px-4 py-2',
        'text-sm font-semibold',
        'transition-all duration-300',
      ].join(' ')}
      role="status"
      aria-live="polite"
      aria-label={`Jami narx: ${formatted} UZS`}
    >
      <span className="text-white/80 font-normal">Taxminiy narx</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatted}{' '}
        <span className="font-normal text-white/80 text-xs">UZS</span>
      </span>
    </div>
  )
}

// ─── Tab Bar ──────────────────────────────────────────────────────────────────

function TabBar() {
  return (
    <nav
      aria-label="Asosiy navigatsiya"
      className={[
        'fixed bottom-0 left-0 right-0 z-30',
        'bg-white dark:bg-neutral-900',
        'border-t border-neutral-100 dark:border-neutral-800',
        'flex items-stretch',
        'shadow-[0_-1px_12px_rgba(0,0,0,0.06)]',
      ].join(' ')}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            [
              'flex-1 flex flex-col items-center justify-center gap-0.5',
              'pt-2 pb-1 min-h-[56px]',
              'text-[10px] font-medium transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
              isActive
                ? 'text-brand'
                : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300',
            ].join(' ')
          }
          aria-label={tab.label}
        >
          {({ isActive }) => (
            <>
              <span
                className={[
                  'transition-transform duration-150',
                  isActive ? 'scale-110' : '',
                ].join(' ')}
              >
                {tab.icon}
              </span>
              <span>{tab.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

// ─── AppShell ─────────────────────────────────────────────────────────────────

interface AppShellProps {
  /** When non-null, renders the running total bar above the tab bar. */
  estimateTotal?: number | null
}

export function AppShell({ estimateTotal = null }: AppShellProps) {
  // Height of bottom UI: tab bar (56px) + optional total bar (40px) + safe area
  const bottomOffset = estimateTotal !== null ? 'pb-[calc(56px+40px)]' : 'pb-[56px]'

  return (
    <div className="flex flex-col min-h-screen bg-neutral-50 dark:bg-neutral-950">
      {/* Page content — leaves room for bottom chrome */}
      <main className={`flex-1 ${bottomOffset}`}>
        <Outlet />
      </main>

      {/* Bottom chrome (stacked) */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 flex flex-col"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <RunningTotalBar total={estimateTotal} />
        <TabBar />
      </div>
    </div>
  )
}
