/**
 * Unit tests for lib/scheduling/completionUI.ts
 *
 * Pure functions extracted from SessionCompletionSheet specifically so they
 * could be unit-tested (see file header comment) — this closes that gap.
 * No production code is changed by this file.
 */
import { describe, expect, it } from 'vitest'
import {
  canComplete,
  canMarkNoShow,
  canCancel,
  mapCompletionError,
  mapNoShowError,
  mapCancelError,
  getNoShowFinancialChoice,
} from '@/lib/scheduling/completionUI'
import type { FDSession } from '@/types/scheduling'
import type { SessionCompletionPreview } from '@/lib/scheduling/sessionCompletionPreview'

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

// ─── mapNoShowError (US-017) ────────────────────────────────────────────────────

describe('mapNoShowError', () => {
  it('maps BILLING_NOT_CONFIGURED to its no-show-specific message', () => {
    expect(mapNoShowError('BILLING_NOT_CONFIGURED')).toBe(
      'Billing setup is required before this session can be marked no-show.',
    )
  })

  it('maps NO_PACKAGE_BALANCE to its user-facing message', () => {
    expect(mapNoShowError('NO_PACKAGE_BALANCE')).toBe(
      'This client has no remaining package sessions.',
    )
  })

  it('maps SESSION_RATE_NOT_CONFIGURED to its no-show-specific message', () => {
    expect(mapNoShowError('SESSION_RATE_NOT_CONFIGURED')).toBe(
      'No session rate is set — add a rate to this session before charging for a no-show.',
    )
  })

  it('maps INVALID_NO_SHOW_ACTION to its user-facing message', () => {
    expect(mapNoShowError('INVALID_NO_SHOW_ACTION')).toBe(
      "That option isn't available for this client's billing setup.",
    )
  })

  it('maps VERSION_CONFLICT to its user-facing message', () => {
    expect(mapNoShowError('VERSION_CONFLICT')).toBe(
      'This session changed. Refresh and try again.',
    )
  })

  it('maps IMMUTABLE_STATUS to its user-facing message', () => {
    expect(mapNoShowError('IMMUTABLE_STATUS')).toBe(
      'This session is already finalized.',
    )
  })

  it('falls back to the generic message for an unknown code', () => {
    expect(mapNoShowError('SOME_UNKNOWN_CODE')).toBe(
      'Could not mark this session as no-show. Please try again.',
    )
  })

  it('falls back to the generic message for an empty string code', () => {
    expect(mapNoShowError('')).toBe('Could not mark this session as no-show. Please try again.')
  })
})

// ─── canMarkNoShow (US-017) ─────────────────────────────────────────────────────

describe('canMarkNoShow', () => {
  it('returns true for a scheduled session whose start time is in the past', () => {
    const session = makeSession({ status: 'scheduled', startAt: new Date(Date.now() - 60_000) })
    expect(canMarkNoShow(session)).toBe(true)
  })

  it('returns true for a confirmed session whose start time is in the past', () => {
    const session = makeSession({ status: 'confirmed', startAt: new Date(Date.now() - 60_000) })
    expect(canMarkNoShow(session)).toBe(true)
  })

  it('returns false for a scheduled session whose start time is in the future', () => {
    const session = makeSession({ status: 'scheduled', startAt: new Date(Date.now() + 60_000) })
    expect(canMarkNoShow(session)).toBe(false)
  })

  for (const status of ['completed', 'cancelled', 'no_show', 'skipped'] as const) {
    it(`returns false for status = ${status} (past session) — immutable/terminal`, () => {
      const session = makeSession({ status, startAt: new Date(Date.now() - 60_000) })
      expect(canMarkNoShow(session)).toBe(false)
    })
  }
})

// ─── mapCancelError (US-039) ────────────────────────────────────────────────────

describe('mapCancelError', () => {
  it('maps VERSION_CONFLICT to its user-facing message', () => {
    expect(mapCancelError('VERSION_CONFLICT')).toBe(
      'This session changed. Refresh and try again.',
    )
  })

  it('maps IMMUTABLE_STATUS to its user-facing message', () => {
    expect(mapCancelError('IMMUTABLE_STATUS')).toBe(
      'This session is already finalized.',
    )
  })

  it('falls back to the generic message for an unknown code', () => {
    expect(mapCancelError('SOME_UNKNOWN_CODE')).toBe(
      'Could not cancel this session. Please try again.',
    )
  })

  it('falls back to the generic message for an empty string code', () => {
    expect(mapCancelError('')).toBe('Could not cancel this session. Please try again.')
  })

  it('does not use billing-related codes — cancel never resolves billing mode', () => {
    // BILLING_NOT_CONFIGURED/NO_PACKAGE_BALANCE/etc. are never thrown by
    // cancelSession, so they must fall through to the generic message here,
    // not accidentally resolve to a no-show/completion-specific string.
    expect(mapCancelError('BILLING_NOT_CONFIGURED')).toBe(
      'Could not cancel this session. Please try again.',
    )
  })
})

// ─── canCancel (US-039) ─────────────────────────────────────────────────────────

describe('canCancel', () => {
  it('returns true for a scheduled session regardless of start time (future or past)', () => {
    const future = makeSession({ status: 'scheduled', startAt: new Date(Date.now() + 60_000) })
    const past   = makeSession({ status: 'scheduled', startAt: new Date(Date.now() - 60_000) })
    expect(canCancel(future)).toBe(true)
    expect(canCancel(past)).toBe(true)
  })

  it('returns true for a confirmed session regardless of start time', () => {
    const future = makeSession({ status: 'confirmed', startAt: new Date(Date.now() + 60_000) })
    expect(canCancel(future)).toBe(true)
  })

  for (const status of ['completed', 'cancelled', 'no_show', 'skipped'] as const) {
    it(`returns false for status = ${status} — immutable/terminal`, () => {
      const session = makeSession({ status })
      expect(canCancel(session)).toBe(false)
    })
  }
})

// ─── getNoShowFinancialChoice (US-017) ─────────────────────────────────────────

describe('getNoShowFinancialChoice', () => {
  it('trial: offers a single no-financial-effect option', () => {
    const preview: SessionCompletionPreview = { kind: 'trial' }
    const choice = getNoShowFinancialChoice(preview)
    expect(choice.blocked).toBe(false)
    expect(choice.options).toHaveLength(1)
    expect(choice.options[0].action).toBe('waive')
    expect(choice.options[0].description).toMatch(/no charge, no package session used/i)
  })

  it('unconfigured: is blocked — no options offered', () => {
    const preview: SessionCompletionPreview = { kind: 'unconfigured' }
    const choice = getNoShowFinancialChoice(preview)
    expect(choice.blocked).toBe(true)
    expect(choice.blockedReason).toBeTruthy()
    expect(choice.options).toHaveLength(0)
  })

  it('pay_per_session: offers charge and waive only — never deduct', () => {
    const preview: SessionCompletionPreview = { kind: 'pay_per_session', amount: 50, currency: 'USD' }
    const choice = getNoShowFinancialChoice(preview)
    expect(choice.blocked).toBe(false)
    const actions = choice.options.map(o => o.action)
    expect(actions.sort()).toEqual(['charge', 'waive'])
    expect(actions).not.toContain('deduct')
  })

  it('pay_per_session: charge option description includes the amount and currency', () => {
    const preview: SessionCompletionPreview = { kind: 'pay_per_session', amount: 75, currency: 'SAR' }
    const choice = getNoShowFinancialChoice(preview)
    const charge = choice.options.find(o => o.action === 'charge')
    expect(charge?.description).toContain('75')
    expect(charge?.description).toContain('SAR')
  })

  it('pay_per_session_rate_missing: offers waive only, with an explanatory note', () => {
    const preview: SessionCompletionPreview = { kind: 'pay_per_session_rate_missing' }
    const choice = getNoShowFinancialChoice(preview)
    expect(choice.blocked).toBe(false)
    expect(choice.options.map(o => o.action)).toEqual(['waive'])
    expect(choice.note).toBeTruthy()
  })

  it('package: offers deduct and waive only — never charge', () => {
    const preview: SessionCompletionPreview = { kind: 'package', balanceAfter: 4 }
    const choice = getNoShowFinancialChoice(preview)
    expect(choice.blocked).toBe(false)
    const actions = choice.options.map(o => o.action)
    expect(actions.sort()).toEqual(['deduct', 'waive'])
    expect(actions).not.toContain('charge')
  })

  it('package: deduct option description never mentions an invoice', () => {
    const preview: SessionCompletionPreview = { kind: 'package', balanceAfter: 4 }
    const choice = getNoShowFinancialChoice(preview)
    const deduct = choice.options.find(o => o.action === 'deduct')
    expect(deduct?.description.toLowerCase()).not.toContain('invoice')
  })

  it('package_already_consumed: still offers deduct and waive, with an explanatory note', () => {
    const preview: SessionCompletionPreview = { kind: 'package_already_consumed' }
    const choice = getNoShowFinancialChoice(preview)
    expect(choice.blocked).toBe(false)
    expect(choice.options.map(o => o.action).sort()).toEqual(['deduct', 'waive'])
    expect(choice.note).toBeTruthy()
  })

  it('package_no_balance: offers waive only, with an explanatory note', () => {
    const preview: SessionCompletionPreview = { kind: 'package_no_balance' }
    const choice = getNoShowFinancialChoice(preview)
    expect(choice.blocked).toBe(false)
    expect(choice.options.map(o => o.action)).toEqual(['waive'])
    expect(choice.note).toBeTruthy()
  })

  it('no option description across any kind ever mentions charge for a package client', () => {
    const preview: SessionCompletionPreview = { kind: 'package', balanceAfter: 4 }
    const choice = getNoShowFinancialChoice(preview)
    for (const option of choice.options) {
      expect(option.action).not.toBe('charge')
    }
  })
})
