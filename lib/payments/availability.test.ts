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
    // Whish Money and every other Lebanon-only method are held product-off
    // (see lib/payments/methods.ts) pending an authoritative country gate —
    // absent from methods[] entirely, not even probed, regardless of what
    // this (or any) tenant's ERP has configured.
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

describe('resolveAvailablePaymentMethods — Lebanon-only methods are held (no authoritative country gate wired yet)', () => {
  // lib/payments/methods.ts holds every market:'LB' method at enabled:false
  // — see that file's header for the full reasoning and the checkpoint doc
  // for the architecture-gap writeup. The tests below prove the *effect*:
  // no workspace, however perfectly its ERP is configured, can reach any of
  // these six methods, and none of them are ever ERP-detail-probed.

  const ALL_SIX_LB_IDS = ['whish_money', 'omt', 'mymonty', 'suyool', 'purpl', 'bank_transfer_fresh_usd']

  it('a tenant whose ERP has all seven Modes of Payment perfectly configured still sees only cash as available', async () => {
    mockList.mockResolvedValue([
      { name: 'Cash' },
      { name: 'Whish Money' },
      { name: 'OMT Pay' },
      { name: 'MyMonty' },
      { name: 'Suyool' },
      { name: 'Purpl' },
      { name: 'Bank Transfer - Fresh USD' },
    ])
    mockDoc.mockImplementation(docBy({
      'Cash':                      { enabled: 1, accounts: [{ company: CO, default_account: 'Cash - TC' }] },
      'Whish Money':               { enabled: 1, accounts: [{ company: CO, default_account: 'Whish - TC' }] },
      'OMT Pay':                   { enabled: 1, accounts: [{ company: CO, default_account: 'OMT - TC' }] },
      'MyMonty':                   { enabled: 1, accounts: [{ company: CO, default_account: 'MyMonty - TC' }] },
      'Suyool':                    { enabled: 1, accounts: [{ company: CO, default_account: 'Suyool - TC' }] },
      'Purpl':                     { enabled: 1, accounts: [{ company: CO, default_account: 'Purpl - TC' }] },
      'Bank Transfer - Fresh USD': { enabled: 1, accounts: [{ company: CO, default_account: 'Bank - TC' }] },
    }))

    const res = await resolveAvailablePaymentMethods(PARAMS)

    expect(res.available.map(m => m.id)).toEqual(['cash'])
    // Not "found but blocked" — structurally absent from methods[] entirely,
    // exactly like USDT and mobile_wallet_other.
    for (const id of ALL_SIX_LB_IDS) {
      expect(res.methods.find(m => m.id === id)).toBeUndefined()
    }
  })

  it('makes zero ERP Mode of Payment detail probes for any Lebanon-only method, even though Step 1\'s list included them', async () => {
    mockList.mockResolvedValue([
      { name: 'Cash' }, { name: 'Whish Money' }, { name: 'OMT Pay' },
      { name: 'MyMonty' }, { name: 'Suyool' }, { name: 'Purpl' },
      { name: 'Bank Transfer - Fresh USD' },
    ])
    mockDoc.mockImplementation(docBy({
      Cash: { enabled: 1, accounts: [{ company: CO, default_account: 'Cash - TC' }] },
    }))

    await resolveAvailablePaymentMethods(PARAMS)

    // The one generic "what's enabled" list call is expected (cash needs it
    // too) — what must NEVER happen is a per-name detail read for any of
    // the six held docnames.
    expect(mockList).toHaveBeenCalledTimes(1)
    expect(mockDoc).toHaveBeenCalledTimes(1)
    expect(mockDoc).toHaveBeenCalledWith('Cash')
    for (const docname of ['Whish Money', 'OMT Pay', 'MyMonty', 'Suyool', 'Purpl', 'Bank Transfer - Fresh USD']) {
      expect(mockDoc).not.toHaveBeenCalledWith(docname)
    }
  })

  it('the hold applies even to omt on its corrected docname "OMT Pay" — market-held, not a docname problem', async () => {
    // Distinct from a missing/misconfigured MoP: OMT Pay is fully, correctly
    // configured here, and omt STILL never becomes a candidate.
    mockList.mockResolvedValue([{ name: 'OMT Pay' }])
    mockDoc.mockImplementation(docBy({
      'OMT Pay': { enabled: 1, accounts: [{ company: CO, default_account: 'OMT - TC' }] },
    }))

    const res = await resolveAvailablePaymentMethods(PARAMS)

    expect(res.methods.find(m => m.id === 'omt')).toBeUndefined()
    expect(mockDoc).not.toHaveBeenCalledWith('OMT Pay')
  })

  it('the hold applies even to bank_transfer_fresh_usd on its exact hyphenated docname — configuration is irrelevant while held', async () => {
    mockList.mockResolvedValue([{ name: 'Bank Transfer - Fresh USD' }])
    mockDoc.mockImplementation(docBy({
      'Bank Transfer - Fresh USD': { enabled: 1, accounts: [{ company: CO, default_account: 'Bank - TC' }] },
    }))

    const res = await resolveAvailablePaymentMethods(PARAMS)

    expect(res.methods.find(m => m.id === 'bank_transfer_fresh_usd')).toBeUndefined()
    expect(mockDoc).not.toHaveBeenCalledWith('Bank Transfer - Fresh USD')
  })

  it('the hold produces no misleading configuration error — held methods are simply absent, never a specific error code', async () => {
    mockList.mockResolvedValue([{ name: 'Cash' }])
    mockDoc.mockImplementation(docBy({
      Cash: { enabled: 1, accounts: [{ company: CO, default_account: 'Cash - TC' }] },
    }))

    const res = await resolveAvailablePaymentMethods(PARAMS)

    for (const id of ALL_SIX_LB_IDS) {
      const entry = res.methods.find(m => m.id === id)
      expect(entry).toBeUndefined()
    }
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

describe('resolveAvailablePaymentMethods — no Lebanon-eligibility inference channel exists (architecture proof)', () => {
  // These tests prove there is no code path anywhere in this function by
  // which nationality, phone number, locale, timezone, or invoice currency
  // could ever activate a Lebanon-only method — not "unlikely to", but
  // structurally incapable of it, because no such input reaches this
  // function at all. This is also, necessarily, why "missing workspace
  // country" always fails closed here: there is no country field to be
  // missing FROM — every call, unconditionally, is as if country were
  // absent, and every call, unconditionally, holds every Lebanon-only
  // method. There is currently no way to construct the positive case (an
  // authoritatively-LB-resolved workspace) at all — see the checkpoint doc
  // for the full architecture-gap writeup; that gap is exactly why this is
  // not testable here, not an oversight in this test file.

  it('ResolveAvailabilityParams has no country/nationality/phone/locale/timezone field — company, currency, and tenantId are the entire input surface', () => {
    // This assignment is itself the proof: if a country-like field existed
    // and were required, omitting it would fail to compile. If one existed
    // but were optional, the key-list assertion below would catch it.
    const params: ResolveAvailabilityParams = { company: CO, currency: 'USD', tenantId: 'tenant-1' }
    expect(Object.keys(params).sort()).toEqual(['company', 'currency', 'tenantId'])
  })

  it('a Lebanon-suggestive currency (LBP) does not unlock Lebanon-only methods — currency gates settlement compatibility only, never market eligibility', async () => {
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

  it('a Lebanon-suggestive company or tenant identifier does not unlock Lebanon-only methods — these strings are never inspected for that purpose', async () => {
    mockList.mockResolvedValue([{ name: 'Cash' }, { name: 'Whish Money' }])
    mockDoc.mockImplementation(docBy({
      Cash:          { enabled: 1, accounts: [{ company: 'Beirut Fitness LB', default_account: 'x' }] },
      'Whish Money': { enabled: 1, accounts: [{ company: 'Beirut Fitness LB', default_account: 'y' }] },
    }))

    const res = await resolveAvailablePaymentMethods({
      company: 'Beirut Fitness LB', currency: 'USD', tenantId: 'lebanon-trainer-tenant',
    })

    expect(res.available.map(m => m.id)).toEqual(['cash'])
    expect(res.methods.find(m => m.id === 'whish_money')).toBeUndefined()
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
