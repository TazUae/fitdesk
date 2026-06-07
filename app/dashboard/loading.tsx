import { Skeleton } from '@/components/modules/LoadingSkeleton'

/**
 * Loading UI for the dashboard home page.
 * Mirrors the compact-header + top-row + second-row layout.
 */
export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 pt-4 pb-24 lg:px-8 lg:pt-6">

      {/* Compact header skeleton */}
      <div className="mb-5 space-y-1.5 px-0.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Top row: Next-up card | Money card */}
      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">

        {/* Next-up */}
        <div
          className="rounded-2xl border p-4 space-y-3"
          style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
        >
          <Skeleton className="h-3 w-20" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-4 w-full" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-9 w-32 rounded-xl" />
            <Skeleton className="h-9 w-28 rounded-xl" />
          </div>
        </div>

        {/* Money */}
        <div
          className="rounded-2xl border p-5 space-y-3"
          style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
        >
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-1.5 w-full rounded-full" />
          <Skeleton className="h-2.5 w-32" />
          <div className="border-t pt-3" style={{ borderColor: 'var(--fd-border)' }}>
            <div className="flex justify-between">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
        </div>
      </div>

      {/* Second row: Upcoming + Today (left) | Quick Actions (right) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,62fr)_minmax(0,38fr)] lg:gap-8">

        {/* LEFT: upcoming */}
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between px-0.5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-12" />
            </div>
            <div
              className="rounded-2xl border overflow-hidden divide-y"
              style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
            >
              {[0, 1, 2].map(i => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <Skeleton className="h-4 w-4" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: Quick Actions */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-28 ml-0.5" />
          <div
            className="rounded-2xl border overflow-hidden divide-y"
            style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
          >
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5"
                style={{ backgroundColor: 'var(--fd-card-hover)' }}
              >
                <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                <Skeleton className="h-3.5 w-24" />
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
