import { Skeleton } from '@/components/modules/LoadingSkeleton'

/**
 * Loading UI for the Settings (FitDesk Setup) page.
 *
 * Shown by Next.js while the server component fetches the live setup summary.
 * Mirrors the SettingsPage layout:
 *   title + subtitle → 4 bordered section cards (label + status badge + content).
 */
export default function SettingsLoading() {
  return (
    <div className="space-y-4 p-4 pb-20">

      {/* Title + subtitle */}
      <div className="space-y-2">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Section cards */}
      {[1, 2, 3, 4].map(i => (
        <div
          key={i}
          className="rounded-2xl border p-4 space-y-3"
          style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
        >
          {/* Section label + status badge */}
          <div className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>

          {/* Content rows */}
          <div className="space-y-2">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}

    </div>
  )
}
