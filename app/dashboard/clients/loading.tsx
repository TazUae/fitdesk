import { CardSkeleton, Skeleton } from '@/components/modules/LoadingSkeleton'

/**
 * Loading UI for the clients list page.
 *
 * Shown by Next.js while the server component (page.tsx) fetches clients
 * from ERPNext. Mirrors the ClientsView layout:
 *   header row (count + add button) → search bar → list of client cards.
 */
export default function ClientsLoading() {
  return (
    <div className="p-4 space-y-4">

      {/* Header row: count shimmer + add-button shimmer */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-8 w-16 rounded-xl" />
      </div>

      {/* Search bar shimmer */}
      <Skeleton className="h-11 w-full rounded-xl" />

      {/* Client card rows */}
      <div className="space-y-2">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>

    </div>
  )
}
