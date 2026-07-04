/**
 * Unit tests for the Phase 6B pure package-consumption guard helpers.
 *
 * No DB, no ERP, no mocks — these are pure functions operating on plain
 * values. Phase 6C will compose these into the atomic conditional-insert
 * guard; this suite proves the decision logic in isolation first.
 */
import { describe, it, expect } from 'vitest'
import {
  buildSessionConsumedIdempotencyKey,
  wouldBreachZeroBalance,
  decideSessionConsumption,
  classifyConsumptionRace,
  type ConsumptionIdentity,
} from '@/lib/billing/package-consumption-guard'

function identity(overrides: Partial<ConsumptionIdentity> = {}): ConsumptionIdentity {
  return {
    tenantId:          'tenant-1',
    sessionId:         'fds-001',
    clientIndexId:     'ci-1',
    erpCustomerId:     'CUST-1',
    packagePurchaseId: 'cpp-1',
    ...overrides,
  }
}

describe('buildSessionConsumedIdempotencyKey', () => {
  it('produces session_consumed:{sessionId} exactly', () => {
    expect(buildSessionConsumedIdempotencyKey('fds-001')).toBe('session_consumed:fds-001')
  })

  it('is deterministic — same sessionId always produces the same key', () => {
    const a = buildSessionConsumedIdempotencyKey('fds-42')
    const b = buildSessionConsumedIdempotencyKey('fds-42')
    expect(a).toBe(b)
  })

  it('throws when sessionId is blank', () => {
    expect(() => buildSessionConsumedIdempotencyKey('')).toThrow('sessionId must not be blank')
  })

  it('throws when sessionId is whitespace-only', () => {
    expect(() => buildSessionConsumedIdempotencyKey('   ')).toThrow('sessionId must not be blank')
  })
})

describe('wouldBreachZeroBalance', () => {
  it('allows a positive balance to absorb a single-unit debit', () => {
    expect(wouldBreachZeroBalance(1, -1)).toBe(false)
    expect(wouldBreachZeroBalance(5, -1)).toBe(false)
  })

  it('rejects a debit against a zero balance', () => {
    expect(wouldBreachZeroBalance(0, -1)).toBe(true)
  })

  it('throws for a negative currentBalance — ledger invariant already violated', () => {
    expect(() => wouldBreachZeroBalance(-1, -1)).toThrow('currentBalance must not be negative')
  })

  it('throws for a non-integer currentBalance', () => {
    expect(() => wouldBreachZeroBalance(1.5, -1)).toThrow('currentBalance must be an integer')
  })

  it('throws for a zero delta', () => {
    expect(() => wouldBreachZeroBalance(1, 0)).toThrow('delta must be a non-zero integer')
  })

  it('throws for a non-integer delta', () => {
    expect(() => wouldBreachZeroBalance(1, -1.5)).toThrow('delta must be a non-zero integer')
  })
})

describe('decideSessionConsumption', () => {
  it('accepts a positive balance for one-session consumption', () => {
    const decision = decideSessionConsumption(identity(), 3)
    expect(decision.kind).toBe('consume')
    if (decision.kind !== 'consume') throw new Error('narrow')
    expect(decision.deltaUnits).toBe(-1)
    expect(decision.idempotencyKey).toBe('session_consumed:fds-001')
    expect(decision.packagePurchaseId).toBe('cpp-1')
  })

  it('rejects a zero balance as no_balance (not an exception)', () => {
    const decision = decideSessionConsumption(identity(), 0)
    expect(decision.kind).toBe('reject_no_balance')
    if (decision.kind !== 'reject_no_balance') throw new Error('narrow')
    expect(decision.packagePurchaseId).toBe('cpp-1')
    expect(decision.reason).toContain('cpp-1')
  })

  it('rejects a negative balance by throwing — this is a corrupted-state guard, not a business outcome', () => {
    expect(() => decideSessionConsumption(identity(), -1)).toThrow('currentBalance must not be negative')
  })

  it('rejects a missing tenantId', () => {
    expect(() => decideSessionConsumption(identity({ tenantId: '' }), 1)).toThrow('tenantId must not be blank')
  })

  it('rejects a missing sessionId', () => {
    expect(() => decideSessionConsumption(identity({ sessionId: '' }), 1)).toThrow('sessionId must not be blank')
  })

  it('rejects a missing clientIndexId', () => {
    expect(() => decideSessionConsumption(identity({ clientIndexId: '' }), 1)).toThrow('clientIndexId must not be blank')
  })

  it('rejects a missing erpCustomerId', () => {
    expect(() => decideSessionConsumption(identity({ erpCustomerId: '' }), 1)).toThrow('erpCustomerId must not be blank')
  })

  it('rejects a missing packagePurchaseId', () => {
    expect(() => decideSessionConsumption(identity({ packagePurchaseId: '' }), 1)).toThrow('packagePurchaseId must not be blank')
  })

  it('is deterministic — same identity + balance always produces an equivalent decision', () => {
    const a = decideSessionConsumption(identity(), 2)
    const b = decideSessionConsumption(identity(), 2)
    expect(a).toEqual(b)
  })

  it('is tenant/package/session scoped — decision carries the full identity', () => {
    const decision = decideSessionConsumption(identity({ tenantId: 'tenant-9', packagePurchaseId: 'cpp-9', sessionId: 'fds-9' }), 1)
    expect(decision.kind).toBe('consume')
    if (decision.kind !== 'consume') throw new Error('narrow')
    expect(decision.identity.tenantId).toBe('tenant-9')
    expect(decision.identity.packagePurchaseId).toBe('cpp-9')
    expect(decision.identity.sessionId).toBe('fds-9')
  })

  it('never produces a deletion, payment, or invoice mutation shape', () => {
    const consumed = decideSessionConsumption(identity(), 1)
    const rejected  = decideSessionConsumption(identity({ sessionId: 'fds-002' }), 0)

    expect(Object.keys(consumed).sort()).toEqual(
      ['kind', 'idempotencyKey', 'packagePurchaseId', 'deltaUnits', 'identity'].sort(),
    )
    expect(Object.keys(rejected).sort()).toEqual(
      ['kind', 'reason', 'packagePurchaseId'].sort(),
    )
    // No variant of ConsumptionDecision has an invoice/payment/delete field —
    // this is enforced by the type itself, asserted here as a runtime guard.
    for (const decision of [consumed, rejected]) {
      expect(decision).not.toHaveProperty('invoiceId')
      expect(decision).not.toHaveProperty('paymentId')
      expect(decision).not.toHaveProperty('deleted')
    }
  })
})

describe('classifyConsumptionRace', () => {
  it('classifies the same sessionId on the same package as a same-session replay', () => {
    const a = identity({ sessionId: 'fds-100', packagePurchaseId: 'cpp-1' })
    const b = identity({ sessionId: 'fds-100', packagePurchaseId: 'cpp-1' })
    expect(classifyConsumptionRace(a, b)).toBe('same_session_replay')
  })

  it('classifies two different sessionIds on the same package as a different-session race', () => {
    const a = identity({ sessionId: 'fds-100', packagePurchaseId: 'cpp-1' })
    const b = identity({ sessionId: 'fds-200', packagePurchaseId: 'cpp-1' })
    expect(classifyConsumptionRace(a, b)).toBe('different_session_race')
  })

  it('classifies attempts on different packages as different_package regardless of sessionId', () => {
    const a = identity({ sessionId: 'fds-100', packagePurchaseId: 'cpp-1' })
    const b = identity({ sessionId: 'fds-100', packagePurchaseId: 'cpp-2' })
    expect(classifyConsumptionRace(a, b)).toBe('different_package')
  })

  it('is the distinction Phase 6C relies on: same-session is already idempotency-key-protected; different-session is the gap', () => {
    const sameSession = identity({ sessionId: 'fds-1', packagePurchaseId: 'cpp-1' })
    const sameSessionReplay = identity({ sessionId: 'fds-1', packagePurchaseId: 'cpp-1' })
    const differentSession = identity({ sessionId: 'fds-2', packagePurchaseId: 'cpp-1' })

    expect(classifyConsumptionRace(sameSession, sameSessionReplay)).toBe('same_session_replay')
    expect(classifyConsumptionRace(sameSession, differentSession)).toBe('different_session_race')
  })
})
