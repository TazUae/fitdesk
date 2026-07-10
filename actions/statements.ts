'use server'

import { getClientById, getInvoices, getPaymentsForCustomer } from '@/lib/business-data/erp-adapter'
import { resolveTrainerId } from '@/lib/auth/resolve-trainer'
import { isErpUnavailableError } from '@/lib/errors/is-unavailable-error'
import { assembleStatement } from '@/lib/statements/assembleStatement'
import type { ActionResult, Invoice, Payment } from '@/types'
import type { ClientStatement } from '@/lib/statements/assembleStatement'

/**
 * Read-only Statement of Account for a single client.
 *
 * Ownership gate: getClientById is scoped to the requesting trainer's ERP
 * tenant (same gate fetchClientById uses in actions/clients.ts) — a client id
 * that doesn't exist in this tenant fails here before any invoice/payment read.
 *
 * Invoice data is required — a failure there still fails the whole action.
 * Payment Entry history is best-effort: a failure there (e.g. a transient
 * ERPNext error on that doctype) falls back to an invoice-only statement with
 * paymentHistoryAvailable: false rather than failing the sheet outright.
 *
 * Never writes anything. Raw ERPNext error detail is not surfaced — only a
 * safe generic message, except for the whitelisted "ERP still connecting"
 * markers already used elsewhere in the app.
 */
export async function getClientStatement(clientId: string): Promise<ActionResult<ClientStatement>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  let erpCustomerId: string
  try {
    const client = await getClientById(clientId, resolved.trainerId)
    erpCustomerId = client.id
  } catch (err) {
    if (isErpUnavailableError(err)) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
    return { success: false, error: 'Client not found.' }
  }

  let invoices: Invoice[]
  try {
    invoices = await getInvoices({ clientId: erpCustomerId })
  } catch (err) {
    if (isErpUnavailableError(err)) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
    return { success: false, error: 'Could not load the statement. Please try again.' }
  }

  let payments: Payment[] = []
  let paymentHistoryAvailable = true
  try {
    payments = await getPaymentsForCustomer(erpCustomerId)
  } catch {
    // Best-effort only — payment history unavailability must not take down
    // an otherwise-successful invoice-only statement. Detail is intentionally
    // discarded here; the UI only ever sees paymentHistoryAvailable/warning.
    paymentHistoryAvailable = false
  }

  return {
    success: true,
    data: assembleStatement(invoices, payments, { paymentHistoryAvailable }),
  }
}
