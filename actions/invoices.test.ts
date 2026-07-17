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
  // Availability preflight support
  getInvoiceCompany:           vi.fn(),
}))
vi.mock('@/lib/whish', () => ({
  logPaymentEvent:     vi.fn(),
  generatePaymentLink: vi.fn(),
  PAYMENT_PROVIDERS:   [],
}))
vi.mock('@/lib/tenant/context', () => ({
  getTenantContext: vi.fn(),
}))
vi.mock('@/lib/tenant/market', () => ({
  resolveWorkspaceMarket: vi.fn(),
}))
vi.mock('@/lib/payments/availability', () => ({
  resolveAvailablePaymentMethods: vi.fn(),
}))

import {
  collectPayment,
  finalizeInvoice,
  fetchInvoiceById,
  getAvailablePaymentMethods,
  getPaymentLink,
  issueInvoice,
  recordPayment,
} from '@/actions/invoices'
import { auth } from '@/lib/auth'
import { ensureTrainerIdForUser } from '@/lib/trainer'
import {
  createAndSubmitPaymentEntry,
  createInvoice,
  getInvoiceByIdForTrainer,
  getInvoiceCompany,
  submitSalesInvoice,
} from '@/lib/business-data/erp-adapter'
import { generatePaymentLink, logPaymentEvent } from '@/lib/whish'
import { getTenantContext } from '@/lib/tenant/context'
import { resolveWorkspaceMarket } from '@/lib/tenant/market'
import { resolveAvailablePaymentMethods } from '@/lib/payments/availability'
import {
  PaymentAccountMissingError,
  PaymentConfigurationUnavailableError,
  PaymentMethodNotFoundError,
} from '@/lib/payments/errors'
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
    id:          'PE-0001',
    invoiceId:   'SINV-1',
    clientId:    'CUST-1',
    trainerId:   '',
    amount:      100,
    currency:    'USD',
    provider:    'cash',
    methodId:    'cash',
    methodLabel: 'Cash',
    paidAt:      '2026-05-16',
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
  // Safe default: unverified/no market. Tests that need a verified-LB
  // workspace override this explicitly.
  vi.mocked(resolveWorkspaceMarket).mockResolvedValue({ market: null, verified: false })
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

// ─── getPaymentLink — isExternalPaymentsAllowed wiring (Sprint 1 follow-up Item 1) ──
//
// generatePaymentLink is fully mocked in this file (see the module mock
// above) — lib/whish.test.ts covers the actual blocking behavior. These
// tests cover the other half: that this action layer resolves
// isExternalPaymentsAllowed() itself and threads the real result through as
// generatePaymentLink's 6th argument, rather than never calling it (which is
// exactly the bug this follow-up round found and fixed) or hardcoding `true`.

describe('getPaymentLink — isExternalPaymentsAllowed wiring', () => {
  const ENV_KEY = 'PILOT_ALLOW_EXTERNAL_PAYMENTS'
  let savedEnv: string | undefined

  beforeEach(() => {
    mockAuth()
    savedEnv = process.env[ENV_KEY]
    delete process.env[ENV_KEY]
    vi.mocked(generatePaymentLink).mockResolvedValue({ success: true, url: 'https://example.test/pay/1', reference: 'ref-1' })
  })
  afterEach(() => {
    if (savedEnv === undefined) delete process.env[ENV_KEY]
    else process.env[ENV_KEY] = savedEnv
    vi.clearAllMocks()
  })

  it('passes externalPaymentsAllowed=false when PILOT_ALLOW_EXTERNAL_PAYMENTS is unset (the real default)', async () => {
    await getPaymentLink({ invoiceId: 'SINV-1', amount: 100, clientName: 'Jane Doe', provider: 'whish' })

    expect(generatePaymentLink).toHaveBeenCalledWith(100, 'Jane Doe', 'SINV-1', 'whish', 'USD', false)
  })

  it('passes externalPaymentsAllowed=true when PILOT_ALLOW_EXTERNAL_PAYMENTS=true', async () => {
    process.env[ENV_KEY] = 'true'

    await getPaymentLink({ invoiceId: 'SINV-1', amount: 100, clientName: 'Jane Doe', provider: 'whish' })

    expect(generatePaymentLink).toHaveBeenCalledWith(100, 'Jane Doe', 'SINV-1', 'whish', 'USD', true)
  })

  it('resolves the flag for every provider, not only whish (the callee decides relevance)', async () => {
    await getPaymentLink({ invoiceId: 'SINV-1', amount: 100, clientName: 'Jane Doe', provider: 'cash' })

    expect(generatePaymentLink).toHaveBeenCalledWith(100, 'Jane Doe', 'SINV-1', 'cash', 'USD', false)
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

  it('rejects usdt — not a supported catalog method, must remain unavailable', async () => {
    const result = await recordPayment({ ...BASE, method: 'usdt' as PaymentMethod })
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

  // ── Audit event carries exact identity ─────────────────────────────────────

  it('logs the exact three-field identity on the audit event, and never sets the link-routing provider field', async () => {
    vi.mocked(getInvoiceByIdForTrainer).mockResolvedValue(invoice({ status: 'sent', outstandingAmount: 100 }))
    vi.mocked(createAndSubmitPaymentEntry).mockResolvedValue({
      payment: payment(),
      invoice: invoice({ status: 'paid', outstandingAmount: 0 }),
    })

    // 'cash' is the only currently-enabled method (every Lebanon-only method
    // is held — see lib/payments/methods.ts), so it is the one live case
    // that can actually reach logPaymentEvent. It still proves the WIRING is
    // correct: methods.test.ts separately proves paymentMethodLabel/
    // paymentMethodToErpMode are correct for all seven catalog ids
    // (including the held ones) — together these prove recordPayment will
    // forward the right values for any method the moment it is enabled.
    await recordPayment({ ...BASE, method: 'cash' })

    const call = vi.mocked(logPaymentEvent).mock.calls[0][0]
    expect(call.method).toBe('cash')
    expect(call.methodLabel).toBe('Cash')
    expect(call.erpModeOfPayment).toBe('Cash')
    // The link-routing `provider` field must never be set on a
    // payment_recorded event — that was the source of the contradictory
    // `{ provider: 'cash', method: 'mymonty' }` class of audit record.
    expect(call.provider).toBeUndefined()
    expect('provider' in call).toBe(false)
  })

  it('rejects every Lebanon-only method for an unverified workspace, before any ERP access or audit event', async () => {
    const LB_METHODS = ['whish_money', 'omt', 'mymonty', 'suyool', 'purpl', 'bank_transfer_fresh_usd'] as const
    for (const method of LB_METHODS) {
      vi.clearAllMocks()
      mockAuth()
      vi.mocked(getInvoiceByIdForTrainer).mockResolvedValue(invoice())

      const result = await recordPayment({ ...BASE, method })

      expect(result.success).toBe(false)
      if (!result.success) expect(result.code).toBe('PAYMENT_FEATURE_DISABLED')
      expect(createAndSubmitPaymentEntry).not.toHaveBeenCalled()
      expect(logPaymentEvent).not.toHaveBeenCalled()
    }
  })

  it('a verified-LB workspace CAN record a Lebanon-only method — the gate lifts once authority is proven', async () => {
    vi.mocked(resolveWorkspaceMarket).mockResolvedValue({ market: 'LB', verified: true })
    vi.mocked(getInvoiceByIdForTrainer).mockResolvedValue(invoice())
    vi.mocked(createAndSubmitPaymentEntry).mockResolvedValue({
      payment: payment(),
      invoice: invoice({ status: 'paid', outstandingAmount: 0 }),
    })

    const result = await recordPayment({ ...BASE, method: 'mymonty' })

    expect(result.success).toBe(true)
    expect(createAndSubmitPaymentEntry).toHaveBeenCalledWith(
      expect.objectContaining({ modeOfPayment: 'MyMonty' }),
    )
  })

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

  it('whish_money is rejected before any ERP call for an unverified workspace — never reaches the mode-mapping step', async () => {
    // lib/payments/methods.test.ts separately proves paymentMethodToErpMode
    // still correctly maps 'whish_money' -> 'Whish Money' at the catalog
    // level; this proves recordPayment's own market gate rejects it first
    // for a workspace with no verified LB authority (the default mock).
    const result = await recordPayment({ ...BASE, method: 'whish_money' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('PAYMENT_FEATURE_DISABLED')
    expect(createAndSubmitPaymentEntry).not.toHaveBeenCalled()
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

  it('maps an account-missing ERP error to PAYMENT_ACCOUNT_MISSING with a safe message', async () => {
    vi.mocked(getInvoiceByIdForTrainer).mockResolvedValue(invoice({ outstandingAmount: 100 }))
    vi.mocked(createAndSubmitPaymentEntry).mockRejectedValue(
      new PaymentAccountMissingError('Cash', 'Test Company'),
    )
    const result = await recordPayment({ ...BASE, amount: 100 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('PAYMENT_ACCOUNT_MISSING')
      // Safe, non-alarming message — never the raw ERP "No deposit account" 503.
      expect(result.error).toMatch(/deposit account/i)
      expect(result.error).not.toMatch(/503/)
    }
  })

  it('maps a method-not-found ERP error to PAYMENT_METHOD_NOT_FOUND (never account-missing)', async () => {
    vi.mocked(getInvoiceByIdForTrainer).mockResolvedValue(invoice({ outstandingAmount: 100 }))
    vi.mocked(createAndSubmitPaymentEntry).mockRejectedValue(
      new PaymentMethodNotFoundError('Whish Money'),
    )
    const result = await recordPayment({ ...BASE, amount: 100 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('PAYMENT_METHOD_NOT_FOUND')
      expect(result.code).not.toBe('PAYMENT_ACCOUNT_MISSING')
    }
  })

  it('rejects a non-catalog method (usdt) before any ERP call, with PAYMENT_FEATURE_DISABLED', async () => {
    const result = await recordPayment({ ...BASE, method: 'usdt' as PaymentMethod })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('PAYMENT_FEATURE_DISABLED')
      expect(result.error).toMatch(/not available/i)
    }
    expect(createAndSubmitPaymentEntry).not.toHaveBeenCalled()
  })
})

// ─── getAvailablePaymentMethods ───────────────────────────────────────────────

describe('getAvailablePaymentMethods', () => {
  beforeEach(() => {
    mockAuth()
    vi.mocked(getTenantContext).mockResolvedValue({
      userId: 'user-1', slug: 'gym', tenantId: 'tenant-1',
      provisioningStatus: 'provisioned', lastSyncedAt: null,
    })
    vi.mocked(getInvoiceByIdForTrainer).mockResolvedValue(invoice())
    vi.mocked(getInvoiceCompany).mockResolvedValue('Test Company')
  })
  afterEach(() => { vi.clearAllMocks() })

  it('returns the tenant-validated available methods', async () => {
    vi.mocked(resolveAvailablePaymentMethods).mockResolvedValue({
      methods:   [{ id: 'cash', label: 'Cash', status: 'available', depositAccount: 'Cash - TC' }],
      available: [{ id: 'cash', label: 'Cash', status: 'available', depositAccount: 'Cash - TC' }],
      stale:     false,
    })
    const result = await getAvailablePaymentMethods('SINV-1')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.available.map(m => m.id)).toEqual(['cash'])
    }
    // Availability is resolved for the invoice's own company + currency.
    expect(resolveAvailablePaymentMethods).toHaveBeenCalledWith(
      expect.objectContaining({ company: 'Test Company', currency: 'USD', tenantId: 'tenant-1' }),
    )
  })

  it('resolves market server-side and passes it to resolveAvailablePaymentMethods — never client-supplied', async () => {
    vi.mocked(resolveWorkspaceMarket).mockResolvedValue({ market: 'LB', verified: true })
    vi.mocked(resolveAvailablePaymentMethods).mockResolvedValue({
      methods: [], available: [], stale: false,
    })

    await getAvailablePaymentMethods('SINV-1')

    expect(resolveAvailablePaymentMethods).toHaveBeenCalledWith(
      expect.objectContaining({ market: 'LB' }),
    )
  })

  it('an unverified workspace resolves market: null, passed through unchanged', async () => {
    vi.mocked(resolveAvailablePaymentMethods).mockResolvedValue({
      methods: [], available: [], stale: false,
    })

    await getAvailablePaymentMethods('SINV-1')

    expect(resolveAvailablePaymentMethods).toHaveBeenCalledWith(
      expect.objectContaining({ market: null }),
    )
  })

  it('Control Plane unavailable (market resolver fails closed) still leaves Cash available — the probe itself is unaffected', async () => {
    // resolveWorkspaceMarket never throws (see lib/tenant/market.test.ts); a
    // Control-Plane outage surfaces here as market: null, exactly like an
    // ordinary unverified workspace — never as a getAvailablePaymentMethods
    // failure by itself.
    vi.mocked(resolveWorkspaceMarket).mockResolvedValue({ market: null, verified: false })
    vi.mocked(resolveAvailablePaymentMethods).mockResolvedValue({
      methods:   [{ id: 'cash', label: 'Cash', status: 'available', depositAccount: 'Cash - TC' }],
      available: [{ id: 'cash', label: 'Cash', status: 'available', depositAccount: 'Cash - TC' }],
      stale:     false,
    })

    const result = await getAvailablePaymentMethods('SINV-1')

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.available.map(m => m.id)).toEqual(['cash'])
  })

  it('returns PAYMENT_CONFIGURATION_UNAVAILABLE when the probe cannot resolve (no method assumed)', async () => {
    vi.mocked(resolveAvailablePaymentMethods).mockRejectedValue(new PaymentConfigurationUnavailableError())
    const result = await getAvailablePaymentMethods('SINV-1')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('PAYMENT_CONFIGURATION_UNAVAILABLE')
  })

  it('fails closed to PAYMENT_CONFIGURATION_UNAVAILABLE when tenant context is missing', async () => {
    vi.mocked(getTenantContext).mockResolvedValue(null)
    const result = await getAvailablePaymentMethods('SINV-1')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('PAYMENT_CONFIGURATION_UNAVAILABLE')
    // Never probes ERP without a resolved tenant.
    expect(resolveAvailablePaymentMethods).not.toHaveBeenCalled()
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
    const result = await collectPayment({ ...BASE, method: 'usdt' as PaymentMethod })
    expect(result.success).toBe(false)
    expect(getInvoiceByIdForTrainer).not.toHaveBeenCalled()
    expect(submitSalesInvoice).not.toHaveBeenCalled()
    expect(createAndSubmitPaymentEntry).not.toHaveBeenCalled()
  })

  it('rejects a Lebanon-only method for an unverified workspace before any ERP access — same gate as recordPayment', async () => {
    const result = await collectPayment({ ...BASE, method: 'purpl' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('PAYMENT_FEATURE_DISABLED')
    expect(getInvoiceByIdForTrainer).not.toHaveBeenCalled()
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
