/**
 * Pure, no-I/O helpers for the Phase 6C atomic package-consumption guard.
 *
 * Phase 6B scope: these helpers are NOT wired into PackageConsumptionService —
 * package-consumption-service.ts is unchanged in this phase. They exist so the
 * negative-balance-guard logic can be unit-tested independently of any
 * database, giving Phase 6C a proven building block to compose into a single
 * atomic SQL statement instead of inlining new logic into the service.
 *
 * No DB. No ERP. No invoice/payment/session-mutation side effects.
 * Deterministic — same inputs always produce the same decision.
 */

import { ledgerDeltaMatchesDirection } from '@/lib/billing/taxonomy'

// ─── Types ────────────────────────────────────────────────────────────────────

/** Identity of a single "consume 1 session" attempt — tenant + package + session scoped. */
export type ConsumptionIdentity = {
  tenantId:          string
  sessionId:         string
  clientIndexId:     string
  erpCustomerId:     string
  packagePurchaseId: string
}

/**
 * Outcome of a pure consumption decision. Deliberately narrow: the only two
 * shapes are "append this ledger debit" or "reject — no balance". There is no
 * shape for deletion, payment, or invoice mutation — a package debit never
 * produces one.
 */
export type ConsumptionDecision =
  | {
      kind:              'consume'
      idempotencyKey:    string
      packagePurchaseId: string
      deltaUnits:        -1
      identity:          ConsumptionIdentity
    }
  | {
      kind:              'reject_no_balance'
      reason:            string
      packagePurchaseId: string
    }

/** How two consumption attempts on the same package purchase relate to each other. */
export type ConsumptionRaceClassification =
  | 'same_session_replay'
  | 'different_session_race'
  | 'different_package'

// ─── Idempotency key ──────────────────────────────────────────────────────────

/**
 * Builds the idempotency key used to anchor a single session's package debit.
 * Matches the key format already used by PackageConsumptionService
 * (`session_consumed:{sessionId}`) — this is the same-session guard, enforced
 * today by the DB-level partial unique index on (tenant_id, idempotency_key).
 */
export function buildSessionConsumedIdempotencyKey(sessionId: string): string {
  if (!sessionId || sessionId.trim() === '') {
    throw new Error('[package-consumption-guard] sessionId must not be blank')
  }
  return `session_consumed:${sessionId}`
}

// ─── Balance-breach predicate ─────────────────────────────────────────────────

/**
 * True when applying `delta` to `currentBalance` would take the derived
 * package balance below zero. This is the pure core of the Phase 6C atomic
 * guard: the guard's SQL condition is "only insert if this would be false".
 *
 * Throws if currentBalance is already negative — a derived balance can never
 * legitimately go negative (that would mean the invariant this guard exists
 * to protect has already been violated upstream).
 */
export function wouldBreachZeroBalance(currentBalance: number, delta: number): boolean {
  if (!Number.isInteger(currentBalance)) {
    throw new Error('[package-consumption-guard] currentBalance must be an integer')
  }
  if (currentBalance < 0) {
    throw new Error(
      '[package-consumption-guard] currentBalance must not be negative — ledger invariant already violated',
    )
  }
  if (!Number.isInteger(delta) || delta === 0) {
    throw new Error('[package-consumption-guard] delta must be a non-zero integer')
  }
  return currentBalance + delta < 0
}

// ─── Identity validation ──────────────────────────────────────────────────────

function assertConsumptionIdentity(identity: ConsumptionIdentity): void {
  const fields: Array<[keyof ConsumptionIdentity, string]> = [
    ['tenantId', identity.tenantId],
    ['sessionId', identity.sessionId],
    ['clientIndexId', identity.clientIndexId],
    ['erpCustomerId', identity.erpCustomerId],
    ['packagePurchaseId', identity.packagePurchaseId],
  ]
  for (const [field, value] of fields) {
    if (!value || value.trim() === '') {
      throw new Error(`[package-consumption-guard] ${field} must not be blank`)
    }
  }
}

// ─── Decision builder ─────────────────────────────────────────────────────────

/**
 * Pure decision for a single-session, single-unit (-1) package consumption
 * attempt. Given the attempt's identity and the package's current derived
 * balance, decides whether the debit is consumable or must be rejected.
 *
 * This function decides the *balance* question only — the Phase 6C gap. It
 * does not decide same-session idempotency; that remains the DB unique
 * index's job (see classifyConsumptionRace below for the distinction).
 */
export function decideSessionConsumption(
  identity: ConsumptionIdentity,
  currentBalance: number,
): ConsumptionDecision {
  assertConsumptionIdentity(identity)

  const deltaUnits = -1 as const

  // Sanity-check against the canonical taxonomy direction map — session_consumed
  // must always be a negative-direction event. Defensive; -1 always satisfies this,
  // but keeps this module honest against taxonomy.ts if that ever changes.
  if (!ledgerDeltaMatchesDirection('session_consumed', deltaUnits)) {
    throw new Error(
      '[package-consumption-guard] session_consumed must be a negative-direction ledger event',
    )
  }

  if (wouldBreachZeroBalance(currentBalance, deltaUnits)) {
    return {
      kind:              'reject_no_balance',
      reason:            `Package ${identity.packagePurchaseId} has no remaining sessions (balance ${currentBalance}).`,
      packagePurchaseId: identity.packagePurchaseId,
    }
  }

  return {
    kind:              'consume',
    idempotencyKey:    buildSessionConsumedIdempotencyKey(identity.sessionId),
    packagePurchaseId: identity.packagePurchaseId,
    deltaUnits,
    identity,
  }
}

// ─── Race classification ──────────────────────────────────────────────────────

/**
 * Classifies whether two consumption attempts on the same package purchase
 * are the same session replaying (idempotent no-op — already protected today
 * by the session_consumed:{sessionId} idempotency key + DB unique index) or
 * two different sessions racing for the same final slot (the Phase 6C gap;
 * the idempotency key does not protect this case, since the two keys differ).
 */
export function classifyConsumptionRace(
  a: ConsumptionIdentity,
  b: ConsumptionIdentity,
): ConsumptionRaceClassification {
  if (a.packagePurchaseId !== b.packagePurchaseId) return 'different_package'
  return a.sessionId === b.sessionId ? 'same_session_replay' : 'different_session_race'
}
