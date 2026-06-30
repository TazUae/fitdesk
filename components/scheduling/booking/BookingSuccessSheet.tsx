'use client'

import { CalendarDays, CheckCircle2 } from 'lucide-react'
import { downloadICS, googleCalendarUrl, type CalendarEvent } from '@/utils/calendar'
import type { BookingPlan } from '@/types/scheduling'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

interface BookingSuccessSheetProps {
  plan:        BookingPlan
  clientName:  string
  sessionIds:  string[]
  onDone:      () => void
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

/**
 * Step 5 — Success state shown after a booking is persisted.
 *
 * Visual elements:
 *   - Green check + headline + pattern summary
 *   - "Add to Calendar" (single-event ICS download)
 *   - "Add to Google Calendar" link
 *   - Done — closes the sheet
 */
export function BookingSuccessSheet({ plan, clientName, sessionIds, onDone }: BookingSuccessSheetProps) {
  const total = plan.occurrences.length
  const firstOcc = plan.occurrences[0]
  const event: CalendarEvent | null = firstOcc
    ? {
        id:    sessionIds[0] ?? `fitdesk-${firstOcc.startAt.getTime()}`,
        title: `PT Session — ${clientName}`,
        start: firstOcc.startAt,
        end:   firstOcc.endAt,
      }
    : null

  // Distinct weekday/time pairs for the summary block
  const seen = new Map<string, { weekday: number; time: string; clock: string }>()
  for (const o of plan.occurrences) {
    const wd = o.startAt.getDay()
    const key = `${wd}:${o.localTime}`
    if (!seen.has(key)) {
      seen.set(key, { weekday: wd, time: o.localTime, clock: formatClock(o.startAt) })
    }
  }
  const summaryRows = [...seen.values()]

  return (
    <section className="flex flex-1 flex-col gap-5 px-4 py-6">
      <div className="flex flex-col items-center text-center">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full"
          style={{ backgroundColor: 'color-mix(in srgb, var(--fd-green) 12%, transparent)' }}
        >
          <CheckCircle2 className="h-9 w-9" style={{ color: 'var(--fd-green)' }} />
        </div>
        <h3 className="mt-4 text-xl font-semibold" style={{ color: 'var(--fd-text)' }}>
          {total === 1 ? 'Session booked!' : `${total} Sessions Booked!`}
        </h3>
        <p className="mt-1 text-sm" style={{ color: 'var(--fd-muted)' }}>
          Your {total === 1 ? 'session has' : 'recurring sessions have'} been scheduled.
        </p>
      </div>

      {summaryRows.length > 0 && (
        <ul
          className="space-y-2 rounded-lg border p-3"
          style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-bg)' }}
        >
          {summaryRows.map(r => (
            <li key={`${r.weekday}-${r.time}`} className="flex items-center justify-between gap-3">
              <span
                className="rounded-md px-2 py-1 text-xs font-bold uppercase"
                style={{ backgroundColor: 'var(--fd-blue-subtle)', color: 'var(--fd-blue)' }}
              >
                {WEEKDAY_LABELS[r.weekday]}
              </span>
              <span className="text-sm" style={{ color: 'var(--fd-text)' }}>
                {r.clock}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        {event && (
          <>
            <button
              type="button"
              onClick={() => downloadICS(event, `sessions-${event.start.toISOString().slice(0, 10)}.ics`)}
              className="flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold"
              style={{ backgroundColor: 'var(--fd-blue)', color: 'var(--fd-text-on-primary)' }}
            >
              <CalendarDays className="h-4 w-4" />
              Add to Calendar
            </button>
            <a
              href={googleCalendarUrl(event)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-lg border py-3 text-sm font-medium transition-colors hover:bg-[var(--fd-card-hover)]"
              style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-text)' }}
            >
              Add to Google Calendar
            </a>
          </>
        )}
        <button
          type="button"
          onClick={onDone}
          className="w-full rounded-lg py-3 text-sm font-medium transition-colors hover:bg-[var(--fd-card-hover)]"
          style={{ color: 'var(--fd-muted)' }}
        >
          Done
        </button>
      </div>
    </section>
  )
}
