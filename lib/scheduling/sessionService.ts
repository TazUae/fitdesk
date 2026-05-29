/**
 * Session service — single-session edit operations.
 *
 * Covers reschedule (one occurrence override) and cancellation.
 * All mutations go through the repository; all checks use the shared engine.
 */
import 'server-only'

import {
  resolveToUtc,
  detectConflict,
  checkAvailability,
} from '@/lib/scheduling/engine'
import {
  findSessionById,
  findSessionsInRange,
  updateSession,
  cancelSession as repositoryCancelSession,
} from '@/lib/scheduling/sessionRepository'
import { ConflictError, OutOfHoursError } from '@/lib/scheduling/bookingService'
import { createInvoice, submitSalesInvoice, getClientById } from '@/lib/erpnext/client'
import type {
  FDSession,
  FDSessionStatus,
  Interval,
  Occurrence,
  TrainerConfig,
} from '@/types/scheduling'

// Item docname provisioned by provisioning_api/api/fitdesk_setup.py.
// Required to exist in ERPNext before a session can be completed.
const TRAINING_SESSION_ITEM_CODE = 'TRAINING-SESSION'

// ─── Error types ──────────────────────────────────────────────────────────────

/** Thrown when the caller's expectedVersion does not match the stored version. */
export class VersionConflictError extends Error {
  constructor(id: string) {
    super(`Session ${id} was modified by another request — reload and try again`)
    this.name = 'VersionConflictError'
  }
}

/** Thrown when attempting to mutate a session whose status prevents it. */
export class ImmutableSessionError extends Error {
  constructor(id: string, public readonly status: FDSessionStatus) {
    super(`Session ${id} cannot be modified: status is '${status}'`)
    this.name = 'ImmutableSessionError'
  }
}

/** Thrown when the client has no billing mode — set one before completing sessions. */
export class BillingNotConfiguredError extends Error {
  constructor(public readonly clientId: string) {
    super(`Client ${clientId} has no billing mode configured — set a billing mode before completing sessions`)
    this.name = 'BillingNotConfiguredError'
  }
}

/** Thrown when the session rate is zero or missing (Pay Per Session only). */
export class SessionRateNotConfiguredError extends Error {
  constructor(public readonly sessionId: string) {
    super(`Session ${sessionId} has no rate configured — set a session rate before completing`)
    this.name = 'SessionRateNotConfiguredError'
  }
}

/** Thrown when attempting to complete a Package session (not yet supported). */
export class PackageCompletionNotReadyError extends Error {
  constructor(public readonly clientId: string) {
    super(`Package session completion is not yet supported for client ${clientId}`)
    this.name = 'PackageCompletionNotReadyError'
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const MUTABLE_STATUSES: FDSessionStatus[] = ['scheduled', 'confirmed']

function assertMutable(session: FDSession): void {
  if (!MUTABLE_STATUSES.includes(session.status)) {
    throw new ImmutableSessionError(session.id, session.status)
  }
}

function buildOccurrenceStub(
  localDate: string,
  localTime: string,
  startAt: Date,
  endAt: Date,
  index: number,
): Occurrence {
  return {
    occurrenceKey:   `${localDate}:${localTime}`,
    occurrenceIndex: index,
    startAt,
    endAt,
    localDate,
    localTime,
  }
}

// ─── rescheduleOne ────────────────────────────────────────────────────────────

/**
 * Move a single FD Session to a new local date and time.
 *
 * Guards applied in order:
 *  1. Version check — rejects stale reads (optimistic concurrency).
 *  2. Immutable-state check — rejects completed / cancelled / no_show / skipped.
 *  3. DST check — rejects times that don't exist (spring-forward gap).
 *  4. Conflict re-check — narrow window fetch, current session excluded.
 *  5. Availability re-check — must still fall inside working hours.
 *
 * On success the stored doc has isOverride=true and version incremented by 1,
 * which signals to series-edit logic that this occurrence was individually moved.
 *
 * @param id              FD Session docname.
 * @param input.newDate   New local date (YYYY-MM-DD) in config.timezone.
 * @param input.newTime   New local time (HH:mm) in config.timezone.
 * @param input.expectedVersion  Caller's snapshot of the session version.
 * @param config          Phase 1 TrainerConfig.
 */
export async function rescheduleOne(
  id: string,
  input: {
    newDate:         string
    newTime:         string
    expectedVersion: number
    newRate?:        number
  },
  config: TrainerConfig,
): Promise<FDSession> {
  // ── 1. Fetch + version guard ───────────────────────────────────────────────
  const current = await findSessionById(id)

  if (current.version !== input.expectedVersion) {
    throw new VersionConflictError(id)
  }

  // ── 2. Immutable-state guard ───────────────────────────────────────────────
  assertMutable(current)

  // ── 3. Resolve new UTC times (throws 'DST_SKIP' for spring-forward gap) ──
  let newStartAt: Date
  try {
    newStartAt = resolveToUtc(input.newDate, input.newTime, config.timezone)
  } catch (err) {
    if (err instanceof Error && err.message === 'DST_SKIP') {
      throw new Error(
        `${input.newTime} on ${input.newDate} does not exist in timezone ${config.timezone} (DST spring-forward)`,
      )
    }
    throw err
  }

  const newEndAt = new Date(newStartAt.getTime() + current.durationMinutes * 60_000)

  // ── 4. Narrow-window conflict check (excluding this session) ──────────────
  const bufferMs = config.bufferMinutes * 60_000
  const winStart = new Date(newStartAt.getTime() - bufferMs)
  const winEnd   = new Date(newEndAt.getTime()   + bufferMs)

  const nearby = await findSessionsInRange(config.trainerId, winStart, winEnd)
  const existingIntervals: Interval[] = nearby
    .filter(s => s.id !== id)
    .map(s => ({ startAt: s.startAt, endAt: s.endAt }))

  const conflictKind = detectConflict(
    { startAt: newStartAt, endAt: newEndAt },
    existingIntervals,
    bufferMs,
  )
  if (conflictKind !== null) {
    const stub = buildOccurrenceStub(
      input.newDate,
      input.newTime,
      newStartAt,
      newEndAt,
      current.occurrenceIndex ?? 0,
    )
    throw new ConflictError([{ occurrence: stub, kind: conflictKind }])
  }

  // ── 5. Availability re-check ──────────────────────────────────────────────
  const reason = checkAvailability({ startAt: newStartAt, endAt: newEndAt }, config)
  if (reason) {
    const stub = buildOccurrenceStub(
      input.newDate,
      input.newTime,
      newStartAt,
      newEndAt,
      current.occurrenceIndex ?? 0,
    )
    throw new OutOfHoursError([{ occurrence: stub, reason }])
  }

  // ── 6. Persist ────────────────────────────────────────────────────────────
  return updateSession(id, {
    startAt:    newStartAt,
    endAt:      newEndAt,
    isOverride: true,
    version:    input.expectedVersion + 1,
    ...(input.newRate !== undefined && { rate: input.newRate }),
  })
}

// ─── cancelSession ────────────────────────────────────────────────────────────

/**
 * Cancel a scheduled or confirmed session.
 *
 * Guards:
 *  1. Version check — rejects stale reads.
 *  2. Immutable-state check — rejects already-terminal statuses.
 *
 * Sets status='cancelled' on the doc; the row is retained for audit history.
 */
export async function cancelSession(
  id: string,
  expectedVersion: number,
): Promise<FDSession> {
  const current = await findSessionById(id)

  if (current.version !== expectedVersion) {
    throw new VersionConflictError(id)
  }

  assertMutable(current)

  return repositoryCancelSession(id)
}

// ─── completeSession ──────────────────────────────────────────────────────────

/**
 * Mark a session as completed, creating and submitting a collectible
 * Sales Invoice when the client's billing mode requires it.
 *
 * Billing-mode dispatch:
 *  - Pay Per Session: create a draft Invoice, submit it so it is payable,
 *    then flip the session to 'completed'. Idempotent: if the session
 *    already carries an invoiceId the existing invoice is reused and
 *    submission is skipped (assumed already submitted).
 *  - Trial: flip the session to 'completed' with no invoice — no charge.
 *  - Package: throws PackageCompletionNotReadyError — package-balance
 *    decrement is not yet implemented.
 *
 * Guards (applied before any side effects):
 *  1. Version check — rejects stale reads.
 *  2. Immutable-state check — only scheduled / confirmed may transition.
 *  3. Billing-mode check — missing mode → BillingNotConfiguredError;
 *     zero/missing rate (Pay Per Session) → SessionRateNotConfiguredError.
 *
 * Order matters: the invoice is created and submitted BEFORE the status
 * flip so that a failure in ERPNext leaves the session in its mutable
 * state (retryable).
 */
export async function completeSession(
  id: string,
  expectedVersion: number,
): Promise<FDSession> {
  const current = await findSessionById(id)

  if (current.version !== expectedVersion) {
    throw new VersionConflictError(id)
  }

  assertMutable(current)

  // Resolve the client's billing mode — drives the invoice path.
  const client = await getClientById(current.clientId, current.trainerId)

  if (!client.billingMode) {
    throw new BillingNotConfiguredError(current.clientId)
  }

  if (client.billingMode === 'Package') {
    throw new PackageCompletionNotReadyError(current.clientId)
  }

  if (client.billingMode === 'Trial') {
    // Trial sessions carry no charge — complete without an invoice.
    return updateSession(id, { status: 'completed' })
  }

  // Pay Per Session: validate rate, then create + submit so the invoice is collectible.
  if (!current.rate || current.rate <= 0) {
    throw new SessionRateNotConfiguredError(id)
  }

  let invoiceId = current.invoiceId
  if (!invoiceId) {
    const today = new Date().toISOString().slice(0, 10)
    const invoice = await createInvoice({
      customer:     current.clientId,
      posting_date: today,
      due_date:     today,
      items: [{
        item_code:   TRAINING_SESSION_ITEM_CODE,
        qty:         1,
        rate:        current.rate,
        description: current.sessionType ?? 'Training session',
      }],
      remarks: `FitDesk session ${current.id}`,
    })
    invoiceId = invoice.id
    await submitSalesInvoice(invoiceId)
  }

  return updateSession(id, { status: 'completed', invoiceId })
}

// ─── markNoShow ───────────────────────────────────────────────────────────────

/**
 * Mark a session as no-show (client did not attend).
 *
 * Guards identical to completeSession. Status flip only in Phase A.
 */
export async function markNoShow(
  id: string,
  expectedVersion: number,
): Promise<FDSession> {
  const current = await findSessionById(id)

  if (current.version !== expectedVersion) {
    throw new VersionConflictError(id)
  }

  assertMutable(current)

  return updateSession(id, { status: 'no_show' })
}
