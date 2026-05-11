'use client'

import { useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import 'temporal-polyfill/global'
import { ScheduleXCalendar, useNextCalendarApp } from '@schedule-x/react'
import { createViewWeek, createViewDay, createViewMonthGrid } from '@schedule-x/calendar'
import type { BackgroundEvent, CalendarEvent, CalendarType } from '@schedule-x/calendar'
import { createEventsServicePlugin } from '@schedule-x/events-service'
import { createDragAndDropPlugin } from '@schedule-x/drag-and-drop'
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
  const wasDragRef             = useRef(false)

  useEffect(() => { sessionsRef.current            = sessions            }, [sessions])
  useEffect(() => { rawSessionsRef.current         = rawSessions         }, [rawSessions])
  useEffect(() => { selectedSlotsRef.current       = selectedSlots       }, [selectedSlots])
  useEffect(() => { onSessionClickRef.current      = onSessionClick      }, [onSessionClick])
  useEffect(() => { onSlotsChangeRef.current       = onSlotsChange       }, [onSlotsChange])
  useEffect(() => { onRangeSelectRef.current       = onRangeSelect       }, [onRangeSelect])
  useEffect(() => { onOptimisticReplaceRef.current = onOptimisticReplace }, [onOptimisticReplace])
  useEffect(() => { onReconcileRef.current         = onReconcile         }, [onReconcile])
  useEffect(() => { timezoneRef.current            = timezone            }, [timezone])

  const eventsService  = useMemo(() => createEventsServicePlugin(), [])
  const dragAndDrop    = useMemo(() => createDragAndDropPlugin(30), [])

  const calendar = useNextCalendarApp(
    {
      views:     [createViewWeek(), createViewDay(), createViewMonthGrid()],
      defaultView: 'week',
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
      },
    },
    [eventsService, dragAndDrop],
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
    <div className="fd-sx-wrap relative h-full w-full">
      <NowLine />
      <ScheduleXCalendar
        calendarApp={calendar}
        customComponents={{ timeGridEvent: SessionCard }}
      />
    </div>
  )
}
