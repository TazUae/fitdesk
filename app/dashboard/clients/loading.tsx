import { CardSkeleton, Skeleton } from '@/components/modules/LoadingSkeleton'

export default function ClientsLoading() {
  return (
    <div className="p-4 space-y-4">

      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-8 w-16 rounded-xl" />
      </div>

      <Skeleton className="h-11 w-full rounded-xl" />

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
