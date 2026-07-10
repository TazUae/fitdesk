/**
 * Pure statement-assembly logic for the read-only Client Statement of Account.
 *
 * Rules:
 *  - No ERP calls, no auth, no network I/O — takes already-fetched Invoice[]
 *    and Payment[] and returns a fully computed ClientStatement.
 *  - Draft invoices are excluded entirely (not yet a real financial event).
 *  - Cancelled invoices are included as $0 audit rows (debit/credit both 0)
 *    but excluded from every summary total.
 *  - Row type is derived from `fdSessionId` (see types/index.ts), not
 *    `custom_invoice_kind` — package invoices never set that ERP field.
 */

import { invoiceStatusLabel, isOutstandingInvoiceStatus } from '@/lib/invoices/status'
import type { Invoice, Payment } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClientStatementRowType = 'Package Invoice' | 'Pay-per-session Invoice' | 'Payment'

export interface ClientStatementRow {
  /** Stable unique key — 'inv-<invoiceId>' or 'pay-<paymentId>'. */
  id: string
  /** ISO date string — YYYY-MM-DD. */
  date: string
  type: ClientStatementRowType
  /** Source docname — Sales Invoice or Payment Entry id. */
  reference: string
  description: string
  debit: number
  credit: number
  runningBalance: number
  status: string
  /**
   * Invoice-level breakdown — set only on invoice rows (Package/Pay-per-session),
   * never on Payment rows. Always derived straight from the invoice's own
   * amount/outstandingAmount fields, so it is available regardless of Payment
   * Entry history availability. Cancelled invoices report all-zero here,
   * matching their existing $0 debit/credit audit-row treatment.
   */
  invoiceTotal?: number
  applied?: number
  outstanding?: number
}

export interface ClientStatementSummary {
  totalInvoiced: number
  /**
   * Amount credited toward invoices.
   * - When paymentHistoryAvailable is true: sum of real Payment Entry amounts
   *   ("Paid" in the UI).
   * - When paymentHistoryAvailable is false: derived from invoice balances —
   *   sum of (grand total - outstanding), clamped per invoice — since actual
   *   payment records could not be read ("Applied" in the UI).
   */
  totalPaid: number
  outstandingBalance: number
  overdueBalance: number
}

export interface ClientStatement {
  rows: ClientStatementRow[]
  summary: ClientStatementSummary
  /**
   * False when Payment Entry history could not be loaded — rows/summary are
   * invoice-only in that case (payments = [] was passed in). Never blocks the
   * statement from loading; the caller decides how to surface this.
   */
  paymentHistoryAvailable: boolean
  /** Safe, user-facing text — set only when paymentHistoryAvailable is false. */
  warning?: string
}

// ─── Row builders ─────────────────────────────────────────────────────────────

function invoiceRowType(invoice: Invoice): ClientStatementRowType {
  return invoice.fdSessionId ? 'Pay-per-session Invoice' : 'Package Invoice'
}

/**
 * Invoice-balance-derived "applied" amount for one invoice — grand total
 * minus outstanding, clamped to [0, invoice.amount] so stale/inconsistent
 * ERP data (e.g. outstanding > total, or a negative outstanding) can never
 * produce a nonsensical applied figure.
 */
function appliedAmountForInvoice(invoice: Invoice): number {
  const raw = invoice.amount - invoice.outstandingAmount
  return Math.min(Math.max(raw, 0), invoice.amount)
}

function buildInvoiceRow(invoice: Invoice): ClientStatementRow {
  const cancelled = invoice.status === 'cancelled'
  const type = invoiceRowType(invoice)

  return {
    id:             `inv-${invoice.id}`,
    date:           invoice.issuedAt,
    type,
    reference:      invoice.id,
    description:    type === 'Pay-per-session Invoice' ? 'Pay-per-session invoice' : 'Package invoice',
    debit:          cancelled ? 0 : invoice.amount,
    credit:         0,
    runningBalance: 0, // filled in after sorting
    status:         cancelled ? 'Cancelled' : invoiceStatusLabel(invoice.status),
    invoiceTotal:   cancelled ? 0 : invoice.amount,
    applied:        cancelled ? 0 : appliedAmountForInvoice(invoice),
    outstanding:    cancelled ? 0 : invoice.outstandingAmount,
  }
}

function buildPaymentRow(payment: Payment): ClientStatementRow {
  return {
    id:             `pay-${payment.id}`,
    date:           payment.paidAt,
    type:           'Payment',
    reference:      payment.id,
    description:    'Payment received',
    debit:          0,
    credit:         payment.amount,
    runningBalance: 0, // filled in after sorting
    status:         'Paid',
  }
}

// ─── Ordering ─────────────────────────────────────────────────────────────────

/** Payments sort after invoices on the same date; ties break on id for stability. */
function rowTypeOrder(type: ClientStatementRowType): number {
  return type === 'Payment' ? 1 : 0
}

function compareRows(a: ClientStatementRow, b: ClientStatementRow): number {
  if (a.date !== b.date) return a.date.localeCompare(b.date)
  const byType = rowTypeOrder(a.type) - rowTypeOrder(b.type)
  if (byType !== 0) return byType
  return a.id.localeCompare(b.id)
}

// ─── Summary ──────────────────────────────────────────────────────────────────

function buildSummary(
  invoices: Invoice[],
  payments: Payment[],
  paymentHistoryAvailable: boolean,
): ClientStatementSummary {
  const realInvoices = invoices.filter(i => i.status !== 'draft' && i.status !== 'cancelled')

  const totalInvoiced = realInvoices.reduce((sum, i) => sum + i.amount, 0)

  // Real payment records when available; otherwise fall back to invoice
  // balance math so the summary never implies "nothing has been applied"
  // when the invoice's own outstanding amount proves otherwise.
  const totalPaid = paymentHistoryAvailable
    ? payments.reduce((sum, p) => sum + p.amount, 0)
    : realInvoices.reduce((sum, i) => sum + appliedAmountForInvoice(i), 0)

  const outstandingBalance = realInvoices
    .filter(i => isOutstandingInvoiceStatus(i.status))
    .reduce((sum, i) => sum + i.outstandingAmount, 0)

  const overdueBalance = realInvoices
    .filter(i => i.status === 'overdue')
    .reduce((sum, i) => sum + i.outstandingAmount, 0)

  return { totalInvoiced, totalPaid, outstandingBalance, overdueBalance }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function assembleStatement(
  invoices: Invoice[],
  payments: Payment[],
  opts: { paymentHistoryAvailable?: boolean } = {},
): ClientStatement {
  const nonDraftInvoices = invoices.filter(i => i.status !== 'draft')
  const paymentHistoryAvailable = opts.paymentHistoryAvailable ?? true

  const rows = [
    ...nonDraftInvoices.map(buildInvoiceRow),
    ...payments.map(buildPaymentRow),
  ].sort(compareRows)

  let balance = 0
  for (const row of rows) {
    balance += row.debit - row.credit
    row.runningBalance = balance
  }

  return {
    rows,
    summary: buildSummary(nonDraftInvoices, payments, paymentHistoryAvailable),
    paymentHistoryAvailable,
    warning: paymentHistoryAvailable
      ? undefined
      : 'Payment history is temporarily unavailable. Totals below use invoice balances. '
        + 'Individual payment rows cannot be shown right now.',
  }
}
