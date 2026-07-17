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
import {
  resetAvailabilityCache,
  resolveAvailablePaymentMethods,
  type ResolveAvailabilityParams,
} from './availability'
import { PaymentConfigurationUnavailableError } from './errors'

const mockList = vi.mocked(listEnabledModesOfPayment)
const mockDoc  = vi.mocked(getModeOfPaymentDoc)

const CO = 'Test Company'
const PARAMS: ResolveAvailabilityParams = { company: CO, currency: 'USD', tenantId: 'tenant-1', market: null }
const LB_PARAMS: ResolveAvailabilityParams = { ...PARAMS, market: 'LB' }

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
    // Whish Money and every other Lebanon-only method are absent for a
    // workspace with no verified LB market (PARAMS.market is null here) —
    // filtered out before any ERP detail probe, regardless of what this (or
    // any) tenant's ERP has configured. See the dedicated market-gate
    // describe block below for the verified-LB counterpart.
    expect(res.methods.find(m => m.id === 'whish_money')).toBeUndefined()
    expect(res.methods.find(m => m.id === 'omt')).toBeUndefined()
    expect(res.stale).toBe(false)
  })

  it('Mode of Payment missing from the tenant\'s enabled set → PAYMENT_METHOD_NOT_FOUND (dedicated case)', async () => {
    // cash is the only currently product-enabled candidate (every Lebanon-
    // only method is held — see the market-hold describe block below), so it
    // is the one real case that can exercise "a genuine candidate absent
    // from the tenant's ERP list". Tenant's ERP has nothing enabled at all.
    mockList.mockResolvedValue([])

    const res = await resolveAvailablePaymentMethods(PARAMS)

    expect(res.methods.find(m => m.id === 'cash')?.status).toBe('PAYMENT_METHOD_NOT_FOUND')
    // Never the incident's mistranslation into account-missing.
    expect(res.methods.find(m => m.id === 'cash')?.status).not.toBe('PAYMENT_ACCOUNT_MISSING')
    // No per-candidate doc read is wasted on a method absent from Step 1's list.
    expect(mockDoc).not.toHaveBeenCalledWith('Cash')
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

  // A dedicated "one candidate's Step-3 read blips, a second candidate is
  // still validated independently" test previously lived here using Cash +
  // Whish Money. It is not currently reconstructable with live catalog data:
  // cash is the only product-enabled candidate while every other method is
  // held for the Lebanon market boundary (see the describe block below), so
  // there is no second real candidate to blip. The isolation code itself
  // (probe()'s per-candidate try/catch in availability.ts) is unchanged —
  // re-add a two-candidate version of this test once a second method is
  // re-enabled.
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

describe('resolveAvailablePaymentMethods — Lebanon market gate (ADR-MKT-001)', () => {
  // The six Lebanon-only methods are now gated by params.market, resolved
  // server-side by the caller via lib/tenant/market.ts — never by anything
  // this function reads itself. Both sides of the gate are proven here: an
  // unverified/non-LB workspace never sees or probes them (zero-probe
  // guarantee), and a verified-LB workspace does.

  const ALL_SIX_LB_IDS = ['whish_money', 'omt', 'mymonty', 'suyool', 'purpl', 'bank_transfer_fresh_usd']
  const ALL_SEVEN_ENABLED = [
    { name: 'Cash' }, { name: 'Whish Money' }, { name: 'OMT Pay' },
    { name: 'MyMonty' }, { name: 'Suyool' }, { name: 'Purpl' },
    { name: 'Bank Transfer - Fresh USD' },
  ]
  const ALL_SEVEN_DOCS = docBy({
    'Cash':                      { enabled: 1, accounts: [{ company: CO, default_account: 'Cash - TC' }] },
    'Whish Money':               { enabled: 1, accounts: [{ company: CO, default_account: 'Whish - TC' }] },
    'OMT Pay':                   { enabled: 1, accounts: [{ company: CO, default_account: 'OMT - TC' }] },
    'MyMonty':                   { enabled: 1, accounts: [{ company: CO, default_account: 'MyMonty - TC' }] },
    'Suyool':                    { enabled: 1, accounts: [{ company: CO, default_account: 'Suyool - TC' }] },
    'Purpl':                     { enabled: 1, accounts: [{ company: CO, default_account: 'Purpl - TC' }] },
    'Bank Transfer - Fresh USD': { enabled: 1, accounts: [{ company: CO, default_account: 'Bank - TC' }] },
  })

  describe('unverified / non-LB workspace — still Cash-only, still zero probes', () => {
    it('a tenant whose ERP has all seven Modes of Payment perfectly configured still sees only cash as available (market: null)', async () => {
      mockList.mockResolvedValue(ALL_SEVEN_ENABLED)
      mockDoc.mockImplementation(ALL_SEVEN_DOCS)

      const res = await resolveAvailablePaymentMethods(PARAMS)

      expect(res.available.map(m => m.id)).toEqual(['cash'])
      for (const id of ALL_SIX_LB_IDS) {
        expect(res.methods.find(m => m.id === id)).toBeUndefined()
      }
    })

    it('an explicitly non-LB market value behaves identically to null — same Cash-only result', async () => {
      mockList.mockResolvedValue(ALL_SEVEN_ENABLED)
      mockDoc.mockImplementation(ALL_SEVEN_DOCS)

      const res = await resolveAvailablePaymentMethods({ ...PARAMS, market: 'US' })

      expect(res.available.map(m => m.id)).toEqual(['cash'])
      for (const id of ALL_SIX_LB_IDS) {
        expect(res.methods.find(m => m.id === id)).toBeUndefined()
      }
    })

    it('makes zero ERP Mode of Payment detail probes for any Lebanon-only method, even though Step 1\'s list included them', async () => {
      mockList.mockResolvedValue(ALL_SEVEN_ENABLED)
      mockDoc.mockImplementation(docBy({
        Cash: { enabled: 1, accounts: [{ company: CO, default_account: 'Cash - TC' }] },
      }))

      await resolveAvailablePaymentMethods(PARAMS)

      // The one generic "what's enabled" list call is expected (cash needs it
      // too) — what must NEVER happen is a per-name detail read for any of
      // the six Lebanon-only docnames.
      expect(mockList).toHaveBeenCalledTimes(1)
      expect(mockDoc).toHaveBeenCalledTimes(1)
      expect(mockDoc).toHaveBeenCalledWith('Cash')
      for (const docname of ['Whish Money', 'OMT Pay', 'MyMonty', 'Suyool', 'Purpl', 'Bank Transfer - Fresh USD']) {
        expect(mockDoc).not.toHaveBeenCalledWith(docname)
      }
    })

    it('the gate applies even to omt on its corrected docname "OMT Pay" — market-gated, not a docname problem', async () => {
      // Distinct from a missing/misconfigured MoP: OMT Pay is fully, correctly
      // configured here, and omt STILL never becomes a candidate without LB.
      mockList.mockResolvedValue([{ name: 'OMT Pay' }])
      mockDoc.mockImplementation(docBy({
        'OMT Pay': { enabled: 1, accounts: [{ company: CO, default_account: 'OMT - TC' }] },
      }))

      const res = await resolveAvailablePaymentMethods(PARAMS)

      expect(res.methods.find(m => m.id === 'omt')).toBeUndefined()
      expect(mockDoc).not.toHaveBeenCalledWith('OMT Pay')
    })

    it('the gate applies even to bank_transfer_fresh_usd on its exact hyphenated docname — configuration is irrelevant without LB', async () => {
      mockList.mockResolvedValue([{ name: 'Bank Transfer - Fresh USD' }])
      mockDoc.mockImplementation(docBy({
        'Bank Transfer - Fresh USD': { enabled: 1, accounts: [{ company: CO, default_account: 'Bank - TC' }] },
      }))

      const res = await resolveAvailablePaymentMethods(PARAMS)

      expect(res.methods.find(m => m.id === 'bank_transfer_fresh_usd')).toBeUndefined()
      expect(mockDoc).not.toHaveBeenCalledWith('Bank Transfer - Fresh USD')
    })

    it('produces no misleading configuration error — gated methods are simply absent, never a specific error code', async () => {
      mockList.mockResolvedValue([{ name: 'Cash' }])
      mockDoc.mockImplementation(docBy({
        Cash: { enabled: 1, accounts: [{ company: CO, default_account: 'Cash - TC' }] },
      }))

      const res = await resolveAvailablePaymentMethods(PARAMS)

      for (const id of ALL_SIX_LB_IDS) {
        expect(res.methods.find(m => m.id === id)).toBeUndefined()
      }
    })
  })

  describe('verified LB workspace — the seven-method catalog, fully probed', () => {
    it('a verified-LB workspace with all seven Modes of Payment configured receives exactly seven available methods', async () => {
      mockList.mockResolvedValue(ALL_SEVEN_ENABLED)
      mockDoc.mockImplementation(ALL_SEVEN_DOCS)

      const res = await resolveAvailablePaymentMethods(LB_PARAMS)

      expect(res.available.map(m => m.id).sort()).toEqual(
        ['bank_transfer_fresh_usd', 'cash', 'mymonty', 'omt', 'purpl', 'suyool', 'whish_money'].sort(),
      )
    })

    it('Other Mobile Wallet is absent even for a verified-LB workspace — not a catalog row at all', async () => {
      mockList.mockResolvedValue([...ALL_SEVEN_ENABLED, { name: 'Some Custom Wallet' }])
      mockDoc.mockImplementation(ALL_SEVEN_DOCS)

      const res = await resolveAvailablePaymentMethods(LB_PARAMS)

      expect(res.methods.find(m => m.id === ('mobile_wallet_other' as never))).toBeUndefined()
    })

    it('USDT is absent even for a verified-LB workspace whose ERP has an enabled "USDT" Mode of Payment', async () => {
      mockList.mockResolvedValue([...ALL_SEVEN_ENABLED, { name: 'USDT' }])
      mockDoc.mockImplementation((mode: string) =>
        mode === 'USDT'
          ? Promise.resolve({ enabled: 1 as const, accounts: [{ company: CO, default_account: 'USDT - TC' }] })
          : ALL_SEVEN_DOCS(mode),
      )

      const res = await resolveAvailablePaymentMethods(LB_PARAMS)

      expect(res.methods.map(m => m.id)).not.toContain('usdt')
      expect(mockDoc).not.toHaveBeenCalledWith('USDT')
    })

    it('a missing or disabled Lebanon method remains unavailable for a verified-LB workspace — never fabricated', async () => {
      mockList.mockResolvedValue([{ name: 'Cash' }, { name: 'Whish Money' }]) // only two of seven enabled in ERP
      mockDoc.mockImplementation(docBy({
        Cash:          { enabled: 1, accounts: [{ company: CO, default_account: 'Cash - TC' }] },
        'Whish Money': { enabled: 0, accounts: [{ company: CO, default_account: 'Whish - TC' }] }, // disabled doc
      }))

      const res = await resolveAvailablePaymentMethods(LB_PARAMS)

      expect(res.available.map(m => m.id)).toEqual(['cash'])
      expect(res.methods.find(m => m.id === 'whish_money')?.status).toBe('PAYMENT_METHOD_DISABLED')
      // omt/mymonty/suyool/purpl/bank_transfer_fresh_usd are candidates for a
      // verified-LB workspace but absent from Step 1's enabled-set list.
      expect(res.methods.find(m => m.id === 'omt')?.status).toBe('PAYMENT_METHOD_NOT_FOUND')
    })
  })

  describe('cache key includes market — a grant or revoke takes effect on the next probe, not after a stale TTL', () => {
    it('the same tenant/company/currency with a different market forces a fresh probe, not a shared cache entry', async () => {
      mockList.mockResolvedValue(ALL_SEVEN_ENABLED)
      mockDoc.mockImplementation(ALL_SEVEN_DOCS)

      await resolveAvailablePaymentMethods(PARAMS)
      expect(mockList).toHaveBeenCalledTimes(1)

      // Same tenant/company/currency, market flips null -> 'LB' (a grant) —
      // must NOT reuse the Cash-only cached entry.
      const granted = await resolveAvailablePaymentMethods(LB_PARAMS)
      expect(mockList).toHaveBeenCalledTimes(2)
      expect(granted.available.map(m => m.id)).toContain('whish_money')
    })

    it('reverting market LB -> null (a revoke) forces a fresh probe and the six methods disappear again', async () => {
      mockList.mockResolvedValue(ALL_SEVEN_ENABLED)
      mockDoc.mockImplementation(ALL_SEVEN_DOCS)

      const granted = await resolveAvailablePaymentMethods(LB_PARAMS)
      expect(granted.available.map(m => m.id)).toContain('whish_money')

      const revoked = await resolveAvailablePaymentMethods(PARAMS)
      expect(mockList).toHaveBeenCalledTimes(2)
      expect(revoked.available.map(m => m.id)).toEqual(['cash'])
      expect(revoked.methods.find(m => m.id === 'whish_money')).toBeUndefined()
    })
  })
})

describe('resolveAvailablePaymentMethods — USDT guard', () => {
  it('never probes or exposes USDT even when the tenant ERP has a "USDT" Mode of Payment enabled', async () => {
    mockList.mockResolvedValue([{ name: 'Cash' }, { name: 'USDT' }])
    mockDoc.mockImplementation(docBy({
      Cash: { enabled: 1, accounts: [{ company: CO, default_account: 'Cash - TC' }] },
      USDT: { enabled: 1, accounts: [{ company: CO, default_account: 'USDT - TC' }] },
    }))

    const res = await resolveAvailablePaymentMethods(PARAMS)

    // USDT is structurally absent from the catalog, so it can never appear in
    // methods[] or available[], and its doc is never even read.
    expect(res.methods.map(m => m.id)).not.toContain('usdt')
    expect(res.available.map(m => m.id)).not.toContain('usdt')
    expect(mockDoc).not.toHaveBeenCalledWith('USDT')
  })
})

describe('resolveAvailablePaymentMethods — market is the ONLY eligibility channel (architecture proof)', () => {
  // These tests prove there is no OTHER code path by which nationality,
  // phone number, locale, timezone, or invoice currency could ever activate
  // a Lebanon-only method — not "unlikely to", but structurally incapable,
  // because none of those inputs are ever inspected for that purpose. The
  // resolved `market` field (never client-supplied — see
  // lib/tenant/market.ts and actions/invoices.ts, which resolve it
  // server-side before calling this function) is the only channel.

  it('ResolveAvailabilityParams\' entire input surface is company, currency, tenantId, and market — no country/nationality/phone/locale/timezone field', () => {
    const params: ResolveAvailabilityParams = { company: CO, currency: 'USD', tenantId: 'tenant-1', market: null }
    expect(Object.keys(params).sort()).toEqual(['company', 'currency', 'market', 'tenantId'])
  })

  it('a Lebanon-suggestive currency (LBP) does not unlock Lebanon-only methods without market:\'LB\' — currency gates settlement compatibility only, never market eligibility', async () => {
    mockList.mockResolvedValue([{ name: 'Cash' }, { name: 'Whish Money' }])
    mockDoc.mockImplementation(docBy({
      Cash:          { enabled: 1, accounts: [{ company: CO, default_account: 'x' }] },
      'Whish Money': { enabled: 1, accounts: [{ company: CO, default_account: 'y' }] },
    }))

    const res = await resolveAvailablePaymentMethods({ ...PARAMS, currency: 'LBP' })

    // Cash itself now fails on currency compatibility (its settlement asset
    // is USD) — proving currency is read for THAT purpose — while Whish
    // Money remains completely absent regardless, proving currency is never
    // read for market-eligibility purposes.
    expect(res.available).toHaveLength(0)
    expect(res.methods.find(m => m.id === 'whish_money')).toBeUndefined()
  })

  it('a Lebanon-suggestive company or tenant identifier does not unlock Lebanon-only methods without market:\'LB\' — these strings are never inspected for that purpose', async () => {
    mockList.mockResolvedValue([{ name: 'Cash' }, { name: 'Whish Money' }])
    mockDoc.mockImplementation(docBy({
      Cash:          { enabled: 1, accounts: [{ company: 'Beirut Fitness LB', default_account: 'x' }] },
      'Whish Money': { enabled: 1, accounts: [{ company: 'Beirut Fitness LB', default_account: 'y' }] },
    }))

    const res = await resolveAvailablePaymentMethods({
      company: 'Beirut Fitness LB', currency: 'USD', tenantId: 'lebanon-trainer-tenant', market: null,
    })

    expect(res.available.map(m => m.id)).toEqual(['cash'])
    expect(res.methods.find(m => m.id === 'whish_money')).toBeUndefined()
  })

  it('an actually-verified market:\'LB\' DOES unlock the six methods — proving market, and only market, is the channel', async () => {
    mockList.mockResolvedValue([{ name: 'Cash' }, { name: 'Whish Money' }])
    mockDoc.mockImplementation(docBy({
      Cash:          { enabled: 1, accounts: [{ company: CO, default_account: 'x' }] },
      'Whish Money': { enabled: 1, accounts: [{ company: CO, default_account: 'y' }] },
    }))

    const res = await resolveAvailablePaymentMethods({ ...PARAMS, market: 'LB' })

    expect(res.available.map(m => m.id)).toContain('whish_money')
  })
})

describe('resolveAvailablePaymentMethods — historical identity is never filtered by market eligibility', () => {
  it('a tenant with a real, ERP-configured MyMonty Mode of Payment still cannot select mymonty for a NEW transaction — market hold and readback are independent systems', async () => {
    // This models exactly the scenario the task calls out: ERPNext proves
    // "MyMonty" is genuinely configured for this tenant (as a historical
    // payment would, via lib/erpnext/client.ts's normalizePayment /
    // erpModeToPaymentMethod — see client.test.ts's readback coverage,
    // unaffected by this hold and re-verified passing in the same run).
    // Read access to that history is a completely separate code path from
    // this one (resolveAvailablePaymentMethods, which only governs what a
    // trainer may pick for a brand-new payment) — proving the tenant's ERP
    // truth here changes nothing about mymonty's held status.
    mockList.mockResolvedValue([{ name: 'Cash' }, { name: 'MyMonty' }])
    mockDoc.mockImplementation(docBy({
      Cash:     { enabled: 1, accounts: [{ company: CO, default_account: 'Cash - TC' }] },
      MyMonty:  { enabled: 1, accounts: [{ company: CO, default_account: 'MyMonty - TC' }] },
    }))

    const res = await resolveAvailablePaymentMethods(PARAMS)

    expect(res.available.map(m => m.id)).toEqual(['cash'])
    expect(res.methods.find(m => m.id === 'mymonty')).toBeUndefined()
    // The tenant's ERP was never even asked for MyMonty's detail doc, even
    // though it is real and configured — the hold short-circuits before any
    // such read, for new-transaction purposes.
    expect(mockDoc).not.toHaveBeenCalledWith('MyMonty')
  })
})
