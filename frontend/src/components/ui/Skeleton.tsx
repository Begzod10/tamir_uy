
// ─── Types ────────────────────────────────────────────────────────────────────



interface SkeletonBaseProps {
  className?: string
}

interface TextSkeletonProps extends SkeletonBaseProps {
  variant: 'text'
  /**
   * Number of text lines. Each line is full width except the last,
   * which is narrowed to 60% to mimic natural prose endings.
   */
  lines?: number
}

interface CardSkeletonProps extends SkeletonBaseProps {
  variant: 'card'
  height?: number | string
}

interface CircleSkeletonProps extends SkeletonBaseProps {
  variant: 'circle'
  /** Diameter in px. Default 40. */
  size?: number
}

type SkeletonProps =
  | TextSkeletonProps
  | CardSkeletonProps
  | CircleSkeletonProps

// ─── Pulse base class ─────────────────────────────────────────────────────────

const pulseBase =
  'animate-pulse rounded bg-neutral-200 dark:bg-neutral-700'

// ─── Component ────────────────────────────────────────────────────────────────

export function Skeleton(props: SkeletonProps) {
  const { className = '' } = props

  if (props.variant === 'text') {
    const lines = props.lines ?? 3
    return (
      <div
        role="status"
        aria-label="Yuklanmoqda"
        className={`flex flex-col gap-2 ${className}`}
      >
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={[pulseBase, 'h-4 rounded-md'].join(' ')}
            style={{ width: i === lines - 1 ? '60%' : '100%' }}
          />
        ))}
        <span className="sr-only">Yuklanmoqda...</span>
      </div>
    )
  }

  if (props.variant === 'card') {
    const height = props.height ?? 120
    return (
      <div
        role="status"
        aria-label="Yuklanmoqda"
        className={[pulseBase, 'rounded-2xl w-full', className].join(' ')}
        style={{
          height: typeof height === 'number' ? `${height}px` : height,
        }}
      >
        <span className="sr-only">Yuklanmoqda...</span>
      </div>
    )
  }

  // variant === 'circle'
  const size = props.variant === 'circle' ? (props.size ?? 40) : 40
  return (
    <div
      role="status"
      aria-label="Yuklanmoqda"
      className={[pulseBase, '!rounded-full flex-shrink-0', className].join(' ')}
      style={{ width: size, height: size }}
    >
      <span className="sr-only">Yuklanmoqda...</span>
    </div>
  )
}

// ─── Convenience re-exports ───────────────────────────────────────────────────

export function SkeletonText(props: Omit<TextSkeletonProps, 'variant'>) {
  return <Skeleton variant="text" {...props} />
}

export function SkeletonCard(props: Omit<CardSkeletonProps, 'variant'>) {
  return <Skeleton variant="card" {...props} />
}

export function SkeletonCircle(props: Omit<CircleSkeletonProps, 'variant'>) {
  return <Skeleton variant="circle" {...props} />
}
