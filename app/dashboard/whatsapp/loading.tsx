import { Skeleton } from '@/components/modules/LoadingSkeleton'

/**
 * Loading UI for the WhatsApp connection page.
 *
 * Shown by Next.js while the server component checks the Evolution API
 * connection status. Mirrors the WhatsAppView layout:
 *   status card (icon + status label + description + action button).
 */
export default function WhatsAppLoading() {
  return (
    <div className="p-4 space-y-4">

      {/* Status card */}
      <div
        className="rounded-2xl border p-6 space-y-4"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        {/* Icon circle + status label */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>

        {/* Description text lines */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>

        {/* Action button */}
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>

    </div>
  )
}
