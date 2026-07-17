import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the ERP client: availability only uses the two Mode-of-Payment readers
// plus ERPNextError (for 404 classification). A hand-rolled ERPNextError class
// keeps `instanceof` working without pulling in the real client's server-only
// dependency graph (tenant context, jose, db, …).
vi.mock('@/lib/erpnext/client', () => {
  class ERPNextError extends Error {
    constructor(
      public status: number,
      public statusText = '',
      public path = '',
      public detail = '',
    ) {
      super(`ERPNext ${status}`)
      this.name = 'ERPNextError'
    }
  }
  return {
    ERPNextError,
    listEnabledModesOfPayment: vi.fn(),
    getModeOfPaymentDoc:       vi.fn(),
  }
})

import {
  ERPNextError,
  getModeOfPaymentDoc,
  listEnabledModesOfPayment,
} from '@/lib/erpnext/client'
import { resetAvailabilityCache, resolveAvailablePaymentMethods } from './availability'
import { PaymentConfigurationUnavailableError } from './errors'

const mockList = vi.mocked(listEnabledModesOfPayment)
const mockDoc  = vi.mocked(getModeOfPaymentDoc)

const CO = 'Test Company'
const PARAMS = { company: CO, currency: 'USD', tenantId: 'tenant-1' }

/** A Mode of Payment doc reader keyed by exact docname. */
function docBy(map: Record<string, { enabled?: 0 | 1; accounts?: Array<{ company?: string; default_account?: string }> }>) {
  return async (mode: string) => {
    if (mode in map) return map[mode]
    throw new ERPNextError(404, 'Not Found', `Mode of Payment/${mode}`)
  }
}

beforeEach(() => {
  resetAvailabilityCache()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('resolveAvailablePaymentMethods — tenant truth', () => {
  it('Cash-only tenant → only cash is available', async () => {
    mockList.mockResolvedValue([{ name: 'Cash', type: 'Cash' }])
    mockDoc.mockImplementation(docBy({
      Cash: { enabled: 1, accounts: [{ company: CO, default_account: 'Cash - TC' }] },
    }))

    const res = await resolveAvailablePaymentMethods(PARAMS)

    expect(res.available.map(m => m.id)).toEqual(['cash'])
    expect(res.available[0].depositAccount).toBe('Cash - TC')
    // Whish Money is not among the tenant's enabled modes → not found, no read.
    const whish = res.methods.find(m => m.id === 'whish_money')
    expect(whish?.status).toBe('PAYMENT_METHOD_NOT_FOUND')
    // OMT is product-disabled → never even a candidate.
    expect(res.methods.some(m => m.id === 'omt')).toBe(false)
    expect(res.stale).toBe(false)
  })

  it('Mode of Payment missing from the tenant\'s enabled set → PAYMENT_METHOD_NOT_FOUND (dedicated case)', async () => {
    // Tenant has ONLY Cash enabled — Whish Money is absent entirely.
    mockList.mockResolvedValue([{ name: 'Cash' }])
    mockDoc.mockImplementation(docBy({
      Cash: { enabled: 1, accounts: [{ company: CO, default_account: 'Cash - TC' }] },
    }))

    const res = await resolveAvailablePaymentMethods(PARAMS)

    expect(res.methods.find(m => m.id === 'whish_money')?.status).toBe('PAYMENT_METHOD_NOT_FOUND')
    // Never the incident's mistranslation into account-missing.
    expect(res.methods.find(m => m.id === 'whish_money')?.status).not.toBe('PAYMENT_ACCOUNT_MISSING')
    // No per-candidate doc read is wasted on a method absent from Step 1's list.
    expect(mockDoc).not.toHaveBeenCalledWith('Whish Money')
  })

  it('method disabled on the ERP doc (enabled: 0) → PAYMENT_METHOD_DISABLED (not available)', async () => {
    // Present in the tenant's enabled-Modes-of-Payment LIST filter result can
    // still race a doc that reports enabled:0 (e.g. disabled between the list
    // read and the doc read) — the doc-level flag is authoritative.
    mockList.mockResolvedValue([{ name: 'Cash' }])
    mockDoc.mockImplementation(docBy({
      Cash: { enabled: 0, accounts: [{ company: CO, default_account: 'Cash - TC' }] },
    }))

    const res = await resolveAvailablePaymentMethods(PARAMS)

    expect(res.available).toHaveLength(0)
    expect(res.methods.find(m => m.id === 'cash')?.status).toBe('PAYMENT_METHOD_DISABLED')
  })

  it('enabled method with no company-mapped account → PAYMENT_ACCOUNT_MISSING (not available)', async () => {
    mockList.mockResolvedValue([{ name: 'Cash' }])
    mockDoc.mockImplementation(docBy({
      Cash: { enabled: 1, accounts: [{ company: 'Other Co', default_account: 'Cash - OC' }] },
    }))

    const res = await resolveAvailablePaymentMethods(PARAMS)

    expect(res.available).toHaveLength(0)
    expect(res.methods.find(m => m.id === 'cash')?.status).toBe('PAYMENT_ACCOUNT_MISSING')
  })

  it('selects the account mapped to THIS company among several — never just the first entry', async () => {
    mockList.mockResolvedValue([{ name: 'Cash' }])
    mockDoc.mockImplementation(docBy({
      Cash: {
        enabled: 1,
        accounts: [
          { company: 'Other Co', default_account: 'Cash - OC' }, // listed first — must NOT be picked
          { company: CO,         default_account: 'Cash - TC' }, // the correct match
          { company: 'Third Co',  default_account: 'Cash - 3C' },
        ],
      },
    }))

    const res = await resolveAvailablePaymentMethods(PARAMS)

    const cash = res.methods.find(m => m.id === 'cash')
    expect(cash?.status).toBe('available')
    expect(cash?.depositAccount).toBe('Cash - TC')
  })

  it('invoice currency incompatible with settlement → PAYMENT_CURRENCY_MISMATCH (excluded)', async () => {
    mockList.mockResolvedValue([{ name: 'Cash' }])
    // A doc is not even read when currency is incompatible (cheap short-circuit).
    mockDoc.mockImplementation(docBy({ Cash: { enabled: 1, accounts: [{ company: CO, default_account: 'x' }] } }))

    const res = await resolveAvailablePaymentMethods({ ...PARAMS, currency: 'EUR' })

    expect(res.available).toHaveLength(0)
    expect(res.methods.find(m => m.id === 'cash')?.status).toBe('PAYMENT_CURRENCY_MISMATCH')
  })

  it('a per-candidate non-404 read failure marks only that method unavailable, not the whole probe', async () => {
    mockList.mockResolvedValue([{ name: 'Cash' }, { name: 'Whish Money' }])
    mockDoc.mockImplementation(async (mode: string) => {
      if (mode === 'Cash') return { enabled: 1 as const, accounts: [{ company: CO, default_account: 'Cash - TC' }] }
      throw new ERPNextError(503, 'Service Unavailable', 'Mode of Payment/Whish Money') // Whish read blips
    })

    const res = await resolveAvailablePaymentMethods(PARAMS)

    // Cash still validated + offered.
    expect(res.available.map(m => m.id)).toEqual(['cash'])
    expect(res.methods.find(m => m.id === 'whish_money')?.status).toBe('ERP_UNAVAILABLE')
  })
})

describe('resolveAvailablePaymentMethods — cache key isolation (tenant, company, currency)', () => {
  function mockCashAvailable() {
    mockList.mockResolvedValue([{ name: 'Cash' }])
    mockDoc.mockImplementation(docBy({
      Cash: { enabled: 1, accounts: [{ company: CO, default_account: 'Cash - TC' }] },
    }))
  }

  it('availability resolved for one tenant is never reused for a different tenant (same company+currency)', async () => {
    mockCashAvailable()
    await resolveAvailablePaymentMethods({ ...PARAMS, tenantId: 'tenant-1' })
    expect(mockList).toHaveBeenCalledTimes(1)

    // A second tenant, identical company/currency — must trigger its OWN
    // fresh probe, never silently reuse tenant-1's cached entry.
    await resolveAvailablePaymentMethods({ ...PARAMS, tenantId: 'tenant-2' })
    expect(mockList).toHaveBeenCalledTimes(2)
  })

  it('cache key incorporates company — a different company for the same tenant forces a fresh probe', async () => {
    mockCashAvailable()
    await resolveAvailablePaymentMethods({ ...PARAMS, company: 'Company A' })
    expect(mockList).toHaveBeenCalledTimes(1)

    await resolveAvailablePaymentMethods({ ...PARAMS, company: 'Company B' })
    expect(mockList).toHaveBeenCalledTimes(2)
  })

  it('cache key incorporates currency — a different currency for the same tenant+company forces a fresh probe', async () => {
    mockCashAvailable()
    await resolveAvailablePaymentMethods({ ...PARAMS, currency: 'USD' })
    expect(mockList).toHaveBeenCalledTimes(1)

    await resolveAvailablePaymentMethods({ ...PARAMS, currency: 'EUR' })
    expect(mockList).toHaveBeenCalledTimes(2)
  })

  it('an identical (tenant, company, currency) call within TTL is served from cache — exactly one probe', async () => {
    mockCashAvailable()
    await resolveAvailablePaymentMethods(PARAMS)
    await resolveAvailablePaymentMethods(PARAMS)
    expect(mockList).toHaveBeenCalledTimes(1)
  })
})

describe('resolveAvailablePaymentMethods — corrected fail behaviour (no Cash assumption)', () => {
  it('probe failure with no cache → PaymentConfigurationUnavailableError (never assumes Cash)', async () => {
    mockList.mockRejectedValue(new Error('boom'))

    await expect(resolveAvailablePaymentMethods(PARAMS))
      .rejects.toBeInstanceOf(PaymentConfigurationUnavailableError)
  })

  it('connectivity failure with no cache propagates the ERP error (→ ERP_UNAVAILABLE), not config', async () => {
    // Message carries an isErpUnavailableError marker.
    mockList.mockRejectedValue(new Error('Control Plane unreachable'))

    await expect(resolveAvailablePaymentMethods(PARAMS)).rejects.toThrow(/Control Plane/)
    await expect(resolveAvailablePaymentMethods(PARAMS))
      .rejects.not.toBeInstanceOf(PaymentConfigurationUnavailableError)
  })

  it('Slice 1 pilot default: does NOT serve last-known-good after a failed probe, even WITHIN the 5-minute stale window', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    mockList.mockResolvedValueOnce([{ name: 'Cash' }])
    mockDoc.mockImplementation(docBy({ Cash: { enabled: 1, accounts: [{ company: CO, default_account: 'Cash - TC' }] } }))

    const fresh = await resolveAvailablePaymentMethods(PARAMS)
    expect(fresh.available.map(m => m.id)).toEqual(['cash'])
    expect(fresh.stale).toBe(false)

    // Past the TTL (60s) but still well within what would be the 5-minute
    // stale window if stale-serving were enabled; fresh probe fails.
    vi.setSystemTime(61_000)
    mockList.mockRejectedValueOnce(new Error('boom'))

    // Stale-serve is disabled by default (STALE_SERVE_ENABLED = false in
    // availability.ts) — a failed fresh probe must ALWAYS surface the
    // recoverable configuration-unavailable state, never a payment-method
    // list computed before the failure, and never log a stale-serve.
    await expect(resolveAvailablePaymentMethods(PARAMS))
      .rejects.toBeInstanceOf(PaymentConfigurationUnavailableError)
    expect(warn).not.toHaveBeenCalledWith('[payment-availability] stale-serve', expect.anything())

    warn.mockRestore()
  })

  it('does NOT serve a stale cache once the (would-be) stale window has elapsed either', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)

    mockList.mockResolvedValueOnce([{ name: 'Cash' }])
    mockDoc.mockImplementation(docBy({ Cash: { enabled: 1, accounts: [{ company: CO, default_account: 'Cash - TC' }] } }))
    await resolveAvailablePaymentMethods(PARAMS)

    // Beyond the 5-minute stale window; a failing probe must not serve old data.
    vi.setSystemTime(6 * 60_000)
    mockList.mockRejectedValueOnce(new Error('boom'))

    await expect(resolveAvailablePaymentMethods(PARAMS))
      .rejects.toBeInstanceOf(PaymentConfigurationUnavailableError)
  })

  it('never returns stale: true while STALE_SERVE_ENABLED is false, regardless of cache age', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)

    mockList.mockResolvedValueOnce([{ name: 'Cash' }])
    mockDoc.mockImplementation(docBy({ Cash: { enabled: 1, accounts: [{ company: CO, default_account: 'Cash - TC' }] } }))
    await resolveAvailablePaymentMethods(PARAMS)

    vi.setSystemTime(61_000) // just past TTL — the only branch that could set stale:true
    mockList.mockRejectedValueOnce(new Error('boom'))

    await expect(resolveAvailablePaymentMethods(PARAMS)).rejects.toBeInstanceOf(PaymentConfigurationUnavailableError)
    // Confirms the failure path, not a `{ ...cached, stale: true }` result.
  })
})
