/**
 * Invoice status helpers — trainer-facing labels and grouping predicate.
 *
 * Single source of truth for how the internal `InvoiceStatus` union is
 * presented and grouped in the UI. Internal status values are never renamed;
 * only their display text and grouping live here.
 */

import type { InvoiceStatus } from '@/types'

/** Trainer-facing label for each internal invoice status. */
const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft:          'Preparing',
  sent:           'To collect',
  partially_paid: 'Partly paid',
  overdue:        'Overdue',
  paid:           'Paid',
  cancelled:      'Cancelled',
}

/** Return the trainer-facing label for an invoice status. */
export function invoiceStatusLabel(status: InvoiceStatus): string {
  return INVOICE_STATUS_LABELS[status]
}

/**
 * Statuses where the invoice still owes money — it belongs in the
 * "To collect" grouping/totals and a payment can be recorded against it.
 *
 * `draft` is excluded: a draft (unsubmitted) invoice cannot receive a
 * Payment Entry in ERPNext.
 */
const OUTSTANDING_STATUSES: ReadonlySet<InvoiceStatus> = new Set<InvoiceStatus>([
  'sent',
  'overdue',
  'partially_paid',
])

/**
 * True when the invoice still has a balance to collect — used for the
 * "To collect" grouping, outstanding totals, and payment actionability.
 */
export function isOutstandingInvoiceStatus(status: InvoiceStatus): boolean {
  return OUTSTANDING_STATUSES.has(status)
}
