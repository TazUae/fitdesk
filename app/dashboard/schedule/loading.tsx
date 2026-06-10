import { Skeleton } from '@/components/modules/LoadingSkeleton'

export default function ScheduleLoading() {
  return (
    <div className="flex flex-col gap-3 p-4 pb-24">

      {/* Calendar toolbar: nav arrow + month label + nav arrow */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>

      {/* Day-of-week header row — 7 narrow labels */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-4" />
        ))}
      </div>

      {/* Calendar body — single tall block standing in for the time grid */}
      <Skeleton className="h-96 w-full rounded-2xl" />

      {/* Booking / add-session CTA */}
      <Skeleton className="h-12 w-full rounded-2xl" />

    </div>
  )
}
