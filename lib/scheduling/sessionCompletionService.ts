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
 * @deprecated Replaced by the full package ledger integration in C4C.
 * Retained as an export so any callers that caught this error continue to compile.
 */
export class PackageCompletionNotReadyError extends Error {
  constructor(public readonly clientId: string) {
    super(
      `Package session completion is not yet available for client ${clientId} — arriving in C4C`,
    )
    this.name = 'PackageCompletionNotReadyError'
  }
}

/** Thrown when no active package with remaining sessions exists for the client. */
export class NoPackageBalanceError extends Error {
  constructor(public readonly clientId: string) {
    super(
      `No active package with available sessions found for client ${clientId} — add or top up a package before completing`,
    )
    this.name = 'NoPackageBalanceError'
  }
}

// ─── Deps ─────────────────────────────────────────────────────────────────────

export interface CompletionDeps {
  findSessionById:    (id: string) => Promise<FDSession>
  updateSession:      (id: string, patch: { status?: FDSessionStatus; version?: number; sessionConsumedPackage?: boolean }) => Promise<FDSession>
  /**
   * Resolve the billing mode for the given ERP Customer docname.
   * Returns null when no local client_index row exists for this customer.
   */
  resolveBillingMode: (clientId: string) => Promise<BillingMode | null>
  /**
   * Consume one session from the client's active package.
   * `sessionId` MUST be the FD Session docname — used as the idempotency anchor.
   * `erpCustomerId` is the ERP Customer docname from the FD Session.
   * Returns the consumption outcome; never throws for business-logic outcomes.
   */
  consumeForSession: (args: { sessionId: string; erpCustomerId: string }) => Promise<{ outcome: 'consumed' | 'already_done' | 'no_package' | 'no_balance' }>
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
    // If the ledger debit already landed (e.g. retry after ERP failure), skip consumption.
    if (current.sessionConsumedPackage) {
      return deps.updateSession(id, {
        status:                 'completed',
        sessionConsumedPackage: true,
        version:                expectedVersion + 1,
      })
    }

    // Ledger-first: consume before any ERP status write.
    // `id` (FD Session docname) is the stable idempotency anchor — no random key.
    const { outcome } = await deps.consumeForSession({
      sessionId:    id,
      erpCustomerId: current.clientId,
    })

    if (outcome === 'no_package' || outcome === 'no_balance') {
      throw new NoPackageBalanceError(current.clientId)
    }

    // consumed or already_done — both safe to proceed
    return deps.updateSession(id, {
      status:                 'completed',
      sessionConsumedPackage: true,
      version:                expectedVersion + 1,
    })
  }

  // Defensive fallback: any unknown/reserved billing mode fails closed
  throw new BillingNotConfiguredError(current.clientId)
}
