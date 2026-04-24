'use client'

import { useEffect, useMemo, useRef } from 'react'
import 'temporal-polyfill/global'
import { ScheduleXCalendar, useNextCalendarApp } from '@schedule-x/react'
import { createViewWeek, createViewDay } from '@schedule-x/calendar'
import type { CalendarEvent } from '@schedule-x/calendar'
import { createEventsServicePlugin } from '@schedule-x/events-service'
import '@schedule-x/theme-default/dist/index.css'
import type { CalendarSession, QuickAddRange } from '@/components/scheduling/CalendarView'

// ─── Props ────────────────────────────────────────────────────────────────────

interface SchedulerXAdapterProps {
  sessions:       CalendarSession[]
  /** Accepted; visual highlight of selected slots wired in Phase 4. */
  selectedSlots:  Date[]
  onSlotsChange:  (slots: Date[]) => void
  onSessionClick: (session: CalendarSession) => void
  /** Accepted; drag-to-create range selection wired in Phase 4. */
  onRangeSelect:  (range: QuickAddRange) => void
  timezone:       string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sxId(s: CalendarSession): string {
  return s.id ?? `tmp-${s.clientId}-${s.start.getTime()}`
}

function toSXEvent(s: CalendarSession, tz: string): CalendarEvent {
  return {
    id:          sxId(s),
    title:       s.clientName,
    start:       Temporal.Instant.fromEpochMilliseconds(s.start.getTime())
                   .toZonedDateTimeISO(tz),
    end:         Temporal.Instant.fromEpochMilliseconds(s.end.getTime())
                   .toZonedDateTimeISO(tz),
    _fdStatus:   s.status,
    _fdClientId: s.clientId,
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SchedulerXAdapter({
  sessions,
  onSlotsChange,
  onSessionClick,
  selectedSlots:  _selectedSlots,
  onRangeSelect:  _onRangeSelect,
  timezone,
}: SchedulerXAdapterProps) {
  const sessionsRef       = useRef(sessions)
  const onSessionClickRef = useRef(onSessionClick)
  const onSlotsChangeRef  = useRef(onSlotsChange)

  useEffect(() => { sessionsRef.current       = sessions       }, [sessions])
  useEffect(() => { onSessionClickRef.current = onSessionClick }, [onSessionClick])
  useEffect(() => { onSlotsChangeRef.current  = onSlotsChange  }, [onSlotsChange])

  const eventsService = useMemo(() => createEventsServicePlugin(), [])

  const calendar = useNextCalendarApp(
    {
      views: [createViewWeek(), createViewDay()],
      timezone,
      dayBoundaries: { start: '09:00', end: '21:00' },
      callbacks: {
        onEventClick: (event) => {
          const session = sessionsRef.current.find(s => sxId(s) === String(event.id))
          if (session) onSessionClickRef.current(session)
        },
        onClickDateTime: (dateTime) => {
          const slot = new Date(dateTime.toInstant().epochMilliseconds)
          onSlotsChangeRef.current([slot])
        },
      },
    },
    [eventsService],
  )

  // Keep Schedule-X events in sync with sessions prop on every reconcile
  useEffect(() => {
    eventsService.set(sessions.map(s => toSXEvent(s, timezone)))
  }, [sessions, timezone, eventsService])

  return (
    <div className="[&_.sx-react-calendar-wrapper]:h-[700px] [&_.sx-react-calendar-wrapper]:w-full">
      <ScheduleXCalendar calendarApp={calendar} />
    </div>
  )
}
