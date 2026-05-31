import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Invoice, Payment } from '@/types'

vi.mock('next/headers', () => ({ headers: () => ({}) }))
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn(async () => ({ user: { id: 'u1', name: 'T', email: 't@example.com', phone: null } })) } },
}))
vi.mock('@/lib/trainer', () => ({ ensureTrainerIdForUser: vi.fn(async () => 'trainer-1') }))
vi.mock('@/lib/business-data/erp-adapter', () => ({
  getInvoiceByIdForTrainer: vi.fn(),
  markInvoicePaid: vi.fn(),
  getInvoiceById: vi.fn(),
  getInvoices: vi.fn(),
  createInvoice: vi.fn(),
}))

import { fetchInvoiceById, recordPayment } from '@/actions/invoices'
import * as erp from '@/lib/business-data/erp-adapter'

const ownedInvoice = { id: 'INV-1', clientId: 'C1', amount: 100 } as unknown as Invoice
const forbidden = Object.assign(new Error('Client does not belong to this trainer.'), { status: 403 })
const payArgs = { invoiceId: 'INV-1', clientId: 'C1', amount: 100, modeOfPayment: 'Cash', date: '2026-05-30' }

beforeEach(() => { vi.clearAllMocks() })

describe('fetchInvoiceById — trainer ownership', () => {
  it('denies a non-owned invoice', async () => {
    vi.mocked(erp.getInvoiceByIdForTrainer).mockRejectedValue(forbidden)
    const res = await fetchInvoiceById('INV-other')
    expect(res.success).toBe(false)
  })

  it('returns an owned invoice', async () => {
    vi.mocked(erp.getInvoiceByIdForTrainer).mockResolvedValue(ownedInvoice)
    const res = await fetchInvoiceById('INV-1')
    expect(res.success).toBe(true)
    expect(erp.getInvoiceByIdForTrainer).toHaveBeenCalledWith('INV-1', 'trainer-1')
  })
})

describe('recordPayment — trainer ownership', () => {
  it('denies payment on a non-owned invoice and never calls markInvoicePaid', async () => {
    vi.mocked(erp.getInvoiceByIdForTrainer).mockRejectedValue(forbidden)
    const res = await recordPayment(payArgs)
    expect(res.success).toBe(false)
    expect(erp.markInvoicePaid).not.toHaveBeenCalled()
  })

  it('records payment on an owned invoice (existing payment path intact)', async () => {
    vi.mocked(erp.getInvoiceByIdForTrainer).mockResolvedValue(ownedInvoice)
    vi.mocked(erp.markInvoicePaid).mockResolvedValue({ id: 'PE-1' } as unknown as Payment)
    const res = await recordPayment(payArgs)
    expect(res.success).toBe(true)
    expect(erp.getInvoiceByIdForTrainer).toHaveBeenCalledWith('INV-1', 'trainer-1')
    expect(erp.markInvoicePaid).toHaveBeenCalled()
  })
})
