'use server'

/**
 * Server actions for FD Session scheduling.
 *
 * C2 scope: list + config.
 * C3 scope: +buildPlanAction (server-side plan preview), +bookPlanAction (create sessions).
 * C4B scope: +completeSessionAction (trial + billing dispatch shell).
 * US-017 scope: +markNoShowAction (trial/PPS/package financial dispatch — see
 *   docs/execution/phase-1-plus-safe-run-plan.md for the approved design).
 * US-039 scope: +cancelSessionAction (financially inert — see the same doc).
 *
 * Not included (deferred to a later US-039 increment):
 *   rescheduleSessionAction
 *
 * Auth: uses resolveTrainerId() from lib/auth/resolve-trainer (same pattern
 * as other FitDesk server actions) so all ERP queries are automatically
 * scoped to the authenticated trainer's ERP tenant.
 */

import { DateTime } from 'luxon'
import { db } from '@/lib/db'
import { resolveTrainerId } from '@/lib/auth/resolve-trainer'
import { getTenantContext } from '@/lib/tenant/context'
import { ClientRepository, type TenantCtx } from '@/lib/clients/repository'
import { PackageLedgerRepository } from '@/lib/billing/package-ledger-repository'
import { buildBookingPlan } from '@/lib/scheduling/engine'
import {
  findSessionsInRange,
  findSessionById,
  updateSession,
} from '@/lib/scheduling/sessionRepository'
import { getTrainerConfig } from '@/lib/scheduling/trainerConfig'
import {
  bookFromPlan,
  ConflictError,
  OutOfHoursError,
  type BookFromPlanResult,
} from '@/lib/scheduling/bookingService'
import { PackageConsumptionService } from '@/lib/billing/package-consumption-service'
import {
  completeSession,
  markNoShow,
  cancelSession,
  BillingNotConfiguredError,
  PayPerSessionCompletionDeferredError,
  PackageCompletionNotReadyError,
  NoPackageBalanceError,
  SessionRateNotConfiguredError,
  InvalidNoShowActionError,
  VersionConflictError,
  ImmutableSessionError,
  type CompletionDeps,
  type NoShowFinancialAction,
} from '@/lib/scheduling/sessionCompletionService'
import {
  previewSessionCompletion,
  type SessionCompletionPreview,
} from '@/lib/scheduling/sessionCompletionPreview'
import {
  findInvoiceBySession,
  createInvoice,
  submitSalesInvoice,
} from '@/lib/erpnext/client'
import { buildSessionInvoicePayload } from '@/lib/scheduling/sessionInvoiceBuilder'
import type { BookingPlan, FDSession, TrainerConfig } from '@/types/scheduling'

// ─── Result types ─────────────────────────────────────────────────────────────

export type SchedulingErrorCode =
  | 'AUTH'
  | 'CONFLICT'
  | 'OUT_OF_HOURS'
  | 'EMPTY_PLAN'
  | 'BILLING_NOT_CONFIGURED'
  | 'VERSION_CONFLICT'
  | 'IMMUTABLE_STATUS'
  | 'PPS_DEFERRED'
  | 'PACKAGE_NOT_READY'
  | 'NO_PACKAGE_BALANCE'
  | 'SESSION_RATE_NOT_CONFIGURED'
  | 'INVALID_NO_SHOW_ACTION'
  | 'ERR'

export type SchedulingResult<T> =
  | { success: true;  data: T }
  | { success: false; code: SchedulingErrorCode; message: string }

// ─── Error mapper ─────────────────────────────────────────────────────────────

function mapError<T>(err: unknown): SchedulingResult<T> {
  if (err instanceof ConflictError) {
    return {
      success: false,
      code:    'CONFLICT',
      message: `${err.conflicts.length} session(s) conflict with existing bookings`,
    }
  }
  if (err instanceof OutOfHoursError) {
    return {
      success: false,
      code:    'OUT_OF_HOURS',
      message: err.violations[0]?.reason ?? 'Session falls outside working hours',
    }
  }
  if (err instanceof BillingNotConfiguredError) {
    return { success: false, code: 'BILLING_NOT_CONFIGURED', message: err.message }
  }
  if (err instanceof PayPerSessionCompletionDeferredError) {
    return { success: false, code: 'PPS_DEFERRED', message: err.message }
  }
  if (err instanceof PackageCompletionNotReadyError) {
    return { success: false, code: 'PACKAGE_NOT_READY', message: err.message }
  }
  if (err instanceof NoPackageBalanceError) {
    return { success: false, code: 'NO_PACKAGE_BALANCE', message: err.message }
  }
  if (err instanceof SessionRateNotConfiguredError) {
    return { success: false, code: 'SESSION_RATE_NOT_CONFIGURED', message: err.message }
  }
  if (err instanceof InvalidNoShowActionError) {
    return { success: false, code: 'INVALID_NO_SHOW_ACTION', message: err.message }
  }
  if (err instanceof VersionConflictError) {
    return { success: false, code: 'VERSION_CONFLICT', message: err.message }
  }
  if (err instanceof ImmutableSessionError) {
    return { success: false, code: 'IMMUTABLE_STATUS', message: err.message }
  }
  return {
    success: false,
    code:    'ERR',
    message: err instanceof Error ? err.message : 'An unexpected error occurred',
  }
}

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Return the FitDesk Trainer Settings (working hours, timezone, buffer) for
 * the authenticated trainer. Used by the schedule page to pass timezone to the
 * calendar and by booking actions for availability checking.
 */
export async function getSchedulerConfig(): Promise<SchedulingResult<TrainerConfig>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) {
    return { success: false, code: 'AUTH', message: resolved.error }
  }
  try {
    const config = await getTrainerConfig(resolved.trainerId)
    return { success: true, data: config }
  } catch (err) {
    return mapError(err)
  }
}

/**
 * List non-cancelled FD Sessions for the authenticated trainer in a rolling
 * window: 7 days ago → 90 days from now (UTC).
 *
 * Used by the schedule page on initial load and by ScheduleView.reconcile()
 * after a booking mutation.
 *
 * Trainer ownership is enforced at the ERP proxy layer: the Frappe filter
 * includes `trainer_id = <trainerId>` and every ERP call is signed with a
 * tenant JWT that scopes it to this trainer's workspace.
 */
export async function listFDSessionsAction(): Promise<SchedulingResult<FDSession[]>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) {
    return { success: false, code: 'AUTH', message: resolved.error }
  }
  try {
    const now     = new Date()
    const startAt = new Date(now.getTime() -  7 * 86_400_000)
    const endAt   = new Date(now.getTime() + 90 * 86_400_000)
    const sessions = await findSessionsInRange(resolved.trainerId, startAt, endAt)
    return { success: true, data: sessions }
  } catch (err) {
    return mapError(err)
  }
}

/**
 * Build a BookingPlan for the selected slots and return it to the client.
 *
 * This is a read-only preview action — nothing is persisted.  The plan is
 * built server-side so conflict detection uses fresh session data from ERP.
 *
 * @param selectedSlots  Calendar cells the trainer has clicked.
 * @param clientId       ERPNext Customer docname.
 * @param durationMinutes Session length in minutes.
 * @param recurrenceWeeks null = one-off; positive int = repeat for N weeks.
 */
export async function buildPlanAction(input: {
  selectedSlots:    Array<{ localDate: string; localTime: string }>
  clientId:         string
  durationMinutes:  number
  recurrenceWeeks:  number | null
}): Promise<SchedulingResult<BookingPlan>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) {
    return { success: false, code: 'AUTH', message: resolved.error }
  }

  if (input.selectedSlots.length === 0) {
    return { success: false, code: 'EMPTY_PLAN', message: 'No slots selected' }
  }

  try {
    const config = await getTrainerConfig(resolved.trainerId)

    // Derive fetch window from the earliest slot with timezone-aware start-of-day.
    // Using the trainer's timezone ensures morning sessions in UTC+ zones are
    // not excluded from conflict detection due to UTC date boundary crossings.
    const sortedDates = [...input.selectedSlots].map(s => s.localDate).sort()
    const windowStart = DateTime.fromISO(sortedDates[0], { zone: config.timezone })
      .startOf('day')
      .toUTC()
      .toJSDate()
    // 12 weeks + 1 day covers the full recurrence window
    const windowEnd = new Date(windowStart.getTime() + (12 * 7 + 1) * 86_400_000)

    const existingSessions = await findSessionsInRange(resolved.trainerId, windowStart, windowEnd)
    const existingIntervals = existingSessions.map(s => ({
      startAt: s.startAt,
      endAt:   s.endAt,
    }))

    const plan = buildBookingPlan({
      selectedSlots:    input.selectedSlots,
      trainerId:        resolved.trainerId,
      clientId:         input.clientId,
      durationMinutes:  input.durationMinutes,
      timezone:         config.timezone,
      recurrenceWeeks:  input.recurrenceWeeks,
      config,
      existingSessions: existingIntervals,
    })

    return { success: true, data: plan }
  } catch (err) {
    return mapError(err)
  }
}

/**
 * Book a plan produced by buildPlanAction (or buildBookingPlan on the client).
 *
 * The service re-verifies the plan server-side against a fresh narrow-window
 * fetch — the client-computed plan is not trusted for authorization.
 *
 * No package consumption, no invoice creation, no payment. Those are C4/C7.
 *
 * @param plan        BookingPlan from buildPlanAction / buildBookingPlan.
 * @param rate        Session fee per occurrence (stored on each FD Session doc).
 * @param sessionType Optional session type label (e.g. 'Strength').
 * @param notes       Optional free-text notes for all occurrences.
 */
export async function bookPlanAction(
  plan:         BookingPlan,
  rate:         number,
  sessionType?: string | null,
  notes?:       string | null,
): Promise<SchedulingResult<BookFromPlanResult>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) {
    return { success: false, code: 'AUTH', message: resolved.error }
  }

  if (plan.occurrences.length === 0) {
    return { success: false, code: 'EMPTY_PLAN', message: 'Plan has no occurrences' }
  }

  try {
    const config = await getTrainerConfig(resolved.trainerId)
    const result = await bookFromPlan(plan, config, rate, sessionType, notes)
    return { success: true, data: result }
  } catch (err) {
    return mapError(err)
  }
}

/**
 * Builds the CompletionDeps object completeSession()/markNoShow()/cancelSession()
 * need, scoped to one resolved tenant/user. Shared by completeSessionAction,
 * batchCompleteSessionsAction, markNoShowAction, and cancelSessionAction so all
 * four go through the exact same billing/ERP dispatch — one definition of "how a
 * session outcome mutates billing", not several that could drift apart.
 * (cancelSessionAction never actually exercises the billing/invoice/package
 * dependencies — cancellation is financially inert — but reuses the same deps
 * object for consistency, not because it needs them.)
 */
function buildCompletionDeps(tenantCtx: TenantCtx, userId: string | null): CompletionDeps {
  return {
    findSessionById,
    updateSession,
    resolveBillingMode: async (clientId) => {
      const client = await new ClientRepository(db).findClientByErpId(tenantCtx, clientId)
      return client?.billingMode ?? null
    },
    consumeForSession: async ({ sessionId, erpCustomerId }) => {
      const client = await new ClientRepository(db).findClientByErpId(tenantCtx, erpCustomerId)
      if (!client) {
        throw new BillingNotConfiguredError(erpCustomerId)
      }
      const svc = new PackageConsumptionService(db)
      const res = await svc.consumeSession(tenantCtx, {
        sessionId,
        clientIndexId:    client.id,
        erpCustomerId:    client.erpCustomerId,
        consumedByUserId: userId,
      })
      return { outcome: res.outcome }
    },
    // Pay-per-session invoice deps (C7C)
    findInvoiceBySession,
    buildSessionInvoicePayload,
    createInvoice,
    submitSalesInvoice,
    getPostingDate: () => new Date().toISOString().slice(0, 10),
  }
}

/**
 * Mark an FD Session as completed.
 *
 * Dispatch:
 *   - Trial (isTrialSession=true): status flip only — no billing, no ledger.
 *   - Package: ledger-first package consumption (C4C) → PACKAGE_NOT_READY / NO_PACKAGE_BALANCE.
 *   - Pay-per-session (C7C): creates+submits one Sales Invoice, then writes status+invoiceId.
 *     Idempotent: existing invoice found via custom_fd_session anchor → reused, not duplicated.
 *     Missing/zero rate → SESSION_RATE_NOT_CONFIGURED.
 *   - Unset or missing billing mode → BILLING_NOT_CONFIGURED.
 *
 * Guards: version check (VERSION_CONFLICT) + mutable-state check (IMMUTABLE_STATUS).
 *
 * No payment entries. No manual invoice UI.
 */
export async function completeSessionAction(
  id:              string,
  expectedVersion: number,
): Promise<SchedulingResult<FDSession>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) {
    return { success: false, code: 'AUTH', message: resolved.error }
  }

  const ctx = await getTenantContext()
  if (!ctx?.tenantId) {
    return { success: false, code: 'ERR', message: 'Workspace not provisioned' }
  }

  const tenantCtx = { tenantId: ctx.tenantId }

  try {
    const result = await completeSession(
      buildCompletionDeps(tenantCtx, ctx.userId ?? null),
      id,
      expectedVersion,
    )
    return { success: true, data: result }
  } catch (err) {
    return mapError(err)
  }
}

/**
 * Mark an FD Session as no-show (US-017).
 *
 * `financialAction` is validated against the client's billing mode by markNoShow:
 *   - pay-per-session: 'charge' (issues the session invoice via the same idempotent
 *     path completion uses) or 'waive' (status flip only). 'deduct' → INVALID_NO_SHOW_ACTION.
 *   - package: 'deduct' (ledger-first package consumption, never an invoice) or
 *     'waive' (status flip only). 'charge' → INVALID_NO_SHOW_ACTION.
 *   - Trial sessions ignore financialAction entirely — status flip only, no charge.
 *
 * `reason` is optional free text appended to the session's existing notes (never
 * overwritten) — the only outcome-reason capture the current FD Session model
 * supports.
 *
 * Guards: version check (VERSION_CONFLICT) + mutable-state check (IMMUTABLE_STATUS),
 * identical to completeSessionAction.
 */
export async function markNoShowAction(
  id:              string,
  expectedVersion: number,
  financialAction: NoShowFinancialAction,
  reason?:         string | null,
): Promise<SchedulingResult<FDSession>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) {
    return { success: false, code: 'AUTH', message: resolved.error }
  }

  const ctx = await getTenantContext()
  if (!ctx?.tenantId) {
    return { success: false, code: 'ERR', message: 'Workspace not provisioned' }
  }

  const tenantCtx = { tenantId: ctx.tenantId }

  try {
    const result = await markNoShow(
      buildCompletionDeps(tenantCtx, ctx.userId ?? null),
      id,
      expectedVersion,
      financialAction,
      reason,
    )
    return { success: true, data: result }
  } catch (err) {
    return mapError(err)
  }
}

/**
 * Cancel an FD Session (US-039).
 *
 * Financially inert by construction: cancelSession never resolves billing mode,
 * never touches the package ledger, and never creates/submits/voids an invoice.
 * The patch it writes never includes `invoiceId` or `sessionConsumedPackage` — any
 * existing value on the row (there normally isn't one pre-completion, but this
 * holds regardless of billing mode or trial status) is left completely untouched.
 *
 * `reason` is optional free text appended to the session's existing notes (never
 * overwritten) — same capture mechanism as markNoShowAction.
 *
 * Guards: version check (VERSION_CONFLICT) + mutable-state check (IMMUTABLE_STATUS),
 * identical to completeSessionAction/markNoShowAction — only scheduled/confirmed
 * sessions may be cancelled.
 */
export async function cancelSessionAction(
  id:              string,
  expectedVersion: number,
  reason?:         string | null,
): Promise<SchedulingResult<FDSession>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) {
    return { success: false, code: 'AUTH', message: resolved.error }
  }

  const ctx = await getTenantContext()
  if (!ctx?.tenantId) {
    return { success: false, code: 'ERR', message: 'Workspace not provisioned' }
  }

  const tenantCtx = { tenantId: ctx.tenantId }

  try {
    const result = await cancelSession(
      buildCompletionDeps(tenantCtx, ctx.userId ?? null),
      id,
      expectedVersion,
      reason,
    )
    return { success: true, data: result }
  } catch (err) {
    return mapError(err)
  }
}

// ─── US-057 — Unresolved Sessions Batch Resolution ─────────────────────────────

export interface UnresolvedSessionPreviewItem {
  id:       string
  preview?: SessionCompletionPreview
  code?:    SchedulingErrorCode
  message?: string
}

/**
 * Read-only preview of what completing each given session would do —
 * billing mode, and for package mode the client's total balance across all
 * active purchases, for pay-per-session the session's own rate. No mutation.
 * Used by the batch-resolve UI to show financial consequences before the
 * trainer confirms (US-057 acceptance criterion).
 *
 * Auth/tenant resolution failures fail the whole call (nothing to preview
 * per-item yet). Once resolved, each sessionId is previewed independently —
 * one session failing to preview (e.g. a stale/unknown id) is reported per
 * item via `code`/`message` with `preview` absent; it does not abort the
 * rest of the batch, matching batchCompleteSessionsAction's own per-item
 * isolation.
 */
export async function previewBatchCompletionAction(
  sessionIds: string[],
): Promise<SchedulingResult<UnresolvedSessionPreviewItem[]>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) {
    return { success: false, code: 'AUTH', message: resolved.error }
  }

  const ctx = await getTenantContext()
  if (!ctx?.tenantId) {
    return { success: false, code: 'ERR', message: 'Workspace not provisioned' }
  }
  const tenantCtx = { tenantId: ctx.tenantId }

  const clientRepo = new ClientRepository(db)
  const ledgerRepo = new PackageLedgerRepository(db)

  const items: UnresolvedSessionPreviewItem[] = []
  for (const id of sessionIds) {
    try {
      const session = await findSessionById(id)
      const client  = await clientRepo.findClientByErpId(tenantCtx, session.clientId)
      const billingMode = client?.billingMode ?? null

      let totalPackageBalance = 0
      // Skip the balance lookup entirely for trial sessions — trial wins over
      // billing mode in previewSessionCompletion (mirrors completeSession's own
      // dispatch order), so the balance would never be used. Avoids an
      // unnecessary DB round-trip for every trial session in a batch.
      if (!session.isTrialSession && billingMode === 'package' && client) {
        const balances = await ledgerRepo.deriveBalancesByClient(tenantCtx, client.id)
        totalPackageBalance = Object.values(balances).reduce((sum, b) => sum + b, 0)
      }

      items.push({
        id,
        preview: previewSessionCompletion({
          isTrialSession:         session.isTrialSession,
          billingMode,
          rate:                   session.rate,
          currency:               'USD', // FDSession carries no currency field; matches the app-wide USD default (e.g. lib/whish.ts's generatePaymentLink).
          sessionConsumedPackage: session.sessionConsumedPackage,
          totalPackageBalance,
        }),
      })
    } catch (err) {
      // Mirrors batchCompleteSessionsAction's per-item isolation: one bad
      // sessionId (stale/unknown id, lookup failure) is reported on this
      // item only, not thrown out of the loop.
      const mapped = mapError<never>(err)
      if (mapped.success) continue // unreachable; satisfies the type checker
      items.push({ id, code: mapped.code, message: mapped.message })
    }
  }
  return { success: true, data: items }
}

export interface BatchCompletionItemResult {
  id:      string
  success: boolean
  data?:   FDSession
  code?:   SchedulingErrorCode
  message?: string
}

/**
 * Complete one or more sessions in a single call (US-057 "batch resolve").
 *
 * Resolves auth/tenant once, then calls the SAME completeSession() used by
 * completeSessionAction sequentially per item — not Promise.all. Sequential
 * matters for two reasons: it keeps writes to the same client's package
 * ledger from racing each other, and it is what makes the duplicate-id
 * guarantee below hold deterministically (each call re-reads fresh session
 * state via findSessionById before mutating).
 *
 * Duplicate-prevention: if the same session id appears more than once in
 * `items` (accidental double-submit, or a bug in the caller), only the FIRST
 * occurrence can succeed — completeSession() re-fetches the session at the
 * top of every call, so by the time the second occurrence runs, the session
 * is already 'completed' and MUTABLE_STATUSES no longer includes it, so it
 * fails closed with ImmutableSessionError (or VersionConflictError, if the
 * caller passed the same now-stale expectedVersion for both). Either way:
 * never a second package consumption, never a second invoice. The same
 * guarantee holds across two separate calls to this action with the same
 * items (e.g. a retried submit) — proven in
 * actions/schedulingActions.test.ts's duplicate-prevention block.
 *
 * One item failing (any reason) does not abort the rest of the batch —
 * results are collected per item so the UI can show exactly which sessions
 * resolved and which need another look.
 */
export async function batchCompleteSessionsAction(
  items: Array<{ id: string; expectedVersion: number }>,
): Promise<SchedulingResult<BatchCompletionItemResult[]>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) {
    return { success: false, code: 'AUTH', message: resolved.error }
  }

  const ctx = await getTenantContext()
  if (!ctx?.tenantId) {
    return { success: false, code: 'ERR', message: 'Workspace not provisioned' }
  }
  const tenantCtx = { tenantId: ctx.tenantId }
  const deps = buildCompletionDeps(tenantCtx, ctx.userId ?? null)

  const results: BatchCompletionItemResult[] = []
  for (const item of items) {
    try {
      const data = await completeSession(deps, item.id, item.expectedVersion)
      results.push({ id: item.id, success: true, data })
    } catch (err) {
      // completeSession() only ever throws, so mapError() always returns its
      // failure branch here — narrow explicitly rather than relying on that
      // invariant silently.
      const mapped = mapError<FDSession>(err)
      if (mapped.success) continue // unreachable; satisfies the type checker
      results.push({ id: item.id, success: false, code: mapped.code, message: mapped.message })
    }
  }

  return { success: true, data: results }
}
