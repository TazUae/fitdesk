/**
 * Manual, idempotent per-tenant client backfill.
 *
 * RULES:
 *  - ERP data arrives via the injected fetchCustomers callback only.
 *    In production, the callback proxies through the approved CP/erpFetch path.
 *    In the CLI, the callback signs a tenant JWT and calls the CP proxy directly.
 *  - No direct ERP access. No ERP credentials stored here.
 *  - No ERP deletes. No DB reset. No destructive operations.
 *  - dryRun defaults to true — real writes require { dryRun: false } explicitly.
 *  - Idempotency: upsertClientFromBackfill checks (tenantId, erpCustomerId) first.
 *
 * See: docs/adr/ADR-001-client-management-erp-authoritative-hybrid.md §Backfill
 */

import { normalizePhoneToE164 } from './phone'
import { formatGoal } from '@/lib/format/goal'
import { ClientRepository } from './repository'
import type { ClientCreateDraft } from '@/types/clients'

// ─── Types ────────────────────────────────────────────────────────────────────

/** Raw ERP Customer shape as returned by the Control Plane proxy. */
export type BackfillCustomerRaw = {
  name: string           // ERP docname — becomes erpCustomerId
  customer_name: string  // full display name
  mobile_no?: string     // raw phone, not yet normalized
  disabled?: 0 | 1
  custom_fitness_goals?: string
  creation: string       // ERP creation timestamp
}

export type BackfillContext = {
  /** Canonical tenant isolation key from WorkspaceProvisioning.tenantId */
  tenantId: string
  /**
   * When true (default), log what would be written without touching the DB.
   * Must be explicitly false to enable real writes.
   */
  dryRun?: boolean
  /** When true, include disabled ERP Customers mapped to 'inactive' status. */
  includeDisabled?: boolean
}

export type BackfillResult = {
  inspected: number
  created: number
  updated: number
  skipped: number        // disabled Customers skipped (includeDisabled: false)
  invalidPhone: number   // Customers with missing or non-parseable phone
  unparseableGoals: number // Customers whose fitness goal field could not be parsed
  errors: BackfillError[]  // unexpected per-Customer errors
}

export type BackfillError = {
  erpCustomerId: string
  reason: string
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Backfill local client_index rows from ERPNext Customers for a single tenant.
 *
 * @param repo           Tenant-scoped repository (injectable for tests).
 * @param ctx            Tenant context + run flags.
 * @param fetchCustomers Returns raw ERP Customers for the tenant.
 *                       Injected to decouple this function from the ERP auth
 *                       context (tests mock it; CLI supplies its own fetcher).
 */
export async function backfillTenantClients(
  repo: ClientRepository,
  ctx: BackfillContext,
  fetchCustomers: () => Promise<BackfillCustomerRaw[]>,
): Promise<BackfillResult> {
  const dryRun = ctx.dryRun !== false  // safe by default

  const result: BackfillResult = {
    inspected:        0,
    created:          0,
    updated:          0,
    skipped:          0,
    invalidPhone:     0,
    unparseableGoals: 0,
    errors:           [],
  }

  let customers: BackfillCustomerRaw[]
  try {
    customers = await fetchCustomers()
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    result.errors.push({ erpCustomerId: '*', reason: `fetchCustomers failed: ${reason}` })
    return result
  }

  const tCtx = { tenantId: ctx.tenantId }

  for (const customer of customers) {
    result.inspected++

    try {
      // Disabled customers are skipped unless includeDisabled is set
      if (customer.disabled === 1 && !ctx.includeDisabled) {
        result.skipped++
        continue
      }

      // Phone must normalize to E.164 — skip the customer if it cannot
      const phoneResult = normalizePhoneToE164(customer.mobile_no ?? '')
      if (!phoneResult.ok) {
        result.invalidPhone++
        continue
      }

      // Normalize to a human-readable display label (mirrors create-draft.ts).
      // Structured client_goal rows are out of scope for backfill.
      const goalLabel = formatGoal(customer.custom_fitness_goals) || null

      const draft: ClientCreateDraft = {
        tenantId:         ctx.tenantId,
        erpCustomerId:    customer.name,
        fullName:         customer.customer_name,
        phoneE164:        phoneResult.e164,
        whatsappEnabled:  false,
        primaryGoalLabel: goalLabel,
        primaryGoalId:    null,
        goalId:           null,
        subGoalIds:       [],
        goalUrgency:      null,
        goalConfidence:   'unknown',
        goalSource:       'system_inferred',
        safetyFlags:      [],
        goalNotes:        null,
        createdByUserId:  null,
      }

      if (dryRun) {
        // Dry-run: check what would happen, write nothing
        const existing = await repo.findClientByErpId(tCtx, customer.name)
        if (existing) {
          result.updated++
        } else {
          result.created++
        }
        continue
      }

      // Execute mode: read before upsert to distinguish created vs updated
      const before = await repo.findClientByErpId(tCtx, customer.name)
      const upserted = await repo.upsertClientFromBackfill(tCtx, draft)

      if (before) {
        result.updated++
      } else {
        result.created++
        // Write client.backfilled event only for newly created rows
        await repo.insertClientEvent({
          tenantId:        ctx.tenantId,
          clientIndexId:   upserted.id,
          erpCustomerId:   customer.name,
          type:            'client.backfilled',
          payloadJson:     { erpCustomerId: customer.name, fullName: customer.customer_name },
          createdByUserId: null,
        })
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      result.errors.push({ erpCustomerId: customer.name, reason })
    }
  }

  return result
}
