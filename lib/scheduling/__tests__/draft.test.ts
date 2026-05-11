/**
 * Unit tests for lib/scheduling/draft.ts
 *
 * Anchor: 2026-01-05 is a Monday in Asia/Riyadh (UTC+3, no DST).
 */
import { describe, it, expect } from 'vitest'
import {
  draftToPlanInput,
  expandPatternSlotsToFirstWeek,
  humanSummary,
  nextAvailableSlot,
  selectedSlotsToPattern,
} from '@/lib/scheduling/draft'
import { buildBookingPlan } from '@/lib/scheduling/engine'
import type { BookingDraft, PatternSlot, TrainerConfig } from '@/types/scheduling'

const RIYADH_TZ = 'Asia/Riyadh'

const DEFAULT_CONFIG: TrainerConfig = {
  trainerId:    'trainer-1',
  timezone:     RIYADH_TZ,
  workingDays:  ['mon', 'tue', 'wed', 'thu', 'fri'],
  startTime:    '09:00',
  endTime:      '20:00',
  bufferMinutes: 15,
}

const BASE_DRAFT: BookingDraft = {
  clientId:        'CUST-001',
  date:            '2026-01-05',
  startTime:       '09:00',
  durationMinutes: 60,
  packageOptIn:    false,
  repeatMode:      'one_off',
  recurrenceWeeks: 1,
  patternSlots:    null,
  sessionsPerWeek: null,
  sessionType:     null,
  fee:             null,
  notes:           null,
}

// ─── expandPatternSlotsToFirstWeek ──────────────────────────────────────────

describe('expandPatternSlotsToFirstWeek', () => {
  it('returns a single slot for one pattern slot on the anchor weekday', () => {
    const slots: PatternSlot[] = [{ weekday: 1, localTime: '09:00' }]  // Mon
    const result = expandPatternSlotsToFirstWeek(slots, '2026-01-05', RIYADH_TZ)
    expect(result).toEqual([{ localDate: '2026-01-05', localTime: '09:00' }])
  })

  it('expands Mon + Wed + Fri pattern from a Monday anchor', () => {
    const slots: PatternSlot[] = [
      { weekday: 1, localTime: '09:00' },  // Mon
      { weekday: 3, localTime: '11:00' },  // Wed
      { weekday: 5, localTime: '17:00' },  // Fri
    ]
    const result = expandPatternSlotsToFirstWeek(slots, '2026-01-05', RIYADH_TZ)
    expect(result).toEqual([
      { localDate: '2026-01-05', localTime: '09:00' },  // Mon
      { localDate: '2026-01-07', localTime: '11:00' },  // Wed
      { localDate: '2026-01-09', localTime: '17:00' },  // Fri
    ])
  })

  it('pushes a pattern slot earlier in the week to the next ISO week when anchor is later', () => {
    // Anchor Wed → Mon slot should appear next Mon
    const slots: PatternSlot[] = [{ weekday: 1, localTime: '09:00' }]  // Mon
    const result = expandPatternSlotsToFirstWeek(slots, '2026-01-07', RIYADH_TZ)  // Wed
    expect(result).toEqual([{ localDate: '2026-01-12', localTime: '09:00' }])
  })

  it('returns [] for invalid anchor date', () => {
    const result = expandPatternSlotsToFirstWeek(
      [{ weekday: 1, localTime: '09:00' }],
      'not-a-date',
      RIYADH_TZ,
    )
    expect(result).toEqual([])
  })
})

// ─── draftToPlanInput ────────────────────────────────────────────────────────

describe('draftToPlanInput', () => {
  it('returns null when draft has no time', () => {
    const draft: BookingDraft = { ...BASE_DRAFT, date: '', startTime: '' }
    expect(draftToPlanInput(draft, DEFAULT_CONFIG, [])).toBeNull()
  })

  it('returns a single-slot input for a one-off draft', () => {
    const result = draftToPlanInput(BASE_DRAFT, DEFAULT_CONFIG, [])
    expect(result?.selectedSlots).toEqual([{ localDate: '2026-01-05', localTime: '09:00' }])
    expect(result?.recurrenceWeeks).toBeNull()
  })

  it('threads recurrenceWeeks when repeatMode is weekly', () => {
    const draft: BookingDraft = { ...BASE_DRAFT, repeatMode: 'weekly', recurrenceWeeks: 4 }
    const result = draftToPlanInput(draft, DEFAULT_CONFIG, [])
    expect(result?.recurrenceWeeks).toBe(4)
  })

  it('uses patternSlots when set', () => {
    const draft: BookingDraft = {
      ...BASE_DRAFT,
      repeatMode: 'weekly',
      recurrenceWeeks: 4,
      patternSlots: [
        { weekday: 1, localTime: '09:00' },
        { weekday: 3, localTime: '11:00' },
      ],
    }
    const result = draftToPlanInput(draft, DEFAULT_CONFIG, [])
    expect(result?.selectedSlots.length).toBe(2)
  })

  it('produces a plan input that the engine accepts without error', () => {
    const input = draftToPlanInput(BASE_DRAFT, DEFAULT_CONFIG, [])
    expect(input).not.toBeNull()
    const plan = buildBookingPlan(input!)
    expect(plan.kind).toBe('one_off')
    expect(plan.occurrences.length).toBe(1)
  })

  it('threads clientId through to the engine plan', () => {
    const input = draftToPlanInput(BASE_DRAFT, DEFAULT_CONFIG, [])
    const plan = buildBookingPlan(input!)
    expect(plan.clientId).toBe('CUST-001')
  })
})

// ─── humanSummary ────────────────────────────────────────────────────────────

describe('humanSummary', () => {
  it('"No sessions" when plan is empty', () => {
    const plan = buildBookingPlan({
      selectedSlots:    [],
      trainerId:        'T',
      clientId:         'C',
      durationMinutes:  60,
      timezone:         RIYADH_TZ,
      recurrenceWeeks:  null,
      config:           DEFAULT_CONFIG,
      existingSessions: [],
    })
    expect(humanSummary(plan)).toBe('No sessions')
  })

  it('one-off → "1 session, Mon …"', () => {
    const plan = buildBookingPlan({
      selectedSlots:    [{ localDate: '2026-01-05', localTime: '09:00' }],
      trainerId:        'T',
      clientId:         'C',
      durationMinutes:  60,
      timezone:         RIYADH_TZ,
      recurrenceWeeks:  null,
      config:           DEFAULT_CONFIG,
      existingSessions: [],
    })
    expect(humanSummary(plan)).toContain('1 session')
  })

  it('single-pattern series → "every Mon at …"', () => {
    const plan = buildBookingPlan({
      selectedSlots:    [{ localDate: '2026-01-05', localTime: '09:00' }],
      trainerId:        'T',
      clientId:         'C',
      durationMinutes:  60,
      timezone:         RIYADH_TZ,
      recurrenceWeeks:  4,
      config:           DEFAULT_CONFIG,
      existingSessions: [],
    })
    expect(humanSummary(plan)).toBe('4 sessions, every Mon at 9:00 AM')
  })

  it('multi-pattern series → "N sessions: Mon …, Wed …"', () => {
    const plan = buildBookingPlan({
      selectedSlots: [
        { localDate: '2026-01-05', localTime: '09:00' },  // Mon
        { localDate: '2026-01-07', localTime: '11:00' },  // Wed
      ],
      trainerId:        'T',
      clientId:         'C',
      durationMinutes:  60,
      timezone:         RIYADH_TZ,
      recurrenceWeeks:  4,
      config:           DEFAULT_CONFIG,
      existingSessions: [],
    })
    expect(humanSummary(plan)).toMatch(/Mon 9:00 AM.*Wed 11:00 AM/)
  })
})

// ─── selectedSlotsToPattern ──────────────────────────────────────────────────

describe('selectedSlotsToPattern', () => {
  it('de-duplicates same weekday+time across different dates', () => {
    const slots = [
      { localDate: '2026-01-05', localTime: '09:00' },  // Mon
      { localDate: '2026-01-12', localTime: '09:00' },  // Mon next week
    ]
    const result = selectedSlotsToPattern(slots, RIYADH_TZ)
    expect(result).toEqual([{ weekday: 1, localTime: '09:00' }])
  })

  it('sorts by Monday-anchored weekday then time', () => {
    const slots = [
      { localDate: '2026-01-09', localTime: '17:00' },  // Fri
      { localDate: '2026-01-05', localTime: '09:00' },  // Mon
      { localDate: '2026-01-07', localTime: '11:00' },  // Wed
    ]
    const result = selectedSlotsToPattern(slots, RIYADH_TZ)
    expect(result.map(s => s.weekday)).toEqual([1, 3, 5])
  })

  it('returns [] for empty input', () => {
    expect(selectedSlotsToPattern([], RIYADH_TZ)).toEqual([])
  })
})

// ─── nextAvailableSlot ───────────────────────────────────────────────────────

describe('nextAvailableSlot', () => {
  it('suggests a slot on a working day inside working hours', () => {
    // Monday 10:00 Riyadh
    const monAt10 = new Date('2026-01-05T07:00:00.000Z')
    const result = nextAvailableSlot(DEFAULT_CONFIG, monAt10)
    expect(result.localDate).toBe('2026-01-05')
    expect(Number(result.localTime.slice(0, 2))).toBeGreaterThanOrEqual(10)
  })

  it('rolls forward past a non-working day (Sat → Mon)', () => {
    // Saturday 10:00 Riyadh — Saturday is NOT a working day in DEFAULT_CONFIG
    const satAt10 = new Date('2026-01-10T07:00:00.000Z')
    const result = nextAvailableSlot(DEFAULT_CONFIG, satAt10)
    // Next working day is Monday 2026-01-12
    expect(result.localDate).toBe('2026-01-12')
    expect(result.localTime).toBe('09:00')
  })

  it('rolls forward to next day when past working-hours end', () => {
    // Monday 21:00 Riyadh — past end of work day (20:00)
    const monLate = new Date('2026-01-05T18:30:00.000Z')
    const result = nextAvailableSlot(DEFAULT_CONFIG, monLate)
    expect(result.localDate).toBe('2026-01-06')
    expect(result.localTime).toBe('09:00')
  })
})
