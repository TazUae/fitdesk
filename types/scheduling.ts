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
