import { Skeleton } from '@/components/modules/LoadingSkeleton'

/**
 * Loading UI for the Account Settings page.
 *
 * Shown by Next.js during the initial server render before the 'use client'
 * page hydrates and resolves the Better Auth session. The page has its own
 * internal loading state (Loader2 spinner) for the client-side session fetch;
 * this skeleton covers the brief window before hydration.
 *
 * Mirrors the AccountPage layout:
 *   profile photo area → form card (5 divided sections) → save button.
 */
export default function AccountLoading() {
  return (
    <div className="space-y-6 p-4 pb-10">

      {/* Profile photo area: avatar circle + name + email */}
      <div className="flex flex-col items-center gap-3 pt-2">
        <Skeleton className="h-20 w-20 rounded-full" />
        <div className="flex flex-col items-center gap-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-36" />
        </div>
      </div>

      {/* Form card: divided field sections */}
      <div
        className="rounded-2xl border divide-y"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="p-4 space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>
        ))}
      </div>

      {/* Save button */}
      <Skeleton className="h-12 w-full rounded-xl" />

    </div>
  )
}
