'use client'

import { useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { scheduleTokens } from '@/lib/ui/scheduleDesignTokens'
import type { FDSessionStatus } from '@/types/scheduling'

// Drag threshold: ignore micro-drags (< 1 slot of motion) — treat as tap.
const DRAG_THRESHOLD_SLOTS = 1

// ─── Config ───────────────────────────────────────────────────────────────────

const WINDOW_START  = 9 * 60    // 09:00 → minutes from midnight
const WINDOW_END    = 21 * 60   // 21:00
const SLOT_MINUTES  = 30
const SLOT_HEIGHT   = scheduleTokens.slotHeightPx
const TOTAL_SLOTS   = (WINDOW_END - WINDOW_START) / SLOT_MINUTES   // 24
const GRID_HEIGHT   = TOTAL_SLOTS * SLOT_HEIGHT                     // 1152 px
const TIME_COL_W    = 52        // px — left time-label column

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CalendarSession {
  id?:        string
  /** ERP Customer docname — for session detail sheet */
  clientId?:  string
  start:      Date
  end:        Date
  clientName: string
  status?:    FDSessionStatus
}

/**
 * Emitted when the trainer drags across more than one 30-min slot in a column.
 *
 * `anchorRect` is the bounding rect of the drag selection in viewport pixels,
 * for popover positioning.
 */
export interface QuickAddRange {
  /** YYYY-MM-DD, local day the drag happened on. */
  date:       string
  /** HH:mm, inclusive start of the drag window (local). */
  startTime:  string
  /** HH:mm, exclusive end of the drag window (local). */
  endTime:    string
  anchorRect: DOMRect
}

interface LaidOut extends CalendarSession {
  /** 0..100 — left edge as percentage of the column inner width. */
  leftPct:  number
  /** 0..100 — width as percentage of the column inner width. */
  widthPct: number
}

// ─── Status colours ───────────────────────────────────────────────────────────

const STATUS_COLOR: Record<FDSessionStatus, { bg: string; border: string; text: string }> = {
  scheduled: { bg: 'rgba(91,156,246,0.15)',  border: 'rgba(91,156,246,0.45)',  text: '#5B9CF6' },
  confirmed: { bg: 'rgba(91,156,246,0.15)',  border: 'rgba(91,156,246,0.45)',  text: '#5B9CF6' },
  completed: { bg: 'rgba(78,203,160,0.15)',  border: 'rgba(78,203,160,0.45)',  text: '#4ECBA0' },
  cancelled: { bg: 'rgba(138,143,168,0.10)', border: 'rgba(138,143,168,0.30)', text: '#8A8FA8' },
  skipped:   { bg: 'rgba(138,143,168,0.10)', border: 'rgba(138,143,168,0.30)', text: '#8A8FA8' },
  no_show:   { bg: 'rgba(232,92,106,0.12)',  border: 'rgba(232,92,106,0.40)',  text: '#E85C6A' },
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function hhmm(d: Date): string {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function mondayOf(d: Date): Date {
  const date = new Date(d)
  date.setHours(0, 0, 0, 0)
  const day = date.getDay()
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1))
  return date
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function isToday(d: Date): boolean {
  return ymd(d) === ymd(new Date())
}

// ─── Grid helpers ─────────────────────────────────────────────────────────────

/** Minutes from midnight → px offset within the grid. */
function topPx(minFromMidnight: number): number {
  const clamped = Math.max(WINDOW_START, Math.min(WINDOW_END, minFromMidnight))
  return ((clamped - WINDOW_START) / SLOT_MINUTES) * SLOT_HEIGHT
}

function durationPx(durationMinutes: number): number {
  return Math.max(SLOT_HEIGHT / 2, (durationMinutes / SLOT_MINUTES) * SLOT_HEIGHT)
}

function minutesFromMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

function formatTimeLabel(minutesTotal: number): string {
  const h = Math.floor(minutesTotal / 60)
  const m = minutesTotal % 60
  const period = h >= 12 ? 'PM' : 'AM'
  const hour   = h % 12 || 12
  return m === 0
    ? `${hour} ${period}`
    : `${hour}:${m.toString().padStart(2, '0')}`
}

/** Snap a raw px offset (click Y within grid) to the start-minute of the 30-min slot that contains it. */
function snapYToSlotStartMin(yPx: number): number {
  const rawMinutes = WINDOW_START + Math.floor(yPx / SLOT_HEIGHT) * SLOT_MINUTES
  return Math.max(WINDOW_START, Math.min(WINDOW_END - SLOT_MINUTES, rawMinutes))
}

function minutesToHHmm(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

// ─── Waterfall overlap layout ─────────────────────────────────────────────────

/**
 * Cluster-based lane layout that matches Google Calendar's "waterfall" look.
 *
 *  1. Sort sessions by start.
 *  2. Build clusters of transitively-overlapping sessions (a new cluster starts
 *     only when a session's start is >= the running max end of the cluster).
 *  3. Greedy lane-assign within each cluster (first lane whose last session
 *     ended at or before this session's start).
 *  4. Base width = 1 / clusterLaneCount. Base left = lane * base width.
 *  5. Expansion pass: for each session, extend rightward through higher lanes
 *     that are unblocked for the *entire* time span of this session. This
 *     avoids the naive "split into N equal columns" look when some lanes are
 *     free for part of the cluster's time range.
 */
function layoutSessions(sessions: CalendarSession[]): LaidOut[] {
  if (sessions.length === 0) return []

  const sorted = [...sessions].sort((a, b) => a.start.getTime() - b.start.getTime())

  // ── Build transitive-overlap clusters ────────────────────────────────────
  const clusters: CalendarSession[][] = []
  let current: CalendarSession[] = []
  let clusterMaxEnd = -Infinity

  for (const s of sorted) {
    if (s.start.getTime() >= clusterMaxEnd) {
      if (current.length) clusters.push(current)
      current = [s]
      clusterMaxEnd = s.end.getTime()
    } else {
      current.push(s)
      clusterMaxEnd = Math.max(clusterMaxEnd, s.end.getTime())
    }
  }
  if (current.length) clusters.push(current)

  // ── Lane-assign + expand per cluster ─────────────────────────────────────
  const laid: LaidOut[] = []

  for (const cluster of clusters) {
    const laneEnds: number[] = []
    const assigned: Array<{ lane: number; s: CalendarSession }> = []

    for (const s of cluster) {
      let lane = laneEnds.findIndex(end => s.start.getTime() >= end)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(s.end.getTime())
      } else {
        laneEnds[lane] = s.end.getTime()
      }
      assigned.push({ lane, s })
    }

    const laneCount = laneEnds.length
    const basePct   = 100 / laneCount

    for (const { lane, s } of assigned) {
      // Expand rightward: span extra lanes while no other session in any of
      // those lanes overlaps this session's time window.
      let span = 1
      for (let L = lane + 1; L < laneCount; L++) {
        const blocked = assigned.some(({ lane: oLane, s: o }) =>
          oLane === L &&
          o !== s &&
          o.start.getTime() < s.end.getTime() &&
          o.end.getTime()   > s.start.getTime(),
        )
        if (blocked) break
        span++
      }

      laid.push({
        ...s,
        leftPct:  lane * basePct,
        widthPct: span * basePct,
      })
    }
  }

  return laid
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TimeLabels() {
  const labels: number[] = []
  for (let m = WINDOW_START; m <= WINDOW_END; m += SLOT_MINUTES) {
    labels.push(m)
  }
  return (
    <div className="relative select-none" style={{ width: TIME_COL_W, height: GRID_HEIGHT }}>
      {labels.map(m => (
        <div
          key={m}
          className="absolute right-2 text-[10px] leading-none"
          style={{
            top:   topPx(m) - 6,
            color: 'var(--fd-muted)',
          }}
        >
          {formatTimeLabel(m)}
        </div>
      ))}
    </div>
  )
}

function GridLines() {
  return (
    <div className="pointer-events-none absolute inset-0">
      {Array.from({ length: TOTAL_SLOTS }).map((_, i) => (
        <div
          key={i}
          className="absolute left-0 right-0"
          style={{
            top:         i * SLOT_HEIGHT,
            height:      1,
            // Solid line on the hour, dashed on the half-hour
            background:  i % 2 === 0
              ? 'var(--fd-border)'
              : 'repeating-linear-gradient(90deg, var(--fd-border) 0, var(--fd-border) 4px, transparent 4px, transparent 10px)',
            opacity: i % 2 === 0 ? 0.7 : 0.4,
          }}
        />
      ))}
    </div>
  )
}

function NowIndicator({ date }: { date: Date }) {
  if (!isToday(date)) return null
  const now     = new Date()
  const minutes = minutesFromMidnight(now)
  if (minutes < WINDOW_START || minutes > WINDOW_END) return null

  return (
    <div
      className="pointer-events-none absolute left-0 right-0 z-10 flex items-center"
      style={{ top: topPx(minutes) }}
    >
      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--fd-red)', marginLeft: -4 }} />
      <div className="h-px flex-1" style={{ backgroundColor: 'var(--fd-red)' }} />
    </div>
  )
}

function SessionBlock({
  session,
  onClick,
}: {
  session: LaidOut
  onClick: (s: CalendarSession) => void
}) {
  const startMin = minutesFromMidnight(session.start)
  const endMin   = minutesFromMidnight(session.end)
  const top      = topPx(startMin)
  const height   = durationPx(endMin - startMin)
  const colors   = STATUS_COLOR[session.status ?? 'scheduled']

  const left  = `${session.leftPct}%`
  const width = `calc(${session.widthPct}% - 2px)`

  return (
    <button
      type="button"
      data-session
      onClick={e => {
        e.stopPropagation()
        onClick(session)
      }}
      className="absolute rounded-lg border px-1.5 py-1 text-left transition-opacity hover:opacity-90 active:opacity-70"
      style={{
        top,
        height:          Math.max(height, 20),
        left,
        width,
        backgroundColor: colors.bg,
        borderColor:     colors.border,
        overflow:        'hidden',
        zIndex:          2,
      }}
    >
      <p
        className="truncate text-[10px] font-semibold leading-tight"
        style={{ color: colors.text }}
      >
        {session.clientName}
      </p>
      {height >= 36 && (
        <p className="text-[9px] leading-none" style={{ color: colors.text, opacity: 0.75 }}>
          {hhmm(session.start)}–{hhmm(session.end)}
        </p>
      )}
    </button>
  )
}

interface DragState {
  pointerId:  number
  /** Slot-start minute where pointerdown happened. */
  anchorMin:  number
  /** Slot-start minute under the pointer right now. */
  currentMin: number
}

function DayColumn({
  date,
  sessions,
  selectedSlots,
  onSlotToggle,
  onSessionClick,
  onRangeSelect,
}: {
  date:            Date
  sessions:        CalendarSession[]
  selectedSlots:   Date[]
  onSlotToggle:    (datetime: Date) => void
  onSessionClick:  (s: CalendarSession) => void
  onRangeSelect?:  (range: QuickAddRange) => void
}) {
  const colRef   = useRef<HTMLDivElement>(null)
  const laidSessions = useMemo(() => layoutSessions(sessions), [sessions])

  const daySlots = selectedSlots.filter(s => ymd(s) === ymd(date))

  const [drag, setDrag] = useState<DragState | null>(null)

  function yFromEvent(e: React.PointerEvent<HTMLDivElement>): number | null {
    const rect = colRef.current?.getBoundingClientRect()
    if (!rect) return null
    return e.clientY - rect.top
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Ignore pointerdowns that originated on a session block
    if ((e.target as HTMLElement).closest('button[data-session]')) return
    // Primary (left) mouse / any touch / any pen
    if (e.pointerType === 'mouse' && e.button !== 0) return

    const y = yFromEvent(e)
    if (y === null) return
    const snapped = snapYToSlotStartMin(y)

    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ pointerId: e.pointerId, anchorMin: snapped, currentMin: snapped })
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag || e.pointerId !== drag.pointerId) return
    const y = yFromEvent(e)
    if (y === null) return
    const snapped = snapYToSlotStartMin(y)
    if (snapped !== drag.currentMin) {
      setDrag({ ...drag, currentMin: snapped })
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag || e.pointerId !== drag.pointerId) return
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }

    const startMin = Math.min(drag.anchorMin, drag.currentMin)
    const endMinExclusive = Math.max(drag.anchorMin, drag.currentMin) + SLOT_MINUTES
    const slotsSpanned = (endMinExclusive - startMin) / SLOT_MINUTES

    setDrag(null)

    if (slotsSpanned <= DRAG_THRESHOLD_SLOTS || !onRangeSelect) {
      // Tap (or caller didn't wire range handler) → single-slot toggle
      const dt = new Date(date)
      dt.setHours(Math.floor(drag.anchorMin / 60), drag.anchorMin % 60, 0, 0)
      onSlotToggle(dt)
      return
    }

    // Emit range for QuickAdd
    const colRect = colRef.current?.getBoundingClientRect()
    if (!colRect) return

    const rangeTopPx    = topPx(startMin)
    const rangeHeightPx = ((endMinExclusive - startMin) / SLOT_MINUTES) * SLOT_HEIGHT
    const anchorRect = new DOMRect(
      colRect.left,
      colRect.top + rangeTopPx,
      colRect.width,
      rangeHeightPx,
    )

    onRangeSelect({
      date:       ymd(date),
      startTime:  minutesToHHmm(startMin),
      endTime:    minutesToHHmm(endMinExclusive),
      anchorRect,
    })
  }

  function handlePointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag || e.pointerId !== drag.pointerId) return
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
    setDrag(null)
  }

  // Drag preview geometry
  const dragPreview = drag ? (() => {
    const startMin = Math.min(drag.anchorMin, drag.currentMin)
    const endMinExclusive = Math.max(drag.anchorMin, drag.currentMin) + SLOT_MINUTES
    return {
      top:    topPx(startMin),
      height: ((endMinExclusive - startMin) / SLOT_MINUTES) * SLOT_HEIGHT,
      label:  `${minutesToHHmm(startMin)} – ${minutesToHHmm(endMinExclusive)}`,
    }
  })() : null

  return (
    <div
      ref={colRef}
      className="group relative flex-1 cursor-pointer border-l min-w-0 touch-none select-none"
      style={{
        height:      GRID_HEIGHT,
        borderColor: 'var(--fd-border)',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <GridLines />
      {/* Subtle hover tint over the whole column */}
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
        style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
      />
      {/* Selected slot highlights */}
      {daySlots.map(s => (
        <div
          key={s.getTime()}
          className="pointer-events-none absolute left-0 right-0 z-[1]"
          style={{
            top:             topPx(minutesFromMidnight(s)),
            height:          SLOT_HEIGHT,
            backgroundColor: 'rgba(78,203,160,0.20)',
            borderTop:       '1px solid rgba(78,203,160,0.50)',
            animation:       'slotFadeIn 0.18s ease both',
          }}
        />
      ))}
      {/* Drag-to-create preview */}
      {dragPreview && (
        <div
          className="pointer-events-none absolute left-0.5 right-0.5 z-[3] flex items-start justify-center rounded-lg border"
          style={{
            top:             dragPreview.top,
            height:          dragPreview.height,
            backgroundColor: 'rgba(91,156,246,0.22)',
            borderColor:     'rgba(91,156,246,0.55)',
          }}
        >
          <span
            className="mt-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-none"
            style={{ backgroundColor: 'rgba(12,15,24,0.75)', color: '#A9C9FF' }}
          >
            {dragPreview.label}
          </span>
        </div>
      )}
      <NowIndicator date={date} />

      {laidSessions.map((s, i) => (
        <SessionBlock
          key={s.id ?? `${ymd(s.start)}-${i}`}
          session={s}
          onClick={onSessionClick}
        />
      ))}
    </div>
  )
}

// ─── Day header row ───────────────────────────────────────────────────────────

function DayHeader({ dates }: { dates: Date[] }) {
  return (
    <div
      className="flex border-b"
      style={{ borderColor: 'var(--fd-border)', paddingLeft: TIME_COL_W }}
    >
      {dates.map(d => {
        const today = isToday(d)
        return (
          <div
            key={ymd(d)}
            className="flex flex-1 flex-col items-center py-2 text-center min-w-0"
            style={{ borderLeft: '1px solid var(--fd-border)' }}
          >
            <span
              className="text-[10px] font-medium uppercase tracking-wider"
              style={{ color: today ? 'var(--fd-accent)' : 'var(--fd-muted)' }}
            >
              {d.toLocaleDateString('en-US', { weekday: 'short' })}
            </span>
            <span
              className={cn(
                'mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold',
              )}
              style={today
                ? { backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }
                : { color: 'var(--fd-text)' }
              }
            >
              {d.getDate()}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface CalendarViewProps {
  sessions:        CalendarSession[]
  onSlotsChange?:  (slots: Date[]) => void
  onSessionClick:  (session: CalendarSession) => void
  /** Controlled slot selection — when provided, parent owns `selectedSlots`. */
  selectedSlots?:   Date[]
  /** When true, only week view (Mon–Sun); hides day/week toggle. */
  weekOnly?:        boolean
  /** Fires when the trainer drags across > 1 slot — opens QuickAdd. */
  onRangeSelect?:   (range: QuickAddRange) => void
}

export function CalendarView({
  sessions,
  onSlotsChange,
  onSessionClick,
  selectedSlots: controlledSlots,
  weekOnly = false,
  onRangeSelect,
}: CalendarViewProps) {
  const [view,          setView]          = useState<'day' | 'week'>(weekOnly ? 'week' : 'week')
  const [weekStart,     setWeekStart]     = useState<Date>(() => mondayOf(new Date()))
  const [dayDate,       setDayDate]       = useState<Date>(() => new Date())
  const [internalSlots, setInternalSlots] = useState<Date[]>([])

  const selectedSlots = controlledSlots ?? internalSlots
  const isControlled = controlledSlots !== undefined

  function handleSlotToggle(datetime: Date) {
    const prev = controlledSlots ?? internalSlots
    const exists = prev.some(s => s.getTime() === datetime.getTime())
    const next   = exists
      ? prev.filter(s => s.getTime() !== datetime.getTime())
      : [...prev, datetime]
    if (!isControlled) setInternalSlots(next)
    onSlotsChange?.(next)
  }

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  )

  const effectiveView = weekOnly ? 'week' : view
  const displayDates = effectiveView === 'week' ? weekDates : [dayDate]

  // Navigate
  function prev() {
    if (effectiveView === 'week') setWeekStart(d => addDays(d, -7))
    else                 setDayDate(d  => addDays(d, -1))
  }
  function next() {
    if (effectiveView === 'week') setWeekStart(d => addDays(d, 7))
    else                 setDayDate(d  => addDays(d, 1))
  }
  function goToday() {
    const now = new Date()
    setWeekStart(mondayOf(now))
    setDayDate(now)
  }

  // Title
  const title = effectiveView === 'week'
    ? (() => {
        const end = addDays(weekStart, 6)
        const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
        const from = weekStart.toLocaleDateString('en-US', opts)
        const to   = end.toLocaleDateString('en-US', { month: weekStart.getMonth() === end.getMonth() ? undefined : 'short', day: 'numeric' })
        return `${from} – ${to}`
      })()
    : dayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  // Sessions per displayed date
  function sessionsOn(d: Date): CalendarSession[] {
    return sessions.filter(s => ymd(s.start) === ymd(d))
  }

  return (
    <div
      className="flex flex-col rounded-2xl border overflow-hidden"
      style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
    >
      <style>{`
        @keyframes slotFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      {/* ── Navigation bar ──────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b"
        style={{ borderColor: 'var(--fd-border)' }}
      >
        {/* View toggle */}
        {!weekOnly && (
          <div
            className="flex rounded-xl border p-0.5 text-xs font-semibold"
            style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)' }}
          >
            {(['day', 'week'] as const).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className="rounded-lg px-3 py-1.5 capitalize transition-colors"
                style={view === v
                  ? { backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }
                  : { color: 'var(--fd-muted)' }
                }
              >
                {v}
              </button>
            ))}
          </div>
        )}

        {/* Title + selection badge */}
        <div className="flex flex-1 items-center justify-center gap-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
            {title}
          </span>
          {selectedSlots.length > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold leading-none"
              style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
            >
              {selectedSlots.length}
            </span>
          )}
        </div>

        {/* Prev / Today / Next */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={prev}
            className="flex h-10 w-10 items-center justify-center rounded-xl border transition-opacity active:opacity-60"
            style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-text)' }}
            aria-label="Previous week"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="h-10 rounded-xl border px-3 text-xs font-semibold transition-opacity active:opacity-60"
            style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-text)' }}
          >
            Today
          </button>
          <button
            type="button"
            onClick={next}
            className="flex h-10 w-10 items-center justify-center rounded-xl border transition-opacity active:opacity-60"
            style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-text)' }}
            aria-label="Next week"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ── Day headers (week view only) ─────────────────────────────────── */}
      {effectiveView === 'week' && (
        <DayHeader dates={weekDates} />
      )}

      {/* ── Time grid ────────────────────────────────────────────────────── */}
      <div className="overflow-y-auto" style={{ maxHeight: '70vh' }}>
        <div className="flex">
          {/* Time labels */}
          <div className="shrink-0" style={{ width: TIME_COL_W }}>
            <TimeLabels />
          </div>

          {/* Day columns */}
          <div className="flex flex-1">
            {displayDates.map(d => (
              <DayColumn
                key={ymd(d)}
                date={d}
                sessions={sessionsOn(d)}
                selectedSlots={selectedSlots}
                onSlotToggle={handleSlotToggle}
                onSessionClick={onSessionClick}
                onRangeSelect={onRangeSelect}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
