import { CardSkeleton, Skeleton } from '@/components/ui/LoadingSkeleton'

/**
 * Loading UI for the dashboard home page.
 *
 * Mirrors the H-adapted layout:
 *   greeting → next up hero → money card → today section → upcoming → quick actions
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-5 p-4 pb-24">

      {/* Greeting + date */}
      <div className="space-y-1.5">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-3.5 w-32" />
      </div>

      {/* Next Up hero card */}
      <CardSkeleton />

      {/* Money snapshot card */}
      <div
        className="rounded-2xl border p-4"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        <div className="flex items-center gap-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="shrink-0 space-y-2 text-right">
            <Skeleton className="ml-auto h-3 w-16" />
            <Skeleton className="ml-auto h-5 w-20" />
          </div>
        </div>
      </div>

      {/* Today section */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-14" />
        <CardSkeleton />
        <CardSkeleton />
      </div>

      {/* Quick Actions */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border py-3"
              style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
            >
              <Skeleton className="mx-auto h-5 w-5 rounded" />
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
