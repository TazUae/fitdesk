'use client'

import { useEffect, useMemo, useRef } from 'react'
import 'temporal-polyfill/global'
import { ScheduleXCalendar, useNextCalendarApp } from '@schedule-x/react'
import { createViewWeek, createViewDay } from '@schedule-x/calendar'
import type { BackgroundEvent, CalendarEvent, CalendarType } from '@schedule-x/calendar'
import { createEventsServicePlugin } from '@schedule-x/events-service'
import '@schedule-x/theme-default/dist/index.css'
import type { CalendarSession, QuickAddRange } from '@/components/scheduling/CalendarView'

// ─── Props ────────────────────────────────────────────────────────────────────

interface SchedulerXAdapterProps {
  sessions:       CalendarSession[]
  selectedSlots:  Date[]
  onSlotsChange:  (slots: Date[]) => void
  onSessionClick: (session: CalendarSession) => void
  /** Accepted; drag-to-create range selection wired in Phase 5. */
  onRangeSelect:  (range: QuickAddRange) => void
  timezone:       string
}

// ─── Status → Schedule-X calendar mapping ────────────────────────────────────

const STATUS_CALENDARS: Record<string, CalendarType> = {
  scheduled: {
    colorName:  'scheduled',
    darkColors: { main: '#4B91FF', container: 'rgba(75,145,255,0.18)',  onContainer: '#A8C8FF' },
  },
  confirmed: {
    colorName:  'confirmed',
    darkColors: { main: '#4ECBA0', container: 'rgba(78,203,160,0.18)',  onContainer: '#9CEDD2' },
  },
  completed: {
    colorName:  'completed',
    darkColors: { main: '#8B92A8', container: 'rgba(139,146,168,0.14)', onContainer: '#B6C0DA' },
  },
  cancelled: {
    colorName:  'cancelled',
    darkColors: { main: '#E85C6A', container: 'rgba(232,92,106,0.14)',  onContainer: '#F0A0AA' },
  },
  no_show: {
    colorName:  'no_show',
    darkColors: { main: '#F5A623', container: 'rgba(245,166,35,0.14)',  onContainer: '#FBCC7E' },
  },
  skipped: {
    colorName:  'skipped',
    darkColors: { main: '#6B7385', container: 'rgba(107,115,133,0.12)', onContainer: '#8B92A8' },
  },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sxId(s: CalendarSession): string {
  return s.id ?? `tmp-${s.clientId}-${s.start.getTime()}`
}

function toSXEvent(s: CalendarSession, tz: string): CalendarEvent {
  return {
    id:         sxId(s),
    title:      s.clientName,
    calendarId: s.status,
    start:      Temporal.Instant.fromEpochMilliseconds(s.start.getTime())
                  .toZonedDateTimeISO(tz),
    end:        Temporal.Instant.fromEpochMilliseconds(s.end.getTime())
                  .toZonedDateTimeISO(tz),
  }
}

function toBackgroundEvents(slots: Date[], tz: string): BackgroundEvent[] {
  return slots.map(slot => {
    const start = Temporal.Instant.fromEpochMilliseconds(slot.getTime())
      .toZonedDateTimeISO(tz)
    return {
      start,
      end:   start.add({ minutes: 30 }),
      style: { background: 'rgba(75,145,255,0.22)', borderLeft: '2px solid #4B91FF' },
    }
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SchedulerXAdapter({
  sessions,
  selectedSlots,
  onSlotsChange,
  onSessionClick,
  onRangeSelect: _onRangeSelect,
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
      views:     [createViewWeek(), createViewDay()],
      timezone,
      isDark:    true,
      calendars: STATUS_CALENDARS,
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

  // Sync sessions on every reconcile
  useEffect(() => {
    eventsService.set(sessions.map(s => toSXEvent(s, timezone)))
  }, [sessions, timezone, eventsService])

  // Highlight queued booking slots as background events
  useEffect(() => {
    eventsService.setBackgroundEvents(toBackgroundEvents(selectedSlots, timezone))
  }, [selectedSlots, timezone, eventsService])

  return (
    <div className="[&_.sx-react-calendar-wrapper]:h-[700px] [&_.sx-react-calendar-wrapper]:w-full">
      <ScheduleXCalendar calendarApp={calendar} />
    </div>
  )
}
