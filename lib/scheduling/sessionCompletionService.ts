/**
 * Session completion service — marks an FD Session as completed.
 *
 * C4B scope: trial completion + billing-mode dispatch shell only.
 *   - Trial (isTrialSession=true): status flip, no billing side-effects.
 *   - Package: placeholder error — C4C integrates the package ledger.
 *   - Pay-per-session: deferred error — C7 owns invoice creation.
 *   - Unset or missing client projection: fail closed.
 *
 * All I/O dependencies are injected (findSessionById, updateSession,
 * resolveBillingMode) so this module has zero direct imports of ERP clients,
 * billing services, or database — making it unit-testable without mocking
 * module internals.
 */

import type { FDSession, FDSessionStatus } from '@/types/scheduling'
import type { BillingMode } from '@/types/clients'

// ─── Error types ──────────────────────────────────────────────────────────────

/** Thrown when the caller's expectedVersion does not match the stored version. */
export class VersionConflictError extends Error {
  constructor(public readonly sessionId: string) {
    super(`Session ${sessionId} was modified by another request — reload and try again`)
    this.name = 'VersionConflictError'
  }
}

/** Thrown when attempting to mutate a session whose status prevents it. */
export class ImmutableSessionError extends Error {
  constructor(public readonly sessionId: string, public readonly status: FDSessionStatus) {
    super(`Session ${sessionId} cannot be modified: status is '${status}'`)
    this.name = 'ImmutableSessionError'
  }
}

/** Thrown when the client has no billing mode configured — set one before completing sessions. */
export class BillingNotConfiguredError extends Error {
  constructor(public readonly clientId: string) {
    super(
      `Client ${clientId} has no billing mode configured — set a billing mode before completing sessions`,
    )
    this.name = 'BillingNotConfiguredError'
  }
}

/**
 * Thrown for pay-per-session clients.
 * Invoice creation is deferred to C7 — this code path must not create ERP invoices.
 */
export class PayPerSessionCompletionDeferredError extends Error {
  constructor(public readonly sessionId: string) {
    super(
      `Pay-per-session invoice creation is deferred to C7 — session ${sessionId} cannot be completed yet`,
    )
    this.name = 'PayPerSessionCompletionDeferredError'
  }
}

/**
 * Thrown for package clients in C4B.
 * Package ledger consumption is implemented in C4C only.
 */
export class PackageCompletionNotReadyError extends Error {
  constructor(public readonly clientId: string) {
    super(
      `Package session completion is not yet available for client ${clientId} — arriving in C4C`,
    )
    this.name = 'PackageCompletionNotReadyError'
  }
}

// ─── Deps ─────────────────────────────────────────────────────────────────────

export interface CompletionDeps {
  findSessionById:    (id: string) => Promise<FDSession>
  updateSession:      (id: string, patch: { status?: FDSessionStatus; version?: number }) => Promise<FDSession>
  /**
   * Resolve the billing mode for the given ERP Customer docname.
   * Returns null when no local client_index row exists for this customer.
   */
  resolveBillingMode: (clientId: string) => Promise<BillingMode | null>
}

// ─── Internal ─────────────────────────────────────────────────────────────────

const MUTABLE_STATUSES: FDSessionStatus[] = ['scheduled', 'confirmed']

// ─── completeSession ──────────────────────────────────────────────────────────

/**
 * Mark a session as completed.
 *
 * Guards applied in order:
 *  1. Version check — rejects stale reads (optimistic concurrency).
 *  2. Immutable-state check — only scheduled/confirmed may transition.
 *
 * Billing dispatch (after guards):
 *  - isTrialSession=true wins over billing mode: status flip only, no charge.
 *  - billingMode='package': throws PackageCompletionNotReadyError (C4C placeholder).
 *  - billingMode='pay_per_session': throws PayPerSessionCompletionDeferredError (C7 deferred).
 *  - billingMode='unset' or null (missing client projection): throws BillingNotConfiguredError.
 *
 * Ordering guarantee (trial path): updateSession is called AFTER all guards pass and
 * BEFORE returning, consistent with the retryable-side-effect principle — a failure
 * inside updateSession leaves the session in its mutable state and can be retried.
 */
export async function completeSession(
  deps: CompletionDeps,
  id: string,
  expectedVersion: number,
): Promise<FDSession> {
  const current = await deps.findSessionById(id)

  // Guard 1: optimistic concurrency
  if (current.version !== expectedVersion) {
    throw new VersionConflictError(id)
  }

  // Guard 2: terminal-state check
  if (!MUTABLE_STATUSES.includes(current.status)) {
    throw new ImmutableSessionError(id, current.status)
  }

  // Trial flag takes priority — no billing lookup required
  if (current.isTrialSession) {
    return deps.updateSession(id, {
      status:  'completed',
      version: expectedVersion + 1,
    })
  }

  // Billing mode dispatch
  const billingMode = await deps.resolveBillingMode(current.clientId)

  if (!billingMode || billingMode === 'unset') {
    throw new BillingNotConfiguredError(current.clientId)
  }

  if (billingMode === 'pay_per_session') {
    throw new PayPerSessionCompletionDeferredError(id)
  }

  if (billingMode === 'package') {
    throw new PackageCompletionNotReadyError(current.clientId)
  }

  // Defensive fallback: any unknown/reserved billing mode fails closed
  throw new BillingNotConfiguredError(current.clientId)
}
