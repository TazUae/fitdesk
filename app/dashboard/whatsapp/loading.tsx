import { Skeleton } from '@/components/modules/LoadingSkeleton'

export default function WhatsAppLoading() {
  return (
    <div className="p-4 space-y-4">

      <div
        className="rounded-2xl border p-6 space-y-4"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>

        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>

        <Skeleton className="h-11 w-full rounded-xl" />
      </div>

    </div>
  )
}
