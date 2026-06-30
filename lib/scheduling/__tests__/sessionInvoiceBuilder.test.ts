import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { buildSessionInvoicePayload } from '@/lib/scheduling/sessionInvoiceBuilder'

// ─── Source text ──────────────────────────────────────────────────────────────

const SRC = readFileSync(
  join(__dirname, '../sessionInvoiceBuilder.ts'),
  'utf-8',
)

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SESSION_ID   = 'fd-session-abc123'
const CUSTOMER_ID  = 'CUST-0001'
const BASE_DATE    = '2026-07-01'
const BASE_RATE    = 100

function build(overrides: {
  sessionId?:     string
  erpCustomerId?: string
  rate?:          number
  postingDate?:   string
} = {}) {
  return buildSessionInvoicePayload({
    sessionId:     SESSION_ID,
    erpCustomerId: CUSTOMER_ID,
    rate:          BASE_RATE,
    postingDate:   BASE_DATE,
    ...overrides,
  })
}

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('buildSessionInvoicePayload — happy path', () => {
  it('sets customer to erpCustomerId', () => {
    expect(build().customer).toBe(CUSTOMER_ID)
  })

  it('sets posting_date to postingDate', () => {
    expect(build().posting_date).toBe(BASE_DATE)
  })

  it('sets due_date equal to posting_date (MVP)', () => {
    const payload = build()
    expect(payload.due_date).toBe(payload.posting_date)
  })

  it('sets custom_fd_session to the session docname', () => {
    expect(build().custom_fd_session).toBe(SESSION_ID)
  })

  it('sets custom_invoice_kind to Session', () => {
    expect(build().custom_invoice_kind).toBe('Session')
  })

  it('creates exactly one line item', () => {
    expect(build().items).toHaveLength(1)
  })

  it('sets item_code to TRAINING-SESSION', () => {
    expect(build().items[0]!.item_code).toBe('TRAINING-SESSION')
  })

  it('sets qty to 1', () => {
    expect(build().items[0]!.qty).toBe(1)
  })

  it('sets rate from the rate param (major units — no conversion)', () => {
    expect(build({ rate: 150 }).items[0]!.rate).toBe(150)
  })

  it('handles a decimal rate without rounding', () => {
    expect(build({ rate: 99.5 }).items[0]!.rate).toBe(99.5)
  })

  it('does not mutate the input params object', () => {
    const params = { sessionId: SESSION_ID, erpCustomerId: CUSTOMER_ID, rate: BASE_RATE, postingDate: BASE_DATE }
    const before = JSON.stringify(params)
    buildSessionInvoicePayload(params)
    expect(JSON.stringify(params)).toBe(before)
  })
})

// ─── Validation — rate ────────────────────────────────────────────────────────

describe('buildSessionInvoicePayload — rate validation', () => {
  it('throws for rate === 0', () => {
    expect(() => build({ rate: 0 })).toThrow('rate')
  })

  it('throws for negative rate', () => {
    expect(() => build({ rate: -10 })).toThrow('rate')
  })
})

// ─── Validation — sessionId ───────────────────────────────────────────────────

describe('buildSessionInvoicePayload — sessionId validation', () => {
  it('throws for empty sessionId', () => {
    expect(() => build({ sessionId: '' })).toThrow('sessionId')
  })

  it('throws for blank-only sessionId', () => {
    expect(() => build({ sessionId: '   ' })).toThrow('sessionId')
  })
})

// ─── Validation — erpCustomerId ───────────────────────────────────────────────

describe('buildSessionInvoicePayload — erpCustomerId validation', () => {
  it('throws for empty erpCustomerId', () => {
    expect(() => build({ erpCustomerId: '' })).toThrow('erpCustomerId')
  })

  it('throws for blank-only erpCustomerId', () => {
    expect(() => build({ erpCustomerId: '   ' })).toThrow('erpCustomerId')
  })
})

// ─── Validation — postingDate ─────────────────────────────────────────────────

describe('buildSessionInvoicePayload — postingDate validation', () => {
  it('throws for wrong format MM/DD/YYYY', () => {
    expect(() => build({ postingDate: '07/01/2026' })).toThrow('YYYY-MM-DD')
  })

  it('throws for ISO datetime string', () => {
    expect(() => build({ postingDate: '2026-07-01T00:00:00.000Z' })).toThrow('YYYY-MM-DD')
  })

  it('throws for empty string', () => {
    expect(() => build({ postingDate: '' })).toThrow('YYYY-MM-DD')
  })

  it('throws for partial date', () => {
    expect(() => build({ postingDate: '2026-07' })).toThrow('YYYY-MM-DD')
  })
})

// ─── Source purity invariant ──────────────────────────────────────────────────

describe('sessionInvoiceBuilder source — no ERP or network imports', () => {
  it('does not import from lib/erpnext/client', () => {
    expect(SRC).not.toContain('lib/erpnext/client')
  })

  it('does not import erpFetch', () => {
    expect(SRC).not.toContain('erpFetch')
  })

  it('does not import fetch or node:http', () => {
    expect(SRC).not.toContain("from 'node:http'")
    expect(SRC).not.toContain("from 'node-fetch'")
  })

  it('does not import from lib/billing', () => {
    expect(SRC).not.toContain('lib/billing')
  })

  it('imports only from lib/erpnext/types (the payload type)', () => {
    expect(SRC).toContain("from '@/lib/erpnext/types'")
  })
})
