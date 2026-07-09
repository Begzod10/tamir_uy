import * as React from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  /** Icon to render before the label. */
  leftIcon?: React.ReactNode
  /** Icon to render after the label. */
  rightIcon?: React.ReactNode
  children: React.ReactNode
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const base =
  'inline-flex items-center justify-center gap-2 font-medium rounded-xl ' +
  'transition-all duration-150 select-none focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ' +
  'disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]'

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-white hover:bg-brand-dark shadow-sm shadow-brand/30',
  secondary:
    'border border-brand text-brand bg-transparent hover:bg-brand/8',
  ghost:
    'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800',
  danger:
    'bg-red-500 text-white hover:bg-red-600 shadow-sm shadow-red-500/30',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  )
}

const spinnerSizes: Record<ButtonSize, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
}

// ─── Component ────────────────────────────────────────────────────────────────

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      leftIcon,
      rightIcon,
      className = '',
      disabled,
      children,
      ...rest
    },
    ref,
  ) {
    const isDisabled = disabled || loading

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-busy={loading}
        className={[base, variants[variant], sizes[size], className].join(' ')}
        {...rest}
      >
        {loading ? (
          <Spinner className={spinnerSizes[size]} />
        ) : (
          leftIcon && <span className="flex-shrink-0">{leftIcon}</span>
        )}
        <span>{children}</span>
        {!loading && rightIcon && (
          <span className="flex-shrink-0">{rightIcon}</span>
        )}
      </button>
    )
  },
)

Button.displayName = 'Button'
