import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string | number
  /** Secondary line shown below the value — e.g. "3 overdue" */
  subtext?: string
  /**
   * Optional CSS color for the value text.
   * Accepts any valid CSS color: hex, var(--fd-*), etc.
   * Defaults to --fd-text.
   */
  accent?: string
  /** Optional Lucide icon rendered in the top-right corner. */
  Icon?: LucideIcon
  className?: string
}

export function StatCard({
  label,
  value,
  subtext,
  accent,
  Icon,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn('relative rounded-2xl border p-4', className)}
      style={{
        backgroundColor: 'var(--fd-surface)',
        borderColor: 'var(--fd-border)',
      }}
    >
      {/* Icon — decorative, top-right */}
      {Icon && (
        <Icon
          className="absolute right-4 top-4 h-4 w-4 opacity-30"
          style={{ color: accent ?? 'var(--fd-muted)' }}
        />
      )}

      {/* Label */}
      <p className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
        {label}
      </p>

      {/* Value */}
      <p
        className="mt-1 text-2xl font-bold leading-none tracking-tight"
        style={{ color: accent ?? 'var(--fd-text)' }}
      >
        {value}
      </p>

      {/* Subtext */}
      {subtext && (
        <p className="mt-1.5 text-xs" style={{ color: 'var(--fd-muted)' }}>
          {subtext}
        </p>
      )}
    </div>
  )
}
