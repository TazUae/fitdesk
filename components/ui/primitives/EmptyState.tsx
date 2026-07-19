import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  /** One short sentence max — explain what appears here and how to get it. */
  description?: string
  /** Primary next action, e.g. a <Button> or <Link>. */
  action?: ReactNode
  /** Compact variant for in-card use. */
  compact?: boolean
}

/**
 * Canonical empty state: explains the surface and offers the next action,
 * instead of leaving a blank region (2026 baseline for every list/grid view).
 */
export function EmptyState({ icon: Icon, title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div className={compact ? 'flex flex-col items-center gap-2 py-6 text-center' : 'flex flex-col items-center gap-3 py-12 text-center'}>
      {Icon && (
        <div
          className="flex h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: 'var(--fd-card)', color: 'var(--fd-muted)' }}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      )}
      <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>{title}</p>
      {description && (
        <p className="max-w-[280px] text-xs" style={{ color: 'var(--fd-muted)' }}>{description}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
