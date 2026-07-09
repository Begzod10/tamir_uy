import * as React from 'react'
import { useNavigate } from 'react-router-dom'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PageHeaderProps {
  title: string
  /** If true, renders a back chevron that calls navigate(-1). */
  showBack?: boolean
  /** Custom back handler — overrides the default navigate(-1). */
  onBack?(): void
  /** Rendered flush-right. Use for primary page action (e.g. save button). */
  rightSlot?: React.ReactNode
  /** Additional class names on the root element. */
  className?: string
}

// ─── Back icon ────────────────────────────────────────────────────────────────

function ChevronLeft() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  showBack = true,
  onBack,
  rightSlot,
  className = '',
}: PageHeaderProps) {
  const navigate = useNavigate()

  function handleBack() {
    if (onBack) {
      onBack()
    } else {
      navigate(-1)
    }
  }

  return (
    <header
      className={[
        'sticky top-0 z-20',
        'flex items-center gap-2',
        'h-14 px-4',
        'bg-white/90 dark:bg-neutral-900/90',
        'backdrop-blur-md',
        'border-b border-neutral-100 dark:border-neutral-800',
        'shadow-sm',
        className,
      ].join(' ')}
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Back button */}
      {showBack ? (
        <button
          type="button"
          onClick={handleBack}
          aria-label="Orqaga"
          className={[
            'flex-shrink-0 flex items-center justify-center',
            '-ml-2 w-9 h-9 rounded-xl',
            'text-neutral-600 dark:text-neutral-300',
            'hover:bg-neutral-100 dark:hover:bg-neutral-800',
            'transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1',
            'active:scale-95',
          ].join(' ')}
        >
          <ChevronLeft />
        </button>
      ) : (
        /* Spacer to keep title centred when there's a rightSlot but no back button */
        rightSlot ? <div className="w-9 flex-shrink-0" aria-hidden="true" /> : null
      )}

      {/* Title */}
      <h1
        className={[
          'flex-1 text-base font-semibold',
          'text-neutral-900 dark:text-white',
          'truncate',
          // Centre the title when both sides have equal-width controls
          showBack && rightSlot ? 'text-center' : showBack ? '' : '',
        ].join(' ')}
      >
        {title}
      </h1>

      {/* Right action slot */}
      {rightSlot ? (
        <div className="flex-shrink-0 flex items-center">{rightSlot}</div>
      ) : (
        /* Balancing spacer so title stays centred when back button is present */
        showBack ? <div className="w-9 flex-shrink-0" aria-hidden="true" /> : null
      )}
    </header>
  )
}
