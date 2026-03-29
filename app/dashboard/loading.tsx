import { StatSkeleton, CardSkeleton, Skeleton } from '@/components/modules/LoadingSkeleton'

/**
 * Loading UI for the dashboard home page.
 *
 * Shown by Next.js while the server component (page.tsx) is fetching data from
 * ERPNext. Mirrors the real layout so the page doesn't jump on load.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-4 pb-24">

      {/* Greeting shimmer */}
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-36" />
      </div>

      {/* 2×2 stat grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatSkeleton />
        <StatSkeleton />
        <StatSkeleton />
        <StatSkeleton />
      </div>

      {/* Today's sessions section */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-20" />
        <CardSkeleton />
        <CardSkeleton />
      </div>

      {/* Upcoming section */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>

    </div>
  )
}
