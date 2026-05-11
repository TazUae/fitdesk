'use client'

import { AlertTriangle } from 'lucide-react'
import type { BookingPlan } from '@/types/scheduling'

interface ConflictBannerProps {
  plan:        BookingPlan
  /** Routes the user back to the time/pattern step to choose alternatives. */
  onSelectDifferentTime?: () => void
}

/**
 * Unified red banner for conflicts and out-of-hours.
 *
 * Shows the count + first-occurrence explanation. A secondary "Select a
 * different time" button routes the BookingSheet back to the pattern step
 * (Phase 5.2 will add "skip this one" + engine onConflict='skip').
 */
export function ConflictBanner({ plan, onSelectDifferentTime }: ConflictBannerProps) {
  const conflictCount = plan.conflicts.length
  const outCount      = plan.outOfHours.length
  if (conflictCount === 0 && outCount === 0) return null

  const firstConflict = plan.conflicts[0]
  const firstOOH      = plan.outOfHours[0]

  let title = ''
  let detail = ''
  if (conflictCount > 0) {
    title = conflictCount === 1
      ? 'Booking blocked: one occurrence conflicts'
      : `Booking blocked: ${conflictCount} occurrences conflict`
    detail = firstConflict?.kind === 'buffer'
      ? 'Too close to an existing session (less than the trainer buffer).'
      : 'Overlaps an existing session.'
  } else if (outCount > 0) {
    title = outCount === 1
      ? 'Booking blocked: outside working hours'
      : `Booking blocked: ${outCount} occurrences outside working hours`
    detail = firstOOH?.reason ?? 'One occurrence falls outside the trainer\'s working window.'
  }

  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg p-3 text-sm"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--fd-red) 8%, var(--fd-surface))',
        border: '1px solid color-mix(in srgb, var(--fd-red) 30%, transparent)',
        color: 'var(--fd-red)',
      }}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 text-xs" style={{ color: 'color-mix(in srgb, var(--fd-red) 80%, var(--fd-text))' }}>
          {detail}
        </p>
        {onSelectDifferentTime && (
          <button
            type="button"
            onClick={onSelectDifferentTime}
            className="mt-2 inline-flex items-center text-xs font-semibold underline"
            style={{ color: 'var(--fd-red)' }}
          >
            Select a different time
          </button>
        )}
      </div>
    </div>
  )
}
