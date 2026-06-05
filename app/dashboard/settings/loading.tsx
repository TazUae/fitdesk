import { Skeleton } from '@/components/modules/LoadingSkeleton'

/**
 * Loading UI for the Workspace Settings page.
 *
 * Shown by Next.js while the server component fetches the live setup summary.
 * Mirrors the SettingsPage layout:
 *   title + subtitle → Business Hours section → Payment Methods section.
 */
export default function SettingsLoading() {
  return (
    <div className="space-y-4 p-4 pb-20">

      {/* Title + subtitle */}
      <div className="space-y-2">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Business Hours section */}
      <div
        className="rounded-2xl border p-4 space-y-4"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        {/* Section label + description */}
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-56" />
        </div>

        {/* Day toggle row */}
        <div className="flex gap-2 pt-1">
          {[1,2,3,4,5,6,7].map(i => (
            <Skeleton key={i} className="h-8 w-8 rounded-full" />
          ))}
        </div>

        {/* Time inputs */}
        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1 rounded-xl" />
          <Skeleton className="h-10 flex-1 rounded-xl" />
        </div>

        {/* Save button */}
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>

      {/* Payment Methods section */}
      <div
        className="rounded-2xl border p-4 space-y-3"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        {/* Section label */}
        <Skeleton className="h-4 w-36" />

        {/* Payment method rows */}
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
