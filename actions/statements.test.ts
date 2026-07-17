import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/resolve-trainer', () => ({
  resolveTrainerId: vi.fn(),
}))
vi.mock('@/lib/business-data/erp-adapter', () => {
  // Minimal stand-in matching lib/erpnext/client.ts's real ERPNextError shape —
  // actions/statements.ts does `instanceof ERPNextError` to decide how to log a
  // degraded payment read. Importing the real module here would pull in the
  // full ERP/tenant/auth graph (BETTER_AUTH_SECRET etc.), which this test file
  // never sets up.
  class ERPNextError extends Error {
    constructor(
      public readonly status: number,
      public readonly statusText: string,
      public readonly path: string,
      public readonly detail: string = '',
    ) {
      super(`ERPNext ${status} ${statusText} → ${path}${detail ? ': ' + detail : ''}`)
      this.name = 'ERPNextError'
    }
  }
  return {
    ERPNextError,
    getClientById:          vi.fn(),
    getInvoices:             vi.fn(),
    getPaymentsForCustomer:  vi.fn(),
  }
})

import { getClientStatement } from '@/actions/statements'
import { resolveTrainerId } from '@/lib/auth/resolve-trainer'
import { getClientById, getInvoices, getPaymentsForCustomer } from '@/lib/business-data/erp-adapter'
import type { Client, Invoice, Payment } from '@/types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function client(overrides: Partial<Client> = {}): Client {
  return {
    id:           'CUST-1',
    firstName:    'Jane',
    lastName:     'Doe',
    name:         'Jane Doe',
    phone:        '+15550000',
    status:       'active',
    trainerId:    '',
    sessionCount: 0,
    createdAt:    '2026-01-01',
    ...overrides,
  }
}

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
    amount:    40,
    currency:  'USD',
    provider:  'cash',
    paidAt:    '2026-05-17',
    ...overrides,
  }
}

function mockAuthOk() {
  vi.mocked(resolveTrainerId).mockResolvedValue({ trainerId: 'trainer-1' })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('getClientStatement', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.clearAllMocks() })

  it('rejects when the trainer is not authenticated — never fetches client/invoices/payments', async () => {
    vi.mocked(resolveTrainerId).mockResolvedValue({ error: 'Not authenticated.' })

    const result = await getClientStatement('CUST-1')

    expect(result.success).toBe(false)
    expect(getClientById).not.toHaveBeenCalled()
    expect(getInvoices).not.toHaveBeenCalled()
    expect(getPaymentsForCustomer).not.toHaveBeenCalled()
  })

  it('rejects a missing/cross-trainer client — never fetches invoices/payments', async () => {
    mockAuthOk()
    vi.mocked(getClientById).mockRejectedValue(new Error('ERPNext 404 Not Found'))

    const result = await getClientStatement('CUST-unknown')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Client not found.')
      // Raw ERP error detail is never surfaced.
      expect(result.error).not.toMatch(/404/)
    }
    expect(getClientById).toHaveBeenCalledWith('CUST-unknown', 'trainer-1')
    expect(getInvoices).not.toHaveBeenCalled()
    expect(getPaymentsForCustomer).not.toHaveBeenCalled()
  })

  it('returns an assembled statement on the success path', async () => {
    mockAuthOk()
    vi.mocked(getClientById).mockResolvedValue(client())
    vi.mocked(getInvoices).mockResolvedValue([invoice()])
    vi.mocked(getPaymentsForCustomer).mockResolvedValue([payment()])

    const result = await getClientStatement('CUST-1')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.rows).toHaveLength(2)
      expect(result.data.summary.totalInvoiced).toBe(100)
      expect(result.data.summary.totalPaid).toBe(40)
      expect(result.data.summary.outstandingBalance).toBe(100)
      expect(result.data.paymentHistoryAvailable).toBe(true)
      expect(result.data.warning).toBeUndefined()
    }
    expect(getInvoices).toHaveBeenCalledWith({ clientId: 'CUST-1' })
    expect(getPaymentsForCustomer).toHaveBeenCalledWith('CUST-1')
  })

  it('returns an empty statement when the client has no invoices or payments', async () => {
    mockAuthOk()
    vi.mocked(getClientById).mockResolvedValue(client())
    vi.mocked(getInvoices).mockResolvedValue([])
    vi.mocked(getPaymentsForCustomer).mockResolvedValue([])

    const result = await getClientStatement('CUST-1')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.rows).toEqual([])
      expect(result.data.summary).toEqual({
        totalInvoiced: 0, totalPaid: 0, outstandingBalance: 0, overdueBalance: 0, currency: 'USD',
      })
    }
  })

  it('does not leak raw ERP error detail when invoices fail to load', async () => {
    mockAuthOk()
    vi.mocked(getClientById).mockResolvedValue(client())
    vi.mocked(getInvoices).mockRejectedValue(new Error('ERPNext 500 Internal Server Error: secret detail'))

    const result = await getClientStatement('CUST-1')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Could not load the statement. Please try again.')
      expect(result.error).not.toMatch(/secret detail/)
    }
    // A required-data failure must still fail the whole action — never
    // falls back to an empty/partial statement.
    expect(getPaymentsForCustomer).not.toHaveBeenCalled()
  })

  // ── Payment history fallback (production hotfix) ──────────────────────────

  describe('payment history fallback', () => {
    it('still succeeds with an invoice-only statement when getPaymentsForCustomer fails (e.g. ERPNext 417)', async () => {
      mockAuthOk()
      vi.mocked(getClientById).mockResolvedValue(client())
      vi.mocked(getInvoices).mockResolvedValue([invoice({ amount: 100, outstandingAmount: 100 })])
      vi.mocked(getPaymentsForCustomer).mockRejectedValue(
        new Error('ERPNext 417 Expectation Failed: doctype detail'),
      )

      const result = await getClientStatement('CUST-1')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.paymentHistoryAvailable).toBe(false)
        expect(result.data.warning).toBe(
          'Payment history is temporarily unavailable. Totals below use invoice balances. '
          + 'Individual payment rows cannot be shown right now.',
        )
        // Raw ERP error detail is never surfaced, even in the warning.
        expect(result.data.warning).not.toMatch(/417/)
        // Invoice data still comes through.
        expect(result.data.rows).toHaveLength(1)
        expect(result.data.rows[0].type).toBe('Package Invoice')
        expect(result.data.summary.totalInvoiced).toBe(100)
        expect(result.data.summary.outstandingBalance).toBe(100)
        // Nothing outstanding was actually applied on this invoice (fully outstanding),
        // so the invoice-balance-derived totalPaid is correctly 0, not a synthetic payment.
        expect(result.data.summary.totalPaid).toBe(0)
        expect(result.data.rows.every(r => r.type !== 'Payment')).toBe(true)
      }
    })

    it('still fails the whole action when invoice fetching fails, even though payments are best-effort', async () => {
      mockAuthOk()
      vi.mocked(getClientById).mockResolvedValue(client())
      vi.mocked(getInvoices).mockRejectedValue(new Error('ERPNext 500 Internal Server Error'))

      const result = await getClientStatement('CUST-1')

      expect(result.success).toBe(false)
      expect(getPaymentsForCustomer).not.toHaveBeenCalled()
    })
  })
})
