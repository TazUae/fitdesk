/**
 * Tenant-scoped, dry-run-only reconcile for the nextSessionAtUtc projection.
 *
 * Phase 5C scope: this module computes a reconcile RESULT — it never writes.
 * There is no write-mode code path here at all (not merely a default-off
 * flag): setClientNextSessionAtUtc, and every other repository write method,
 * is never called. Write mode is a separate, future phase.
 *
 * RULES:
 *  - Iterates existing client_index rows for the tenant only (repo.listClients,
 *    a read method). Reconcile does not create, match, or backfill ERP
 *    Customers — that remains backfill.ts's job.
 *  - FD Session data arrives via the injected fetchClientSessions callback
 *    only. This module never imports erpFetch or sessionRepository directly,
 *    so it cannot bypass the ERP proxy path and stores no ERP credentials.
 *  - Proposed changes are limited to the nextSessionAtUtc projection field —
 *    no other client_index column, and no sibling table (goals, events,
 *    action intents, packages, ledger), is ever inspected or proposed.
 *  - No deletion is ever proposed.
 *  - Per-client errors (e.g. a failing session fetch) are isolated into
 *    result.errors; they do not abort the run and do not clear an existing
 *    projection for that client.
 *
 * See: docs/plans/PHASE_5_CLIENT_RECONCILE_AND_NEXT_SESSION_PLAN.md
 */

import { deriveNextSessionAtUtc } from './nextSession'
import type { ClientRepository, TenantCtx } from './repository'
import type { FDSession } from '@/types/scheduling'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReconcileContext = {
  /** Canonical tenant isolation key from WorkspaceProvisioning.tenantId */
  tenantId: string
  /** Trainer whose FD Sessions are read — next-session is a trainer-scoped query. */
  trainerId: string
  /**
   * Reference instant used for the future/past comparison in
   * deriveNextSessionAtUtc. Defaults to `new Date()`; tests should pass a
   * fixed value for deterministic results.
   */
  now?: Date
}

/** A single proposed field change for one client. Read-only plan — never applied by this module. */
export type ReconcileProposedChange = {
  clientIndexId: string
  erpCustomerId: string
  /** Reconcile (Phase 5C) only ever proposes this one projection field. */
  field: 'nextSessionAtUtc'
  previousValue: string | null
  proposedValue: string | null
}

export type ReconcileError = {
  clientIndexId: string
  erpCustomerId: string
  reason: string
}

export type ReconcileResult = {
  tenantId: string
  trainerId: string
  /** Always true in Phase 5C — this module has no write-mode code path. */
  dryRun: true
  /** Total client_index rows examined for this tenant. */
  inspected: number
  /** Proposed changes where the derived value is a non-null timestamp. */
  projected: number
  /** Clients whose derived value already matches the stored value — no change proposed. */
  unchanged: number
  /** Proposed changes that would clear an existing value to null. */
  cleared: number
  /** Clients skipped due to a per-client error (session fetch failure, etc). */
  skipped: number
  changes: ReconcileProposedChange[]
  errors: ReconcileError[]
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Compute the dry-run nextSessionAtUtc reconcile plan for one tenant.
 *
 * @param repo                 Tenant-scoped repository (injectable for tests).
 * @param ctx                  Tenant + trainer context and run flags.
 * @param fetchClientSessions  Returns FD Sessions for one client (by erpCustomerId).
 *                             Injected so this module performs no ERP I/O itself —
 *                             production callers wrap sessionRepository.findSessionsForClient;
 *                             tests mock it directly.
 */
export async function reconcileTenantNextSessions(
  repo: ClientRepository,
  ctx: ReconcileContext,
  fetchClientSessions: (erpCustomerId: string) => Promise<FDSession[]>,
): Promise<ReconcileResult> {
  const now = ctx.now ?? new Date()

  const result: ReconcileResult = {
    tenantId:  ctx.tenantId,
    trainerId: ctx.trainerId,
    dryRun:    true,
    inspected: 0,
    projected: 0,
    unchanged: 0,
    cleared:   0,
    skipped:   0,
    changes:   [],
    errors:    [],
  }

  const tCtx: TenantCtx = { tenantId: ctx.tenantId }
  const clients = await repo.listClients(tCtx, { limit: 500 })

  for (const client of clients) {
    result.inspected++

    try {
      const sessions = await fetchClientSessions(client.erpCustomerId)
      const proposedValue = deriveNextSessionAtUtc(sessions, now)
      const previousValue = client.nextSessionAtUtc

      if (proposedValue === previousValue) {
        result.unchanged++
        continue
      }

      result.changes.push({
        clientIndexId: client.id,
        erpCustomerId: client.erpCustomerId,
        field:         'nextSessionAtUtc',
        previousValue,
        proposedValue,
      })

      if (proposedValue === null) {
        result.cleared++
      } else {
        result.projected++
      }
    } catch (err) {
      // Per-client isolation: a failing fetch must not clear an existing
      // projection and must not abort the rest of the tenant's reconcile.
      result.skipped++
      const reason = err instanceof Error ? err.message : String(err)
      result.errors.push({
        clientIndexId: client.id,
        erpCustomerId: client.erpCustomerId,
        reason,
      })
    }
  }

  return result
}
