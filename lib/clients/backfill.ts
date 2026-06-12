/**
 * Manual, idempotent per-tenant client backfill foundation.
 *
 * Phase 1: type contracts + function skeleton only.
 * Phase 2: fills in the ERP read loop using the existing ERP adapter/proxy path.
 *
 * RULES:
 *  - ERP Customers are read ONLY through the existing approved adapter/proxy path.
 *  - No direct ERP access. No ERP credentials stored here.
 *  - No ERP deletes. No DB reset. No destructive operations.
 *  - Idempotency: upsertClientFromBackfill checks (tenantId, erpCustomerId) before insert.
 *  - Run once per tenant before that tenant's Client Directory goes live.
 *  - Dry-run mode: logs what would be written without committing.
 *
 * See: docs/adr/ADR-001-client-management-erp-authoritative-hybrid.md §Backfill decision
 */

import { ClientRepository } from './repository'

// ─── Types ────────────────────────────────────────────────────────────────────

export type BackfillContext = {
  /** Canonical tenant isolation key from WorkspaceProvisioning.tenantId */
  tenantId: string
  /** When true, log actions without writing to the database. */
  dryRun?: boolean
}

export type BackfillResult = {
  inspected: number
  created: number
  updated: number
  skipped: number
  errors: BackfillError[]
}

export type BackfillError = {
  erpCustomerId: string
  reason: string
}

// ─── Phase 1 skeleton ─────────────────────────────────────────────────────────

/**
 * Backfill local client_index rows from ERPNext Customers for a given tenant.
 *
 * Phase 2 will implement the full ERP read loop:
 *   1. Read all ERP Customers for tenantId through the existing proxy path.
 *   2. For each Customer: normalize phone → upsertClientFromBackfill.
 *   3. If goal JSON parses cleanly, create/update client_goal.
 *   4. Write client_event: client.backfilled for each created row.
 *   5. Return BackfillResult with counts and any per-customer errors.
 *
 * Idempotency guarantee: calling this twice for the same tenant is safe —
 * upsertClientFromBackfill uses INSERT OR IGNORE via the unique (tenantId, erpCustomerId) index.
 */
export async function backfillTenantClients(
  _repo: ClientRepository,
  ctx: BackfillContext,
): Promise<BackfillResult> {
  // Phase 1: skeleton only.
  // Remove this error and implement the ERP read loop in Phase 2.
  throw new Error(
    `[backfillTenantClients] Phase 2 not yet implemented. ` +
    `tenantId=${ctx.tenantId} dryRun=${ctx.dryRun ?? false}`,
  )
}
