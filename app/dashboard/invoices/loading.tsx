import { CardSkeleton, Skeleton } from '@/components/modules/LoadingSkeleton'

/**
 * Loading UI for the invoices list page.
 *
 * Shown by Next.js while the server component (page.tsx) fetches invoices
 * and clients from ERPNext. Mirrors the InvoicesView layout:
 *   header row → summary cards (2-col grid) → filter tabs → invoice list.
 */
export default function InvoicesLoading() {
  return (
    <div className="p-4 space-y-4">

      {/* Header row: count shimmer */}
      <Skeleton className="h-5 w-24" />

      {/* Summary cards — 2-column grid (outstanding / collected) */}
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
      </div>

      {/* Filter tabs — 4 pill shimmers */}
      <div className="flex gap-2">
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-16 rounded-full" />
        <Skeleton className="h-8 w-12 rounded-full" />
      </div>

      {/* Invoice card rows */}
      <div className="space-y-2">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>

    </div>
  )
}
