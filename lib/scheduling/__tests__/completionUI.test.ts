/**
 * Unit tests for lib/scheduling/completionUI.ts
 *
 * Pure functions extracted from SessionCompletionSheet specifically so they
 * could be unit-tested (see file header comment) — this closes that gap.
 * No production code is changed by this file.
 */
import { describe, expect, it } from 'vitest'
import { canComplete, mapCompletionError } from '@/lib/scheduling/completionUI'
import type { FDSession } from '@/types/scheduling'

// ─── mapCompletionError ─────────────────────────────────────────────────────────

describe('mapCompletionError', () => {
  it('maps BILLING_NOT_CONFIGURED to its user-facing message', () => {
    expect(mapCompletionError('BILLING_NOT_CONFIGURED')).toBe(
      'Billing setup is required before this session can be completed.',
    )
  })

  it('maps NO_PACKAGE_BALANCE to its user-facing message', () => {
    expect(mapCompletionError('NO_PACKAGE_BALANCE')).toBe(
      'This client has no remaining package sessions.',
    )
  })

  it('maps SESSION_RATE_NOT_CONFIGURED to its user-facing message', () => {
    expect(mapCompletionError('SESSION_RATE_NOT_CONFIGURED')).toBe(
      'No session rate is set — add a rate to this session before completing.',
    )
  })

  it('maps VERSION_CONFLICT to its user-facing message', () => {
    expect(mapCompletionError('VERSION_CONFLICT')).toBe(
      'This session changed. Refresh and try again.',
    )
  })

  it('maps IMMUTABLE_STATUS to its user-facing message', () => {
    expect(mapCompletionError('IMMUTABLE_STATUS')).toBe(
      'This session is already finalized.',
    )
  })

  it('maps PPS_DEFERRED to the generic fallback wording (legacy code, kept as fallback)', () => {
    expect(mapCompletionError('PPS_DEFERRED')).toBe(
      'Could not complete the session. Please try again.',
    )
  })

  it('falls back to the generic message for an unknown code', () => {
    expect(mapCompletionError('SOME_UNKNOWN_CODE')).toBe(
      'Could not complete the session. Please try again.',
    )
  })

  it('falls back to the generic message for an empty string code', () => {
    expect(mapCompletionError('')).toBe('Could not complete the session. Please try again.')
  })

  it('is case-sensitive — a lowercase known code is not matched', () => {
    expect(mapCompletionError('billing_not_configured')).toBe(
      'Could not complete the session. Please try again.',
    )
  })
})

// ─── canComplete ──────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<FDSession> = {}): FDSession {
  return {
    id:              'fds-001',
    tenantId:        'tenant-a',
    trainerId:       'trainer-1',
    clientId:        'CUST-001',
    clientName:      'Alice',
    seriesId:        null,
    startAt:         new Date('2026-01-05T09:00:00Z'),
    endAt:           new Date('2026-01-05T10:00:00Z'),
    durationMinutes: 60,
    timezone:        'Asia/Riyadh',
    status:          'scheduled',
    occurrenceKey:   null,
    occurrenceIndex: null,
    isOverride:      false,
    rate:            100,
    sessionType:     null,
    notes:           null,
    invoiceId:              null,
    version:                1,
    isTrialSession:         false,
    sessionConsumedPackage: false,
    ...overrides,
  }
}

describe('canComplete', () => {
  it('returns true for a scheduled session whose start time is in the past', () => {
    const session = makeSession({ status: 'scheduled', startAt: new Date(Date.now() - 60_000) })
    expect(canComplete(session)).toBe(true)
  })

  it('returns true for a confirmed session whose start time is in the past', () => {
    const session = makeSession({ status: 'confirmed', startAt: new Date(Date.now() - 60_000) })
    expect(canComplete(session)).toBe(true)
  })

  it('returns true for a session whose start time is exactly now (boundary, <=)', () => {
    const now = Date.now()
    const session = makeSession({ status: 'scheduled', startAt: new Date(now) })
    // canComplete reads Date.now() internally at call time, which will be >= `now`
    // by the time this line executes, so startAt <= Date.now() holds.
    expect(canComplete(session)).toBe(true)
  })

  it('returns false for a scheduled session whose start time is in the future', () => {
    const session = makeSession({ status: 'scheduled', startAt: new Date(Date.now() + 60_000) })
    expect(canComplete(session)).toBe(false)
  })

  it('returns false for a completed session even if start time is in the past', () => {
    const session = makeSession({ status: 'completed', startAt: new Date(Date.now() - 60_000) })
    expect(canComplete(session)).toBe(false)
  })

  it('returns false for a cancelled session even if start time is in the past', () => {
    const session = makeSession({ status: 'cancelled', startAt: new Date(Date.now() - 60_000) })
    expect(canComplete(session)).toBe(false)
  })

  it('returns false for a no_show session even if start time is in the past', () => {
    const session = makeSession({ status: 'no_show', startAt: new Date(Date.now() - 60_000) })
    expect(canComplete(session)).toBe(false)
  })

  it('returns false for a skipped session even if start time is in the past', () => {
    const session = makeSession({ status: 'skipped', startAt: new Date(Date.now() - 60_000) })
    expect(canComplete(session)).toBe(false)
  })
})
