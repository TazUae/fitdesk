import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Set ERP env vars before the module is evaluated — these constants are captured
// at module load time (const BASE_URL = process.env.ERPNEXT_BASE_URL), so they
// must be populated before the static import below is resolved.
vi.hoisted(() => {
  process.env.ERPNEXT_BASE_URL   = 'http://erp.test'
  process.env.ERPNEXT_API_KEY    = 'test-api-key'
  process.env.ERPNEXT_API_SECRET = 'test-api-secret'
})

import { ERPNextError, getInvoiceByIdForTrainer } from './client'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TRAINER_ID       = 'trainer-1'
const OTHER_TRAINER_ID = 'trainer-2'
const INVOICE_ID       = 'SINV-00001'
const CLIENT_ID        = 'CLIENT-00001'

function erpOk(data: unknown) {
  return { ok: true, json: async () => ({ data }) }
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

function rawClient(trainerId: string) {
  return {
    name:         CLIENT_ID,
    first_name:   'Test',
    last_name:    'Client',
    full_name:    'Test Client',
    email_id:     'test@example.com',
    mobile_no:    '+1234567890',
    status:       'Active',
    trainer:      trainerId,
    total_sessions: 0,
    creation:     '2026-01-01',
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

  it('returns the invoice when the client belongs to the requesting trainer', async () => {
    fetchMock
      .mockResolvedValueOnce(erpOk(rawInvoice()))
      .mockResolvedValueOnce(erpOk(rawClient(TRAINER_ID)))

    const invoice = await getInvoiceByIdForTrainer(INVOICE_ID, TRAINER_ID)

    expect(invoice.id).toBe(INVOICE_ID)
    expect(invoice.clientId).toBe(CLIENT_ID)
    // Both the invoice GET and the client ownership GET must have been issued.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toContain(INVOICE_ID)
    expect(fetchMock.mock.calls[1][0]).toContain(CLIENT_ID)
  })

  it('throws ERPNextError(403) when the client belongs to a different trainer', async () => {
    fetchMock
      .mockResolvedValueOnce(erpOk(rawInvoice()))
      .mockResolvedValueOnce(erpOk(rawClient(OTHER_TRAINER_ID)))

    await expect(
      getInvoiceByIdForTrainer(INVOICE_ID, TRAINER_ID),
    ).rejects.toSatisfy(
      (e: unknown) => e instanceof ERPNextError && e.status === 403,
    )
  })

  it('propagates the underlying ERPNextError when the invoice does not exist', async () => {
    fetchMock.mockResolvedValueOnce(erpError(404, 'Not Found'))

    await expect(
      getInvoiceByIdForTrainer(INVOICE_ID, TRAINER_ID),
    ).rejects.toBeInstanceOf(ERPNextError)
  })
})
