'use server'

import { db } from '@/lib/db'
import { resolveTrainerId } from '@/lib/auth/resolve-trainer'
import { getTenantContext } from '@/lib/tenant/context'
import {
  createAndSubmitPaymentEntry,
  createInvoice,
  getInvoiceById,
  submitSalesInvoice,
} from '@/lib/business-data/erp-adapter'
import { isEnabledPaymentMethod } from '@/lib/payments/methods'
import { PackageAssignmentService } from '@/lib/billing/package-assignment-service'
import { PackageVoidService } from '@/lib/billing/package-void-service'
import { PackageTemplateRepository } from '@/lib/billing/package-template-repository'
import { ClientPackagePurchaseRepository } from '@/lib/billing/client-package-purchase-repository'
import { PackageLedgerRepository } from '@/lib/billing/package-ledger-repository'
import type {
  AssignPackageInput,
  AssignPackageResult,
  AssignablePackageTemplate,
  ClientPackageSummary,
  VoidPackageInput,
  VoidPackageResult,
} from '@/types/billing'
import type { ActionResult } from '@/types'

/**
 * Assign a package to a client (Pay Later, Paid Now, or complimentary).
 *
 * tenantId and assignedByUserId are always derived server-side —
 * never trusted from the client payload.
 *
 * For Paid Now: payment.method is validated server-side before service construction.
 * createAndSubmitPaymentEntry is injected into the service adapter — the action
 * never calls it directly.
 *
 * Sequence: auth → tenant → method validation → service.assignPackage → ActionResult.
 * All ERP I/O is handled inside PackageAssignmentService via the injected adapter.
 */
export async function assignPackage(
  input: AssignPackageInput,
): Promise<ActionResult<AssignPackageResult>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  const ctx = await getTenantContext()
  if (!ctx?.tenantId) {
    return { success: false, error: 'Workspace not provisioned. Please contact support.' }
  }

  const safeInput: AssignPackageInput = {
    ...input,
    assignedByUserId: ctx.userId,
  }

  // Validate payment method server-side before service construction —
  // disabled or unsupported methods must never reach ERP.
  if (safeInput.payment != null && !isEnabledPaymentMethod(safeInput.payment.method)) {
    return {
      success: false,
      error:   `Unsupported or disabled payment method: "${safeInput.payment.method}".`,
    }
  }

  try {
    const service = new PackageAssignmentService(db, {
      createAndSubmitPaymentEntry,
      createInvoice,
      submitSalesInvoice,
      getInvoiceById,
    })
    const data = await service.assignPackage({ tenantId: ctx.tenantId }, safeInput)
    return { success: true, data }
  } catch (err) {
    console.error('[assignPackage]', err instanceof Error ? err.message : String(err))
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to assign package.',
    }
  }
}

/**
 * List all active package templates available for assignment.
 * Returns a picker-safe projection — no audit trail fields.
 * No ERP calls. Local read only.
 */
export async function listAssignablePackageTemplates(): Promise<
  ActionResult<AssignablePackageTemplate[]>
> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  const ctx = await getTenantContext()
  if (!ctx?.tenantId) {
    return { success: false, error: 'Workspace not provisioned. Please contact support.' }
  }

  try {
    const repo      = new PackageTemplateRepository(db)
    const templates = await repo.listTemplates({ tenantId: ctx.tenantId }, { status: 'active' })
    const data: AssignablePackageTemplate[] = templates.map((t) => ({
      id:           t.id,
      name:         t.name,
      description:  t.description,
      templateType: t.templateType,
      sessionCount: t.sessionCount,
      priceAmount:  t.priceAmount,
      currency:     t.currency,
      expiryDays:   t.expiryDays,
      erpItemCode:  t.erpItemCode,
    }))
    return { success: true, data }
  } catch (err) {
    console.error('[listAssignablePackageTemplates]', err instanceof Error ? err.message : String(err))
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to list package templates.',
    }
  }
}

/**
 * Void a mistaken complimentary package assignment.
 *
 * Only complimentary, active, fully unused, invoice-free purchases can be voided.
 * Trainer must supply a non-empty reason. tenantId and voidedByUserId are resolved
 * server-side — never trusted from the client payload.
 * No ERP calls. Local read + write only.
 */
export async function voidClientPackagePurchase(
  input: VoidPackageInput,
): Promise<ActionResult<VoidPackageResult>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  const ctx = await getTenantContext()
  if (!ctx?.tenantId) {
    return { success: false, error: 'Workspace not provisioned. Please contact support.' }
  }

  if (!input.reason || input.reason.trim() === '') {
    return { success: false, error: 'A reason is required to void a package.' }
  }

  try {
    const service = new PackageVoidService(db)
    const data = await service.voidComplimentaryPackage(
      { tenantId: ctx.tenantId },
      { ...input, voidedByUserId: ctx.userId },
    )
    return { success: true, data }
  } catch (err) {
    console.error('[voidClientPackagePurchase]', err instanceof Error ? err.message : String(err))
    const message = err instanceof Error
      ? err.message.replace(/^\[PackageVoidService\]\s*/, '')
      : 'Failed to void package.'
    return { success: false, error: message }
  }
}

/**
 * Return all package purchases for a client with ledger-derived session balances.
 * No ERP calls. Local read only.
 */
export async function getClientPackageSummary(
  clientIndexId: string,
): Promise<ActionResult<ClientPackageSummary>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  const ctx = await getTenantContext()
  if (!ctx?.tenantId) {
    return { success: false, error: 'Workspace not provisioned. Please contact support.' }
  }

  try {
    const tenantCtx    = { tenantId: ctx.tenantId }
    const purchaseRepo = new ClientPackagePurchaseRepository(db)
    const ledgerRepo   = new PackageLedgerRepository(db)

    const [purchases, balances] = await Promise.all([
      purchaseRepo.listPurchasesByClient(tenantCtx, clientIndexId),
      ledgerRepo.deriveBalancesByClient(tenantCtx, clientIndexId),
    ])

    const data: ClientPackageSummary = {
      clientIndexId,
      purchases: purchases.map((p) => ({
        ...p,
        remainingBalance: balances[p.id] ?? 0,
      })),
    }
    return { success: true, data }
  } catch (err) {
    console.error('[getClientPackageSummary]', err instanceof Error ? err.message : String(err))
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to load package summary.',
    }
  }
}
