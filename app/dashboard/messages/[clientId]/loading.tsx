import { Skeleton } from '@/components/modules/LoadingSkeleton'

/**
 * Loading UI for the client messages page.
 *
 * Shown by Next.js while the server component fetches the client record and
 * message history. Mirrors the MessagesView layout:
 *   client header card → composer card (type pills + textarea + send button)
 *   → message history.
 */
export default function MessagesLoading() {
  return (
    <div className="flex flex-col gap-6 p-4 pb-24">

      {/* Client header card: avatar + name + phone */}
      <div
        className="flex items-center gap-3 rounded-2xl border p-4"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>

      {/* Composer card: section label + type pills + textarea + button */}
      <div
        className="rounded-2xl border p-4 space-y-4"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        <Skeleton className="h-3 w-32" />

        {/* Type selector pills */}
        <div className="flex gap-2">
          <Skeleton className="h-7 w-20 rounded-full" />
          <Skeleton className="h-7 w-20 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-full" />
        </div>

        {/* Draft textarea */}
        <Skeleton className="h-28 w-full rounded-xl" />

        {/* Generate / send button */}
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>

    </div>
  )
}
