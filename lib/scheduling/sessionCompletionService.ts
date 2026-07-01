/**
 * Session completion service — marks an FD Session as completed.
 *
 * Billing dispatch:
 *   - Trial (isTrialSession=true): status flip only, no billing side-effects.
 *   - Package: ledger-first package consumption (C4C), no invoice.
 *   - Pay-per-session: idempotent Sales Invoice create+submit (C7C), then status flip.
 *   - Unset or missing client projection: fail closed.
 *
 * All I/O dependencies are injected so this module has zero direct imports of ERP
 * clients, billing services, or database — making it unit-testable without mocking
 * module internals.
 */

import type { FDSession, FDSessionStatus } from '@/types/scheduling'
import type { BillingMode } from '@/types/clients'
import type { Invoice } from '@/types'
import type { CreateInvoicePayload } from '@/lib/erpnext/types'

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
 * Thrown when a pay-per-session FD Session has no rate configured (rate <= 0).
 * Set a session rate before completing a pay-per-session booking.
 */
export class SessionRateNotConfiguredError extends Error {
  constructor(public readonly sessionId: string) {
    super(
      `FD Session ${sessionId} has no session rate configured — set a rate before completing a pay-per-session booking`,
    )
    this.name = 'SessionRateNotConfiguredError'
  }
}

/**
 * @deprecated PPS completion now creates a real invoice (C7C). This class is retained
 * so existing callers that catch it continue to compile. The service no longer throws it
 * on the successful PPS path.
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
  findSessionById: (id: string) => Promise<FDSession>
  updateSession: (id: string, patch: {
    status?:                 FDSessionStatus
    version?:                number
    sessionConsumedPackage?: boolean
    invoiceId?:              string | null
  }) => Promise<FDSession>
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
  // ── Pay-per-session invoice deps (C7C) ──────────────────────────────────────
  /** Query Sales Invoice by FD Session docname — idempotency check before create. */
  findInvoiceBySession: (sessionId: string) => Promise<Invoice | null>
  /** Build a Sales Invoice payload for a pay-per-session completion. */
  buildSessionInvoicePayload: (args: { sessionId: string; erpCustomerId: string; rate: number; postingDate: string }) => CreateInvoicePayload
  /** Create a draft Sales Invoice in ERPNext. */
  createInvoice: (payload: CreateInvoicePayload) => Promise<Invoice>
  /** Submit a draft Sales Invoice so it becomes payable (status: sent). */
  submitSalesInvoice: (invoiceId: string) => Promise<Invoice>
  /** Returns today's date as YYYY-MM-DD for the invoice posting_date / due_date. */
  getPostingDate: () => string
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
 *  - billingMode='package': ledger-first consumption, then status flip.
 *  - billingMode='pay_per_session': invoice-first (idempotent), then status flip + invoiceId.
 *  - billingMode='unset' or null (missing client projection): throws BillingNotConfiguredError.
 *
 * PPS ordering guarantee: invoice is created and submitted BEFORE the FD Session status
 * write. If the status write fails, a retry finds the existing invoice via
 * findInvoiceBySession (custom_fd_session anchor) and reuses it — no duplicate invoice.
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
    // Validate session rate
    if (!current.rate || current.rate <= 0) {
      throw new SessionRateNotConfiguredError(id)
    }

    // Pre-create idempotency check: reuse any existing invoice for this session.
    // Handles retries where the invoice was issued but the FD Session write failed.
    let invoice = await deps.findInvoiceBySession(id)

    if (invoice !== null) {
      if (invoice.status === 'cancelled') {
        // Cancelled invoices cannot be reused; a second one with the same
        // custom_fd_session would be a duplicate. Surface as ERR.
        throw new Error(
          `FD Session ${id} has a cancelled Sales Invoice (${invoice.id}). ` +
          'Cancel and re-book this session to issue a new invoice.',
        )
      }
      if (invoice.status === 'draft') {
        // Prior attempt created the invoice but submit failed — submit it now.
        invoice = await deps.submitSalesInvoice(invoice.id)
      }
      // Any other status (sent, paid, overdue, partially_paid) → reuse as-is.
    } else {
      // No prior invoice — build, create, and submit one.
      const postingDate = deps.getPostingDate()
      const payload = deps.buildSessionInvoicePayload({
        sessionId:     id,
        erpCustomerId: current.clientId,
        rate:          current.rate,
        postingDate,
      })
      const draft = await deps.createInvoice(payload)
      invoice = await deps.submitSalesInvoice(draft.id)
    }

    // Invoice is safely issued (submitted or reused). Write FD Session completion.
    // If this write fails, retry finds the invoice via findInvoiceBySession — no duplicate.
    return deps.updateSession(id, {
      status:    'completed',
      invoiceId: invoice.id,
      version:   expectedVersion + 1,
    })
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
