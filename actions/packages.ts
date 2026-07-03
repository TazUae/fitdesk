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
import { PackageConsumptionService } from '@/lib/billing/package-consumption-service'
import { PackageTemplateRepository } from '@/lib/billing/package-template-repository'
import { ClientPackagePurchaseRepository } from '@/lib/billing/client-package-purchase-repository'
import { PackageLedgerRepository } from '@/lib/billing/package-ledger-repository'
import { ClientRepository } from '@/lib/clients/repository'
import type {
  AssignPackageInput,
  AssignPackageResult,
  AssignablePackageTemplate,
  ClientPackageSummary,
  PackageTemplate,
  PackageTemplateDraft,
  VoidPackageInput,
  VoidPackageResult,
} from '@/types/billing'
import type { ConsumeSessionResult } from '@/lib/billing/package-consumption-service'
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
 * Record a "Use 1 session" debit against the best available active package.
 *
 * clientIndexId and idempotencyKey come from the browser.
 * erpCustomerId is always resolved server-side from the client record — never
 * trusted from the caller. All four ConsumeSessionResult outcomes return
 * success:true; only auth/tenant/validation/unexpected errors return success:false.
 * No ERP writes. No invoice or payment side effects.
 */
export async function usePackageSession(
  input: { clientIndexId: string; idempotencyKey: string },
): Promise<ActionResult<ConsumeSessionResult>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  const ctx = await getTenantContext()
  if (!ctx?.tenantId) {
    return { success: false, error: 'Workspace not provisioned. Please contact support.' }
  }

  if (!input.clientIndexId || input.clientIndexId.trim() === '') {
    return { success: false, error: 'clientIndexId is required.' }
  }
  if (!input.idempotencyKey || input.idempotencyKey.trim() === '') {
    return { success: false, error: 'idempotencyKey is required.' }
  }

  const tenantCtx = { tenantId: ctx.tenantId }

  try {
    const client = await new ClientRepository(db).findClientById(tenantCtx, input.clientIndexId)
    if (!client) {
      return { success: false, error: 'Client not found.' }
    }

    const service = new PackageConsumptionService(db)
    const data = await service.consumeSession(tenantCtx, {
      sessionId:        input.idempotencyKey,
      clientIndexId:    input.clientIndexId,
      erpCustomerId:    client.erpCustomerId,
      consumedByUserId: ctx.userId,
      nowUtc:           new Date().toISOString(),
    })
    return { success: true, data }
  } catch (err) {
    console.error('[usePackageSession]', err instanceof Error ? err.message : String(err))
    const message = err instanceof Error
      ? err.message.replace(/^\[PackageConsumptionService\]\s*/, '')
      : 'Could not record the session.'
    return { success: false, error: message }
  }
}

/**
 * List all package templates for the current tenant (all statuses).
 * Used by the Package Catalog management page.
 * No ERP calls. Local read only.
 */
export async function listPackageTemplates(): Promise<ActionResult<PackageTemplate[]>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  const ctx = await getTenantContext()
  if (!ctx?.tenantId) {
    return { success: false, error: 'Workspace not provisioned. Please contact support.' }
  }

  try {
    const repo = new PackageTemplateRepository(db)
    const data = await repo.listTemplates({ tenantId: ctx.tenantId })
    return { success: true, data }
  } catch (err) {
    console.error('[listPackageTemplates]', err instanceof Error ? err.message : String(err))
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to list package templates.',
    }
  }
}

/**
 * Create a new package template in 'draft' status.
 * priceAmount must already be in minor currency units (e.g. cents for USD).
 * erpItemCode is optional at creation but required before activation.
 * No ERP calls. Local write only.
 */
export async function createPackageTemplate(input: {
  name:         string
  sessionCount: number
  priceAmount:  number
  currency:     string
  expiryDays?:  number | null
  erpItemCode?: string | null
}): Promise<ActionResult<PackageTemplate>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  const ctx = await getTenantContext()
  if (!ctx?.tenantId) {
    return { success: false, error: 'Workspace not provisioned. Please contact support.' }
  }

  if (!input.name || input.name.trim() === '') {
    return { success: false, error: 'Template name is required.' }
  }
  if (!Number.isInteger(input.sessionCount) || input.sessionCount < 1) {
    return { success: false, error: 'Session count must be a positive whole number.' }
  }
  if (!Number.isInteger(input.priceAmount) || input.priceAmount < 0) {
    return { success: false, error: 'Price must be a non-negative amount in minor units.' }
  }
  const currency = input.currency?.trim().toUpperCase()
  if (!currency || currency.length !== 3) {
    return { success: false, error: 'Currency must be a 3-letter ISO code (e.g. USD).' }
  }
  if (
    input.expiryDays !== undefined &&
    input.expiryDays !== null &&
    (!Number.isInteger(input.expiryDays) || input.expiryDays < 1)
  ) {
    return { success: false, error: 'Expiry days must be a positive whole number.' }
  }

  try {
    const repo = new PackageTemplateRepository(db)
    const draft: PackageTemplateDraft = {
      name:         input.name.trim(),
      sessionCount: input.sessionCount,
      priceAmount:  input.priceAmount,
      currency,
      expiryDays:   input.expiryDays ?? null,
      erpItemCode:  input.erpItemCode?.trim() || null,
    }
    const data = await repo.createTemplate({ tenantId: ctx.tenantId }, draft)
    return { success: true, data }
  } catch (err) {
    console.error('[createPackageTemplate]', err instanceof Error ? err.message : String(err))
    return {
      success: false,
      error: err instanceof Error
        ? err.message.replace(/^\[PackageTemplateRepository\]\s*/, '')
        : 'Failed to create template.',
    }
  }
}

/**
 * Activate a draft package template.
 * The template must already have a non-empty erpItemCode set.
 * No ERP calls. Local write only.
 */
export async function activatePackageTemplate(
  templateId: string,
): Promise<ActionResult<PackageTemplate>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  const ctx = await getTenantContext()
  if (!ctx?.tenantId) {
    return { success: false, error: 'Workspace not provisioned. Please contact support.' }
  }

  if (!templateId || templateId.trim() === '') {
    return { success: false, error: 'Template ID is required.' }
  }

  try {
    const repo = new PackageTemplateRepository(db)
    const data = await repo.activateTemplate({ tenantId: ctx.tenantId }, templateId)
    return { success: true, data }
  } catch (err) {
    console.error('[activatePackageTemplate]', err instanceof Error ? err.message : String(err))
    return {
      success: false,
      error: err instanceof Error
        ? err.message.replace(/^\[PackageTemplateRepository\]\s*/, '')
        : 'Failed to activate template.',
    }
  }
}

/**
 * Archive a package template (lifecycle — not a financial mutation).
 * Archiving is always permitted. Archived templates cannot be re-activated.
 * Existing purchases and ledger rows are unaffected.
 * No ERP calls. Local write only.
 */
export async function archivePackageTemplate(
  templateId: string,
): Promise<ActionResult<PackageTemplate>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  const ctx = await getTenantContext()
  if (!ctx?.tenantId) {
    return { success: false, error: 'Workspace not provisioned. Please contact support.' }
  }

  if (!templateId || templateId.trim() === '') {
    return { success: false, error: 'Template ID is required.' }
  }

  try {
    const repo = new PackageTemplateRepository(db)
    const data = await repo.archiveTemplate({ tenantId: ctx.tenantId }, templateId)
    return { success: true, data }
  } catch (err) {
    console.error('[archivePackageTemplate]', err instanceof Error ? err.message : String(err))
    return {
      success: false,
      error: err instanceof Error
        ? err.message.replace(/^\[PackageTemplateRepository\]\s*/, '')
        : 'Failed to archive template.',
    }
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
