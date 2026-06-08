import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// All external dependencies are mocked — the tests exercise only the action
// layer's own validation, ownership gates, and post-submit verification logic.
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
  // H5-gated read — the only by-id invoice read allowed in trainer actions.
  getInvoiceByIdForTrainer:    vi.fn(),
  // B1 write primitives
  createAndSubmitPaymentEntry: vi.fn(),
  submitSalesInvoice:          vi.fn(),
  // Create
  createInvoice:               vi.fn(),
  // List
  getInvoices:                 vi.fn(),
}))
vi.mock('@/lib/whish', () => ({
  logPaymentEvent:     vi.fn(),
  generatePaymentLink: vi.fn(),
  PAYMENT_PROVIDERS:   [],
}))

import {
  collectPayment,
  finalizeInvoice,
  fetchInvoiceById,
  issueInvoice,
  recordPayment,
} from '@/actions/invoices'
import { auth } from '@/lib/auth'
import { ensureTrainerIdForUser } from '@/lib/trainer'
import {
  createAndSubmitPaymentEntry,
  createInvoice,
  getInvoiceByIdForTrainer,
  submitSalesInvoice,
} from '@/lib/business-data/erp-adapter'
import type { Invoice, InvoiceStatus, Payment } from '@/types'
import type { PaymentMethod } from '@/lib/payments/methods'
import type { CreateInvoicePayload } from '@/lib/erpnext/types'

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

/** 403 error thrown by getInvoiceByIdForTrainer when trainer doesn't own the invoice. */
const forbidden = Object.assign(
  new Error('Invoice does not belong to this trainer.'),
  { status: 403 },
)

// ─── Shared auth setup ────────────────────────────────────────────────────────

function mockAuth() {
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: 'user-1', name: 'Trainer', email: 'trainer@example.com', phone: null },
  } as never)
  vi.mocked(ensureTrainerIdForUser).mockResolvedValue('trainer-1')
}

// ─── fetchInvoiceById ─────────────────────────────────────────────────────────

describe('fetchInvoiceById — ownership gate', () => {
  beforeEach(mockAuth)
  afterEach(() => { vi.clearAllMocks() })

  it('rejects a cross-trainer invoice (403) and returns success: false', async () => {
    vi.mocked(getInvoiceByIdForTrainer).mockRejectedValue(forbidden)
    const result = await fetchInvoiceById('SINV-other')
    expect(result.success).toBe(false)
    expect(getInvoiceByIdForTrainer).toHaveBeenCalledWith('SINV-other', 'trainer-1')
  })

  it('returns an owned invoice via the H5 gate', async () => {
    vi.mocked(getInvoiceByIdForTrainer).mockResolvedValue(invoice())
    const result = await fetchInvoiceById('SINV-1')
    expect(result.success).toBe(true)
    expect(getInvoiceByIdForTrainer).toHaveBeenCalledWith('SINV-1', 'trainer-1')
  })
})

// ─── recordPayment ────────────────────────────────────────────────────────────

describe('recordPayment', () => {
  beforeEach(mockAuth)
  afterEach(() => { vi.clearAllMocks() })

  // ── Ownership gate ─────────────────────────────────────────────────────────

  it('rejects a cross-trainer invoice — never reaches createAndSubmitPaymentEntry', async () => {
    vi.mocked(getInvoiceByIdForTrainer).mockRejectedValue(forbidden)
    const result = await recordPayment(BASE)
    expect(result.success).toBe(false)
    expect(getInvoiceByIdForTrainer).toHaveBeenCalledWith('SINV-1', 'trainer-1')
    expect(createAndSubmitPaymentEntry).not.toHaveBeenCalled()
  })

  // ── Method validation ──────────────────────────────────────────────────────

  it('rejects OMT while it is disabled', async () => {
    const result = await recordPayment({ ...BASE, method: 'omt' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/not available/i)
    expect(getInvoiceByIdForTrainer).not.toHaveBeenCalled()
  })

  it('rejects an unknown method value', async () => {
    const result = await recordPayment({ ...BASE, method: 'paypal' as PaymentMethod })
    expect(result.success).toBe(false)
    expect(createAndSubmitPaymentEntry).not.toHaveBeenCalled()
  })

  // ── Amount validation ──────────────────────────────────────────────────────

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
    vi.mocked(getInvoiceByIdForTrainer).mockResolvedValue(invoice({ outstandingAmount: 80 }))
    const result = await recordPayment({ ...BASE, amount: 120 })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/exceeds the outstanding/i)
    expect(createAndSubmitPaymentEntry).not.toHaveBeenCalled()
  })

  it('rejects an invoice with nothing outstanding', async () => {
    vi.mocked(getInvoiceByIdForTrainer).mockResolvedValue(invoice({ status: 'sent', outstandingAmount: 0 }))
    const result = await recordPayment({ ...BASE, amount: 1 })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/no outstanding balance/i)
  })

  // ── Status gating ──────────────────────────────────────────────────────────

  it.each<InvoiceStatus>(['paid', 'cancelled', 'draft'])(
    'rejects a %s invoice and never reaches ERPNext',
    async status => {
      vi.mocked(getInvoiceByIdForTrainer).mockResolvedValue(invoice({ status }))
      const result = await recordPayment(BASE)
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toMatch(/not open for payment/i)
      expect(createAndSubmitPaymentEntry).not.toHaveBeenCalled()
    },
  )

  it.each<InvoiceStatus>(['sent', 'overdue', 'partially_paid'])(
    'allows a %s invoice through to ERPNext',
    async status => {
      vi.mocked(getInvoiceByIdForTrainer).mockResolvedValue(invoice({ status, outstandingAmount: 100 }))
      vi.mocked(createAndSubmitPaymentEntry).mockResolvedValue({
        payment: payment(),
        invoice: invoice({ status: 'paid', outstandingAmount: 0 }),
      })
      const result = await recordPayment(BASE)
      expect(result.success).toBe(true)
      expect(createAndSubmitPaymentEntry).toHaveBeenCalledTimes(1)
    },
  )

  // ── Mode-of-payment mapping ────────────────────────────────────────────────

  it('maps "cash" method to the ERPNext "Cash" Mode of Payment', async () => {
    vi.mocked(getInvoiceByIdForTrainer).mockResolvedValue(invoice())
    vi.mocked(createAndSubmitPaymentEntry).mockResolvedValue({
      payment: payment(),
      invoice: invoice({ status: 'paid', outstandingAmount: 0 }),
    })
    await recordPayment({ ...BASE, method: 'cash' })
    expect(createAndSubmitPaymentEntry).toHaveBeenCalledWith(
      expect.objectContaining({ modeOfPayment: 'Cash' }),
    )
  })

  it('maps "whish_money" method to the ERPNext "Whish Money" Mode of Payment', async () => {
    vi.mocked(getInvoiceByIdForTrainer).mockResolvedValue(invoice())
    vi.mocked(createAndSubmitPaymentEntry).mockResolvedValue({
      payment: payment(),
      invoice: invoice({ status: 'paid', outstandingAmount: 0 }),
    })
    await recordPayment({ ...BASE, method: 'whish_money' })
    expect(createAndSubmitPaymentEntry).toHaveBeenCalledWith(
      expect.objectContaining({ modeOfPayment: 'Whish Money' }),
    )
  })

  // ── Post-submit verification ───────────────────────────────────────────────

  it('succeeds with fully-paid state when ERPNext clears the balance', async () => {
    vi.mocked(getInvoiceByIdForTrainer).mockResolvedValue(invoice({ outstandingAmount: 100 }))
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
    vi.mocked(getInvoiceByIdForTrainer).mockResolvedValue(invoice({ outstandingAmount: 100 }))
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
    vi.mocked(getInvoiceByIdForTrainer).mockResolvedValue(invoice({ outstandingAmount: 100 }))
    vi.mocked(createAndSubmitPaymentEntry).mockResolvedValue({
      payment: payment(),
      invoice: invoice({ status: 'sent', outstandingAmount: 100 }),
    })
    const result = await recordPayment({ ...BASE, amount: 100 })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/did not apply it/i)
  })

  it('surfaces a missing-payment-account error from the ERP layer', async () => {
    vi.mocked(getInvoiceByIdForTrainer).mockResolvedValue(invoice({ outstandingAmount: 100 }))
    vi.mocked(createAndSubmitPaymentEntry).mockRejectedValue(
      new Error('No deposit account is configured for payment method "Cash".'),
    )
    const result = await recordPayment({ ...BASE, amount: 100 })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/No deposit account/i)
  })
})

// ─── finalizeInvoice ──────────────────────────────────────────────────────────

describe('finalizeInvoice', () => {
  beforeEach(mockAuth)
  afterEach(() => { vi.clearAllMocks() })

  // ── Ownership gate ─────────────────────────────────────────────────────────

  it('rejects a cross-trainer invoice — never calls submitSalesInvoice', async () => {
    vi.mocked(getInvoiceByIdForTrainer).mockRejectedValue(forbidden)
    const result = await finalizeInvoice('SINV-other')
    expect(result.success).toBe(false)
    expect(getInvoiceByIdForTrainer).toHaveBeenCalledWith('SINV-other', 'trainer-1')
    expect(submitSalesInvoice).not.toHaveBeenCalled()
  })

  // ── Status gating ──────────────────────────────────────────────────────────

  it.each<InvoiceStatus>(['sent', 'overdue', 'partially_paid', 'paid', 'cancelled'])(
    'rejects a %s invoice — only a draft can be finalized',
    async status => {
      vi.mocked(getInvoiceByIdForTrainer).mockResolvedValue(invoice({ status }))
      const result = await finalizeInvoice('SINV-1')
      expect(result.success).toBe(false)
      expect(submitSalesInvoice).not.toHaveBeenCalled()
    },
  )

  it('finalizes a draft invoice and returns the refreshed payable invoice', async () => {
    vi.mocked(getInvoiceByIdForTrainer).mockResolvedValue(invoice({ status: 'draft' }))
    vi.mocked(submitSalesInvoice).mockResolvedValue(invoice({ status: 'sent', outstandingAmount: 100 }))
    const result = await finalizeInvoice('SINV-1')
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.status).toBe('sent')
    expect(submitSalesInvoice).toHaveBeenCalledWith('SINV-1')
  })

  it('fails when ERPNext still reports the invoice as a draft after submit', async () => {
    vi.mocked(getInvoiceByIdForTrainer).mockResolvedValue(invoice({ status: 'draft' }))
    vi.mocked(submitSalesInvoice).mockResolvedValue(invoice({ status: 'draft' }))
    const result = await finalizeInvoice('SINV-1')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/still reports it as a draft/i)
  })

  it('surfaces an ERP submit error', async () => {
    vi.mocked(getInvoiceByIdForTrainer).mockResolvedValue(invoice({ status: 'draft' }))
    vi.mocked(submitSalesInvoice).mockRejectedValue(
      new Error('ERPNext 417 Expectation Failed: Income account is mandatory'),
    )
    const result = await finalizeInvoice('SINV-1')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/Income account is mandatory/i)
  })

  it('rejects when the invoice cannot be loaded (gated fetch fails)', async () => {
    vi.mocked(getInvoiceByIdForTrainer).mockRejectedValue(new Error('ERPNext 404 Not Found'))
    const result = await finalizeInvoice('SINV-1')
    expect(result.success).toBe(false)
    expect(submitSalesInvoice).not.toHaveBeenCalled()
  })
})

// ─── collectPayment ───────────────────────────────────────────────────────────

describe('collectPayment', () => {
  beforeEach(mockAuth)
  afterEach(() => { vi.clearAllMocks() })

  // ── Ownership gate ─────────────────────────────────────────────────────────

  it('rejects a cross-trainer invoice — never finalizes or pays', async () => {
    vi.mocked(getInvoiceByIdForTrainer).mockRejectedValue(forbidden)
    const result = await collectPayment({ ...BASE })
    expect(result.success).toBe(false)
    expect(submitSalesInvoice).not.toHaveBeenCalled()
    expect(createAndSubmitPaymentEntry).not.toHaveBeenCalled()
  })

  // ── Early validation (before any fetch) ───────────────────────────────────

  it('rejects an unavailable method before fetching, finalizing, or paying', async () => {
    const result = await collectPayment({ ...BASE, method: 'omt' })
    expect(result.success).toBe(false)
    expect(getInvoiceByIdForTrainer).not.toHaveBeenCalled()
    expect(submitSalesInvoice).not.toHaveBeenCalled()
    expect(createAndSubmitPaymentEntry).not.toHaveBeenCalled()
  })

  it('rejects amount <= 0 before fetching, finalizing, or paying', async () => {
    const result = await collectPayment({ ...BASE, amount: 0 })
    expect(result.success).toBe(false)
    expect(getInvoiceByIdForTrainer).not.toHaveBeenCalled()
  })

  // ── Draft path ─────────────────────────────────────────────────────────────

  it('finalizes a draft invoice, then records payment (fully paid)', async () => {
    let state: Invoice = invoice({ status: 'draft', outstandingAmount: 100 })
    vi.mocked(getInvoiceByIdForTrainer).mockImplementation(async () => state)
    vi.mocked(submitSalesInvoice).mockImplementation(async () => {
      state = invoice({ status: 'sent', outstandingAmount: 100 })
      return state
    })
    vi.mocked(createAndSubmitPaymentEntry).mockImplementation(async () => {
      state = invoice({ status: 'paid', outstandingAmount: 0 })
      return { payment: payment(), invoice: state }
    })

    const result = await collectPayment({ ...BASE, amount: 100 })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.fullyPaid).toBe(true)
      expect(result.data.remainingAmount).toBe(0)
    }
    expect(submitSalesInvoice).toHaveBeenCalledTimes(1)
    expect(createAndSubmitPaymentEntry).toHaveBeenCalledTimes(1)
  })

  it('finalizes a draft invoice, then records a partial payment (remaining balance)', async () => {
    let state: Invoice = invoice({ status: 'draft', outstandingAmount: 100 })
    vi.mocked(getInvoiceByIdForTrainer).mockImplementation(async () => state)
    vi.mocked(submitSalesInvoice).mockImplementation(async () => {
      state = invoice({ status: 'sent', outstandingAmount: 100 })
      return state
    })
    vi.mocked(createAndSubmitPaymentEntry).mockImplementation(async () => {
      state = invoice({ status: 'partially_paid', outstandingAmount: 40 })
      return { payment: payment(), invoice: state }
    })

    const result = await collectPayment({ ...BASE, amount: 60 })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.fullyPaid).toBe(false)
      expect(result.data.remainingAmount).toBe(40)
    }
    expect(submitSalesInvoice).toHaveBeenCalledTimes(1)
  })

  it('stops before recording payment when finalize fails', async () => {
    vi.mocked(getInvoiceByIdForTrainer).mockResolvedValue(invoice({ status: 'draft' }))
    vi.mocked(submitSalesInvoice).mockRejectedValue(
      new Error('ERPNext 417: Due Date cannot be before Posting Date'),
    )
    const result = await collectPayment(BASE)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/Due Date/i)
    expect(createAndSubmitPaymentEntry).not.toHaveBeenCalled()
  })

  it('returns the recovery message when finalize succeeds but payment fails', async () => {
    let state: Invoice = invoice({ status: 'draft', outstandingAmount: 100 })
    vi.mocked(getInvoiceByIdForTrainer).mockImplementation(async () => state)
    vi.mocked(submitSalesInvoice).mockImplementation(async () => {
      state = invoice({ status: 'sent', outstandingAmount: 100 })
      return state
    })
    vi.mocked(createAndSubmitPaymentEntry).mockRejectedValue(
      new Error('ERPNext 503 Payment Account Missing'),
    )

    const result = await collectPayment({ ...BASE, amount: 100 })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/payment didn.t go through/i)
    expect(submitSalesInvoice).toHaveBeenCalledTimes(1)
  })

  // ── Already-payable path ───────────────────────────────────────────────────

  it.each<InvoiceStatus>(['sent', 'overdue', 'partially_paid'])(
    'records payment directly on a %s invoice without finalizing',
    async status => {
      let state: Invoice = invoice({ status, outstandingAmount: 100 })
      vi.mocked(getInvoiceByIdForTrainer).mockImplementation(async () => state)
      vi.mocked(createAndSubmitPaymentEntry).mockImplementation(async () => {
        state = invoice({ status: 'paid', outstandingAmount: 0 })
        return { payment: payment(), invoice: state }
      })

      const result = await collectPayment({ ...BASE, amount: 100 })

      expect(result.success).toBe(true)
      expect(submitSalesInvoice).not.toHaveBeenCalled()
      expect(createAndSubmitPaymentEntry).toHaveBeenCalledTimes(1)
    },
  )

  it('rejects a paid invoice — touches neither finalize nor payment', async () => {
    vi.mocked(getInvoiceByIdForTrainer).mockResolvedValue(invoice({ status: 'paid', outstandingAmount: 0 }))
    const result = await collectPayment(BASE)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/already paid/i)
    expect(submitSalesInvoice).not.toHaveBeenCalled()
    expect(createAndSubmitPaymentEntry).not.toHaveBeenCalled()
  })

  it('rejects a cancelled invoice', async () => {
    vi.mocked(getInvoiceByIdForTrainer).mockResolvedValue(invoice({ status: 'cancelled' }))
    const result = await collectPayment(BASE)
    expect(result.success).toBe(false)
    expect(submitSalesInvoice).not.toHaveBeenCalled()
    expect(createAndSubmitPaymentEntry).not.toHaveBeenCalled()
  })
})

// ─── issueInvoice ─────────────────────────────────────────────────────────────

describe('issueInvoice', () => {
  function invoicePayload(overrides: Partial<CreateInvoicePayload> = {}): CreateInvoicePayload {
    return {
      customer:     'CUST-1',
      posting_date: '2026-05-16',
      due_date:     '2026-05-23',
      items:        [{ item_code: 'TRAINING-SESSION', qty: 1, rate: 100, description: 'PT' }],
      ...overrides,
    }
  }

  beforeEach(mockAuth)
  afterEach(() => { vi.clearAllMocks() })

  it.each([
    { label: 'zero rate',     items: [{ item_code: 'X', qty: 1, rate: 0 }] },
    { label: 'zero quantity', items: [{ item_code: 'X', qty: 0, rate: 100 }] },
  ])('rejects a $label invoice (total <= 0) before any ERP write', async ({ items }) => {
    const result = await issueInvoice(invoicePayload({ items }))
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/greater than 0/i)
    expect(createInvoice).not.toHaveBeenCalled()
  })

  it('creates the Sales Invoice and finalizes it (To collect), no payment touched', async () => {
    vi.mocked(createInvoice).mockResolvedValue(invoice({ status: 'draft' }))
    vi.mocked(getInvoiceByIdForTrainer).mockResolvedValue(invoice({ status: 'draft' }))
    vi.mocked(submitSalesInvoice).mockResolvedValue(invoice({ status: 'sent' }))

    const result = await issueInvoice(invoicePayload())

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.invoice.status).toBe('sent')
      expect(result.data.issueWarning).toBeUndefined()
    }
    expect(createInvoice).toHaveBeenCalledTimes(1)
    expect(submitSalesInvoice).toHaveBeenCalledTimes(1)
    expect(createAndSubmitPaymentEntry).not.toHaveBeenCalled()
  })

  it('returns the create error when invoice creation fails', async () => {
    vi.mocked(createInvoice).mockRejectedValue(new Error('ERPNext 500 Internal Server Error'))
    const result = await issueInvoice(invoicePayload())
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/500/)
    expect(submitSalesInvoice).not.toHaveBeenCalled()
  })

  it('returns success with issueWarning when finalize fails after create', async () => {
    vi.mocked(createInvoice).mockResolvedValue(invoice({ status: 'draft' }))
    vi.mocked(getInvoiceByIdForTrainer).mockResolvedValue(invoice({ status: 'draft' }))
    vi.mocked(submitSalesInvoice).mockRejectedValue(
      new Error('ERPNext 417: Due Date cannot be before Posting Date'),
    )

    const result = await issueInvoice(invoicePayload())

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.invoice.status).toBe('draft')
      expect(result.data.issueWarning).toMatch(/Due Date/i)
    }
    expect(createAndSubmitPaymentEntry).not.toHaveBeenCalled()
  })

  it('rejects when the trainer is not authenticated', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never)
    const result = await issueInvoice(invoicePayload())
    expect(result.success).toBe(false)
    expect(createInvoice).not.toHaveBeenCalled()
  })
})
