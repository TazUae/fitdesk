/**
 * Scheduling domain types for FitDesk V3 engine (Phase 1).
 *
 * These are separate from types/index.ts to keep the new scheduling model
 * isolated during the transition away from sessions-as-invoices.
 *
 * Import path: @/types/scheduling
 */

// ─── Trainer config (Phase 1 — flat object, no DocType) ───────────────────────

export interface TrainerConfig {
  trainerId:      string
  /** IANA timezone identifier, e.g. 'Asia/Riyadh'. */
  timezone:       string
  workingDays:    Array<'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'>
  /** Earliest session start, 'HH:mm' 24-hour local time. */
  startTime:      string
  /** Latest session end, 'HH:mm' 24-hour local time. */
  endTime:        string
  /** Minimum required gap between any two sessions (minutes). */
  bufferMinutes:  number
}

// ─── Recurrence pattern ───────────────────────────────────────────────────────

/**
 * Weekly recurrence pattern.
 * Phase 1 supports 'weekly' only; frequency is typed for forward compatibility.
 */
export interface SeriesPattern {
  frequency: 'weekly'
  /** Repeat every N weeks (1 = every week). */
  interval:  number
  /** One entry per weekday + time combination. */
  slots: Array<{
    /** JS convention: 0 = Sunday, 1 = Monday … 6 = Saturday. */
    weekday:   0 | 1 | 2 | 3 | 4 | 5 | 6
    /** 'HH:mm' in the series timezone. */
    localTime: string
  }>
  /** Stop after this many total occurrences; null = no cap. */
  count: number | null
  /** Stop after this date (YYYY-MM-DD, inclusive); null = no cap. */
  until: string | null
}

// ─── Time interval ────────────────────────────────────────────────────────────

/** A half-open time range [startAt, endAt). Both values are UTC Dates. */
export interface Interval {
  startAt: Date
  endAt:   Date
}

// ─── Occurrence (intermediate) ────────────────────────────────────────────────

/**
 * A single materialized slot produced by expandPattern().
 * Not a DB row yet — becomes one when bookFromPlan() persists it.
 */
export interface Occurrence {
  /** Deterministic key: 'YYYY-MM-DD:HH:mm'. Unique within a series. */
  occurrenceKey:   string
  /** 0-based position in the returned array. */
  occurrenceIndex: number
  startAt:         Date    // UTC
  endAt:           Date    // UTC
  /** YYYY-MM-DD in the series timezone. */
  localDate:       string
  /** HH:mm in the series timezone. */
  localTime:       string
}

// ─── Conflict ─────────────────────────────────────────────────────────────────

export type ConflictKind = 'overlap' | 'buffer'

// ─── FD Session (persisted) ───────────────────────────────────────────────────

export type FDSessionStatus =
  | 'scheduled'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'skipped'

export interface FDSession {
  id:              string    // ERPNext docname
  tenantId:        string
  trainerId:       string
  clientId:        string
  clientName:      string
  seriesId:        string | null
  startAt:         Date      // UTC
  endAt:           Date      // UTC
  durationMinutes: number
  timezone:        string    // IANA; tz the booking was made in
  status:          FDSessionStatus
  occurrenceKey:   string | null
  occurrenceIndex: number | null
  /** true after rescheduleOne() — series edits skip this row. */
  isOverride:      boolean
  rate:            number
  sessionType:     string | null
  notes:           string | null
  invoiceId:       string | null
  version:         number
  /** is_trial_session — true when this session was a complimentary/trial (Phase B) */
  isTrialSession:          boolean
  /** session_consumed_package — true when this session was charged against a package balance (Phase B) */
  sessionConsumedPackage:  boolean
}

// ─── FD SessionSeries (persisted) ────────────────────────────────────────────

export interface FDSessionSeries {
  id:              string    // ERPNext docname
  tenantId:        string
  trainerId:       string
  clientId:        string
  pattern:         SeriesPattern
  startDate:       string    // YYYY-MM-DD
  endDate:         string | null
  durationMinutes: number
  timezone:        string
  defaultRate:     number
  status:          'active' | 'ended' | 'cancelled'
  version:         number
}

// ─── Booking plan ─────────────────────────────────────────────────────────────

/**
 * Output of buildBookingPlan().
 * Built client-side for preview; re-built server-side for authority.
 */
export interface BookingPlan {
  kind:            'one_off' | 'series'
  trainerId:       string
  clientId:        string
  durationMinutes: number
  timezone:        string
  /** Present only when kind = 'series'. */
  series?: {
    pattern:         SeriesPattern
    startDate:       string
    endDate:         string | null
    durationMinutes: number
    timezone:        string
  }
  occurrences:  Occurrence[]
  conflicts:    Array<{ occurrence: Occurrence; kind: ConflictKind }>
  outOfHours:   Array<{ occurrence: Occurrence; reason: string }>
  /** false if occurrences is empty, any conflict exists, or any slot is out of hours. */
  valid:        boolean
  summary: {
    total:      number
    conflicts:  number
    outOfHours: number
  }
}

// ─── Calendar UI types ────────────────────────────────────────────────────────
//
// Shape of data the calendar component (Schedule-X adapter) consumes and emits.
// UI-layer types kept here so the adapter and its parent view share a single
// source of truth.

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

// ─── Phase 5.1A — Booking draft model ─────────────────────────────────────────
//
// The BookingDraft is the in-memory state held by ScheduleView while the
// BookingSheet is open. It maps deterministically to the engine's existing
// `buildBookingPlan` input via `lib/scheduling/draft.ts`, so no engine change
// is needed to support the new step-based UI.

export type RepeatMode = 'one_off' | 'weekly'

/**
 * One weekday/time pair in a derived recurrence pattern.
 *
 * `durationMinutes` is an optional per-slot override; the engine currently
 * uses a single plan-level duration, so this field is forward-looking only.
 */
export interface PatternSlot {
  weekday:           0 | 1 | 2 | 3 | 4 | 5 | 6
  localTime:         string             // 'HH:mm'
  durationMinutes?:  number
}

/**
 * The frontend draft state that drives the BookingSheet.
 *
 * Field meanings:
 *   - `date` / `startTime` anchor the first occurrence; with no pattern,
 *     they are the booking itself.
 *   - `patternSlots` is the canonical recurrence-pattern source. When set,
 *     `date` is reduced to the earliest anchor date used by the engine's
 *     `selectedSlots` input.
 *   - `sessionsPerWeek` is a UI-derivation aid for the chip selector; once
 *     `patternSlots` is finalized it equals `patternSlots.length`.
 */
export interface BookingDraft {
  clientId:         string | null
  date:             string             // 'YYYY-MM-DD'
  startTime:        string             // 'HH:mm'
  durationMinutes:  number
  packageOptIn:     boolean
  repeatMode:       RepeatMode
  recurrenceWeeks:  number             // 1|2|3|4|8 (12 hard cap from engine)
  patternSlots:     PatternSlot[] | null
  sessionsPerWeek:  1 | 2 | 3 | 4 | 5 | null
  sessionType:      string | null
  fee:              number | null
  notes:            string | null
}

/**
 * Discriminated union the BookingSheet uses to drive the sticky CTA text
 * and the per-step error surface.
 */
export type BookingValidity =
  | { kind: 'invalid'; reason: 'NO_CLIENT' | 'NO_TIME' | 'EMPTY_PLAN' | 'NO_PATTERN' | 'NO_FEE' }
  | { kind: 'blocked'; reason: 'CONFLICT' | 'OUT_OF_HOURS' | 'PACKAGE_OVERDRAW'; details: string }
  | { kind: 'ready';   plan: BookingPlan; total: number }

/**
 * Snapshot of a client's remaining-sessions state for the BookingClientStep
 * and PackageBalanceGate.
 */
export interface PackageBalanceState {
  remainingSessions: number | null
  willConsume:       number
  status:            'ok' | 'low' | 'overdraw' | 'no_package'
}
