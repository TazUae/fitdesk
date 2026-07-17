import { CardSkeleton, Skeleton } from '@/components/ui/LoadingSkeleton'

export default function ClientsLoading() {
  return (
    <div className="p-4 space-y-4">

      {/* Header row */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-8 w-16 rounded-xl" />
      </div>

      {/* Search bar */}
      <Skeleton className="h-11 w-full rounded-xl" />

      {/* Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>

    </div>
  )
}
