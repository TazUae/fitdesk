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
import type { AssignPackageInput, AssignPackageResult } from '@/types/billing'
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
