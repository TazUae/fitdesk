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
  cancelSession,
  clampDueDate,
  createAndSubmitPaymentEntry,
  createSession,
  findInvoiceBySession,
  getClientById,
  getCustomerBillingMode,
  getInvoiceById,
  getInvoiceByIdForTrainer,
  getPaymentEntry,
  getPaymentsForCustomer,
  getSessionById,
  getSessions,
  markSessionComplete,
  markSessionMissed,
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
    posting_date:    '2026-01-15',
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

// ─── getPaymentsForCustomer ───────────────────────────────────────────────────
// Regression coverage for two ERPNext 417 fixes: paymentFields() previously
// requested received_amount/docstatus/status (unread by normalizePayment and
// not part of ERPPaymentEntry) while omitting currency/remarks (which
// normalizePayment does read); it also requested/sorted by `payment_date`,
// which ERPNext's list-query validator rejects outright ("Field not
// permitted in query: payment_date") since the real field is `posting_date`.

describe('getPaymentsForCustomer', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function requestedParam(name: string, callIndex = 0): unknown {
    const url = new URL(fetchMock.mock.calls[callIndex][0] as string)
    const raw = url.searchParams.get(name)
    return raw === null ? null : JSON.parse(raw)
  }

  it('requests exactly the fields normalizePayment consumes', async () => {
    fetchMock.mockResolvedValueOnce(erpOk([rawPaymentEntry()]))

    await getPaymentsForCustomer(CLIENT_ID)

    const fields = requestedParam('fields') as string[]
    expect([...fields].sort()).toEqual(
      ['currency', 'mode_of_payment', 'name', 'paid_amount', 'party', 'posting_date', 'reference_no', 'remarks'].sort(),
    )
  })

  it('excludes received_amount, docstatus, and status — unread and not part of ERPPaymentEntry', async () => {
    fetchMock.mockResolvedValueOnce(erpOk([rawPaymentEntry()]))

    await getPaymentsForCustomer(CLIENT_ID)

    const fields = requestedParam('fields') as string[]
    expect(fields).not.toContain('received_amount')
    expect(fields).not.toContain('docstatus')
    expect(fields).not.toContain('status')
  })

  it('requests posting_date and orders by it — payment_date is rejected by ERPNext ("Field not permitted in query")', async () => {
    fetchMock.mockResolvedValueOnce(erpOk([rawPaymentEntry()]))

    await getPaymentsForCustomer(CLIENT_ID)

    const fields = requestedParam('fields') as string[]
    expect(fields).toContain('posting_date')
    expect(fields).not.toContain('payment_date')

    const url = new URL(fetchMock.mock.calls[0][0] as string)
    const orderby = url.searchParams.get('orderby')
    expect(orderby).toBe('posting_date asc')
    expect(orderby).not.toMatch(/payment_date/)
  })

  it('still filters to submitted, incoming payments for the customer (unaffected by the field trim)', async () => {
    fetchMock.mockResolvedValueOnce(erpOk([rawPaymentEntry()]))

    await getPaymentsForCustomer(CLIENT_ID)

    const filters = requestedParam('filters')
    expect(filters).toEqual([
      ['party_type', '=', 'Customer'],
      ['party', '=', CLIENT_ID],
      ['docstatus', '=', 1],
      ['payment_type', '=', 'Receive'],
    ])
  })

  it('maps currency and remarks from the raw Payment Entry (previously silently dropped)', async () => {
    fetchMock.mockResolvedValueOnce(erpOk([
      { ...rawPaymentEntry(), currency: 'LBP', remarks: 'Cash at front desk' },
    ]))

    const payments = await getPaymentsForCustomer(CLIENT_ID)

    expect(payments).toHaveLength(1)
    expect(payments[0].currency).toBe('LBP')
    expect(payments[0].note).toBe('Cash at front desk')
  })

  it('defaults currency to USD when the raw Payment Entry omits it', async () => {
    const { currency: _currency, ...withoutCurrency } = rawPaymentEntry()
    fetchMock.mockResolvedValueOnce(erpOk([withoutCurrency]))

    const payments = await getPaymentsForCustomer(CLIENT_ID)

    expect(payments[0].currency).toBe('USD')
  })

  it('maps paidAt from posting_date, preferring it over the legacy payment_date fallback', async () => {
    fetchMock.mockResolvedValueOnce(erpOk([
      { ...rawPaymentEntry(), posting_date: '2026-02-01', payment_date: '2026-01-01' },
    ]))

    const payments = await getPaymentsForCustomer(CLIENT_ID)

    expect(payments[0].paidAt).toBe('2026-02-01')
  })

  it('falls back to the legacy payment_date field only when posting_date is absent', async () => {
    const { posting_date: _postingDate, ...withoutPostingDate } = rawPaymentEntry()
    fetchMock.mockResolvedValueOnce(erpOk([
      { ...withoutPostingDate, payment_date: '2026-01-01' },
    ]))

    const payments = await getPaymentsForCustomer(CLIENT_ID)

    expect(payments[0].paidAt).toBe('2026-01-01')
  })

  it('propagates ERPNextError when the read fails (e.g. an ERPNext 417)', async () => {
    fetchMock.mockResolvedValueOnce(erpError(417, 'Expectation Failed'))

    await expect(getPaymentsForCustomer(CLIENT_ID)).rejects.toBeInstanceOf(ERPNextError)
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

// ─── normalizeClient (via getClientById round-trip) ──────────────────────────

function rawCustomer(overrides: Record<string, unknown> = {}) {
  return {
    name:          CLIENT_ID,
    customer_name: 'Test Client',
    mobile_no:     '+1 555 000 0001',
    creation:      '2024-01-01',
    ...overrides,
  }
}

describe('normalizeClient — disabled → status mapping', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('maps disabled: 1 → status "inactive"', async () => {
    fetchMock.mockResolvedValueOnce(erpOk(rawCustomer({ disabled: 1 })))
    const client = await getClientById(CLIENT_ID, TRAINER_ID)
    expect(client.status).toBe('inactive')
  })

  it('maps disabled: 0 → status "active"', async () => {
    fetchMock.mockResolvedValueOnce(erpOk(rawCustomer({ disabled: 0 })))
    const client = await getClientById(CLIENT_ID, TRAINER_ID)
    expect(client.status).toBe('active')
  })

  it('maps absent disabled → status "active"', async () => {
    fetchMock.mockResolvedValueOnce(erpOk(rawCustomer()))
    const client = await getClientById(CLIENT_ID, TRAINER_ID)
    expect(client.status).toBe('active')
  })

  it('passes through email_id when present', async () => {
    fetchMock.mockResolvedValueOnce(erpOk(rawCustomer({ email_id: 'test@example.com' })))
    const client = await getClientById(CLIENT_ID, TRAINER_ID)
    expect(client.email).toBe('test@example.com')
  })

  it('sets email undefined when email_id absent', async () => {
    fetchMock.mockResolvedValueOnce(erpOk(rawCustomer()))
    const client = await getClientById(CLIENT_ID, TRAINER_ID)
    expect(client.email).toBeUndefined()
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

// ─── findInvoiceBySession ─────────────────────────────────────────────────────

const FD_SESSION_DOCNAME = 'fd-session-abc123'

describe('findInvoiceBySession', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null when no invoice exists for the given FD Session docname', async () => {
    fetchMock.mockResolvedValueOnce(erpOk([]))

    const result = await findInvoiceBySession(FD_SESSION_DOCNAME)

    expect(result).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns the normalized invoice when one exists', async () => {
    const inv = { ...rawInvoice(), custom_fd_session: FD_SESSION_DOCNAME }
    fetchMock.mockResolvedValueOnce(erpOk([inv]))

    const result = await findInvoiceBySession(FD_SESSION_DOCNAME)

    expect(result).not.toBeNull()
    expect(result!.id).toBe(INVOICE_ID)
    expect(result!.clientId).toBe(CLIENT_ID)
  })

  it('returns only the first match (limit 1 behaviour)', async () => {
    const inv = { ...rawInvoice(), custom_fd_session: FD_SESSION_DOCNAME }
    fetchMock.mockResolvedValueOnce(erpOk([inv, { ...inv, name: 'SINV-99999' }]))

    const result = await findInvoiceBySession(FD_SESSION_DOCNAME)

    expect(result!.id).toBe(INVOICE_ID)
  })

  it('filters by custom_fd_session in the query params', async () => {
    fetchMock.mockResolvedValueOnce(erpOk([]))

    await findInvoiceBySession(FD_SESSION_DOCNAME)

    const [calledUrl] = fetchMock.mock.calls[0] as [string, unknown]
    expect(calledUrl).toContain('custom_fd_session')
    expect(calledUrl).toContain(encodeURIComponent(FD_SESSION_DOCNAME))
  })

  it('propagates ERPNextError when the ERP call fails', async () => {
    fetchMock.mockResolvedValueOnce(erpError(500, 'Internal Server Error'))

    await expect(findInvoiceBySession(FD_SESSION_DOCNAME)).rejects.toBeInstanceOf(ERPNextError)
  })
})


describe('getCustomerBillingMode', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('maps ERP Customer Package to local package mode', async () => {
    fetchMock.mockResolvedValueOnce(erpOk({ custom_billing_mode: 'Package' }))

    const result = await getCustomerBillingMode(CLIENT_ID)

    expect(result).toBe('package')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain(encodeURIComponent(CLIENT_ID))
    expect(fetchMock.mock.calls[0][0]).toContain('custom_billing_mode')
  })

  it('maps ERP Customer Pay Per Session to local pay_per_session mode', async () => {
    fetchMock.mockResolvedValueOnce(erpOk({ custom_billing_mode: 'Pay Per Session' }))

    await expect(getCustomerBillingMode(CLIENT_ID)).resolves.toBe('pay_per_session')
  })

  it('returns null for Trial, empty, missing, or unknown ERP values', async () => {
    for (const value of ['Trial', '', undefined, 'Something Else']) {
      fetchMock.mockResolvedValueOnce(erpOk({ custom_billing_mode: value }))
      await expect(getCustomerBillingMode(CLIENT_ID)).resolves.toBeNull()
    }
  })
})

// ─── PT Session stubs — orphaned, dead-end by design (Sprint 1 follow-up Item 2) ──
//
// actions/sessions.ts's completeSession/cancelSession/noShowSession call these
// functions. They are unconditional stubs — the PT Session DocType does not
// exist in this ERP instance; live scheduling uses the separate FD Session
// path (lib/scheduling/sessionRepository.ts + sessionCompletionService.ts,
// wired through actions/schedulingActions.ts, not this file). No component or
// route imports completeSession/cancelSession/noShowSession from
// actions/sessions.ts (confirmed by repo-wide grep during this work) — this
// whole call chain is orphaned, not reachable from any UI today.
//
// These tests exist so that if this file is ever "half-fixed" — e.g. someone
// changes getSessions to return real data without also wiring
// createSession/markSessionComplete/cancelSession/markSessionMissed to a real
// backend — the change fails loudly here instead of silently letting
// actions/sessions.ts start reporting false success. See US-017 (No-Show
// Session Outcome) and US-039 (Session Cancel / Reschedule Outcome) in
// docs/execution/FINAL_DOC_PACK_TRACEABILITY_MAP.md for the real, live-backed
// version of this feature that would replace this file's session functions
// entirely, rather than "completing" these stubs in place.

describe('PT Session stubs — orphaned, not wired to a live backend', () => {
  it('getSessions returns an empty list rather than throwing', async () => {
    await expect(getSessions({ trainerId: TRAINER_ID })).resolves.toEqual([])
  })

  it('getSessionById always throws 404 — no session can ever be "found" through this path', async () => {
    await expect(getSessionById('S1', TRAINER_ID)).rejects.toBeInstanceOf(ERPNextError)
    const err = await getSessionById('S1', TRAINER_ID).catch(e => e as ERPNextError)
    expect(err.status).toBe(404)
  })

  it('createSession always throws 503 — never returns a fake-created session', async () => {
    await expect(createSession({
      client: 'CUST-1', trainer: TRAINER_ID, session_date: '2026-01-01',
    })).rejects.toBeInstanceOf(ERPNextError)
    const err = await createSession({
      client: 'CUST-1', trainer: TRAINER_ID, session_date: '2026-01-01',
    }).catch(e => e as ERPNextError)
    expect(err.status).toBe(503)
  })

  it('markSessionComplete always throws 503 — never silently marks a session complete', async () => {
    await expect(markSessionComplete('S1')).rejects.toBeInstanceOf(ERPNextError)
    const err = await markSessionComplete('S1').catch(e => e as ERPNextError)
    expect(err.status).toBe(503)
  })

  it('cancelSession always throws 503 — never silently cancels a session', async () => {
    await expect(cancelSession('S1')).rejects.toBeInstanceOf(ERPNextError)
    const err = await cancelSession('S1').catch(e => e as ERPNextError)
    expect(err.status).toBe(503)
  })

  it('markSessionMissed always throws 503 — never silently marks a no-show', async () => {
    await expect(markSessionMissed('S1')).rejects.toBeInstanceOf(ERPNextError)
    const err = await markSessionMissed('S1').catch(e => e as ERPNextError)
    expect(err.status).toBe(503)
  })
})
