import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `client.ts` imports lib/tenant/context which has `import "server-only"` —
// that package is not available in vitest. Mock the module before any import
// runs (vitest hoists vi.mock calls automatically).
vi.mock('@/lib/tenant/context', () => ({
  getTenantContext: vi.fn(),
}))

import {
  clampDueDate,
  clientFields,
  createAndSubmitPaymentEntry,
  createInvoice,
  getPaymentEntry,
  mapInvoiceStatus,
  mapPaymentProvider,
  normalizeClient,
  normalizeInvoice,
  submitPaymentEntry,
  submitSalesInvoice,
} from './client'
import { getTenantContext } from '@/lib/tenant/context'
import type { ERPClient, ERPInvoice } from './types'

describe('clientFields', () => {
  it('returns valid JSON array', () => {
    const parsed = JSON.parse(clientFields())
    expect(Array.isArray(parsed)).toBe(true)
  })

  it('includes required ERPNext fields', () => {
    const fields: string[] = JSON.parse(clientFields())
    expect(fields).toContain('name')
    expect(fields).toContain('customer_name')
    expect(fields).toContain('creation')
  })

  it('includes provisioned FitDesk custom fields', () => {
    const fields: string[] = JSON.parse(clientFields())
    // These four are provisioned by provisioning_api/api/fitdesk_setup.py.
    // Anything not in fitdesk_setup.py must NOT be requested — Frappe 417s.
    expect(fields).toContain('custom_fitness_goals')
    expect(fields).toContain('custom_trainer_notes')
    expect(fields).toContain('custom_package_type')
    expect(fields).toContain('custom_remaining_sessions')
  })

  it('does not request fields not provisioned in the target tenant', () => {
    const fields: string[] = JSON.parse(clientFields())
    // These are mapped by normalizeClient (forward-compat) but not provisioned;
    // requesting them would 417.
    expect(fields).not.toContain('custom_blood_type')
    expect(fields).not.toContain('custom_emergency_contact_name')
    expect(fields).not.toContain('custom_emergency_contact_phone')
  })

  it('does not contain server-rejected fields', () => {
    const fields: string[] = JSON.parse(clientFields())
    // Frappe permission_query_conditions rejects unknown or restricted fields with 417
    expect(fields).not.toContain('owner')        // not needed on Customer
    expect(fields).not.toContain('modified_by')
    expect(fields).not.toContain('docstatus')
  })
})

describe('normalizeClient', () => {
  const minimal: ERPClient = {
    name: 'CUST-0001',
    customer_name: 'Jane Doe',
    creation: '2026-01-15 10:00:00.000000',
    modified: '2026-01-15 10:00:00.000000',
  }

  it('maps required fields', () => {
    const client = normalizeClient(minimal)
    expect(client.id).toBe('CUST-0001')
    expect(client.name).toBe('Jane Doe')
    expect(client.createdAt).toBe('2026-01-15 10:00:00.000000')
  })

  it('omits undefined optional fields', () => {
    const client = normalizeClient(minimal)
    expect(client.mobile).toBeUndefined()
    expect(client.fitnessGoals).toBeUndefined()
    expect(client.trainerNotes).toBeUndefined()
    expect(client.packageType).toBeUndefined()
  })

  it('maps optional fields when present', () => {
    const full: ERPClient = {
      ...minimal,
      mobile_no: '+961-70-123456',
      custom_fitness_goals: 'Weight loss',
      custom_trainer_notes: 'Knee injury',
      custom_package_type: 'Monthly',
      custom_blood_type: 'O+',
      custom_emergency_contact_name: 'John Doe',
      custom_emergency_contact_phone: '+961-70-654321',
      custom_remaining_sessions: 8,
    }
    const client = normalizeClient(full)
    expect(client.mobile).toBe('+961-70-123456')
    expect(client.fitnessGoals).toBe('Weight loss')
    expect(client.trainerNotes).toBe('Knee injury')
    expect(client.packageType).toBe('Monthly')
    expect(client.bloodType).toBe('O+')
    expect(client.emergencyContactName).toBe('John Doe')
    expect(client.emergencyContactPhone).toBe('+961-70-654321')
    expect(client.remainingSessions).toBe(8)
  })

  it('leaves absent optional fields as undefined', () => {
    // ERPClient fields are optional (string | undefined) — absent fields must
    // not appear on the normalized Client shape.
    const sparse: ERPClient = {
      name: 'CUST-0002',
      customer_name: 'Sparse Client',
      creation: '2026-02-01 00:00:00.000000',
      modified: '2026-02-01 00:00:00.000000',
    }
    const client = normalizeClient(sparse)
    expect(client.mobile).toBeUndefined()
    expect(client.fitnessGoals).toBeUndefined()
    expect(client.remainingSessions).toBeUndefined()
  })
})

describe('mapInvoiceStatus', () => {
  it('maps real ERPNext Sales Invoice statuses', () => {
    expect(mapInvoiceStatus('Draft')).toBe('draft')
    expect(mapInvoiceStatus('Unpaid')).toBe('sent')
    expect(mapInvoiceStatus('Overdue')).toBe('overdue')
    expect(mapInvoiceStatus('Partly Paid')).toBe('partially_paid')
    expect(mapInvoiceStatus('Paid')).toBe('paid')
    expect(mapInvoiceStatus('Cancelled')).toBe('cancelled')
    expect(mapInvoiceStatus('Return')).toBe('cancelled')
    expect(mapInvoiceStatus('Credit Note Issued')).toBe('cancelled')
  })

  it('maps legacy "Submitted" to sent for backward compatibility', () => {
    expect(mapInvoiceStatus('Submitted')).toBe('sent')
  })

  it('falls back to draft for unknown status', () => {
    expect(mapInvoiceStatus('')).toBe('draft')
    expect(mapInvoiceStatus('UNKNOWN_STATUS')).toBe('draft')
    expect(mapInvoiceStatus('Internal Transfer')).toBe('draft')
  })
})

describe('normalizeInvoice', () => {
  const raw: ERPInvoice = {
    name: 'SINV-00001',
    customer: 'CUST-00001',
    customer_name: 'John Doe',
    posting_date: '2026-01-01',
    due_date: '2026-01-15',
    grand_total: 500,
    outstanding_amount: 500,
    currency: 'USD',
    status: 'Unpaid',
    creation: '2026-01-01 10:00:00.000000',
    modified: '2026-01-01 10:00:00.000000',
  }

  it('maps required fields correctly', () => {
    const inv = normalizeInvoice(raw)
    expect(inv.id).toBe('SINV-00001')
    expect(inv.clientId).toBe('CUST-00001')
    expect(inv.clientName).toBe('John Doe')
    expect(inv.amount).toBe(500)
    expect(inv.outstandingAmount).toBe(500)
    expect(inv.currency).toBe('USD')
    expect(inv.dueDate).toBe('2026-01-15')
    expect(inv.issuedAt).toBe('2026-01-01')
  })

  it('trainerId is always empty string', () => {
    expect(normalizeInvoice(raw).trainerId).toBe('')
  })

  it('falls back clientName to docname when customer_name is absent', () => {
    const inv = normalizeInvoice({ ...raw, customer_name: undefined })
    expect(inv.clientName).toBe('CUST-00001')
  })

  it('defaults currency to USD when absent', () => {
    const inv = normalizeInvoice({ ...raw, currency: undefined as never })
    expect(inv.currency).toBe('USD')
  })

  it('maps status via mapInvoiceStatus', () => {
    expect(normalizeInvoice({ ...raw, status: 'Draft' }).status).toBe('draft')
    expect(normalizeInvoice({ ...raw, status: 'Unpaid' }).status).toBe('sent')
    expect(normalizeInvoice({ ...raw, status: 'Partly Paid' }).status).toBe('partially_paid')
    expect(normalizeInvoice({ ...raw, status: 'Paid' }).status).toBe('paid')
    expect(normalizeInvoice({ ...raw, status: 'Overdue' }).status).toBe('overdue')
    expect(normalizeInvoice({ ...raw, status: 'Cancelled' }).status).toBe('cancelled')
  })

  it('sets paidAt to modified date (YYYY-MM-DD) when status is Paid', () => {
    const inv = normalizeInvoice({
      ...raw,
      status: 'Paid',
      outstanding_amount: 0,
      modified: '2026-02-14 09:30:15.000000',
    })
    expect(inv.paidAt).toBe('2026-02-14')
  })

  it('sets paidAt when outstanding is 0 even if status mapping is unusual', () => {
    const inv = normalizeInvoice({
      ...raw,
      status: 'Submitted',
      outstanding_amount: 0,
      modified: '2026-02-14 09:30:15.000000',
    })
    expect(inv.paidAt).toBe('2026-02-14')
  })

  it('leaves paidAt undefined when invoice is not fully paid', () => {
    expect(normalizeInvoice({ ...raw, status: 'Unpaid', outstanding_amount: 500 }).paidAt).toBeUndefined()
    expect(normalizeInvoice({ ...raw, status: 'Overdue',   outstanding_amount: 250 }).paidAt).toBeUndefined()
  })
})

describe('mapPaymentProvider', () => {
  it('detects whish', () => {
    expect(mapPaymentProvider('Whish Money')).toBe('whish')
    expect(mapPaymentProvider('whish')).toBe('whish')
    expect(mapPaymentProvider('WHISH TRANSFER')).toBe('whish')
  })

  it('detects bank transfer', () => {
    expect(mapPaymentProvider('Bank Transfer')).toBe('bank_transfer')
    expect(mapPaymentProvider('Wire Transfer')).toBe('bank_transfer')
    expect(mapPaymentProvider('bank')).toBe('bank_transfer')
  })

  it('defaults to cash', () => {
    expect(mapPaymentProvider('Cash')).toBe('cash')
    expect(mapPaymentProvider('card')).toBe('cash')
    expect(mapPaymentProvider('')).toBe('cash')
  })
})

describe('clampDueDate', () => {
  it('raises a due date that precedes the posting date', () => {
    expect(clampDueDate('2026-05-16', '2026-05-10')).toBe('2026-05-16')
  })

  it('leaves a due date equal to the posting date unchanged', () => {
    expect(clampDueDate('2026-05-16', '2026-05-16')).toBe('2026-05-16')
  })

  it('leaves a due date after the posting date unchanged', () => {
    expect(clampDueDate('2026-05-16', '2026-05-23')).toBe('2026-05-23')
  })
})

describe('createInvoice', () => {
  const RAW_INVOICE: ERPInvoice = {
    name:               'SINV-00010',
    customer:           'CUST-1',
    customer_name:      'Jane Doe',
    posting_date:       '2026-05-16',
    due_date:           '2026-05-16',
    grand_total:        100,
    outstanding_amount: 100,
    currency:           'USD',
    status:             'Draft',
    creation:           '2026-05-16 10:00:00.000000',
    modified:           '2026-05-16 10:00:00.000000',
  }

  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    process.env.CONTROL_PLANE_URL = 'http://control-plane.test'
    process.env.FITDESK_JWT_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef'
    vi.mocked(getTenantContext).mockResolvedValue({
      userId:             'user-1',
      slug:               'tenant-1',
      tenantId:           'tenant-1',
      provisioningStatus: 'ready',
      lastSyncedAt:       null,
    })
    fetchMock = vi.fn().mockResolvedValue({
      ok:   true,
      json: async () => ({ data: RAW_INVOICE }),
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** Parse the JSON body POSTed to ERPNext on the first fetch call. */
  function postedBody(): Record<string, unknown> {
    return JSON.parse(fetchMock.mock.calls[0][1].body as string)
  }

  it('sends set_posting_time: 1 so ERPNext honors the supplied posting_date', async () => {
    await createInvoice({
      customer:     'CUST-1',
      posting_date: '2026-05-16',
      due_date:     '2026-05-16',
      items:        [{ item_code: 'TRAINING-SESSION', qty: 1, rate: 100 }],
    })

    expect(postedBody().set_posting_time).toBe(1)
  })

  it('preserves posting_date and normalizes a due_date that precedes it', async () => {
    await createInvoice({
      customer:     'CUST-1',
      posting_date: '2026-05-16',
      due_date:     '2026-05-10',
      items:        [{ item_code: 'TRAINING-SESSION', qty: 1, rate: 100 }],
    })

    const body = postedBody()
    expect(body.posting_date).toBe('2026-05-16')
    expect(body.due_date).toBe('2026-05-16')
  })
})

describe('createAndSubmitPaymentEntry / submitPaymentEntry / getPaymentEntry', () => {
  const DRAFT_PE = {
    name:            'PE-0001',
    doctype:         'Payment Entry',
    docstatus:       0,
    payment_type:    'Receive' as const,
    party_type:      'Customer' as const,
    party:           'CUST-1',
    paid_amount:     100,
    received_amount: 100,
    currency:        'USD',
    payment_date:    '2026-05-16',
    mode_of_payment: 'Cash',
    paid_to:         'Cash - ACME',
    creation:        '2026-05-16 12:00:00.000000',
  }
  const SUBMITTED_PE = { ...DRAFT_PE, docstatus: 1 }

  function rawInvoice(overrides: Partial<ERPInvoice> = {}): ERPInvoice {
    return {
      name:               'SINV-1',
      customer:           'CUST-1',
      customer_name:      'Jane Doe',
      posting_date:       '2026-05-01',
      due_date:           '2026-05-15',
      grand_total:        100,
      outstanding_amount: 0,
      currency:           'USD',
      status:             'Paid',
      creation:           '2026-05-01 10:00:00.000000',
      modified:           '2026-05-16 12:00:00.000000',
      ...overrides,
    }
  }

  interface ScenarioOpts {
    accounts?: Array<{ company?: string; default_account?: string }>
    invoiceAfter?: ERPInvoice
  }

  type RecordedCall = { url: string; method: string; body: unknown }

  function setupFetch(opts: ScenarioOpts = {}): { calls: RecordedCall[] } {
    const accounts = opts.accounts ?? [{ company: 'ACME', default_account: 'Cash - ACME' }]
    const invoiceAfter = opts.invoiceAfter ?? rawInvoice()
    let invoiceReads = 0
    const calls: RecordedCall[] = []

    const fetchMock = vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      const body = init?.body ? JSON.parse(init.body) : undefined
      calls.push({ url, method, body })

      const json = (data: unknown) => ({ ok: true, json: async () => data })

      if (url.includes('/api/erp/method/frappe.client.submit')) {
        return json({ message: SUBMITTED_PE })
      }
      // getPaymentEntry — single doc read (has a trailing /docname).
      if (url.includes('/api/erp/doctype/Payment%20Entry/')) {
        return json({ data: DRAFT_PE })
      }
      // create Payment Entry — collection POST (no /docname).
      if (url.includes('/api/erp/doctype/Payment%20Entry')) {
        return json({ data: DRAFT_PE })
      }
      if (url.includes('/api/erp/doctype/Mode%20of%20Payment/')) {
        return json({ data: { accounts } })
      }
      if (url.includes('/api/erp/doctype/Sales%20Invoice/')) {
        invoiceReads += 1
        // 1st read = Step 1 company fetch; 2nd = Step 5 post-submit re-fetch.
        return invoiceReads === 1
          ? json({ data: { company: 'ACME' } })
          : json({ data: invoiceAfter })
      }
      throw new Error(`unexpected fetch: ${method} ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    return { calls }
  }

  const PAY_OPTS = {
    invoiceId:     'SINV-1',
    clientId:      'CUST-1',
    amount:        100,
    modeOfPayment: 'Cash',
    date:          '2026-05-16',
  }

  beforeEach(() => {
    process.env.CONTROL_PLANE_URL = 'http://control-plane.test'
    process.env.FITDESK_JWT_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef'
    vi.mocked(getTenantContext).mockResolvedValue({
      userId:             'user-1',
      slug:               'tenant-1',
      tenantId:           'tenant-1',
      provisioningStatus: 'ready',
      lastSyncedAt:       null,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('creates a Payment Entry and then submits it', async () => {
    const { calls } = setupFetch()
    await createAndSubmitPaymentEntry(PAY_OPTS)

    const createIdx = calls.findIndex(
      c => c.method === 'POST' && c.url.includes('/api/erp/doctype/Payment%20Entry'),
    )
    const submitIdx = calls.findIndex(
      c => c.url.includes('/api/erp/method/frappe.client.submit'),
    )
    expect(createIdx).toBeGreaterThanOrEqual(0)
    expect(submitIdx).toBeGreaterThan(createIdx)
  })

  it('submits the full fetched Payment Entry document via frappe.client.submit', async () => {
    const { calls } = setupFetch()
    await createAndSubmitPaymentEntry(PAY_OPTS)

    const submitCall = calls.find(c => c.url.includes('/api/erp/method/frappe.client.submit'))
    expect(submitCall).toBeDefined()
    const sentDoc = (submitCall?.body as { doc?: { name?: string } }).doc
    expect(sentDoc?.name).toBe('PE-0001')
  })

  it('re-fetches the Sales Invoice after submitting the payment', async () => {
    const { calls } = setupFetch()
    await createAndSubmitPaymentEntry(PAY_OPTS)

    const submitIdx = calls.findIndex(c => c.url.includes('/api/erp/method/frappe.client.submit'))
    const lastCall = calls[calls.length - 1]
    expect(lastCall.method).toBe('GET')
    expect(lastCall.url).toContain('/api/erp/doctype/Sales%20Invoice/SINV-1')
    expect(calls.length - 1).toBeGreaterThan(submitIdx)
  })

  it('returns the submitted payment and the re-fetched invoice', async () => {
    setupFetch({ invoiceAfter: rawInvoice({ outstanding_amount: 0, status: 'Paid' }) })
    const result = await createAndSubmitPaymentEntry(PAY_OPTS)
    expect(result.payment.id).toBe('PE-0001')
    expect(result.invoice.id).toBe('SINV-1')
    expect(result.invoice.outstandingAmount).toBe(0)
    expect(result.invoice.status).toBe('paid')
  })

  it('throws a clear error when the Mode of Payment has no account', async () => {
    setupFetch({ accounts: [] })
    await expect(createAndSubmitPaymentEntry(PAY_OPTS)).rejects.toThrow(/No deposit account/)
  })

  it('does not create a Payment Entry when the account is missing', async () => {
    const { calls } = setupFetch({ accounts: [] })
    await expect(createAndSubmitPaymentEntry(PAY_OPTS)).rejects.toThrow()
    expect(calls.some(c => c.method === 'POST' && c.url.includes('Payment%20Entry'))).toBe(false)
  })

  it('getPaymentEntry fetches the document by docname', async () => {
    setupFetch()
    const doc = await getPaymentEntry('PE-0001')
    expect(doc.name).toBe('PE-0001')
  })

  it('submitPaymentEntry submits via the /api/erp/method path and returns the submitted doc', async () => {
    const { calls } = setupFetch()
    const submitted = await submitPaymentEntry('PE-0001')
    expect(submitted.name).toBe('PE-0001')
    expect(calls.some(c => c.url.includes('/api/erp/method/frappe.client.submit'))).toBe(true)
  })
})

describe('submitSalesInvoice', () => {
  function rawInvoice(overrides: Partial<ERPInvoice> = {}): ERPInvoice {
    return {
      name:               'SINV-1',
      customer:           'CUST-1',
      customer_name:      'Jane Doe',
      posting_date:       '2026-05-01',
      due_date:           '2026-05-15',
      grand_total:        100,
      outstanding_amount: 100,
      currency:           'USD',
      status:             'Draft',
      creation:           '2026-05-01 10:00:00.000000',
      modified:           '2026-05-16 12:00:00.000000',
      ...overrides,
    }
  }

  interface ScenarioOpts {
    invoiceAfter?: ERPInvoice
    submitFails?: boolean
  }

  type RecordedCall = { url: string; method: string; body: unknown }

  function setupFetch(opts: ScenarioOpts = {}): { calls: RecordedCall[] } {
    const draftDoc = rawInvoice({ status: 'Draft' })
    const invoiceAfter = opts.invoiceAfter ?? rawInvoice({ status: 'Unpaid', outstanding_amount: 100 })
    let invoiceReads = 0
    const calls: RecordedCall[] = []

    const fetchMock = vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      const body = init?.body ? JSON.parse(init.body) : undefined
      calls.push({ url, method, body })

      const json = (data: unknown) => ({ ok: true, json: async () => data })

      if (url.includes('/api/erp/method/frappe.client.submit')) {
        if (opts.submitFails) {
          return {
            ok:         false,
            status:     417,
            statusText: 'Expectation Failed',
            text:       async () => 'Income account is mandatory',
          }
        }
        return json({ message: { ...draftDoc, status: 'Unpaid', docstatus: 1 } })
      }
      if (url.includes('/api/erp/doctype/Sales%20Invoice/')) {
        invoiceReads += 1
        // 1st read = raw doc fetched for submit; 2nd = post-submit re-fetch.
        return invoiceReads === 1
          ? json({ data: draftDoc })
          : json({ data: invoiceAfter })
      }
      throw new Error(`unexpected fetch: ${method} ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    return { calls }
  }

  beforeEach(() => {
    process.env.CONTROL_PLANE_URL = 'http://control-plane.test'
    process.env.FITDESK_JWT_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef'
    vi.mocked(getTenantContext).mockResolvedValue({
      userId:             'user-1',
      slug:               'tenant-1',
      tenantId:           'tenant-1',
      provisioningStatus: 'ready',
      lastSyncedAt:       null,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches the full Sales Invoice document before submitting (no fields filter)', async () => {
    const { calls } = setupFetch()
    await submitSalesInvoice('SINV-1')

    expect(calls[0].method).toBe('GET')
    expect(calls[0].url).toContain('/api/erp/doctype/Sales%20Invoice/SINV-1')
    expect(calls[0].url).not.toContain('fields')
  })

  it('submits via the /api/erp/method frappe.client.submit path with the full doc', async () => {
    const { calls } = setupFetch()
    await submitSalesInvoice('SINV-1')

    const submitCall = calls.find(c => c.url.includes('/api/erp/method/frappe.client.submit'))
    expect(submitCall).toBeDefined()
    expect(submitCall?.method).toBe('POST')
    const sentDoc = (submitCall?.body as { doc?: { name?: string } }).doc
    expect(sentDoc?.name).toBe('SINV-1')
  })

  it('re-fetches the invoice after submit and returns the refreshed normalized invoice', async () => {
    const { calls } = setupFetch({ invoiceAfter: rawInvoice({ status: 'Unpaid', outstanding_amount: 100 }) })
    const result = await submitSalesInvoice('SINV-1')

    const submitIdx = calls.findIndex(c => c.url.includes('/api/erp/method/frappe.client.submit'))
    const lastCall = calls[calls.length - 1]
    expect(lastCall.method).toBe('GET')
    expect(lastCall.url).toContain('/api/erp/doctype/Sales%20Invoice/SINV-1')
    expect(calls.length - 1).toBeGreaterThan(submitIdx)

    expect(result.id).toBe('SINV-1')
    expect(result.status).toBe('sent')
  })

  it('propagates an error when the submit call fails', async () => {
    setupFetch({ submitFails: true })
    await expect(submitSalesInvoice('SINV-1')).rejects.toThrow()
  })
})
