import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// recordPayment pulls in auth, the ERP adapter, and the payment audit log.
// Mock everything external so the test exercises only the action's own
// validation and post-submit verification logic.
vi.mock('next/headers', () => ({
  headers: vi.fn(() => new Headers()),
}))
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}))
vi.mock('@/lib/trainer', () => ({
  ensureTrainerIdForUser: vi.fn(),
}))
vi.mock('@/lib/business-data/erp-adapter', () => ({
  getInvoiceById:              vi.fn(),
  createAndSubmitPaymentEntry: vi.fn(),
  getInvoices:                 vi.fn(),
  createInvoice:               vi.fn(),
}))
vi.mock('@/lib/whish', () => ({
  logPaymentEvent:     vi.fn(),
  generatePaymentLink: vi.fn(),
  PAYMENT_PROVIDERS:   [],
}))

import { recordPayment } from './invoices'
import { auth } from '@/lib/auth'
import { ensureTrainerIdForUser } from '@/lib/trainer'
import { createAndSubmitPaymentEntry, getInvoiceById } from '@/lib/business-data/erp-adapter'
import type { Invoice, InvoiceStatus, Payment } from '@/types'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

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
    ...overrides,
  }
}

function payment(): Payment {
  return {
    id:        'PE-0001',
    invoiceId: 'SINV-1',
    clientId:  'CUST-1',
    trainerId: '',
    amount:    100,
    currency:  'USD',
    provider:  'cash',
    paidAt:    '2026-05-16',
  }
}

const BASE: Parameters<typeof recordPayment>[0] = {
  invoiceId: 'SINV-1',
  clientId:  'CUST-1',
  amount:    100,
  method:    'cash',
  date:      '2026-05-16',
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('recordPayment', () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: 'user-1', name: 'Trainer', email: 'trainer@example.com', phone: null },
    } as never)
    vi.mocked(ensureTrainerIdForUser).mockResolvedValue('trainer-1')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── Method validation ─────────────────────────────────────────────────────────

  it('rejects OMT while it is disabled', async () => {
    const result = await recordPayment({ ...BASE, method: 'omt' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/not available/i)
    expect(getInvoiceById).not.toHaveBeenCalled()
  })

  it('rejects an unknown method value', async () => {
    const result = await recordPayment({ ...BASE, method: 'paypal' as never })
    expect(result.success).toBe(false)
    expect(createAndSubmitPaymentEntry).not.toHaveBeenCalled()
  })

  // ── Amount validation ─────────────────────────────────────────────────────────

  it('rejects an amount of zero', async () => {
    const result = await recordPayment({ ...BASE, amount: 0 })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/greater than zero/i)
  })

  it('rejects a negative amount', async () => {
    const result = await recordPayment({ ...BASE, amount: -10 })
    expect(result.success).toBe(false)
  })

  it('rejects a non-finite amount', async () => {
    const result = await recordPayment({ ...BASE, amount: Number.NaN })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/valid payment amount/i)
  })

  it('rejects an overpayment that exceeds the outstanding balance', async () => {
    vi.mocked(getInvoiceById).mockResolvedValue(invoice({ outstandingAmount: 80 }))
    const result = await recordPayment({ ...BASE, amount: 120 })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/exceeds the outstanding/i)
    expect(createAndSubmitPaymentEntry).not.toHaveBeenCalled()
  })

  it('rejects an invoice with nothing outstanding', async () => {
    vi.mocked(getInvoiceById).mockResolvedValue(invoice({ status: 'sent', outstandingAmount: 0 }))
    const result = await recordPayment({ ...BASE, amount: 1 })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/no outstanding balance/i)
  })

  // ── Status gating ─────────────────────────────────────────────────────────────

  it.each<InvoiceStatus>(['paid', 'cancelled', 'draft'])(
    'rejects a %s invoice and never reaches ERPNext',
    async status => {
      vi.mocked(getInvoiceById).mockResolvedValue(invoice({ status }))
      const result = await recordPayment(BASE)
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toMatch(/not open for payment/i)
      expect(createAndSubmitPaymentEntry).not.toHaveBeenCalled()
    },
  )

  it.each<InvoiceStatus>(['sent', 'overdue', 'partially_paid'])(
    'allows a %s invoice through to ERPNext',
    async status => {
      vi.mocked(getInvoiceById).mockResolvedValue(invoice({ status, outstandingAmount: 100 }))
      vi.mocked(createAndSubmitPaymentEntry).mockResolvedValue({
        payment: payment(),
        invoice: invoice({ status: 'paid', outstandingAmount: 0 }),
      })
      const result = await recordPayment(BASE)
      expect(result.success).toBe(true)
      expect(createAndSubmitPaymentEntry).toHaveBeenCalledTimes(1)
    },
  )

  // ── Mode-of-payment mapping ────────────────────────────────────────────────────

  it('maps Cash to the ERPNext "Cash" Mode of Payment', async () => {
    vi.mocked(getInvoiceById).mockResolvedValue(invoice())
    vi.mocked(createAndSubmitPaymentEntry).mockResolvedValue({
      payment: payment(),
      invoice: invoice({ status: 'paid', outstandingAmount: 0 }),
    })
    await recordPayment({ ...BASE, method: 'cash' })
    expect(createAndSubmitPaymentEntry).toHaveBeenCalledWith(
      expect.objectContaining({ modeOfPayment: 'Cash' }),
    )
  })

  it('maps Whish Money to the ERPNext "Whish Money" Mode of Payment', async () => {
    vi.mocked(getInvoiceById).mockResolvedValue(invoice())
    vi.mocked(createAndSubmitPaymentEntry).mockResolvedValue({
      payment: payment(),
      invoice: invoice({ status: 'paid', outstandingAmount: 0 }),
    })
    await recordPayment({ ...BASE, method: 'whish_money' })
    expect(createAndSubmitPaymentEntry).toHaveBeenCalledWith(
      expect.objectContaining({ modeOfPayment: 'Whish Money' }),
    )
  })

  // ── Post-submit verification ───────────────────────────────────────────────────

  it('succeeds with fully-paid state when ERPNext clears the balance', async () => {
    vi.mocked(getInvoiceById).mockResolvedValue(invoice({ outstandingAmount: 100 }))
    vi.mocked(createAndSubmitPaymentEntry).mockResolvedValue({
      payment: payment(),
      invoice: invoice({ status: 'paid', outstandingAmount: 0 }),
    })
    const result = await recordPayment({ ...BASE, amount: 100 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.fullyPaid).toBe(true)
      expect(result.data.remainingAmount).toBe(0)
    }
  })

  it('succeeds with partial state and reports the remaining balance', async () => {
    vi.mocked(getInvoiceById).mockResolvedValue(invoice({ outstandingAmount: 100 }))
    vi.mocked(createAndSubmitPaymentEntry).mockResolvedValue({
      payment: payment(),
      invoice: invoice({ status: 'partially_paid', outstandingAmount: 40 }),
    })
    const result = await recordPayment({ ...BASE, amount: 60 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.fullyPaid).toBe(false)
      expect(result.data.remainingAmount).toBe(40)
    }
  })

  it('fails when ERPNext does not reduce the outstanding amount', async () => {
    vi.mocked(getInvoiceById).mockResolvedValue(invoice({ outstandingAmount: 100 }))
    vi.mocked(createAndSubmitPaymentEntry).mockResolvedValue({
      payment: payment(),
      invoice: invoice({ status: 'sent', outstandingAmount: 100 }),
    })
    const result = await recordPayment({ ...BASE, amount: 100 })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/did not apply it/i)
  })

  it('surfaces a missing-payment-account error from the ERP layer', async () => {
    vi.mocked(getInvoiceById).mockResolvedValue(invoice({ outstandingAmount: 100 }))
    vi.mocked(createAndSubmitPaymentEntry).mockRejectedValue(
      new Error('No deposit account is configured for payment method "Cash".'),
    )
    const result = await recordPayment({ ...BASE, amount: 100 })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/No deposit account/i)
  })
})
