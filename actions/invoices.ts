'use server'

import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { createAndSubmitPaymentEntry, createInvoice, getInvoiceById, getInvoices, submitSalesInvoice } from '@/lib/business-data/erp-adapter'
import { ensureTrainerIdForUser } from '@/lib/trainer'
import {
  generatePaymentLink,
  logPaymentEvent,
  PAYMENT_PROVIDERS,
  type PaymentProvider,
} from '@/lib/whish'
import { isEnabledPaymentMethod, paymentMethodToErpMode, type PaymentMethod } from '@/lib/payments/methods'
import { isOutstandingInvoiceStatus } from '@/lib/invoices/status'
import type { ActionResult, Invoice, RecordPaymentResult } from '@/types'
import type { CreateInvoicePayload } from '@/lib/erpnext/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveTrainerId(): Promise<{ trainerId: string } | { error: string }> {
  const session = await auth.api.getSession({ headers: headers() })
  if (!session?.user) return { error: 'Not authenticated.' }
  const sessionPhone =
    typeof (session.user as { phone?: string | null }).phone === 'string'
      ? (session.user as { phone?: string | null }).phone
      : undefined
  try {
    const trainerId = await ensureTrainerIdForUser({
      userId: session.user.id,
      name: session.user.name,
      email: session.user.email,
      phone: sessionPhone,
    })
    return { trainerId }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Trainer account not configured.' }
  }
}

/** Map ERPNext mode-of-payment strings to our PaymentProvider enum. */
function modeToProvider(mode: string): PaymentProvider {
  const lower = mode.toLowerCase()
  if (lower.includes('whish'))                        return 'whish'
  if (lower.includes('bank') || lower.includes('transfer')) return 'bank_transfer'
  return 'cash'
}

// ─── Actions ──────────────────────────────────────────────────────────────────

/** Fetch all invoices scoped to the authenticated trainer. */
export async function fetchInvoices(opts: {
  clientId?: string
  status?:   string
} = {}): Promise<ActionResult<Invoice[]>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    // Note: Sales Invoice has no trainer field in standard ERPNext.
    // Scoping is enforced by only fetching clients that belong to this trainer.
    // For clientId-scoped invoice queries (e.g. client detail page), the
    // client itself is already scoped to the trainer.
    const data = await getInvoices({ ...opts, trainerId: resolved.trainerId })
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch invoices' }
  }
}

/** Fetch a single invoice by ERPNext docname. */
export async function fetchInvoiceById(id: string): Promise<ActionResult<Invoice>> {
  const session = await auth.api.getSession({ headers: headers() })
  if (!session?.user) return { success: false, error: 'Not authenticated.' }

  try {
    const data = await getInvoiceById(id)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch invoice' }
  }
}

/** Create a new Sales Invoice in ERPNext (draft status). */
export async function addInvoice(
  payload: CreateInvoicePayload,
): Promise<ActionResult<Invoice>> {
  const session = await auth.api.getSession({ headers: headers() })
  if (!session?.user) return { success: false, error: 'Not authenticated.' }

  try {
    const data = await createInvoice(payload)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create invoice' }
  }
}

/**
 * Generate a payment collection link for a given provider.
 *
 * This does NOT record payment in ERPNext. The trainer must call
 * recordPayment() separately after the client confirms they have paid.
 */
export async function getPaymentLink(opts: {
  invoiceId:  string
  amount:     number
  clientName: string
  provider:   PaymentProvider
  currency?:  string
}): Promise<ActionResult<{ url?: string; reference?: string }>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    const result = await generatePaymentLink(
      opts.amount,
      opts.clientName,
      opts.invoiceId,
      opts.provider,
      opts.currency ?? 'USD',
    )

    if (!result.success) {
      return { success: false, error: result.error ?? 'Failed to generate link' }
    }

    logPaymentEvent({
      trainerId:  resolved.trainerId,
      invoiceId:  opts.invoiceId,
      provider:   opts.provider,
      eventType:  'link_generated',
      amount:     opts.amount,
      reference:  result.reference,
      timestamp:  new Date().toISOString(),
    })

    return { success: true, data: { url: result.url, reference: result.reference } }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to generate payment link',
    }
  }
}

/**
 * Record a payment for an invoice.
 *
 * Validates the request against a freshly-fetched invoice, creates AND
 * submits an ERPNext Payment Entry, then re-fetches the invoice to confirm
 * ERPNext actually reduced the outstanding amount. Success is reported only
 * after that confirmation — a created-but-unreconciled payment is a failure,
 * never a false success.
 *
 * Always call this AFTER the trainer has confirmed receipt.
 */
export async function recordPayment(opts: {
  invoiceId:  string
  clientId:   string
  amount:     number
  method:     PaymentMethod
  date:       string
  reference?: string
  note?:      string
}): Promise<ActionResult<RecordPaymentResult>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  // Validate the payment method server-side. Only enabled MVP methods
  // (Cash, Whish Money) are accepted; a disabled method such as OMT is
  // rejected even if a client sends its value directly. The ERPNext Mode of
  // Payment name is resolved server-side — never trusted from the client.
  if (!isEnabledPaymentMethod(opts.method)) {
    return { success: false, error: 'That payment method is not available.' }
  }
  const modeOfPayment = paymentMethodToErpMode(opts.method)

  // Validate the amount before any ERP call.
  if (!Number.isFinite(opts.amount)) {
    return { success: false, error: 'Enter a valid payment amount.' }
  }
  if (opts.amount <= 0) {
    return { success: false, error: 'Payment amount must be greater than zero.' }
  }

  // Fetch the invoice fresh and confirm it can take a payment.
  let invoice: Invoice
  try {
    invoice = await getInvoiceById(opts.invoiceId)
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to load invoice' }
  }

  if (!isOutstandingInvoiceStatus(invoice.status)) {
    return {
      success: false,
      error: 'This invoice is not open for payment. Only sent, overdue, or partly-paid invoices can be paid.',
    }
  }

  const oldOutstanding = invoice.outstandingAmount
  if (oldOutstanding <= 0) {
    return { success: false, error: 'This invoice has no outstanding balance to pay.' }
  }
  if (opts.amount > oldOutstanding) {
    return {
      success: false,
      error: `Amount exceeds the outstanding balance (${invoice.currency} ${oldOutstanding.toLocaleString()}).`,
    }
  }

  // Create + submit the Payment Entry, then re-fetch the invoice.
  try {
    const { payment, invoice: refreshed } = await createAndSubmitPaymentEntry({
      invoiceId:     opts.invoiceId,
      clientId:      opts.clientId,
      amount:        opts.amount,
      modeOfPayment,
      date:          opts.date,
      reference:     opts.reference,
      note:          opts.note,
    })

    const newOutstanding = refreshed.outstandingAmount

    // ERPNext must have reduced the outstanding amount. If it did not, the
    // Payment Entry was created but not reconciled — report failure so the
    // trainer is never told a payment landed when it did not.
    if (newOutstanding >= oldOutstanding) {
      return {
        success: false,
        error: 'Payment was created but ERPNext did not apply it to the invoice. Check the invoice in ERPNext before retrying.',
      }
    }

    logPaymentEvent({
      trainerId:  resolved.trainerId,
      invoiceId:  opts.invoiceId,
      provider:   modeToProvider(modeOfPayment),
      eventType:  'payment_recorded',
      amount:     opts.amount,
      reference:  opts.reference,
      note:       opts.note,
      timestamp:  new Date().toISOString(),
    })

    // Treat a sub-cent residual as fully paid: ERPNext rounds outstanding to
    // currency precision, so anything below a cent is float dust.
    const fullyPaid = newOutstanding < 0.01
    return {
      success: true,
      data: {
        payment,
        invoice:         refreshed,
        fullyPaid,
        remainingAmount: fullyPaid ? 0 : newOutstanding,
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to record payment' }
  }
}

/**
 * Finalize a draft (Preparing) invoice so it becomes payable.
 *
 * Fetches the invoice fresh, confirms it is still a draft, submits the Sales
 * Invoice in ERPNext, then confirms — via the re-fetched invoice — that it
 * actually left draft state. Success is reported only after that confirmation.
 *
 * Payment recording is unaffected: this only transitions an invoice from
 * draft to payable; it never records a payment.
 */
export async function finalizeInvoice(invoiceId: string): Promise<ActionResult<Invoice>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  // Fetch the invoice fresh and confirm it is still a draft. The fresh read
  // also makes this idempotent against a double-tap — a second call sees a
  // non-draft status and is rejected here before touching ERPNext.
  let invoice: Invoice
  try {
    invoice = await getInvoiceById(invoiceId)
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to load invoice' }
  }

  if (invoice.status !== 'draft') {
    return {
      success: false,
      error: invoice.status === 'cancelled'
        ? 'A cancelled invoice cannot be finalized.'
        : 'This invoice is already finalized.',
    }
  }

  // Submit in ERPNext, then verify the invoice actually left draft state.
  try {
    const refreshed = await submitSalesInvoice(invoiceId)

    if (refreshed.status === 'draft') {
      return {
        success: false,
        error: 'Invoice was submitted but ERPNext still reports it as a draft. Check the invoice in ERPNext before retrying.',
      }
    }

    return { success: true, data: refreshed }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to finalize invoice' }
  }
}

/**
 * Collect a payment for an invoice — finalizing it first if it is still a
 * draft (Preparing).
 *
 * The trainer presses one action ("Record payment"); this composes the two
 * existing steps so the ERPNext draft/submit lifecycle stays invisible:
 *   - draft                          → finalizeInvoice, then recordPayment
 *   - sent / overdue / partially_paid → recordPayment directly
 *   - paid / cancelled                → rejected
 *
 * Composition only: recordPayment and finalizeInvoice keep their existing
 * behavior — the payment accounting path is unchanged. Returns the same
 * RecordPaymentResult shape as recordPayment.
 */
export async function collectPayment(opts: {
  invoiceId:  string
  clientId:   string
  amount:     number
  method:     PaymentMethod
  date:       string
  reference?: string
  note?:      string
}): Promise<ActionResult<RecordPaymentResult>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  // Cheap validation before any ERPNext write, so a bad request can never
  // finalize an invoice and then fail on the payment.
  if (!isEnabledPaymentMethod(opts.method)) {
    return { success: false, error: 'That payment method is not available.' }
  }
  if (!Number.isFinite(opts.amount)) {
    return { success: false, error: 'Enter a valid payment amount.' }
  }
  if (opts.amount <= 0) {
    return { success: false, error: 'Payment amount must be greater than zero.' }
  }

  // Fetch fresh to decide whether a finalize step is needed.
  let invoice: Invoice
  try {
    invoice = await getInvoiceById(opts.invoiceId)
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to load invoice' }
  }

  if (invoice.status === 'paid') {
    return { success: false, error: 'This invoice is already paid.' }
  }
  if (invoice.status === 'cancelled') {
    return { success: false, error: 'A cancelled invoice cannot take a payment.' }
  }

  // A draft invoice must be finalized before it can receive a payment.
  if (invoice.status === 'draft') {
    const finalized = await finalizeInvoice(opts.invoiceId)
    if (!finalized.success) {
      return { success: false, error: finalized.error }
    }

    const paid = await recordPayment(opts)
    if (!paid.success) {
      // The invoice is finalized (now payable) but the payment did not land.
      // A safe, recoverable state — the trainer can simply retry the payment.
      return {
        success: false,
        error: 'Invoice was issued, but the payment didn\'t go through. Please try Record payment again.',
      }
    }
    return paid
  }

  // Already payable (sent / overdue / partially_paid) — record directly.
  return recordPayment(opts)
}
