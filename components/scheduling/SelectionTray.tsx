'use client'

import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SelectionTrayProps {
  selectedSlots: Date[]
  timezone:      string
  /** Whether one or more occurrences would conflict — drives the red state. */
  hasConflict?:  boolean
  onClear:       () => void
  onOpen:        () => void
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** Format a Date as "Mon 6:00 PM" in the trainer's timezone. */
function formatSlot(d: Date, timezone: string): string {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday:  'short',
    hour:     'numeric',
    minute:   '2-digit',
    hour12:   true,
  })
  return dtf.format(d).replace(',', '')
}

/** Format a Date as ISO weekday (0..6 in JS Sun..Sat) in the trainer's timezone. */
function weekdayOf(d: Date, timezone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' })
  return WEEKDAY_LABELS.indexOf(dtf.format(d) as typeof WEEKDAY_LABELS[number])
}

/**
 * Docked bottom strip showing the user's multi-slot selection.
 *
 * Tapping the body opens the BookingSheet pre-filled at Step 1. The X
 * clears the selection without opening the sheet.
 *
 * Mobile: spans the bottom inset (above the bottom nav).
 * Desktop: sticky strip above the bottom of the main calendar column.
 */
export function SelectionTray({
  selectedSlots,
  timezone,
  hasConflict,
  onClear,
  onOpen,
}: SelectionTrayProps) {
  if (selectedSlots.length === 0) return null

  const sorted = [...selectedSlots].sort((a, b) => a.getTime() - b.getTime())
  const labels = sorted.map(s => formatSlot(s, timezone))
  const preview = labels.slice(0, 3).join(' · ')
  const overflow = labels.length > 3 ? ` · +${labels.length - 3} more` : ''

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        'fixed inset-x-4 z-30 mx-auto flex max-w-[600px] cursor-pointer items-center gap-3 border px-4 py-3 transition-colors',
        'md:left-auto md:right-6 md:mx-0 md:rounded-lg',
        'md:bottom-6',
      )}
      style={{
        // Phase 5.0 — the Planner route has no bottom nav, so the tray sits
        // just above the safe-area inset. The right-aligned FAB is hidden
        // by ScheduleView while the tray is visible, so they don't collide.
        bottom: 'calc(env(safe-area-inset-bottom) + 16px)',
        backgroundColor: 'var(--fd-surface)',
        borderColor: hasConflict
          ? 'color-mix(in srgb, var(--fd-red) 50%, transparent)'
          : 'var(--fd-blue)',
        borderRadius: '0.75rem',
        boxShadow: '0 4px 12px rgba(60,64,67,0.18), 0 2px 4px rgba(60,64,67,0.10)',
      }}
      aria-label={`${selectedSlots.length} session${selectedSlots.length === 1 ? '' : 's'} selected. Tap to book.`}
    >
      <div className="min-w-0 flex-1">
        <p
          className="text-sm font-semibold"
          style={{ color: hasConflict ? 'var(--fd-red)' : 'var(--fd-text)' }}
        >
          {selectedSlots.length} session{selectedSlots.length === 1 ? '' : 's'} selected
          {hasConflict && ' · conflict'}
        </p>
        <p className="truncate text-xs" style={{ color: 'var(--fd-muted)' }}>
          {preview}{overflow}
        </p>
      </div>

      <button
        type="button"
        onClick={e => {
          e.stopPropagation()
          onClear()
        }}
        aria-label="Clear selection"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[var(--fd-card-hover)]"
        style={{ color: 'var(--fd-muted)' }}
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  )
}

/** Derive the unique weekday count from the selected slots — useful for the BookingSheet. */
export function distinctWeekdays(slots: Date[], timezone: string): number {
  const set = new Set<number>()
  for (const s of slots) set.add(weekdayOf(s, timezone))
  return set.size
}
