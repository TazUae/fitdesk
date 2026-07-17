import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/tenant/context', () => ({
  getTenantContext: vi.fn(),
}))

import { getTenantContext } from '@/lib/tenant/context'
import { resetWorkspaceMarketCache, resolveWorkspaceMarket } from './market'

const TENANT_A = 'tenant-a'
const TENANT_B = 'tenant-b'

function ctxFor(tenantId: string | null) {
  return tenantId
    ? { userId: 'u1', slug: 's1', tenantId, provisioningStatus: 'active', lastSyncedAt: null }
    : null
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  resetWorkspaceMarketCache()
  process.env.CONTROL_PLANE_URL  = 'http://cp-api.test:4000'
  process.env.FITDESK_JWT_SECRET = 'test-jwt-secret-min-32-chars-xxxxxxxxxxxx'
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(getTenantContext).mockResolvedValue(ctxFor(TENANT_A))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const VERIFIED_LB_BODY = { operatingMarket: 'LB', verified: true, verifiedAt: '2026-07-20T10:00:00.000Z' }
const UNVERIFIED_BODY  = { operatingMarket: null, verified: false, verifiedAt: null }

describe('resolveWorkspaceMarket — accepted case', () => {
  it('a genuinely verified LB response is accepted', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, VERIFIED_LB_BODY))

    const result = await resolveWorkspaceMarket()

    expect(result).toEqual({ market: 'LB', verified: true })
  })

  it('sends the tenant JWT as a Bearer Authorization header and calls the correct path', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, VERIFIED_LB_BODY))

    await resolveWorkspaceMarket()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('http://cp-api.test:4000/api/erp/tenant/market')
    expect(init.method).toBe('GET')
    expect(init.headers.Authorization).toMatch(/^Bearer .+/)
  })
})

describe('resolveWorkspaceMarket — fail-closed matrix', () => {
  it('a null operatingMarket / verified:false response fails closed', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, UNVERIFIED_BODY))
    expect(await resolveWorkspaceMarket()).toEqual({ market: null, verified: false })
  })

  it('operatingMarket:"LB" but verified:false fails closed (verified is the authority, not the market string alone)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { operatingMarket: 'LB', verified: false, verifiedAt: null }))
    expect(await resolveWorkspaceMarket()).toEqual({ market: null, verified: false })
  })

  it('an unsupported market string (not "LB") fails closed even if verified:true', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { operatingMarket: 'US', verified: true, verifiedAt: '2026-01-01T00:00:00.000Z' }))
    expect(await resolveWorkspaceMarket()).toEqual({ market: null, verified: false })
  })

  it('a malformed response body (not an object) fails closed', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, 'not-an-object'))
    expect(await resolveWorkspaceMarket()).toEqual({ market: null, verified: false })
  })

  it('a response missing required fields fails closed', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { operatingMarket: 'LB' })) // missing verified/verifiedAt
    expect(await resolveWorkspaceMarket()).toEqual({ market: null, verified: false })
  })

  it('a response with extra/unexpected fields (contract mismatch) fails closed', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ...VERIFIED_LB_BODY, country: 'LB' }))
    expect(await resolveWorkspaceMarket()).toEqual({ market: null, verified: false })
  })

  it('verified:true with an invalid (non-parseable) verifiedAt fails closed', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { operatingMarket: 'LB', verified: true, verifiedAt: 'not-a-date' }))
    expect(await resolveWorkspaceMarket()).toEqual({ market: null, verified: false })
  })

  it('verified:true with a null verifiedAt fails closed (an internally inconsistent contract)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { operatingMarket: 'LB', verified: true, verifiedAt: null }))
    expect(await resolveWorkspaceMarket()).toEqual({ market: null, verified: false })
  })

  for (const status of [401, 403, 404, 409, 429, 500, 502, 503]) {
    it(`HTTP ${status} fails closed`, async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(status, { error: 'unauthorized-or-error' }))
      expect(await resolveWorkspaceMarket()).toEqual({ market: null, verified: false })
    })
  }

  it('invalid JSON in the response body fails closed', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token') },
    })
    expect(await resolveWorkspaceMarket()).toEqual({ market: null, verified: false })
  })

  it('a network error (fetch rejects) fails closed', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    expect(await resolveWorkspaceMarket()).toEqual({ market: null, verified: false })
  })

  it('a DNS-style resolution error fails closed', async () => {
    fetchMock.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND cp-api.test'))
    expect(await resolveWorkspaceMarket()).toEqual({ market: null, verified: false })
  })

  it('an aborted/timed-out request fails closed', async () => {
    // Simulates what the bounded-timeout AbortController produces once it
    // fires: fetch rejects with an AbortError. Exercising the resolver's
    // reaction to that rejection, rather than the literal 10s wall-clock
    // duration, is what this test needs to prove.
    fetchMock.mockRejectedValueOnce(new DOMException('The operation was aborted', 'AbortError'))
    expect(await resolveWorkspaceMarket()).toEqual({ market: null, verified: false })
  })

  it('the request is genuinely bounded — an AbortController signal is passed to fetch', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, VERIFIED_LB_BODY))
    await resolveWorkspaceMarket()
    const init = fetchMock.mock.calls[0][1]
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('no tenant context (not signed in) fails closed without ever calling fetch', async () => {
    vi.mocked(getTenantContext).mockResolvedValueOnce(null)
    expect(await resolveWorkspaceMarket()).toEqual({ market: null, verified: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('CONTROL_PLANE_URL not configured fails closed without calling fetch', async () => {
    delete process.env.CONTROL_PLANE_URL
    expect(await resolveWorkspaceMarket()).toEqual({ market: null, verified: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('FITDESK_JWT_SECRET not configured fails closed', async () => {
    delete process.env.FITDESK_JWT_SECRET
    expect(await resolveWorkspaceMarket()).toEqual({ market: null, verified: false })
  })

  it('failure never throws — every failure mode resolves, never rejects', async () => {
    fetchMock.mockRejectedValueOnce(new Error('boom'))
    await expect(resolveWorkspaceMarket()).resolves.toEqual({ market: null, verified: false })
  })
})

describe('resolveWorkspaceMarket — tenant isolation', () => {
  it('tenant A\'s verified LB authority is never returned for tenant B', async () => {
    vi.mocked(getTenantContext).mockResolvedValueOnce(ctxFor(TENANT_A))
    fetchMock.mockResolvedValueOnce(jsonResponse(200, VERIFIED_LB_BODY))
    const a = await resolveWorkspaceMarket()
    expect(a).toEqual({ market: 'LB', verified: true })

    vi.mocked(getTenantContext).mockResolvedValueOnce(ctxFor(TENANT_B))
    fetchMock.mockResolvedValueOnce(jsonResponse(200, UNVERIFIED_BODY))
    const b = await resolveWorkspaceMarket()
    expect(b).toEqual({ market: null, verified: false })

    // Two distinct requests were made — tenant B's result was never served
    // from tenant A's cache entry.
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('the cache key is scoped per tenantId, never shared', async () => {
    vi.mocked(getTenantContext).mockResolvedValue(ctxFor(TENANT_A))
    fetchMock.mockResolvedValue(jsonResponse(200, VERIFIED_LB_BODY))
    await resolveWorkspaceMarket()
    await resolveWorkspaceMarket() // same tenant, within TTL -> cached, 1 fetch total
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.mocked(getTenantContext).mockResolvedValue(ctxFor(TENANT_B))
    fetchMock.mockResolvedValue(jsonResponse(200, UNVERIFIED_BODY))
    await resolveWorkspaceMarket() // different tenant -> must NOT hit tenant A's cache
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('resolveWorkspaceMarket — bounded cache, expiry, and revocation safety', () => {
  it('an identical call within the TTL window is served from cache — exactly one fetch', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    fetchMock.mockResolvedValue(jsonResponse(200, VERIFIED_LB_BODY))

    await resolveWorkspaceMarket()
    vi.setSystemTime(30_000) // well within the 60s TTL
    await resolveWorkspaceMarket()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('a cached verified-LB result expires after the bounded TTL and re-probes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    fetchMock.mockResolvedValueOnce(jsonResponse(200, VERIFIED_LB_BODY))
    const first = await resolveWorkspaceMarket()
    expect(first).toEqual({ market: 'LB', verified: true })

    // Past the bounded TTL (60s) — a revoke that happened in the meantime
    // must be observed on the next call, not masked by a stale cache entry.
    vi.setSystemTime(61_000)
    fetchMock.mockResolvedValueOnce(jsonResponse(200, UNVERIFIED_BODY))
    const second = await resolveWorkspaceMarket()

    expect(second).toEqual({ market: null, verified: false })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('a failed lookup is itself cached (never hammering a struggling Control Plane) but never as an authorized value', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    fetchMock.mockRejectedValueOnce(new Error('boom'))
    const first = await resolveWorkspaceMarket()
    expect(first).toEqual({ market: null, verified: false })

    vi.setSystemTime(1_000) // still within TTL
    const second = await resolveWorkspaceMarket()
    expect(second).toEqual({ market: null, verified: false })
    // Second call served from the (fail-closed) cache -- only one fetch total.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('resetWorkspaceMarketCache clears all cached entries regardless of tenant', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, VERIFIED_LB_BODY))
    await resolveWorkspaceMarket()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    resetWorkspaceMarketCache()

    fetchMock.mockResolvedValueOnce(jsonResponse(200, VERIFIED_LB_BODY))
    await resolveWorkspaceMarket()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
