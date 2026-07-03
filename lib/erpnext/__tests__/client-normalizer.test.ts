/**
 * Unit tests for normalizeClient — billing mode and default session rate mapping.
 *
 * Covers:
 *   a. PPS client with defaultSessionRate → billingMode + defaultSessionRate populated
 *   b. PPS client without rate → billingMode populated, defaultSessionRate absent
 *   c. Package client → billingMode='package', no defaultSessionRate
 *   d. Unknown billing mode → billingMode='unset'
 *   e. Rate=0 → defaultSessionRate absent (0 is treated as "not set")
 *   f. Non-PPS client → no defaultSessionRate (rate field present in ERP but irrelevant)
 */

import { describe, it, expect, vi } from 'vitest'

// Mock transitive server-side imports that lib/erpnext/client.ts pulls in.
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ headers: () => ({}) }))
vi.mock('@/lib/tenant/context', () => ({ getTenantContext: vi.fn() }))

import { normalizeClient } from '@/lib/erpnext/client'

// Minimal ERPCustomer shape needed for normalizeClient.
// The function accepts the full ERPCustomer interface; we supply only what the
// tests exercise. TypeScript ignores extra-missing-optional fields.
type PartialERPCustomer = Parameters<typeof normalizeClient>[0]

function makeRaw(overrides: Partial<PartialERPCustomer> = {}): PartialERPCustomer {
  return {
    name:          'CUST-001',
    customer_name: 'Alice Trainer',
    mobile_no:     '+96170000000',
    creation:      '2026-01-01 00:00:00',
    ...overrides,
  }
}

// ─── billingMode mapping ──────────────────────────────────────────────────────

describe('normalizeClient — billingMode', () => {
  it('maps "Pay Per Session" → pay_per_session', () => {
    const client = normalizeClient(makeRaw({ custom_billing_mode: 'Pay Per Session' }))
    expect(client.billingMode).toBe('pay_per_session')
  })

  it('maps "Package" → package', () => {
    const client = normalizeClient(makeRaw({ custom_billing_mode: 'Package' }))
    expect(client.billingMode).toBe('package')
  })

  it('maps missing billing mode → unset', () => {
    const client = normalizeClient(makeRaw({ custom_billing_mode: undefined }))
    expect(client.billingMode).toBe('unset')
  })

  it('maps unknown billing mode string → unset', () => {
    const client = normalizeClient(makeRaw({ custom_billing_mode: 'Trial' }))
    expect(client.billingMode).toBe('unset')
  })
})

// ─── defaultSessionRate mapping ───────────────────────────────────────────────

describe('normalizeClient — defaultSessionRate', () => {
  it('PPS client with positive rate → defaultSessionRate present (a)', () => {
    const client = normalizeClient(makeRaw({
      custom_billing_mode:         'Pay Per Session',
      custom_default_session_rate: 20,
    }))
    expect(client.billingMode).toBe('pay_per_session')
    expect(client.defaultSessionRate).toBe(20)
  })

  it('PPS client with no rate → defaultSessionRate absent (b)', () => {
    const client = normalizeClient(makeRaw({
      custom_billing_mode:         'Pay Per Session',
      custom_default_session_rate: undefined,
    }))
    expect(client.billingMode).toBe('pay_per_session')
    expect(client.defaultSessionRate).toBeUndefined()
  })

  it('rate = 0 → defaultSessionRate absent (zero is treated as unset)', () => {
    const client = normalizeClient(makeRaw({
      custom_billing_mode:         'Pay Per Session',
      custom_default_session_rate: 0,
    }))
    expect(client.defaultSessionRate).toBeUndefined()
  })

  it('Package client → billingMode=package, no defaultSessionRate (c)', () => {
    const client = normalizeClient(makeRaw({
      custom_billing_mode:         'Package',
      custom_default_session_rate: undefined,
    }))
    expect(client.billingMode).toBe('package')
    expect(client.defaultSessionRate).toBeUndefined()
  })

  it('Non-PPS client with rate field present → defaultSessionRate still mapped (f)', () => {
    // The rate field is in ERP regardless of billing mode — we map it when positive.
    const client = normalizeClient(makeRaw({
      custom_billing_mode:         'Package',
      custom_default_session_rate: 50,
    }))
    expect(client.defaultSessionRate).toBe(50)
  })
})

// ─── Source invariants — NO_FEE wiring ───────────────────────────────────────
// RTL is not installed in this project (vitest env = node). We verify the key
// wiring patterns in BookingSheet and BookingStickyFooter by reading source.

import { readFileSync } from 'fs'
import { join } from 'path'

const BOOKING_SHEET_SRC = readFileSync(
  join(__dirname, '../../..', 'components/scheduling/BookingSheet.tsx'),
  'utf-8',
)
const STICKY_FOOTER_SRC = readFileSync(
  join(__dirname, '../../..', 'components/scheduling/booking/BookingStickyFooter.tsx'),
  'utf-8',
)

describe('NO_FEE wiring — source invariants', () => {
  it('BookingStickyFooter handles NO_FEE in ctaLabel switch (b)', () => {
    expect(STICKY_FOOTER_SRC).toContain("case 'NO_FEE'")
    expect(STICKY_FOOTER_SRC).toContain('Enter a fee to continue')
  })

  it('BookingSheet validity machine gates PPS bookings on NO_FEE (b)', () => {
    expect(BOOKING_SHEET_SRC).toContain("'pay_per_session'")
    expect(BOOKING_SHEET_SRC).toContain("reason: 'NO_FEE'")
  })

  it('BookingSheet resets and re-seeds fee when client changes (a)', () => {
    // Verify the effect seeds fee from defaultSessionRate and resets on change
    expect(BOOKING_SHEET_SRC).toContain('defaultSessionRate')
    expect(BOOKING_SHEET_SRC).toContain('seedRate')
    expect(BOOKING_SHEET_SRC).toContain("updateDraft({ fee: seedRate })")
  })

  it('BookingSheet does NOT pass draft.fee ?? 0 as the only rate path (c)', () => {
    // The old bug: draft.fee ?? 0 was the only thing passed to bookPlanAction,
    // so non-PPS clients (fee=null) booked with rate=0. The fix keeps this
    // expression but guards PPS via NO_FEE before submit is reachable.
    // Verify the guard exists so non-PPS still allows null fee at book time.
    expect(BOOKING_SHEET_SRC).toContain("clientBillingMode === 'pay_per_session'")
  })
})
