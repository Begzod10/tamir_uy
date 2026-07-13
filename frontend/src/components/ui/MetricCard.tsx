import * as React from 'react'
import { useMotionValue, animate, useTransform } from 'framer-motion'
import { motion } from 'framer-motion'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string
  value: number
  unit?: string
  /** Number of decimal places to display. Default 1. */
  decimals?: number
  /** Icon rendered above the value. */
  icon?: React.ReactNode
  className?: string
}

// ─── Count-up hook ────────────────────────────────────────────────────────────

function useCountUp(target: number, decimals: number) {
  const motionValue = useMotionValue(0)
  const displayed = useTransform(motionValue, (v) => v.toFixed(decimals))

  React.useEffect(() => {
    const controls = animate(motionValue, target, {
      duration: 0.8,
      ease: [0.22, 1, 0.36, 1],
    })
    return () => controls.stop()
  }, [target, motionValue])

  return displayed
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MetricCard({
  label,
  value,
  unit,
  decimals = 1,
  icon,
  className = '',
}: MetricCardProps) {
  const displayed = useCountUp(value, decimals)

  return (
    <div
      className={[
        'rounded-2xl bg-white dark:bg-neutral-800',
        'border border-neutral-100 dark:border-neutral-700',
        'shadow-sm px-4 py-4 flex flex-col gap-2',
        className,
      ].join(' ')}
    >
      {icon && (
        <span className="text-brand text-xl leading-none">{icon}</span>
      )}

      <div className="flex items-baseline gap-1">
        <motion.span
          className={[
            'text-2xl font-bold tracking-tight',
            'text-neutral-900 dark:text-white',
            'font-variant-numeric tabular-nums',
          ].join(' ')}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {displayed}
        </motion.span>
        {unit && (
          <span className="text-sm text-neutral-500 dark:text-neutral-400">
            {unit}
          </span>
        )}
      </div>

      <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        {label}
      </p>
    </div>
  )
}
