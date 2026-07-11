import { describe, expect, it } from 'vitest'
import { assembleStatement } from './assembleStatement'
import type { Invoice, InvoiceStatus, Payment } from '@/types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id:                'SINV-1',
    clientId:          'CUST-1',
    clientName:        'Jane Doe',
    trainerId:         '',
    amount:            100,
    outstandingAmount: 100,
    currency:          'USD',
    status:            'sent',
    dueDate:           '2026-05-20',
    issuedAt:          '2026-05-16',
    fdSessionId:       null,
    ...overrides,
  }
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id:        'PE-1',
    invoiceId: '',
    clientId:  'CUST-1',
    trainerId: '',
    amount:    50,
    currency:  'USD',
    provider:  'cash',
    paidAt:    '2026-05-17',
    ...overrides,
  }
}

// ─── Row typing ───────────────────────────────────────────────────────────────

describe('assembleStatement — row typing', () => {
  it('builds a Package Invoice row when fdSessionId is absent', () => {
    const { rows } = assembleStatement([invoice({ fdSessionId: null })], [])
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe('Package Invoice')
    expect(rows[0].debit).toBe(100)
    expect(rows[0].credit).toBe(0)
    expect(rows[0].reference).toBe('SINV-1')
  })

  it('builds a Pay-per-session Invoice row when fdSessionId is present', () => {
    const { rows } = assembleStatement(
      [invoice({ id: 'SINV-2', fdSessionId: 'FDSES-1' })],
      [],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe('Pay-per-session Invoice')
  })

  it('builds a Payment credit row', () => {
    const { rows } = assembleStatement([], [payment({ amount: 75 })])
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe('Payment')
    expect(rows[0].debit).toBe(0)
    expect(rows[0].credit).toBe(75)
    expect(rows[0].status).toBe('Paid')
  })
})

// ─── Running balance ────────────────────────────────────────────────────────

describe('assembleStatement — running balance', () => {
  it('accumulates balance = previous + debit - credit in date order', () => {
    const { rows } = assembleStatement(
      [invoice({ id: 'SINV-1', amount: 100, issuedAt: '2026-05-01' })],
      [payment({ id: 'PE-1', amount: 40, paidAt: '2026-05-02' })],
    )
    expect(rows.map(r => r.runningBalance)).toEqual([100, 60])
  })

  it('handles multiple invoices and payments interleaved by date', () => {
    const { rows } = assembleStatement(
      [
        invoice({ id: 'SINV-1', amount: 100, issuedAt: '2026-05-01' }),
        invoice({ id: 'SINV-2', amount: 50, issuedAt: '2026-05-03' }),
      ],
      [
        payment({ id: 'PE-1', amount: 100, paidAt: '2026-05-02' }),
        payment({ id: 'PE-2', amount: 20, paidAt: '2026-05-04' }),
      ],
    )
    // 2026-05-01: +100 = 100
    // 2026-05-02: -100 = 0
    // 2026-05-03: +50  = 50
    // 2026-05-04: -20  = 30
    expect(rows.map(r => r.runningBalance)).toEqual([100, 0, 50, 30])
  })
})

// ─── Summary totals ────────────────────────────────────────────────────────

describe('assembleStatement — summary totals', () => {
  it('computes totalInvoiced, totalPaid, outstandingBalance, overdueBalance', () => {
    const { summary } = assembleStatement(
      [
        invoice({ id: 'SINV-1', status: 'sent', amount: 100, outstandingAmount: 100 }),
        invoice({ id: 'SINV-2', status: 'overdue', amount: 50, outstandingAmount: 50 }),
        invoice({ id: 'SINV-3', status: 'paid', amount: 30, outstandingAmount: 0 }),
      ],
      [payment({ id: 'PE-1', amount: 30 })],
    )
    expect(summary.totalInvoiced).toBe(180)
    expect(summary.totalPaid).toBe(30)
    // outstanding = sum of outstandingAmount for outstanding-status invoices (sent, overdue, partially_paid)
    expect(summary.outstandingBalance).toBe(150)
    // overdue = sum of outstandingAmount for overdue-status invoices only
    expect(summary.overdueBalance).toBe(50)
  })

  it('returns all-zero summary for a client with no invoices or payments', () => {
    const { rows, summary } = assembleStatement([], [])
    expect(rows).toEqual([])
    expect(summary).toEqual({
      totalInvoiced: 0, totalPaid: 0, outstandingBalance: 0, overdueBalance: 0, currency: 'USD',
    })
  })

  // US-018 — "Currency is visible": the summary must report the client's real
  // invoice currency, not silently assume USD. FitDesk's MENA rollout (AE, SA,
  // LB, KW, QA) means a client statement in AED must never be labeled USD.
  it('derives currency from the invoices when it is not USD', () => {
    const { summary } = assembleStatement(
      [invoice({ id: 'SINV-1', status: 'sent', amount: 100, outstandingAmount: 100, currency: 'AED' })],
      [],
    )
    expect(summary.currency).toBe('AED')
  })

  it('defaults currency to USD when there are no invoices to derive it from', () => {
    const { summary } = assembleStatement([], [payment({ id: 'PE-1', amount: 30 })])
    expect(summary.currency).toBe('USD')
  })
})

// ─── Draft / cancelled handling ───────────────────────────────────────────────

describe('assembleStatement — draft and cancelled invoices', () => {
  it('excludes draft invoices entirely — no row, no totals contribution', () => {
    const { rows, summary } = assembleStatement(
      [invoice({ id: 'SINV-1', status: 'draft', amount: 999, outstandingAmount: 999 })],
      [],
    )
    expect(rows).toHaveLength(0)
    expect(summary.totalInvoiced).toBe(0)
  })

  it('includes a cancelled invoice as a $0 row but excludes it from totals', () => {
    const { rows, summary } = assembleStatement(
      [invoice({ id: 'SINV-1', status: 'cancelled', amount: 200, outstandingAmount: 200 })],
      [],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('Cancelled')
    expect(rows[0].debit).toBe(0)
    expect(rows[0].credit).toBe(0)
    expect(rows[0].runningBalance).toBe(0)
    expect(rows[0].invoiceTotal).toBe(0)
    expect(rows[0].applied).toBe(0)
    expect(rows[0].outstanding).toBe(0)
    expect(summary.totalInvoiced).toBe(0)
    expect(summary.outstandingBalance).toBe(0)
    expect(summary.overdueBalance).toBe(0)
  })

  it.each<InvoiceStatus>(['sent', 'partially_paid', 'overdue'])(
    'counts a %s invoice toward outstandingBalance',
    status => {
      const { summary } = assembleStatement(
        [invoice({ status, outstandingAmount: 42 })],
        [],
      )
      expect(summary.outstandingBalance).toBe(42)
    },
  )
})

// ─── Payment history availability ─────────────────────────────────────────────

const APPLIED_WARNING =
  'Payment history is temporarily unavailable. Totals below use invoice balances. '
  + 'Individual payment rows cannot be shown right now.'

describe('assembleStatement — payment history availability', () => {
  it('defaults to paymentHistoryAvailable: true with no warning', () => {
    const statement = assembleStatement([invoice()], [payment()])
    expect(statement.paymentHistoryAvailable).toBe(true)
    expect(statement.warning).toBeUndefined()
  })

  it('derives applied summary from invoice balances when payment history is unavailable (total 200 / outstanding 100 => applied 100)', () => {
    const statement = assembleStatement(
      [invoice({ id: 'SINV-1', amount: 200, outstandingAmount: 100 })],
      [], // payments unavailable — caller passes an empty array
      { paymentHistoryAvailable: false },
    )
    expect(statement.paymentHistoryAvailable).toBe(false)
    expect(statement.summary.totalInvoiced).toBe(200)
    expect(statement.summary.outstandingBalance).toBe(100)
    expect(statement.summary.totalPaid).toBe(100)
  })

  it('does not create a synthetic Payment row from the invoice-applied amount', () => {
    const statement = assembleStatement(
      [invoice({ id: 'SINV-1', amount: 200, outstandingAmount: 100 })],
      [],
      { paymentHistoryAvailable: false },
    )
    expect(statement.rows).toHaveLength(1)
    expect(statement.rows.every(r => r.type !== 'Payment')).toBe(true)
    expect(statement.rows[0].type).toBe('Package Invoice')
    // The invoice row itself is untouched — still a debit row for the full amount.
    expect(statement.rows[0].debit).toBe(200)
    expect(statement.rows[0].credit).toBe(0)
    // But it carries the invoice-level breakdown used for the per-row display.
    expect(statement.rows[0].invoiceTotal).toBe(200)
    expect(statement.rows[0].applied).toBe(100)
    expect(statement.rows[0].outstanding).toBe(100)
  })

  it('uses the full non-blocking warning sentence', () => {
    const statement = assembleStatement(
      [invoice({ amount: 200, outstandingAmount: 100 })],
      [],
      { paymentHistoryAvailable: false },
    )
    expect(statement.warning).toBe(APPLIED_WARNING)
  })

  it('clamps applied to 0 when outstanding exceeds total (stale/inconsistent ERP data)', () => {
    const statement = assembleStatement(
      [invoice({ id: 'SINV-1', amount: 100, outstandingAmount: 150 })],
      [],
      { paymentHistoryAvailable: false },
    )
    expect(statement.rows[0].applied).toBe(0)
    expect(statement.summary.totalPaid).toBe(0)
  })

  it('clamps applied to the invoice total when outstanding is negative/weird', () => {
    const statement = assembleStatement(
      [invoice({ id: 'SINV-1', amount: 100, outstandingAmount: -20 })],
      [],
      { paymentHistoryAvailable: false },
    )
    expect(statement.rows[0].applied).toBe(100)
    expect(statement.summary.totalPaid).toBe(100)
  })

  it('preserves existing payment-row behavior when paymentHistoryAvailable is true — "Paid" still means real Payment Entries', () => {
    const statement = assembleStatement(
      [invoice({ id: 'SINV-1', amount: 200, outstandingAmount: 100 })],
      [payment({ id: 'PE-1', amount: 60 })],
    )
    expect(statement.paymentHistoryAvailable).toBe(true)
    expect(statement.rows).toHaveLength(2)
    expect(statement.rows.some(r => r.type === 'Payment')).toBe(true)
    // totalPaid comes from the real payment, not the invoice-balance derivation (which would be 100).
    expect(statement.summary.totalPaid).toBe(60)
  })
})

// ─── Ordering ──────────────────────────────────────────────────────────────────

describe('assembleStatement — ordering', () => {
  it('sorts rows by date ascending', () => {
    const { rows } = assembleStatement(
      [invoice({ id: 'SINV-1', issuedAt: '2026-05-10' })],
      [payment({ id: 'PE-1', paidAt: '2026-05-01' })],
    )
    expect(rows.map(r => r.id)).toEqual(['pay-PE-1', 'inv-SINV-1'])
  })

  it('is stable for same-day rows: invoice before payment, then by id', () => {
    const { rows } = assembleStatement(
      [
        invoice({ id: 'SINV-2', issuedAt: '2026-05-05' }),
        invoice({ id: 'SINV-1', issuedAt: '2026-05-05' }),
      ],
      [payment({ id: 'PE-1', paidAt: '2026-05-05' })],
    )
    expect(rows.map(r => r.id)).toEqual(['inv-SINV-1', 'inv-SINV-2', 'pay-PE-1'])
  })
})
