import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/resolve-trainer', () => ({
  resolveTrainerId: vi.fn(),
}))
vi.mock('@/lib/business-data/erp-adapter', () => ({
  getClientById:          vi.fn(),
  getInvoices:             vi.fn(),
  getPaymentsForCustomer:  vi.fn(),
}))

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
        totalInvoiced: 0, totalPaid: 0, outstandingBalance: 0, overdueBalance: 0,
      })
    }
  })

  it('does not leak raw ERP error detail when invoices/payments fail to load', async () => {
    mockAuthOk()
    vi.mocked(getClientById).mockResolvedValue(client())
    vi.mocked(getInvoices).mockRejectedValue(new Error('ERPNext 500 Internal Server Error: secret detail'))

    const result = await getClientStatement('CUST-1')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Could not load the statement. Please try again.')
      expect(result.error).not.toMatch(/secret detail/)
    }
  })
})
