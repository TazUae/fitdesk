'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import 'temporal-polyfill/global'
import { ScheduleXCalendar, useNextCalendarApp } from '@schedule-x/react'
import { createViewWeek, createViewDay, createViewMonthGrid } from '@schedule-x/calendar'
import type { BackgroundEvent, CalendarEvent, CalendarType } from '@schedule-x/calendar'
import { createEventsServicePlugin } from '@schedule-x/events-service'
import { createCalendarControlsPlugin } from '@schedule-x/calendar-controls'
import '@schedule-x/theme-default/dist/index.css'
import './scheduler-x-overrides.css'
import { rescheduleSessionAction } from '@/actions/schedulingActions'
import { SessionCard } from '@/components/scheduling/SessionCard'
import { NowLine } from '@/components/scheduling/NowLine'
import type { CalendarSession, FDSession, QuickAddRange } from '@/types/scheduling'

// ─── Props ────────────────────────────────────────────────────────────────────

interface SchedulerXAdapterProps {
  sessions:             CalendarSession[]
  rawSessions:          FDSession[]
  selectedSlots:        Date[]
  onSlotsChange:        (slots: Date[]) => void
  onSessionClick:       (session: CalendarSession) => void
  onRangeSelect:        (range: QuickAddRange) => void
  onOptimisticReplace:  (next: FDSession) => void
  onReconcile:          () => void
  timezone:             string
  calendarDate:         Date
  onCalendarDateChange: (date: Date) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_START_MIN     = 9 * 60
const DAY_END_MIN       = 21 * 60
const DAY_DURATION_MIN  = DAY_END_MIN - DAY_START_MIN
const DRAG_THRESHOLD_PX = 20

// ─── Status → Schedule-X calendar mapping (Phase 5.0 light theme) ─────────────
// Semantic anchor colors; the visible event card is rendered by SessionCard
// using the per-client pastel palette, so these are mostly informational.

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
      style: { background: 'rgba(26,115,232,0.18)', borderLeft: '2px solid #1A73E8' },
    }
  })
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function dateToYMD(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
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
  rawSessions,
  selectedSlots,
  onSlotsChange,
  onSessionClick,
  onRangeSelect,
  onOptimisticReplace,
  onReconcile,
  timezone,
  calendarDate,
  onCalendarDateChange,
}: SchedulerXAdapterProps) {
  const sessionsRef            = useRef(sessions)
  const rawSessionsRef         = useRef(rawSessions)
  const selectedSlotsRef       = useRef(selectedSlots)
  const onSessionClickRef      = useRef(onSessionClick)
  const onSlotsChangeRef       = useRef(onSlotsChange)
  const onRangeSelectRef       = useRef(onRangeSelect)
  const onOptimisticReplaceRef = useRef(onOptimisticReplace)
  const onReconcileRef         = useRef(onReconcile)
  const timezoneRef            = useRef(timezone)
  // Set by drag-end so the click that follows is suppressed
  const wasDragRef               = useRef(false)
  const onCalendarDateChangeRef  = useRef(onCalendarDateChange)
  const calendarDateRef          = useRef(calendarDate)
  const wrapperRef               = useRef<HTMLDivElement>(null)

  useEffect(() => { sessionsRef.current            = sessions            }, [sessions])
  useEffect(() => { rawSessionsRef.current         = rawSessions         }, [rawSessions])
  useEffect(() => { selectedSlotsRef.current       = selectedSlots       }, [selectedSlots])
  useEffect(() => { onSessionClickRef.current      = onSessionClick      }, [onSessionClick])
  useEffect(() => { onSlotsChangeRef.current       = onSlotsChange       }, [onSlotsChange])
  useEffect(() => { onRangeSelectRef.current       = onRangeSelect       }, [onRangeSelect])
  useEffect(() => { onOptimisticReplaceRef.current = onOptimisticReplace }, [onOptimisticReplace])
  useEffect(() => { onReconcileRef.current         = onReconcile         }, [onReconcile])
  useEffect(() => { timezoneRef.current            = timezone            }, [timezone])
  useEffect(() => { onCalendarDateChangeRef.current = onCalendarDateChange }, [onCalendarDateChange])
  useEffect(() => { calendarDateRef.current         = calendarDate         }, [calendarDate])

  // Initial view: Day on mobile (narrow grid), Week on desktop.
  // Computed via lazy initializer so the calendar config receives the correct
  // defaultView on first creation — no setView() call before plugin attachment.
  const [currentView, setCurrentView] = useState<'week' | 'day' | 'month-grid'>(() => {
    if (typeof window === 'undefined') return 'week'
    return window.matchMedia('(max-width: 767px)').matches ? 'day' : 'week'
  })

  const eventsService          = useMemo(() => createEventsServicePlugin(), [])
  const calendarControlsPlugin = useMemo(() => createCalendarControlsPlugin(), [])

  const calendar = useNextCalendarApp(
    {
      views:     [createViewWeek(), createViewDay(), createViewMonthGrid()],
      defaultView: currentView,
      timezone,
      isDark:    false,
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
          // Tap-to-toggle works on both mouse-click and touch-tap, so mobile
          // users get multi-slot selection without needing drag.
          const slot   = new Date(dateTime.toInstant().epochMilliseconds)
          const slotMs = slot.getTime()
          const next   = selectedSlotsRef.current.some(s => s.getTime() === slotMs)
            ? selectedSlotsRef.current.filter(s => s.getTime() !== slotMs)
            : [...selectedSlotsRef.current, slot]
          onSlotsChangeRef.current(next)
        },
        onEventUpdate: (event) => {
          const raw = rawSessionsRef.current.find(s => s.id === String(event.id))
          if (!raw) {
            void onReconcileRef.current()
            return
          }

          const startDT  = event.start as Temporal.ZonedDateTime
          const newDate  = startDT.toPlainDate().toString()
          const newTime  = formatHHmm(startDT.hour * 60 + startDT.minute)
          const durationMs = raw.endAt.getTime() - raw.startAt.getTime()
          const newStartAt = new Date(startDT.toInstant().epochMilliseconds)
          const newEndAt   = new Date(newStartAt.getTime() + durationMs)

          // Optimistic update so the UI reflects the drag immediately
          onOptimisticReplaceRef.current({ ...raw, startAt: newStartAt, endAt: newEndAt })

          rescheduleSessionAction(raw.id, {
            newDate,
            newTime,
            expectedVersion: raw.version,
          }).then(r => {
            if (r.success) {
              onOptimisticReplaceRef.current(r.data)
            } else {
              toast.error(r.message ?? 'Failed to reschedule session')
              void onReconcileRef.current()
            }
          }).catch(() => {
            toast.error('Failed to reschedule session')
            void onReconcileRef.current()
          })
        },
        // SX → React: fired when the main calendar's anchor date changes (prev/next, today, date picker)
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

  // Highlight queued booking slots as background events
  useEffect(() => {
    eventsService.setBackgroundEvents(toBackgroundEvents(selectedSlots, timezone))
  }, [selectedSlots, timezone, eventsService])

  // React → SX: sync calendarDate into the main calendar (mini-calendar click direction)
  useEffect(() => {
    if (!calendar) return
    const incoming = dateToYMD(calendarDate)
    const current  = calendarControlsPlugin.getDate()
    const currentStr = `${current.year}-${pad2(current.month)}-${pad2(current.day)}`
    if (incoming === currentStr) return
    calendarControlsPlugin.setDate(Temporal.PlainDate.from(incoming))
  }, [calendar, calendarDate, calendarControlsPlugin])

  // Auto-scroll Day/Week views to "current time − 60 min" on intentional view entry.
  // Runs when the calendar first initialises (calendar: null→obj) and on each user-
  // driven view switch. Does not re-run on ordinary rerenders, so no snap-back after
  // manual scrolling. Month view is skipped (overview; no time position needed).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!calendar || currentView === 'month-grid') return

    // Week view: only scroll when today's date falls within the displayed week.
    if (currentView === 'week') {
      const today  = new Date()
      const viewed = calendarDateRef.current
      const diffMs = Math.abs(
        new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
        new Date(viewed.getFullYear(), viewed.getMonth(), viewed.getDate()).getTime(),
      )
      if (diffMs > 6 * 86400000) return
    }

    // Day view: only scroll when today is the displayed day.
    if (currentView === 'day') {
      const today  = new Date()
      const viewed = calendarDateRef.current
      if (
        today.getFullYear() !== viewed.getFullYear() ||
        today.getMonth()    !== viewed.getMonth()    ||
        today.getDate()     !== viewed.getDate()
      ) return
    }

    // Defer until Schedule-X has committed its view DOM update.
    // Children's effects (ScheduleXCalendar.render) run before ours, so by the
    // time this rAF fires the scroll container exists and has a real scrollHeight.
    const raf = requestAnimationFrame(() => {
      const container = wrapperRef.current?.querySelector<HTMLElement>('.sx__view-container')
      if (!container || container.scrollHeight <= container.clientHeight) return

      const now       = new Date()
      const localMin  = now.getHours() * 60 + now.getMinutes()
      const targetMin = Math.max(DAY_START_MIN, localMin - 60)
      const fraction  = (targetMin - DAY_START_MIN) / DAY_DURATION_MIN
      container.scrollTop = Math.min(
        fraction * container.scrollHeight,
        container.scrollHeight - container.clientHeight,
      )
    })

    return () => cancelAnimationFrame(raf)
  // calendar: null → obj fires once on init; currentView fires on each intentional switch.
  // calendarDateRef is a ref — intentionally excluded from deps to avoid date-nav snap-back.
  }, [calendar, currentView]) // eslint-disable-line react-hooks/exhaustive-deps

  const sxCustomComponents = useMemo(
    () => ({ timeGridEvent: SessionCard }),
    [],
  )

  const VIEW_LABELS: Record<'day' | 'week' | 'month-grid', string> = {
    day:          'Day',
    week:         'Week',
    'month-grid': 'Month',
  }

  return (
    <div ref={wrapperRef} className="fd-sx-wrap relative h-full min-w-0 w-full overflow-hidden">
      {/* Compact view switcher — mobile only (hidden at md+).
          The Schedule-X native header view-selector is hidden on mobile via CSS. */}
      <div className="fd-sx-view-switcher flex gap-1 border-b px-3 py-2 md:hidden"
        style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-surface)' }}
      >
        {(['day', 'week', 'month-grid'] as const).map(v => (
          <button
            key={v}
            type="button"
            onClick={() => { calendarControlsPlugin.setView(v); setCurrentView(v) }}
            className="flex-1 rounded-full px-3 py-1 text-sm font-medium transition-colors"
            style={
              currentView === v
                ? { backgroundColor: 'var(--fd-blue)', color: 'var(--fd-text-on-primary)' }
                : { backgroundColor: 'transparent', color: 'var(--fd-muted)',
                    border: '1px solid var(--fd-border)' }
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
