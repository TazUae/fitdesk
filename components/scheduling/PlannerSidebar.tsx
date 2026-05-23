'use client'

import { MiniCalendar } from '@/components/scheduling/MiniCalendar'
import { CalendarFilters } from '@/components/scheduling/CalendarFilters'

interface PlannerSidebarProps {
  currentDate?:  Date
  onSelectDate?: (d: Date) => void
}

/**
 * Left sidebar for the Planner (desktop only).
 *
 * Contains:
 *   - MiniCalendar — month grid; tapping a date jumps the main calendar
 *     (jump wiring is Phase S2).
 *   - CalendarFilters — display-only checkboxes.
 *
 * The primary booking CTA lives in PlannerToolbar so it is always reachable
 * regardless of sidebar state. No duplicate Create button here.
 */
export function PlannerSidebar({ currentDate, onSelectDate }: PlannerSidebarProps) {
  return (
    <div className="flex h-full w-full flex-col overflow-y-auto py-3">
      <MiniCalendar selectedDate={currentDate} onSelectDate={onSelectDate} />

      <div className="my-2 mx-3 border-t" style={{ borderColor: 'var(--fd-border)' }} />

      <CalendarFilters />
    </div>
  )
}
