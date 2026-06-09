import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock tenant context before module load — erpFetch calls getTenantContext().
vi.mock('@/lib/tenant/context', () => ({
  getTenantContext: vi.fn().mockResolvedValue({
    tenantId: 'test-tenant-id',
    userId:   'test-user-id',
    slug:     'test',
    provisioningStatus: 'provisioned',
    lastSyncedAt: null,
  }),
}))

// Set proxy env vars before the module is evaluated.
vi.hoisted(() => {
  process.env.CONTROL_PLANE_URL   = 'http://cp-api.test:4000'
  process.env.FITDESK_JWT_SECRET  = 'test-jwt-secret-min-32-chars-xxxxxxxxxxxx'
})

import {
  ERPNextError,
  clampDueDate,
  createAndSubmitPaymentEntry,
  getInvoiceById,
  getInvoiceByIdForTrainer,
  getPaymentEntry,
  submitPaymentEntry,
  submitSalesInvoice,
} from './client'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TRAINER_ID = 'trainer-1'
const INVOICE_ID = 'SINV-00001'
const CLIENT_ID  = 'CUST-00001'

function erpOk(data: unknown) {
  return { ok: true, json: async () => ({ data }) }
}

function frappeMethodOk(message: unknown) {
  return { ok: true, json: async () => ({ message }) }
}

function erpError(status: number, statusText: string) {
  return { ok: false, status, statusText, text: async () => statusText }
}

function rawInvoice(clientId = CLIENT_ID) {
  return {
    name:               INVOICE_ID,
    customer:           clientId,
    customer_name:      'Test Client',
    posting_date:       '2026-01-01',
    due_date:           '2026-01-31',
    grand_total:        100,
    outstanding_amount: 100,
    paid_amount:        0,
    currency:           'USD',
    status:             'Draft',
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('getInvoiceByIdForTrainer', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the invoice for the requesting trainer', async () => {
    fetchMock.mockResolvedValueOnce(erpOk(rawInvoice()))

    const invoice = await getInvoiceByIdForTrainer(INVOICE_ID, TRAINER_ID)

    expect(invoice.id).toBe(INVOICE_ID)
    expect(invoice.clientId).toBe(CLIENT_ID)
    // In single-tenant proxy mode only one fetch is needed (the invoice).
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain(INVOICE_ID)
  })

  it('propagates the underlying ERPNextError when the invoice does not exist', async () => {
    fetchMock.mockResolvedValueOnce(erpError(404, 'Not Found'))

    await expect(
      getInvoiceByIdForTrainer(INVOICE_ID, TRAINER_ID),
    ).rejects.toBeInstanceOf(ERPNextError)
  })
})

// ─── clampDueDate ─────────────────────────────────────────────────────────────

describe('clampDueDate', () => {
  it('returns dueDate when it is after postingDate', () => {
    expect(clampDueDate('2026-01-01', '2026-01-31')).toBe('2026-01-31')
  })

  it('returns postingDate when dueDate is before postingDate', () => {
    expect(clampDueDate('2026-01-15', '2026-01-01')).toBe('2026-01-15')
  })

  it('returns postingDate when dueDate equals postingDate', () => {
    expect(clampDueDate('2026-01-15', '2026-01-15')).toBe('2026-01-15')
  })
})

// ─── submitSalesInvoice ───────────────────────────────────────────────────────

const PAYMENT_ENTRY_ID = 'PE-00001'

function rawPaymentEntry(name = PAYMENT_ENTRY_ID) {
  return {
    name,
    payment_type:   'Receive' as const,
    party_type:     'Customer' as const,
    party:           CLIENT_ID,
    paid_amount:     100,
    currency:        'USD',
    payment_date:    '2026-01-15',
    mode_of_payment: 'Cash',
    creation:        '2026-01-15',
  }
}

describe('submitSalesInvoice', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches the draft, submits via frappe.client.submit, and returns the re-fetched invoice', async () => {
    const draftDoc = rawInvoice()
    // Call 1: GET invoice doc for submit
    fetchMock.mockResolvedValueOnce(erpOk(draftDoc))
    // Call 2: POST frappe.client.submit — returns { message: <doc> }, not { data: ... }
    fetchMock.mockResolvedValueOnce(frappeMethodOk({ ...draftDoc, status: 'Submitted' }))
    // Call 3: GET invoice re-fetch (getInvoiceById)
    fetchMock.mockResolvedValueOnce(erpOk({ ...draftDoc, status: 'Submitted' }))

    const invoice = await submitSalesInvoice(INVOICE_ID)

    expect(invoice.id).toBe(INVOICE_ID)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    // Second call must be the frappe.client.submit method
    expect(fetchMock.mock.calls[1][0]).toContain('frappe.client.submit')
    expect(fetchMock.mock.calls[1][1].method).toBe('POST')
  })

  it('throws ERPNextError(502) when submit returns no message', async () => {
    fetchMock.mockResolvedValueOnce(erpOk(rawInvoice()))
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) })

    await expect(submitSalesInvoice(INVOICE_ID)).rejects.toSatisfy(
      (e: unknown) => e instanceof ERPNextError && e.status === 502,
    )
  })

  it('propagates ERPNextError when the initial invoice fetch fails', async () => {
    fetchMock.mockResolvedValueOnce(erpError(404, 'Not Found'))

    await expect(submitSalesInvoice(INVOICE_ID)).rejects.toBeInstanceOf(ERPNextError)
  })
})

// ─── getPaymentEntry ──────────────────────────────────────────────────────────

describe('getPaymentEntry', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the raw ERPPaymentEntry document', async () => {
    fetchMock.mockResolvedValueOnce(erpOk(rawPaymentEntry()))

    const pe = await getPaymentEntry(PAYMENT_ENTRY_ID)

    expect(pe.name).toBe(PAYMENT_ENTRY_ID)
    expect(pe.paid_amount).toBe(100)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain(PAYMENT_ENTRY_ID)
  })

  it('propagates ERPNextError(404) when payment entry does not exist', async () => {
    fetchMock.mockResolvedValueOnce(erpError(404, 'Not Found'))

    await expect(getPaymentEntry(PAYMENT_ENTRY_ID)).rejects.toBeInstanceOf(ERPNextError)
  })
})

// ─── submitPaymentEntry ───────────────────────────────────────────────────────

describe('submitPaymentEntry', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches the PE doc, submits via frappe.client.submit, and returns the submitted PE', async () => {
    const pe = rawPaymentEntry()
    // Call 1: GET payment entry doc
    fetchMock.mockResolvedValueOnce(erpOk(pe))
    // Call 2: POST frappe.client.submit — returns { message: <pe> }, not { data: ... }
    fetchMock.mockResolvedValueOnce(frappeMethodOk(pe))

    const result = await submitPaymentEntry(PAYMENT_ENTRY_ID)

    expect(result.name).toBe(PAYMENT_ENTRY_ID)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toContain('frappe.client.submit')
  })

  it('throws ERPNextError(502) when submit returns no message', async () => {
    fetchMock.mockResolvedValueOnce(erpOk(rawPaymentEntry()))
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) })

    await expect(submitPaymentEntry(PAYMENT_ENTRY_ID)).rejects.toSatisfy(
      (e: unknown) => e instanceof ERPNextError && e.status === 502,
    )
  })
})

// ─── createAndSubmitPaymentEntry ──────────────────────────────────────────────

describe('createAndSubmitPaymentEntry', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const opts = {
    invoiceId:     INVOICE_ID,
    clientId:      CLIENT_ID,
    amount:        100,
    modeOfPayment: 'Cash',
    date:          '2026-01-15',
  }

  function mopResponse(account = 'Cash - TEST') {
    return erpOk({
      accounts: [{ company: 'Test Company', default_account: account }],
    })
  }

  it('executes the 5-step flow and returns { payment, invoice }', async () => {
    const inv = rawInvoice()
    // Step 1: GET invoice for company
    fetchMock.mockResolvedValueOnce(erpOk({ company: 'Test Company' }))
    // Step 2: GET Mode of Payment accounts
    fetchMock.mockResolvedValueOnce(mopResponse())
    // Step 3: POST Payment Entry (create draft)
    fetchMock.mockResolvedValueOnce(erpOk(rawPaymentEntry()))
    // Step 4a: GET PE doc (inside submitPaymentEntry)
    fetchMock.mockResolvedValueOnce(erpOk(rawPaymentEntry()))
    // Step 4b: POST frappe.client.submit for PE — returns { message: <pe> }
    fetchMock.mockResolvedValueOnce(frappeMethodOk(rawPaymentEntry()))
    // Step 5: GET invoice re-fetch
    fetchMock.mockResolvedValueOnce(erpOk(inv))

    const result = await createAndSubmitPaymentEntry(opts)

    expect(result.payment.id).toBe(PAYMENT_ENTRY_ID)
    expect(result.invoice.id).toBe(INVOICE_ID)
    expect(fetchMock).toHaveBeenCalledTimes(6)
    // Step 3 must POST to Payment Entry resource
    expect(fetchMock.mock.calls[2][0]).toContain('Payment%20Entry')
    expect(fetchMock.mock.calls[2][1].method).toBe('POST')
  })

  it('throws ERPNextError(503) when Mode of Payment has no deposit account', async () => {
    // Step 1: GET invoice for company
    fetchMock.mockResolvedValueOnce(erpOk({ company: 'Test Company' }))
    // Step 2: MoP has no accounts
    fetchMock.mockResolvedValueOnce(erpOk({ accounts: [] }))

    await expect(createAndSubmitPaymentEntry(opts)).rejects.toSatisfy(
      (e: unknown) => e instanceof ERPNextError && e.status === 503,
    )
  })

  it('throws ERPNextError(503) when Mode of Payment fetch fails', async () => {
    fetchMock.mockResolvedValueOnce(erpOk({ company: 'Test Company' }))
    // MoP not found — triggers catch → paidTo undefined
    fetchMock.mockResolvedValueOnce(erpError(404, 'Not Found'))

    await expect(createAndSubmitPaymentEntry(opts)).rejects.toSatisfy(
      (e: unknown) => e instanceof ERPNextError && e.status === 503,
    )
  })

  it('propagates ERPNextError when the invoice company fetch fails', async () => {
    fetchMock.mockResolvedValueOnce(erpError(404, 'Not Found'))

    await expect(createAndSubmitPaymentEntry(opts)).rejects.toBeInstanceOf(ERPNextError)
  })
})

// ─── mapInvoiceStatus (via getInvoiceById round-trip) ────────────────────────

describe('mapInvoiceStatus — ERPNext status → app InvoiceStatus', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('maps ERPNext "Unpaid" to app status "sent"', async () => {
    fetchMock.mockResolvedValueOnce(erpOk({ ...rawInvoice(), status: 'Unpaid' }))
    const invoice = await getInvoiceById(INVOICE_ID)
    expect(invoice.status).toBe('sent')
  })

  it('maps ERPNext "Partly Paid" to app status "partially_paid"', async () => {
    fetchMock.mockResolvedValueOnce(
      erpOk({ ...rawInvoice(), status: 'Partly Paid', outstanding_amount: 40, paid_amount: 60 }),
    )
    const invoice = await getInvoiceById(INVOICE_ID)
    expect(invoice.status).toBe('partially_paid')
  })
})
