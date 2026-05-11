'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MiniCalendarProps {
  /** Date to highlight as "selected" — defaults to today. */
  selectedDate?: Date
  /** Called when the user taps a day cell. */
  onSelectDate?: (date: Date) => void
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function startOfMonth(d: Date): Date {
  const x = new Date(d)
  x.setDate(1)
  x.setHours(0, 0, 0, 0)
  return x
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate()
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

/**
 * Small month grid widget for the sidebar. Display-only in Phase 5.0
 * (tapping a date emits onSelectDate but the parent does not yet wire it
 * back to the main calendar — that integration is Phase 5.1B / Bundle 2).
 */
export function MiniCalendar({ selectedDate, onSelectDate }: MiniCalendarProps) {
  const today = useMemo(() => new Date(), [])
  const initial = selectedDate ?? today
  const [viewMonth, setViewMonth] = useState<Date>(startOfMonth(initial))

  const days = useMemo(() => {
    const first = startOfMonth(viewMonth)
    const firstWeekday = first.getDay()  // 0 = Sun
    const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate()

    // Build a 6×7 grid of dates (some from prev / next month)
    const cells: Array<{ date: Date; inMonth: boolean }> = []
    for (let i = 0; i < firstWeekday; i++) {
      const d = new Date(first)
      d.setDate(d.getDate() - (firstWeekday - i))
      cells.push({ date: d, inMonth: false })
    }
    for (let i = 1; i <= daysInMonth; i++) {
      cells.push({ date: new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i), inMonth: true })
    }
    while (cells.length < 42) {
      const last = cells[cells.length - 1].date
      const d = new Date(last)
      d.setDate(d.getDate() + 1)
      cells.push({ date: d, inMonth: false })
    }
    return cells
  }, [viewMonth])

  return (
    <section aria-label="Mini calendar" className="select-none px-1 py-2">
      <div className="mb-2 flex items-center justify-between px-2">
        <p className="text-sm font-medium" style={{ color: 'var(--fd-text)' }}>
          {monthLabel(viewMonth)}
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-[var(--fd-card-hover)]"
            style={{ color: 'var(--fd-muted)' }}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-[var(--fd-card-hover)]"
            style={{ color: 'var(--fd-muted)' }}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0.5 px-1 text-center text-[11px]" style={{ color: 'var(--fd-muted)' }}>
        {WEEKDAY_LABELS.map((d, i) => (
          <div key={i} className="py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5 px-1">
        {days.map(({ date, inMonth }, idx) => {
          const isToday = isSameDay(date, today)
          const isSelected = selectedDate ? isSameDay(date, selectedDate) : isToday
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectDate?.(date)}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-[12px] transition-colors',
                'hover:bg-[var(--fd-card-hover)]',
              )}
              style={{
                backgroundColor: isSelected ? 'var(--fd-blue)' : 'transparent',
                color: isSelected
                  ? 'var(--fd-text-on-primary)'
                  : !inMonth
                    ? 'color-mix(in srgb, var(--fd-muted) 70%, transparent)'
                    : isToday
                      ? 'var(--fd-blue)'
                      : 'var(--fd-text)',
                fontWeight: isToday || isSelected ? 600 : 400,
              }}
              aria-label={date.toDateString()}
              aria-pressed={isSelected}
            >
              {date.getDate()}
            </button>
          )
        })}
      </div>
    </section>
  )
}
