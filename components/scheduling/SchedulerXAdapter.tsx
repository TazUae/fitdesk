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
  onRangeSelect:  (range: QuickAddRange) => void
  timezone:       string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_START_MIN     = 9 * 60
const DAY_END_MIN       = 21 * 60
const DAY_DURATION_MIN  = DAY_END_MIN - DAY_START_MIN
const DRAG_THRESHOLD_PX = 20

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

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatHHmm(minutes: number): string {
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`
}

/** Map a viewport Y-coordinate to a snapped 30-min offset inside a day column rect. */
function yToMinutes(y: number, rect: DOMRect): number {
  const clamped = Math.max(0, Math.min(y - rect.top, rect.height))
  const raw     = DAY_START_MIN + (clamped / rect.height) * DAY_DURATION_MIN
  const snapped = Math.round(raw / 30) * 30
  return Math.max(DAY_START_MIN, Math.min(DAY_END_MIN, snapped))
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SchedulerXAdapter({
  sessions,
  selectedSlots,
  onSlotsChange,
  onSessionClick,
  onRangeSelect,
  timezone,
}: SchedulerXAdapterProps) {
  const sessionsRef       = useRef(sessions)
  const onSessionClickRef = useRef(onSessionClick)
  const onSlotsChangeRef  = useRef(onSlotsChange)
  const onRangeSelectRef  = useRef(onRangeSelect)
  // Set by drag-end so the click that follows is suppressed
  const wasDragRef        = useRef(false)

  useEffect(() => { sessionsRef.current       = sessions       }, [sessions])
  useEffect(() => { onSessionClickRef.current = onSessionClick }, [onSessionClick])
  useEffect(() => { onSlotsChangeRef.current  = onSlotsChange  }, [onSlotsChange])
  useEffect(() => { onRangeSelectRef.current  = onRangeSelect  }, [onRangeSelect])

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
        onMouseDownDateTime: (startDT, downEvent) => {
          const startY   = downEvent.clientY
          const anchorEl = downEvent.target instanceof Element ? downEvent.target : null

          const handleUp = (upEvent: MouseEvent) => {
            const dy = upEvent.clientY - startY
            if (Math.abs(dy) < DRAG_THRESHOLD_PX) return

            const atUp     = document.elementFromPoint(upEvent.clientX, upEvent.clientY)
            const columnEl = atUp?.closest<HTMLElement>('[data-time-grid-date]') ?? null
            if (!columnEl) return

            const columnDate = columnEl.getAttribute('data-time-grid-date')
            if (!columnDate) return

            const startDateStr = startDT.toPlainDate().toString()
            if (columnDate !== startDateStr) return   // cross-day drags not supported

            const startMin = startDT.hour * 60 + startDT.minute
            const endMin   = yToMinutes(upEvent.clientY, columnEl.getBoundingClientRect())
            const [lo, hi] = startMin < endMin ? [startMin, endMin] : [endMin, startMin]
            if (hi - lo < 30) return

            wasDragRef.current = true

            onRangeSelectRef.current({
              date:       columnDate,
              startTime:  formatHHmm(lo),
              endTime:    formatHHmm(hi),
              anchorRect: (anchorEl ?? columnEl).getBoundingClientRect(),
            })
          }

          document.addEventListener('mouseup', handleUp, { once: true })
        },
        onClickDateTime: (dateTime) => {
          if (wasDragRef.current) {
            wasDragRef.current = false
            return
          }
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
