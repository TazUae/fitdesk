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
}

export interface ClientStatementSummary {
  totalInvoiced: number
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

function buildSummary(invoices: Invoice[], payments: Payment[]): ClientStatementSummary {
  const realInvoices = invoices.filter(i => i.status !== 'draft' && i.status !== 'cancelled')

  const totalInvoiced = realInvoices.reduce((sum, i) => sum + i.amount, 0)
  const totalPaid      = payments.reduce((sum, p) => sum + p.amount, 0)

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

  const rows = [
    ...nonDraftInvoices.map(buildInvoiceRow),
    ...payments.map(buildPaymentRow),
  ].sort(compareRows)

  let balance = 0
  for (const row of rows) {
    balance += row.debit - row.credit
    row.runningBalance = balance
  }

  const paymentHistoryAvailable = opts.paymentHistoryAvailable ?? true

  return {
    rows,
    summary: buildSummary(nonDraftInvoices, payments),
    paymentHistoryAvailable,
    warning: paymentHistoryAvailable ? undefined : 'Payment history is temporarily unavailable.',
  }
}
