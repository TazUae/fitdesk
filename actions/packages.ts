'use server'

import { db } from '@/lib/db'
import { resolveTrainerId } from '@/lib/auth/resolve-trainer'
import { getTenantContext } from '@/lib/tenant/context'
import {
  createInvoice,
  getInvoiceById,
  submitSalesInvoice,
} from '@/lib/business-data/erp-adapter'
import { PackageAssignmentService } from '@/lib/billing/package-assignment-service'
import type { AssignPackageInput, AssignPackageResult } from '@/types/billing'
import type { ActionResult } from '@/types'

/**
 * Assign a package to a client (Pay Later or complimentary).
 *
 * tenantId and assignedByUserId are always derived server-side —
 * never trusted from the client payload.
 *
 * Sequence: auth check → tenant context → service.assignPackage → ActionResult envelope.
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

  try {
    const service = new PackageAssignmentService(db, {
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
