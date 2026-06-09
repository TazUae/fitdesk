import { Skeleton } from '@/components/modules/LoadingSkeleton'

export default function SettingsLoading() {
  return (
    <div className="space-y-4 p-4 pb-20">

      <div className="space-y-2">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-4 w-64" />
      </div>

      <div
        className="rounded-2xl border p-4 space-y-4"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-56" />
        </div>

        <div className="flex gap-2 pt-1">
          {[1,2,3,4,5,6,7].map(i => (
            <Skeleton key={i} className="h-8 w-8 rounded-full" />
          ))}
        </div>

        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1 rounded-xl" />
          <Skeleton className="h-10 flex-1 rounded-xl" />
        </div>

        <Skeleton className="h-10 w-full rounded-xl" />
      </div>

      <div
        className="rounded-2xl border p-4 space-y-3"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        <Skeleton className="h-4 w-36" />

        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
            style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)' }}
          >
            <Skeleton className="h-5 w-5 rounded-full shrink-0" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
        ))}
      </div>

    </div>
  )
}
