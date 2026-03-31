'use server'

import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { createInvoice, getInvoiceById, getInvoices, markInvoicePaid } from '@/lib/business-data/erp-adapter'
import { ensureTrainerIdForUser } from '@/lib/trainer'
import {
  generatePaymentLink,
  logPaymentEvent,
  PAYMENT_PROVIDERS,
  type PaymentProvider,
} from '@/lib/whish'
import type { ActionResult, Invoice, Payment } from '@/types'
import type { CreateInvoicePayload } from '@/lib/erpnext/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveTrainerId(): Promise<{ trainerId: string } | { error: string }> {
  const session = await auth.api.getSession({ headers: headers() })
  if (!session?.user) return { error: 'Not authenticated.' }
  try {
    const trainerId = await ensureTrainerIdForUser({
      userId: session.user.id,
      name: session.user.name,
      email: session.user.email,
      phone: session.user.phone,
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
 * Creates a Payment Entry in ERPNext and updates the invoice outstanding amount.
 * Always call this AFTER the trainer has confirmed receipt.
 */
export async function recordPayment(opts: {
  invoiceId:     string
  clientId:      string
  amount:        number
  modeOfPayment: string
  date:          string
  reference?:    string
  note?:         string
}): Promise<ActionResult<Payment>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    const data = await markInvoicePaid({
      invoiceId:     opts.invoiceId,
      clientId:      opts.clientId,
      amount:        opts.amount,
      modeOfPayment: opts.modeOfPayment,
      date:          opts.date,
      reference:     opts.reference,
      note:          opts.note,
    })

    logPaymentEvent({
      trainerId:  resolved.trainerId,
      invoiceId:  opts.invoiceId,
      provider:   modeToProvider(opts.modeOfPayment),
      eventType:  'payment_recorded',
      amount:     opts.amount,
      reference:  opts.reference,
      note:       opts.note,
      timestamp:  new Date().toISOString(),
    })

    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to record payment' }
  }
}
