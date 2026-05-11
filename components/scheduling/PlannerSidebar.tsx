'use client'

import { Plus } from 'lucide-react'
import { MiniCalendar } from '@/components/scheduling/MiniCalendar'
import { CalendarFilters } from '@/components/scheduling/CalendarFilters'

interface PlannerSidebarProps {
  currentDate?:    Date
  onSelectDate?:   (d: Date) => void
  /** Opens the booking sheet at step 1. */
  onCreate?:       () => void
}

/**
 * Left sidebar for the Planner (desktop only).
 *
 * Contains:
 *   - "+ Create" — primary entry point on desktop (replaces the floating FAB).
 *   - MiniCalendar — month grid; tapping a date jumps the main calendar
 *     (jump wiring is Phase 5.1B / Bundle 2).
 *   - CalendarFilters — display-only checkboxes.
 */
export function PlannerSidebar({ currentDate, onSelectDate, onCreate }: PlannerSidebarProps) {
  return (
    <div className="flex h-full w-full flex-col overflow-y-auto py-3">
      <div className="px-4 pb-3">
        <button
          type="button"
          onClick={onCreate}
          className="flex items-center gap-3 rounded-full border px-4 py-3 text-sm font-medium shadow-sm transition-shadow hover:shadow-md"
          style={{
            borderColor:     'var(--fd-border)',
            backgroundColor: 'var(--fd-surface)',
            color:           'var(--fd-text)',
            boxShadow:       'var(--fd-shadow-card, 0 1px 2px rgba(60,64,67,0.08), 0 1px 3px rgba(60,64,67,0.12))',
          }}
          aria-label="Create new booking"
        >
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full"
            style={{ backgroundColor: 'var(--fd-blue)', color: 'var(--fd-text-on-primary)' }}
          >
            <Plus className="h-4 w-4" />
          </span>
          <span>Create</span>
        </button>
      </div>

      <MiniCalendar selectedDate={currentDate} onSelectDate={onSelectDate} />

      <div className="my-2 mx-3 border-t" style={{ borderColor: 'var(--fd-border)' }} />

      <CalendarFilters />
    </div>
  )
}
