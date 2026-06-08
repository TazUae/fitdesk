/**
 * FitDesk Scheduling Engine — Phase 1 pure core.
 *
 * All functions are pure and deterministic: no I/O, no side effects, no
 * process.env access, no server-only APIs. This file is safe to import in
 * both browser components and server actions.
 *
 * The only external dependency is Luxon for timezone-aware date arithmetic.
 */
import { DateTime } from 'luxon'

import type {
  BookingPlan,
  ConflictKind,
  Interval,
  Occurrence,
  SeriesPattern,
  TrainerConfig,
} from '@/types/scheduling'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Hard limit on how many weeks a series may span in Phase 1. */
export const MAX_SERIES_WEEKS = 12

/** All 7 weekday label strings indexed by JS weekday (0 = Sunday). */
const WEEKDAY_LABELS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
type WeekdayLabel = (typeof WEEKDAY_LABELS)[number]

// ─── Timezone helpers ─────────────────────────────────────────────────────────

/**
 * Convert a local date + time string to a UTC Date, respecting the given
 * IANA timezone via Luxon.
 *
 * @throws Error with message 'DST_SKIP' when the requested local time does not
 *   exist in the timezone (spring-forward gap). Luxon silently normalises these
 *   times; we detect normalisation by comparing formatted output against input.
 * @throws Error when the date/time string or timezone is invalid.
 */
export function resolveToUtc(date: string, time: string, tz: string): Date {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: tz })

  if (!dt.isValid) {
    throw new Error(
      `resolveToUtc: invalid input "${date}T${time}" in "${tz}": ${dt.invalidReason ?? 'unknown'}`,
    )
  }

  // Spring-forward detection: Luxon shifts non-existent times forward silently.
  // If the formatted local time no longer matches the requested time, the
  // original time fell inside the DST gap and was normalised away.
  const formatted = dt.toFormat('HH:mm')
  if (formatted !== time) {
    throw new Error('DST_SKIP')
  }

  return dt.toUTC().toJSDate()
}

/**
 * Convert a UTC Date to local date/time parts in the given IANA timezone.
 *
 * @returns
 *   - date:    'YYYY-MM-DD' local date
 *   - time:    'HH:mm' local 24-hour time
 *   - weekday: JS convention — 0 = Sunday, 1 = Monday … 6 = Saturday
 */
export function toZonedParts(
  utc: Date,
  tz: string,
): { date: string; time: string; weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6 } {
  const dt = DateTime.fromJSDate(utc, { zone: tz })
  // Luxon weekday: 1 = Mon … 7 = Sun  →  JS: 0 = Sun … 6 = Sat  (% 7 maps 7 → 0)
  const weekday = (dt.weekday % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6
  return {
    date: dt.toFormat('yyyy-MM-dd'),
    time: dt.toFormat('HH:mm'),
    weekday,
  }
}

// ─── Pattern expansion ────────────────────────────────────────────────────────

/**
 * Convert a JS weekday (0 = Sun … 6 = Sat) to the number of days after the
 * Monday of an ISO week: Mon = 0, Tue = 1 … Sun = 6.
 */
function weekdayToMondayOffset(weekday: number): number {
  return (weekday + 6) % 7
}

/**
 * Expand a weekly SeriesPattern into concrete Occurrences.
 *
 * Limits applied (all independent; earliest wins):
 *   - endDate cap (caller-supplied)
 *   - MAX_SERIES_WEEKS from the first Monday on or before startDate
 *   - pattern.count (total occurrences)
 *   - pattern.until (YYYY-MM-DD inclusive)
 *
 * DST behaviour:
 *   - Spring-forward (non-existent local time): occurrence silently skipped.
 *   - Fall-back (ambiguous local time): Luxon picks the earlier UTC offset
 *     (pre-transition); no throw, no skip.
 */
export function expandPattern(input: {
  seriesId:        string
  pattern:         SeriesPattern
  startDate:       string     // YYYY-MM-DD inclusive
  endDate:         string     // YYYY-MM-DD inclusive
  durationMinutes: number
  timezone:        string
}): Occurrence[] {
  const { pattern, startDate, endDate, durationMinutes, timezone } = input

  const anchorDt  = DateTime.fromISO(startDate, { zone: timezone }).startOf('day')
  const endDt     = DateTime.fromISO(endDate,   { zone: timezone }).startOf('day')

  // Monday of the week that contains startDate (Luxon ISO weeks start Monday)
  const weekStart = anchorDt.startOf('week')

  // Hard ceiling: MAX_SERIES_WEEKS from the Monday of the anchor week
  const maxEndDt  = weekStart.plus({ weeks: MAX_SERIES_WEEKS }).minus({ days: 1 })
  const capDt     = endDt < maxEndDt ? endDt : maxEndDt
  const capStr    = capDt.toFormat('yyyy-MM-dd')

  // Sort slots for deterministic chronological output within each week
  const sortedSlots = [...pattern.slots].sort((a, b) => {
    const d = weekdayToMondayOffset(a.weekday) - weekdayToMondayOffset(b.weekday)
    return d !== 0 ? d : a.localTime.localeCompare(b.localTime)
  })

  const weekInterval = Math.max(1, pattern.interval)
  const results: Occurrence[] = []

  for (let week = 0; ; week += weekInterval) {
    const thisMonStr = weekStart.plus({ weeks: week }).toFormat('yyyy-MM-dd')

    // Once Monday itself is past the cap, no slot in this week can qualify
    if (thisMonStr > capStr) break

    for (const slot of sortedSlots) {
      const offset       = weekdayToMondayOffset(slot.weekday)
      const localDateStr = DateTime.fromISO(thisMonStr, { zone: timezone })
        .plus({ days: offset })
        .toFormat('yyyy-MM-dd')

      // Boundary guards (string comparison is safe for YYYY-MM-DD)
      if (localDateStr < startDate)                         continue
      if (localDateStr > capStr)                            continue
      if (pattern.until && localDateStr > pattern.until)   continue

      // Resolve to UTC; skip if the local time is in a DST gap
      let startAt: Date
      try {
        startAt = resolveToUtc(localDateStr, slot.localTime, timezone)
      } catch (err) {
        if (err instanceof Error && err.message === 'DST_SKIP') continue
        throw err
      }

      const endAt = new Date(startAt.getTime() + durationMinutes * 60_000)

      results.push({
        occurrenceKey:   `${localDateStr}:${slot.localTime}`,
        occurrenceIndex: results.length,   // 0-based; only counts included occurrences
        startAt,
        endAt,
        localDate: localDateStr,
        localTime: slot.localTime,
      })

      if (pattern.count !== null && results.length >= pattern.count) return results
    }
  }

  return results
}

// ─── Conflict detection ───────────────────────────────────────────────────────

/**
 * Check one candidate interval against a list of existing intervals.
 *
 * Returns:
 *   'overlap' — the intervals share time (hard conflict)
 *   'buffer'  — the intervals are within bufferMs of each other but don't overlap
 *   null      — no conflict
 */
export function detectConflict(
  candidate: Interval,
  existing:  Interval[],
  bufferMs:  number,
): ConflictKind | null {
  const cs = candidate.startAt.getTime()
  const ce = candidate.endAt.getTime()

  let bufferHit = false

  for (const e of existing) {
    const es = e.startAt.getTime()
    const ee = e.endAt.getTime()

    // Hard overlap test: A and B share time ↔ A.start < B.end AND A.end > B.start
    if (cs < ee && ce > es) return 'overlap'

    // Buffer test: same formula with ee/es expanded by bufferMs
    if (cs < ee + bufferMs && ce > es - bufferMs) bufferHit = true
  }

  return bufferHit ? 'buffer' : null
}

/**
 * Check every candidate in the batch.
 *
 * Each candidate that passes is appended to the working "accepted" set before
 * the next candidate is evaluated, so intra-batch self-conflicts are detected.
 *
 * Returns only the conflicting entries (accepted candidates are not returned).
 */
export function detectConflictsBatch(
  candidates: Interval[],
  existing:   Interval[],
  bufferMs:   number,
): Array<{ interval: Interval; kind: ConflictKind }> {
  const accepted: Interval[] = []
  const results: Array<{ interval: Interval; kind: ConflictKind }> = []

  for (const candidate of candidates) {
    const kind = detectConflict(candidate, [...existing, ...accepted], bufferMs)
    if (kind !== null) {
      results.push({ interval: candidate, kind })
    } else {
      accepted.push(candidate)
    }
  }

  return results
}

// ─── Availability gate ────────────────────────────────────────────────────────

/**
 * Verify that a candidate interval falls inside the trainer's working hours.
 *
 * @returns null when the candidate is fully inside working hours;
 *          a human-readable reason string when it isn't.
 */
export function checkAvailability(
  candidate: { startAt: Date; endAt: Date },
  config:    TrainerConfig,
): string | null {
  const startDt = DateTime.fromJSDate(candidate.startAt, { zone: config.timezone })
  const endDt   = DateTime.fromJSDate(candidate.endAt,   { zone: config.timezone })

  // Weekday check
  const jsWeekday   = (startDt.weekday % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6
  const weekdayName = WEEKDAY_LABELS[jsWeekday] as WeekdayLabel

  if (!(config.workingDays as string[]).includes(weekdayName)) {
    return `Not a working day (${weekdayName})`
  }

  // Time-window check (minutes from midnight for arithmetic simplicity)
  const toMin = (hhmm: string): number => {
    const [h, m] = hhmm.split(':').map(Number)
    return h * 60 + m
  }

  const windowStart = toMin(config.startTime)
  const windowEnd   = toMin(config.endTime)
  const sessStart   = startDt.hour * 60 + startDt.minute
  const sessEnd     = endDt.hour   * 60 + endDt.minute

  if (sessStart < windowStart) {
    return `Starts before working hours (${config.startTime})`
  }
  if (sessEnd > windowEnd) {
    return `Ends after working hours (${config.endTime})`
  }

  return null
}

// ─── Plan builder ─────────────────────────────────────────────────────────────

/**
 * Compute the last date of coverage given a start date and week count.
 *
 * e.g. startDate = '2026-01-05' (Mon), weeks = 4
 *      → '2026-02-01' (Sun, last day of week 4)
 */
function coverageEndDate(startDate: string, weeks: number, tz: string): string {
  return DateTime.fromISO(startDate, { zone: tz })
    .plus({ weeks, days: -1 })
    .toFormat('yyyy-MM-dd')
}

/**
 * Extract unique weekday+time pairs from the selected slot list, de-duplicating
 * across multiple dates that share the same weekday and time, then sorting
 * in chronological order within a Monday-anchored week.
 */
function derivePatternSlots(
  slots: Array<{ localDate: string; localTime: string }>,
  tz:    string,
): SeriesPattern['slots'] {
  const seen = new Map<string, SeriesPattern['slots'][number]>()

  for (const slot of slots) {
    const dt      = DateTime.fromISO(`${slot.localDate}T${slot.localTime}`, { zone: tz })
    const weekday = (dt.weekday % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6
    const key     = `${weekday}:${slot.localTime}`
    if (!seen.has(key)) seen.set(key, { weekday, localTime: slot.localTime })
  }

  return [...seen.values()].sort((a, b) => {
    const d = weekdayToMondayOffset(a.weekday) - weekdayToMondayOffset(b.weekday)
    return d !== 0 ? d : a.localTime.localeCompare(b.localTime)
  })
}

/**
 * Build a BookingPlan from calendar slot picks.
 *
 * Classification:
 *   kind = 'one_off'  ← exactly one slot AND recurrenceWeeks === null
 *   kind = 'series'   ← multiple slots OR recurrenceWeeks is set
 *
 * This function is pure and produces the same result on the client (preview)
 * and the server (authority) when given equivalent inputs.
 */
export function buildBookingPlan(input: {
  selectedSlots:    Array<{ localDate: string; localTime: string }>
  trainerId:        string
  clientId:         string
  durationMinutes:  number
  timezone:         string
  /** null = one-off (or single-week multi-slot); positive integer = repeat for N weeks */
  recurrenceWeeks:  number | null
  config:           TrainerConfig
  existingSessions: Interval[]
}): BookingPlan {
  const {
    selectedSlots, trainerId, clientId, durationMinutes,
    timezone, recurrenceWeeks, config, existingSessions,
  } = input

  const emptyPlan = (): BookingPlan => ({
    kind: 'one_off', trainerId, clientId, durationMinutes, timezone,
    occurrences: [], conflicts: [], outOfHours: [], valid: false,
    summary: { total: 0, conflicts: 0, outOfHours: 0 },
  })

  if (selectedSlots.length === 0) return emptyPlan()

  const isOneOff = selectedSlots.length === 1 && recurrenceWeeks === null
  const kind = isOneOff ? 'one_off' : 'series'

  // Anchor = earliest selected date (then earliest time if dates tie)
  const sortedInput = [...selectedSlots].sort((a, b) => {
    const d = a.localDate.localeCompare(b.localDate)
    return d !== 0 ? d : a.localTime.localeCompare(b.localTime)
  })
  const startDate = sortedInput[0].localDate

  const effectiveWeeks = recurrenceWeeks ?? 1
  const endDate = isOneOff ? startDate : coverageEndDate(startDate, effectiveWeeks, timezone)

  const pattern: SeriesPattern = {
    frequency: 'weekly',
    interval:  1,
    slots:     derivePatternSlots(selectedSlots, timezone),
    count:     null,
    until:     null,
  }

  const occurrences = expandPattern({
    seriesId: 'PLAN',
    pattern,
    startDate,
    endDate,
    durationMinutes,
    timezone,
  })

  const bufferMs = config.bufferMinutes * 60_000

  // Conflict detection (intra-batch self-conflicts included)
  const conflictHits = detectConflictsBatch(
    occurrences.map(o => ({ startAt: o.startAt, endAt: o.endAt })),
    existingSessions,
    bufferMs,
  )
  const conflictByTime = new Map(
    conflictHits.map(c => [c.interval.startAt.getTime(), c.kind]),
  )
  const conflicts = occurrences
    .filter(o => conflictByTime.has(o.startAt.getTime()))
    .map(o => ({ occurrence: o, kind: conflictByTime.get(o.startAt.getTime())! }))

  // Availability gate — each occurrence checked independently
  const outOfHours = occurrences.flatMap(o => {
    const reason = checkAvailability({ startAt: o.startAt, endAt: o.endAt }, config)
    return reason ? [{ occurrence: o, reason }] : []
  })

  const seriesInfo = kind === 'series'
    ? { pattern, startDate, endDate, durationMinutes, timezone }
    : undefined

  const valid =
    occurrences.length > 0 &&
    conflicts.length  === 0 &&
    outOfHours.length === 0

  return {
    kind, trainerId, clientId, durationMinutes, timezone,
    series: seriesInfo,
    occurrences, conflicts, outOfHours, valid,
    summary: {
      total:      occurrences.length,
      conflicts:  conflicts.length,
      outOfHours: outOfHours.length,
    },
  }
}
