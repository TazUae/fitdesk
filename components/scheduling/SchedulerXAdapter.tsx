'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import 'temporal-polyfill/global'
import { ScheduleXCalendar, useNextCalendarApp } from '@schedule-x/react'
import {
  createViewWeek,
  createViewDay,
  createViewMonthGrid,
  createViewWeekAgenda,
  createViewMonthAgenda,
} from '@schedule-x/calendar'
import type { CalendarEvent, CalendarType } from '@schedule-x/calendar'
import { createEventsServicePlugin } from '@schedule-x/events-service'
import { createCalendarControlsPlugin } from '@schedule-x/calendar-controls'
import '@schedule-x/theme-default/dist/index.css'
import './scheduler-x-overrides.css'
import { SessionCard } from '@/components/scheduling/SessionCard'
import { NowLine } from '@/components/scheduling/NowLine'
import type { CalendarSession } from '@/types/scheduling'

// ─── Props ────────────────────────────────────────────────────────────────────

interface SchedulerXAdapterProps {
  sessions:             CalendarSession[]
  timezone:             string
  calendarDate:         Date
  onCalendarDateChange: (date: Date) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Match dayBoundaries below: 06:00–21:00
const DAY_START_MIN    = 6 * 60    // 360
const DAY_END_MIN      = 21 * 60   // 1260
const DAY_DURATION_MIN = DAY_END_MIN - DAY_START_MIN

// ─── Status → Schedule-X calendar mapping ────────────────────────────────────

const STATUS_CALENDARS: Record<string, CalendarType> = {
  scheduled: {
    colorName:   'scheduled',
    lightColors: { main: '#1A73E8', container: '#D2E3FC', onContainer: '#174EA6' },
  },
  confirmed: {
    colorName:   'confirmed',
    lightColors: { main: '#188038', container: '#CEEAD6', onContainer: '#0D652D' },
  },
  completed: {
    colorName:   'completed',
    lightColors: { main: '#5F6368', container: '#E8EAED', onContainer: '#3C4043' },
  },
  cancelled: {
    colorName:   'cancelled',
    lightColors: { main: '#D93025', container: '#FAD2CF', onContainer: '#A50E0E' },
  },
  no_show: {
    colorName:   'no_show',
    lightColors: { main: '#E37400', container: '#FEEFC3', onContainer: '#7E6101' },
  },
  skipped: {
    colorName:   'skipped',
    lightColors: { main: '#5F6368', container: '#E8EAED', onContainer: '#3C4043' },
  },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sxId(s: CalendarSession): string {
  return s.id ?? `tmp-${s.clientId ?? ''}-${s.start.getTime()}`
}

function toSXEvent(s: CalendarSession, tz: string): CalendarEvent {
  return {
    id:         sxId(s),
    title:      s.clientName,
    calendarId: s.status ?? 'scheduled',
    start:      Temporal.Instant.fromEpochMilliseconds(s.start.getTime()).toZonedDateTimeISO(tz),
    end:        Temporal.Instant.fromEpochMilliseconds(s.end.getTime()).toZonedDateTimeISO(tz),
    editable:   false,
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function dateToYMD(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SchedulerXAdapter({
  sessions,
  timezone,
  calendarDate,
  onCalendarDateChange,
}: SchedulerXAdapterProps) {
  const sessionsRef             = useRef(sessions)
  const onCalendarDateChangeRef = useRef(onCalendarDateChange)
  const calendarDateRef         = useRef(calendarDate)
  const wrapperRef              = useRef<HTMLDivElement>(null)

  useEffect(() => { sessionsRef.current             = sessions             }, [sessions])
  useEffect(() => { onCalendarDateChangeRef.current = onCalendarDateChange }, [onCalendarDateChange])
  useEffect(() => { calendarDateRef.current         = calendarDate         }, [calendarDate])

  // Initial view: Day on mobile, Week on desktop
  const [currentView, setCurrentView] = useState<
    'week' | 'day' | 'month-grid' | 'week-agenda' | 'month-agenda'
  >(() => {
    if (typeof window === 'undefined') return 'week'
    return window.matchMedia('(max-width: 767px)').matches ? 'day' : 'week'
  })

  const eventsService          = useMemo(() => createEventsServicePlugin(), [])
  const calendarControlsPlugin = useMemo(() => createCalendarControlsPlugin(), [])

  const calendar = useNextCalendarApp(
    {
      views: [
        createViewWeek(),
        createViewDay(),
        createViewMonthGrid(),
        createViewWeekAgenda(),
        createViewMonthAgenda(),
      ],
      defaultView: currentView,
      timezone,
      isDark:      false,
      calendars:   STATUS_CALENDARS,
      dayBoundaries: { start: '06:00', end: '21:00' },
      callbacks: {
        // SX → React: fired when the main calendar's anchor date changes
        onSelectedDateUpdate: (date) => {
          const newStr = `${date.year}-${pad2(date.month)}-${pad2(date.day)}`
          if (newStr === dateToYMD(calendarDateRef.current)) return
          onCalendarDateChangeRef.current(new Date(date.year, date.month - 1, date.day))
        },
      },
    },
    [eventsService, calendarControlsPlugin],
  )

  // Sync sessions on every reconcile
  useEffect(() => {
    eventsService.set(sessions.map(s => toSXEvent(s, timezone)))
  }, [sessions, timezone, eventsService])

  // React → SX: sync calendarDate into the main calendar (mini-calendar click direction)
  useEffect(() => {
    if (!calendar) return
    const incoming   = dateToYMD(calendarDate)
    const current    = calendarControlsPlugin.getDate()
    const currentStr = `${current.year}-${pad2(current.month)}-${pad2(current.day)}`
    if (incoming === currentStr) return
    calendarControlsPlugin.setDate(Temporal.PlainDate.from(incoming))
  }, [calendar, calendarDate, calendarControlsPlugin])

  const prevViewRef     = useRef(currentView)
  const prevCalendarRef = useRef<typeof calendar>(null)

  // Auto-scroll time-grid views to the most relevant time on view entry / date nav
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const viewChangedOrInit =
      prevViewRef.current !== currentView || prevCalendarRef.current !== calendar
    prevViewRef.current     = currentView
    prevCalendarRef.current = calendar

    if (!calendar || (currentView !== 'day' && currentView !== 'week')) return

    const today  = new Date()
    const viewed = calendarDate
    const isToday =
      today.getFullYear() === viewed.getFullYear() &&
      today.getMonth()    === viewed.getMonth()    &&
      today.getDate()     === viewed.getDate()

    let targetMin: number

    if (currentView === 'week') {
      // Only auto-scroll on view entry; skip on date navigation
      if (!viewChangedOrInit) return
      const diffMs = Math.abs(
        new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
        new Date(viewed.getFullYear(), viewed.getMonth(), viewed.getDate()).getTime(),
      )
      if (diffMs > 6 * 86400000) return
      targetMin = today.getHours() * 60 + today.getMinutes() - 60
    } else if (isToday) {
      targetMin = today.getHours() * 60 + today.getMinutes() - 60
    } else {
      // Day, another date: scroll to the earliest session on that day
      const earliestMin = sessionsRef.current.reduce<number | null>((min, s) => {
        const d = s.start
        if (
          d.getFullYear() !== viewed.getFullYear() ||
          d.getMonth()    !== viewed.getMonth()    ||
          d.getDate()     !== viewed.getDate()
        ) return min
        const mins = d.getHours() * 60 + d.getMinutes()
        return min === null || mins < min ? mins : min
      }, null)
      if (earliestMin === null) return
      targetMin = earliestMin - 60
    }

    targetMin = Math.max(DAY_START_MIN, targetMin)

    const raf = requestAnimationFrame(() => {
      const container = wrapperRef.current?.querySelector<HTMLElement>('.sx__view-container')
      if (!container || container.scrollHeight <= container.clientHeight) return
      const fraction = (targetMin - DAY_START_MIN) / DAY_DURATION_MIN
      container.scrollTop = Math.min(
        fraction * container.scrollHeight,
        container.scrollHeight - container.clientHeight,
      )
    })

    return () => cancelAnimationFrame(raf)
  }, [calendar, currentView, calendarDate]) // eslint-disable-line react-hooks/exhaustive-deps

  const sxCustomComponents = useMemo(() => ({ timeGridEvent: SessionCard }), [])

  const VIEW_LABELS: Record<'day' | 'week-agenda' | 'month-agenda', string> = {
    day:            'Day',
    'week-agenda':  'Week',
    'month-agenda': 'Month',
  }

  return (
    <div ref={wrapperRef} className="fd-sx-wrap relative h-full min-w-0 w-full overflow-hidden">
      {/* Compact view switcher — mobile only (hidden at md+) */}
      <div
        className="fd-sx-view-switcher flex gap-1 border-b px-3 py-2 md:hidden"
        style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-surface)' }}
      >
        {(['day', 'week-agenda', 'month-agenda'] as const).map(v => (
          <button
            key={v}
            type="button"
            onClick={() => { calendarControlsPlugin.setView(v); setCurrentView(v) }}
            className="flex-1 rounded-full px-3 py-1 text-sm font-medium transition-colors"
            style={
              currentView === v
                ? { backgroundColor: 'var(--fd-blue)', color: 'var(--fd-text-on-primary)' }
                : { backgroundColor: 'transparent', color: 'var(--fd-muted)', border: '1px solid var(--fd-border)' }
            }
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
      </div>

      <NowLine />
      <ScheduleXCalendar
        calendarApp={calendar}
        customComponents={sxCustomComponents}
      />
    </div>
  )
}
