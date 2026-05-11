/**
 * Pure helpers for the BookingSheet draft → engine input pipeline.
 *
 * NOT a server-only module. Mirror the purity contract of
 * `lib/scheduling/engine.ts`: no I/O, no React, no env, deterministic.
 *
 * Lives here (not in engine.ts) because these helpers are UI-shape concerns;
 * the engine stays untouched in Phase 5.1.
 */

import { DateTime } from 'luxon'
import type {
  BookingDraft,
  BookingPlan,
  Interval,
  PatternSlot,
  TrainerConfig,
} from '@/types/scheduling'

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Convert a JS weekday (0=Sun..6=Sat) to Monday-anchored offset (Mon=0..Sun=6). */
function weekdayToMondayOffset(weekday: number): number {
  return (weekday + 6) % 7
}

/** 'HH:mm' → minutes-from-midnight. */
function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Format hour-of-day (0–23) and minute into a clock label like "6:00 PM". */
function formatClock(hhmm: string): string {
  const min = hhmmToMinutes(hhmm)
  const h24 = Math.floor(min / 60)
  const m = min % 60
  const suffix = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

// ─── Public helpers ───────────────────────────────────────────────────────────

/**
 * Materialize a `BookingDraft` into the calendar slot list the engine's
 * `buildBookingPlan()` expects.
 *
 * When `patternSlots` is non-null, each pattern slot anchors to the first
 * matching weekday on or after `draft.date` in the trainer's timezone.
 * The pure engine then expands them across `recurrenceWeeks`.
 *
 * When `patternSlots` is null, falls through to the single-slot path —
 * `{ localDate: draft.date, localTime: draft.startTime }`.
 */
export function expandPatternSlotsToFirstWeek(
  patternSlots: PatternSlot[],
  anchorDate: string,
  timezone: string,
): Array<{ localDate: string; localTime: string }> {
  const anchor = DateTime.fromISO(anchorDate, { zone: timezone }).startOf('day')
  if (!anchor.isValid) return []

  // Luxon weekday: 1=Mon..7=Sun → JS: 0=Sun..6=Sat (% 7 maps 7→0)
  const anchorJsWeekday = anchor.weekday % 7
  const anchorMonOffset = weekdayToMondayOffset(anchorJsWeekday)

  const result: Array<{ localDate: string; localTime: string }> = []

  for (const slot of patternSlots) {
    const slotMonOffset = weekdayToMondayOffset(slot.weekday)
    // Days forward to reach the slot's weekday within the SAME week-of-anchor;
    // negative result means the slot falls before the anchor, so push it into
    // the next ISO week.
    let daysForward = slotMonOffset - anchorMonOffset
    if (daysForward < 0) daysForward += 7

    const slotDate = anchor.plus({ days: daysForward }).toFormat('yyyy-MM-dd')
    result.push({ localDate: slotDate, localTime: slot.localTime })
  }

  return result
}

/**
 * Build the `buildBookingPlan` input from a `BookingDraft`.
 *
 * Returns `null` when the draft has no time information (caller should treat
 * the validity state as NO_TIME).
 */
export function draftToPlanInput(
  draft: BookingDraft,
  config: TrainerConfig,
  existingSessions: Interval[],
): {
  selectedSlots:    Array<{ localDate: string; localTime: string }>
  trainerId:        string
  clientId:         string
  durationMinutes:  number
  timezone:         string
  recurrenceWeeks:  number | null
  config:           TrainerConfig
  existingSessions: Interval[]
} | null {
  const slots = draft.patternSlots && draft.patternSlots.length > 0
    ? expandPatternSlotsToFirstWeek(draft.patternSlots, draft.date, config.timezone)
    : draft.date && draft.startTime
      ? [{ localDate: draft.date, localTime: draft.startTime }]
      : []

  if (slots.length === 0) return null

  return {
    selectedSlots:    slots,
    trainerId:        config.trainerId,
    clientId:         draft.clientId ?? '',
    durationMinutes:  draft.durationMinutes,
    timezone:         config.timezone,
    recurrenceWeeks:  draft.repeatMode === 'weekly' ? draft.recurrenceWeeks : null,
    config,
    existingSessions,
  }
}

/**
 * One-line trainer-friendly summary of a plan.
 *
 * Examples:
 *   "1 session, Mon 6:00 PM"
 *   "4 sessions, every Mon at 6:00 PM"
 *   "8 sessions: Mon 6:00 PM, Wed 7:30 PM"
 *   "12 sessions over 4 weeks: Mon/Wed/Fri"
 */
export function humanSummary(plan: BookingPlan): string {
  const total = plan.occurrences.length
  if (total === 0) return 'No sessions'

  if (plan.kind === 'one_off' || !plan.series) {
    const first = plan.occurrences[0]
    return `1 session, ${WEEKDAY_LABELS[(new Date(first.startAt)).getDay()]} ${formatClock(first.localTime)}`
  }

  // Series — group by weekday/time pattern
  const slots = plan.series.pattern.slots
  if (slots.length === 1) {
    const s = slots[0]
    return `${total} sessions, every ${WEEKDAY_LABELS[s.weekday]} at ${formatClock(s.localTime)}`
  }

  const parts = slots.map(s => `${WEEKDAY_LABELS[s.weekday]} ${formatClock(s.localTime)}`)
  return `${total} sessions: ${parts.join(', ')}`
}

/**
 * Suggest the next available 30-min slot in the trainer's local time,
 * inside working hours. Used by the FAB "Add suggested slot" action.
 *
 * Looks at today first; if past the trainer's working hours, rolls forward
 * to the next working day.
 */
export function nextAvailableSlot(
  config: TrainerConfig,
  now: Date = new Date(),
): { localDate: string; localTime: string } {
  const nowLocal = DateTime.fromJSDate(now, { zone: config.timezone })
  const workStart = hhmmToMinutes(config.startTime)
  const workEnd   = hhmmToMinutes(config.endTime) - 30  // last bookable start

  let cursor = nowLocal
  for (let i = 0; i < 14; i++) {
    const weekdayIdx = cursor.weekday % 7  // 0=Sun..6=Sat
    const weekdayKey = (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[weekdayIdx]

    if (config.workingDays.includes(weekdayKey)) {
      const isToday = cursor.hasSame(nowLocal, 'day')
      const nowMinutes = isToday ? nowLocal.hour * 60 + nowLocal.minute : workStart
      // Round up to the next 30-min slot
      const targetMin = isToday
        ? Math.max(Math.ceil((nowMinutes + 1) / 30) * 30, workStart)
        : workStart

      if (targetMin <= workEnd) {
        const h = Math.floor(targetMin / 60)
        const m = targetMin % 60
        return {
          localDate: cursor.toFormat('yyyy-MM-dd'),
          localTime: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        }
      }
    }
    cursor = cursor.plus({ days: 1 }).startOf('day')
  }

  // Fallback — should never hit in practice
  return { localDate: nowLocal.toFormat('yyyy-MM-dd'), localTime: config.startTime }
}

/**
 * Derive a `PatternSlot[]` from an array of (localDate, localTime) pairs,
 * preserving the input order but de-duplicating on (weekday, localTime).
 *
 * Used when the user multi-taps cells on the calendar and we need to
 * normalize the selection into a pattern.
 */
export function selectedSlotsToPattern(
  slots: Array<{ localDate: string; localTime: string }>,
  timezone: string,
): PatternSlot[] {
  const seen = new Map<string, PatternSlot>()
  for (const s of slots) {
    const dt = DateTime.fromISO(`${s.localDate}T${s.localTime}`, { zone: timezone })
    if (!dt.isValid) continue
    const weekday = (dt.weekday % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6
    const key = `${weekday}:${s.localTime}`
    if (!seen.has(key)) seen.set(key, { weekday, localTime: s.localTime })
  }
  // Stable sort: Monday-anchored chronological
  return [...seen.values()].sort((a, b) => {
    const da = weekdayToMondayOffset(a.weekday) - weekdayToMondayOffset(b.weekday)
    if (da !== 0) return da
    return a.localTime.localeCompare(b.localTime)
  })
}
