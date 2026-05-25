/**
 * Unit tests for lib/scheduling/draft.ts
 *
 * Anchor: 2026-01-05 is a Monday in Asia/Riyadh (UTC+3, no DST).
 */
import { describe, it, expect } from 'vitest'
import {
  computePackageStatus,
  draftToPlanInput,
  expandPatternSlotsToFirstWeek,
  humanSummary,
  isPackageOverdraw,
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

// ─── isPackageOverdraw ───────────────────────────────────────────────────────

describe('isPackageOverdraw', () => {
  const overdraw = { remainingSessions: 0, willConsume: 2, status: 'overdraw' as const }
  const low      = { remainingSessions: 1, willConsume: 2, status: 'low'      as const }
  const ok       = { remainingSessions: 5, willConsume: 1, status: 'ok'       as const }
  const noPkg    = { remainingSessions: null, willConsume: 0, status: 'no_package' as const }

  it('returns true for Package + overdraw balance', () => {
    expect(isPackageOverdraw('Package', overdraw)).toBe(true)
  })

  it('returns false for Package + low balance (not an overdraw)', () => {
    expect(isPackageOverdraw('Package', low)).toBe(false)
  })

  it('returns false for Package + ok balance', () => {
    expect(isPackageOverdraw('Package', ok)).toBe(false)
  })

  it('returns false for Package + no_package status', () => {
    expect(isPackageOverdraw('Package', noPkg)).toBe(false)
  })

  it('returns false for Package + null balance', () => {
    expect(isPackageOverdraw('Package', null)).toBe(false)
  })

  it('returns false for Pay Per Session regardless of balance', () => {
    expect(isPackageOverdraw('Pay Per Session', overdraw)).toBe(false)
  })

  it('returns false for Trial regardless of balance', () => {
    expect(isPackageOverdraw('Trial', overdraw)).toBe(false)
  })

  it('returns false for null billingMode (legacy/unknown)', () => {
    expect(isPackageOverdraw(null, overdraw)).toBe(false)
  })

  it('returns false for undefined billingMode', () => {
    expect(isPackageOverdraw(undefined, overdraw)).toBe(false)
  })
})

// ─── computePackageStatus ────────────────────────────────────────────────────

describe('computePackageStatus', () => {
  // ── null remaining (no package data from ERP) ──────────────────────────
  it('returns no_package when remaining is null', () => {
    expect(computePackageStatus(null, 0)).toBe('no_package')
  })

  it('returns no_package when remaining is null regardless of willConsume', () => {
    expect(computePackageStatus(null, 99)).toBe('no_package')
  })

  // ── remaining ≤ 0 (balance already exhausted before this booking) ──────
  it('returns overdraw when remaining is 0 and willConsume is 0', () => {
    expect(computePackageStatus(0, 0)).toBe('overdraw')
  })

  it('returns overdraw when remaining is 0 and willConsume is non-zero', () => {
    expect(computePackageStatus(0, 5)).toBe('overdraw')
  })

  // ── willConsume > remaining (plan exceeds balance) ─────────────────────
  it('returns overdraw when willConsume exceeds remaining by 1', () => {
    expect(computePackageStatus(2, 3)).toBe('overdraw')
  })

  it('returns overdraw for the main audit scenario: remaining=2, willConsume=8', () => {
    // Proves the recurring 8-session booking triggers overdraw for a client
    // with only 2 sessions left.
    expect(computePackageStatus(2, 8)).toBe('overdraw')
  })

  it('returns overdraw when remaining=1 and willConsume=2', () => {
    expect(computePackageStatus(1, 2)).toBe('overdraw')
  })

  it('returns overdraw when remaining=3 and willConsume=4', () => {
    expect(computePackageStatus(3, 4)).toBe('overdraw')
  })

  it('returns overdraw when remaining=10 and willConsume=11', () => {
    expect(computePackageStatus(10, 11)).toBe('overdraw')
  })

  // ── willConsume === remaining (consuming exactly what's left) ──────────
  // Intentional: strict ">" means exact-balance books are not an overdraw.
  it('returns low when willConsume equals remaining (boundary: 2)', () => {
    expect(computePackageStatus(2, 2)).toBe('low')
  })

  it('returns low when willConsume equals remaining (boundary: 1)', () => {
    expect(computePackageStatus(1, 1)).toBe('low')
  })

  it('returns ok when willConsume equals remaining (boundary: 4)', () => {
    // remaining=4 > 3, so low threshold doesn't apply even with exact balance
    expect(computePackageStatus(4, 4)).toBe('ok')
  })

  // ── low threshold (remaining ≤ 3, no overdraw) ────────────────────────
  it('returns low when remaining=1 and willConsume=0 (initial state)', () => {
    expect(computePackageStatus(1, 0)).toBe('low')
  })

  it('returns low when remaining=2 and willConsume=0 (initial state)', () => {
    expect(computePackageStatus(2, 0)).toBe('low')
  })

  it('returns low when remaining=3 and willConsume=0 (boundary)', () => {
    expect(computePackageStatus(3, 0)).toBe('low')
  })

  it('returns low when remaining=3 and willConsume=3 (exact boundary)', () => {
    expect(computePackageStatus(3, 3)).toBe('low')
  })

  // ── ok threshold (remaining > 3, no overdraw) ─────────────────────────
  it('returns ok when remaining=4 and willConsume=0 (initial state)', () => {
    expect(computePackageStatus(4, 0)).toBe('ok')
  })

  it('returns ok when remaining=10 and willConsume=5', () => {
    expect(computePackageStatus(10, 5)).toBe('ok')
  })

  it('returns ok when remaining=4 and willConsume=3', () => {
    expect(computePackageStatus(4, 3)).toBe('ok')
  })
})

// ─── computePackageStatus + buildBookingPlan integration ────────────────────

describe('Package overdraw — full booking chain', () => {
  it('8-session recurring plan with 2 remaining → status overdraw', () => {
    // Prove the chain: engine occurrence count → computePackageStatus → overdraw.
    // Simulates BookingSheet's willConsume recomputation effect for the primary
    // audit scenario: Package client, remaining=2, recurrenceWeeks=8.
    const plan = buildBookingPlan({
      selectedSlots:    [{ localDate: '2026-01-05', localTime: '09:00' }],
      trainerId:        'T',
      clientId:         'C',
      durationMinutes:  60,
      timezone:         RIYADH_TZ,
      recurrenceWeeks:  8,
      config:           DEFAULT_CONFIG,
      existingSessions: [],
    })
    expect(plan.occurrences.length).toBe(8)
    expect(computePackageStatus(2, plan.occurrences.length)).toBe('overdraw')
  })

  it('isPackageOverdraw returns true for the full chain: Package + 8-session plan + 2 remaining', () => {
    const plan = buildBookingPlan({
      selectedSlots:    [{ localDate: '2026-01-05', localTime: '09:00' }],
      trainerId:        'T',
      clientId:         'C',
      durationMinutes:  60,
      timezone:         RIYADH_TZ,
      recurrenceWeeks:  8,
      config:           DEFAULT_CONFIG,
      existingSessions: [],
    })
    const status = computePackageStatus(2, plan.occurrences.length)
    expect(isPackageOverdraw('Package', { remainingSessions: 2, willConsume: plan.occurrences.length, status })).toBe(true)
  })

  it('4-session recurring plan with 5 remaining → status ok (no overdraw)', () => {
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
    expect(plan.occurrences.length).toBe(4)
    expect(computePackageStatus(5, plan.occurrences.length)).toBe('ok')
    expect(isPackageOverdraw('Package', { remainingSessions: 5, willConsume: plan.occurrences.length, status: 'ok' })).toBe(false)
  })

  it('Pay Per Session client with overdraw balance → isPackageOverdraw false', () => {
    // Proves billing mode gates the guard: PPS client never triggers overdraw
    // even if pkgBalance.status is somehow 'overdraw'.
    const plan = buildBookingPlan({
      selectedSlots:    [{ localDate: '2026-01-05', localTime: '09:00' }],
      trainerId:        'T',
      clientId:         'C',
      durationMinutes:  60,
      timezone:         RIYADH_TZ,
      recurrenceWeeks:  8,
      config:           DEFAULT_CONFIG,
      existingSessions: [],
    })
    const status = computePackageStatus(2, plan.occurrences.length)
    expect(status).toBe('overdraw')
    expect(isPackageOverdraw('Pay Per Session', { remainingSessions: 2, willConsume: plan.occurrences.length, status })).toBe(false)
  })

  it('one-off session with 2 remaining → status low (not overdraw)', () => {
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
    expect(plan.occurrences.length).toBe(1)
    expect(computePackageStatus(2, plan.occurrences.length)).toBe('low')
    expect(isPackageOverdraw('Package', { remainingSessions: 2, willConsume: 1, status: 'low' })).toBe(false)
  })
})
