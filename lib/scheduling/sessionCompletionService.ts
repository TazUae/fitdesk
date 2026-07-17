/**
 * Session completion service — marks an FD Session as completed, no-show, or
 * cancelled.
 *
 * completeSession billing dispatch:
 *   - Trial (isTrialSession=true): status flip only, no billing side-effects.
 *   - Package: ledger-first package consumption (C4C), no invoice.
 *   - Pay-per-session: idempotent Sales Invoice create+submit (C7C), then status flip.
 *   - Unset or missing client projection: fail closed.
 *
 * markNoShow financial dispatch (US-017 — approved design, see
 * docs/execution/phase-1-plus-safe-run-plan.md):
 *   - Trial: status flip only, no charge, regardless of the requested financial action.
 *   - Pay-per-session: 'charge' (issues the invoice via the same idempotent path as
 *     completion) or 'waive' (status flip only). 'deduct' is invalid for this mode —
 *     PPS has no balance to deduct from.
 *   - Package: 'deduct' (ledger-first consumption via the same idempotent path as
 *     completion, never creates an invoice) or 'waive' (status flip only). 'charge' is
 *     invalid for this mode — packages are pre-paid and are never invoiced at no-show.
 *   - Unset or missing client projection: fail closed.
 *
 * cancelSession (US-039 — approved design, see
 * docs/execution/phase-1-plus-safe-run-plan.md): financially inert by construction —
 * never creates, submits, voids, refunds, or credits an invoice, and never consumes or
 * reverses a package session, regardless of billing mode. Only reachable pre-completion
 * (the mutable-status guard), so there is never an invoice or package debit to disturb.
 *
 * All I/O dependencies are injected so this module has zero direct imports of ERP
 * clients, billing services, or database — making it unit-testable without mocking
 * module internals.
 */

import type { FDSession, FDSessionStatus } from '@/types/scheduling'
import type { BillingMode } from '@/types/clients'
import type { Invoice } from '@/types'
import type { CreateInvoicePayload } from '@/lib/erpnext/types'

// ─── No-show financial action (US-017) ────────────────────────────────────────

/**
 * The trainer's chosen financial handling of a no-show, resolved against the
 * client's billing mode by markNoShow:
 *   - 'charge' — pay-per-session only: issue the session invoice as usual.
 *   - 'deduct' — package only: consume one package unit, no invoice.
 *   - 'waive'  — both modes: status flip only, no financial effect.
 */
export type NoShowFinancialAction = 'charge' | 'deduct' | 'waive'

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

/**
 * Thrown when markNoShow's requested financial action does not match the client's
 * billing mode — e.g. 'deduct' for a pay-per-session client (no balance to deduct
 * from) or 'charge' for a package client (packages are pre-paid, never invoiced at
 * no-show). Fails closed rather than silently reinterpreting the trainer's choice.
 */
export class InvalidNoShowActionError extends Error {
  constructor(
    public readonly sessionId: string,
    public readonly financialAction: NoShowFinancialAction,
    public readonly billingMode: string,
  ) {
    super(
      `No-show action '${financialAction}' is not valid for billing mode '${billingMode}' (session ${sessionId})`,
    )
    this.name = 'InvalidNoShowActionError'
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

// ─── cancelSession (US-039) ─────────────────────────────────────────────────────

/**
 * Append a cancellation reason to the session's existing notes, if one is given.
 * Same append-only contract as noShowNotesPatch — never overwrites prior notes,
 * and is a no-op (no `notes` key at all) for a blank/absent reason.
 */
function cancelNotesPatch(
  currentNotes: string | null,
  reason?: string | null,
): { notes?: string | null } {
  const trimmed = reason?.trim()
  if (!trimmed) return {}
  const entry = `Cancelled: ${trimmed}`
  return { notes: currentNotes ? `${currentNotes}\n${entry}` : entry }
}

/**
 * Cancel a session (client/trainer cannot or will not attend — recorded before
 * the session happens, unlike no-show which is recorded after).
 *
 * Guards applied in order (identical to completeSession/markNoShow):
 *  1. Version check — rejects stale reads (optimistic concurrency).
 *  2. Immutable-state check — only scheduled/confirmed may transition.
 *
 * Financial rule (US-039 — approved design, see the module-level doc comment):
 * cancellation has NO financial effect, for any billing mode. It never calls
 * resolveBillingMode, consumeForSession, findInvoiceBySession, createInvoice, or
 * submitSalesInvoice — the patch it writes never includes `invoiceId` or
 * `sessionConsumedPackage`, so any existing value on the row (there normally
 * isn't one pre-completion, but this holds regardless) is left completely
 * untouched, never voided/refunded/credited/deleted.
 *
 * `reason` is optional free text appended to the session's existing notes —
 * same append-only contract as markNoShow's reason capture.
 */
export async function cancelSession(
  deps: CompletionDeps,
  id: string,
  expectedVersion: number,
  reason?: string | null,
): Promise<FDSession> {
  const current = await deps.findSessionById(id)

  // Guard 1: optimistic concurrency
  if (current.version !== expectedVersion) {
    throw new VersionConflictError(id)
  }

  // Guard 2: terminal-state check — only scheduled/confirmed may be cancelled
  if (!MUTABLE_STATUSES.includes(current.status)) {
    throw new ImmutableSessionError(id, current.status)
  }

  return deps.updateSession(id, {
    status:  'cancelled',
    version: expectedVersion + 1,
    ...cancelNotesPatch(current.notes, reason),
  })
}

// ─── markNoShow (US-017) ───────────────────────────────────────────────────────

/**
 * Append a no-show reason to the session's existing notes, if one is given.
 * Returns an empty patch (no `notes` key at all) when no reason is supplied, so
 * a no-show call without a reason never touches the notes field — the model's
 * only free-text field is never overwritten, only appended to.
 */
function noShowNotesPatch(
  currentNotes: string | null,
  reason?: string | null,
): { notes?: string | null } {
  const trimmed = reason?.trim()
  if (!trimmed) return {}
  const entry = `No-show: ${trimmed}`
  return { notes: currentNotes ? `${currentNotes}\n${entry}` : entry }
}

/**
 * Mark a session as no-show (client did not attend).
 *
 * Guards applied in order (identical to completeSession):
 *  1. Version check — rejects stale reads (optimistic concurrency).
 *  2. Immutable-state check — only scheduled/confirmed may transition.
 *
 * Financial dispatch — see the module-level doc comment for the full approved
 * design. Reuses the exact same PPS invoice path (invoice-first, idempotent via
 * findInvoiceBySession) and package path (ledger-first, idempotent via
 * consumeForSession) that completeSession already uses — no new ERP surface.
 *
 * `reason` is optional free text (e.g. "client didn't show, no call") appended to
 * the session's existing notes — the only capture mechanism the current FD Session
 * model supports; never overwrites prior notes.
 */
export async function markNoShow(
  deps: CompletionDeps,
  id: string,
  expectedVersion: number,
  financialAction: NoShowFinancialAction,
  reason?: string | null,
): Promise<FDSession> {
  const current = await deps.findSessionById(id)

  // Guard 1: optimistic concurrency
  if (current.version !== expectedVersion) {
    throw new VersionConflictError(id)
  }

  // Guard 2: terminal-state check — only scheduled/confirmed may become no_show
  if (!MUTABLE_STATUSES.includes(current.status)) {
    throw new ImmutableSessionError(id, current.status)
  }

  // Trial flag takes priority — no billing lookup, no charge, regardless of the
  // requested financialAction (mirrors completeSession's trial-wins-first dispatch).
  if (current.isTrialSession) {
    return deps.updateSession(id, {
      status:  'no_show',
      version: expectedVersion + 1,
      ...noShowNotesPatch(current.notes, reason),
    })
  }

  const billingMode = await deps.resolveBillingMode(current.clientId)

  if (!billingMode || billingMode === 'unset') {
    throw new BillingNotConfiguredError(current.clientId)
  }

  if (billingMode === 'pay_per_session') {
    if (financialAction === 'deduct') {
      throw new InvalidNoShowActionError(id, financialAction, billingMode)
    }

    if (financialAction === 'waive') {
      return deps.updateSession(id, {
        status:  'no_show',
        version: expectedVersion + 1,
        ...noShowNotesPatch(current.notes, reason),
      })
    }

    // financialAction === 'charge' — identical idempotent invoice path as completeSession.
    if (!current.rate || current.rate <= 0) {
      throw new SessionRateNotConfiguredError(id)
    }

    let invoice = await deps.findInvoiceBySession(id)

    if (invoice !== null) {
      if (invoice.status === 'cancelled') {
        throw new Error(
          `FD Session ${id} has a cancelled Sales Invoice (${invoice.id}). ` +
          'Cancel and re-book this session to issue a new invoice.',
        )
      }
      if (invoice.status === 'draft') {
        invoice = await deps.submitSalesInvoice(invoice.id)
      }
      // Any other status (sent, paid, overdue, partially_paid) → reuse as-is.
    } else {
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

    return deps.updateSession(id, {
      status:    'no_show',
      invoiceId: invoice.id,
      version:   expectedVersion + 1,
      ...noShowNotesPatch(current.notes, reason),
    })
  }

  if (billingMode === 'package') {
    if (financialAction === 'charge') {
      throw new InvalidNoShowActionError(id, financialAction, billingMode)
    }

    if (financialAction === 'waive') {
      return deps.updateSession(id, {
        status:  'no_show',
        version: expectedVersion + 1,
        ...noShowNotesPatch(current.notes, reason),
      })
    }

    // financialAction === 'deduct' — identical ledger-first idempotent path as completeSession.
    // Never creates an invoice — packages are pre-paid.
    if (current.sessionConsumedPackage) {
      return deps.updateSession(id, {
        status:                 'no_show',
        sessionConsumedPackage: true,
        version:                expectedVersion + 1,
        ...noShowNotesPatch(current.notes, reason),
      })
    }

    const { outcome } = await deps.consumeForSession({
      sessionId:     id,
      erpCustomerId: current.clientId,
    })

    if (outcome === 'no_package' || outcome === 'no_balance') {
      throw new NoPackageBalanceError(current.clientId)
    }

    // consumed or already_done — both safe to proceed
    return deps.updateSession(id, {
      status:                 'no_show',
      sessionConsumedPackage: true,
      version:                expectedVersion + 1,
      ...noShowNotesPatch(current.notes, reason),
    })
  }

  // Defensive fallback: any unknown/reserved billing mode fails closed
  throw new BillingNotConfiguredError(current.clientId)
}
