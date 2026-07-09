import * as React from 'react'
import * as RadixToast from '@radix-ui/react-toast'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastVariant = 'default' | 'success' | 'warning' | 'error'

export interface ToastData {
  id: string
  variant?: ToastVariant
  title: string
  description?: string
}

// ─── Context (toast queue) ────────────────────────────────────────────────────

interface ToastContextValue {
  toast(data: Omit<ToastData, 'id'>): void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}

// ─── Variant styles ───────────────────────────────────────────────────────────

const variantStyles: Record<ToastVariant, string> = {
  default:
    'bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700',
  success:
    'bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800',
  warning:
    'bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800',
  error:
    'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800',
}

const variantIconMap: Record<ToastVariant, string> = {
  default: '💬',
  success: '✓',
  warning: '⚠',
  error: '✕',
}

const variantIconColor: Record<ToastVariant, string> = {
  default: 'text-neutral-500',
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  error: 'text-red-600 dark:text-red-400',
}

const variantTitleColor: Record<ToastVariant, string> = {
  default: 'text-neutral-900 dark:text-white',
  success: 'text-emerald-900 dark:text-emerald-100',
  warning: 'text-amber-900 dark:text-amber-100',
  error: 'text-red-900 dark:text-red-100',
}

// ─── Single Toast ─────────────────────────────────────────────────────────────

interface ToastItemProps extends ToastData {
  onClose(id: string): void
}

function ToastItem({ id, variant = 'default', title, description, onClose }: ToastItemProps) {
  return (
    <RadixToast.Root
      duration={3000}
      onOpenChange={(open) => {
        if (!open) onClose(id)
      }}
      className={[
        'relative flex items-start gap-3 p-4 rounded-xl shadow-lg',
        'data-[state=open]:animate-slide-in-from-right',
        'data-[state=closed]:animate-fade-out',
        variantStyles[variant],
      ].join(' ')}
      style={{ minWidth: 260, maxWidth: 360 }}
    >
      {/* Icon */}
      <span
        className={[
          'flex-shrink-0 w-5 h-5 mt-0.5 text-sm font-bold flex items-center justify-center',
          variantIconColor[variant],
        ].join(' ')}
        aria-hidden="true"
      >
        {variantIconMap[variant]}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <RadixToast.Title
          className={[
            'text-sm font-semibold leading-snug',
            variantTitleColor[variant],
          ].join(' ')}
        >
          {title}
        </RadixToast.Title>
        {description && (
          <RadixToast.Description className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400 leading-snug">
            {description}
          </RadixToast.Description>
        )}
      </div>

      {/* Close button */}
      <RadixToast.Close
        className="flex-shrink-0 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
        aria-label="Yopish"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </RadixToast.Close>
    </RadixToast.Root>
  )
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastData[]>([])

  const toast = React.useCallback((data: Omit<ToastData, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { ...data, id }])
  }, [])

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      <RadixToast.Provider swipeDirection="right" duration={3000}>
        {children}

        {/* Stack viewport anchored bottom-right */}
        <RadixToast.Viewport
          className="fixed bottom-24 right-4 z-[100] flex flex-col gap-2 outline-none"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        />

        {toasts.map((t) => (
          <ToastItem key={t.id} {...t} onClose={removeToast} />
        ))}
      </RadixToast.Provider>
    </ToastContext.Provider>
  )
}
