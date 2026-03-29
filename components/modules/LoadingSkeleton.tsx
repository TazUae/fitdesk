import { cn } from '@/lib/utils'

// ─── Base pulse block ─────────────────────────────────────────────────────────

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-lg', className)}
      style={{ backgroundColor: 'var(--fd-card)' }}
    />
  )
}

// ─── List card skeleton ───────────────────────────────────────────────────────
// Matches the shape of a client / session / invoice list row.

export function CardSkeleton() {
  return (
    <div
      className="flex items-center gap-3 rounded-2xl border p-4"
      style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
    >
      {/* Avatar circle */}
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />

      {/* Two text lines */}
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>

      {/* Trailing badge/value */}
      <Skeleton className="h-5 w-14 rounded-full" />
    </div>
  )
}

// ─── Stat card skeleton ───────────────────────────────────────────────────────
// Matches the shape of <StatCard />.

export function StatSkeleton() {
  return (
    <div
      className="rounded-2xl border p-4 space-y-2"
      style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
    >
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-7 w-20" />
      <Skeleton className="h-3 w-28" />
    </div>
  )
}

// ─── Convenience wrapper ──────────────────────────────────────────────────────
// Drop-in for any list that is loading.

interface LoadingSkeletonProps {
  /** Number of card skeletons to render. */
  count?: number
  /** 'card' (default) for list rows, 'stat' for stat grid items. */
  variant?: 'card' | 'stat'
  className?: string
}

export function LoadingSkeleton({
  count = 4,
  variant = 'card',
  className,
}: LoadingSkeletonProps) {
  const Item = variant === 'stat' ? StatSkeleton : CardSkeleton

  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Item key={i} />
      ))}
    </div>
  )
}
