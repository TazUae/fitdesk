import { CardSkeleton, Skeleton } from '@/components/ui/LoadingSkeleton'

export default function InvoicesLoading() {
  return (
    <div className="p-4 space-y-4">

      <Skeleton className="h-5 w-24" />

      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
      </div>

      <div className="flex gap-2">
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-16 rounded-full" />
        <Skeleton className="h-8 w-12 rounded-full" />
      </div>

      <div className="space-y-2">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>

    </div>
  )
}
