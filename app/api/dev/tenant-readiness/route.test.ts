import { afterEach, describe, expect, it, vi } from 'vitest'

// Mock everything the route reaches at import time so the GET handler can be
// invoked without a full Next.js / DB / CP runtime.
vi.mock('next/headers', () => ({ headers: () => new Headers() }))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))
vi.mock('@/lib/db', () => ({ db: { query: { workspaceProvisioning: { findFirst: vi.fn() } } } }))
vi.mock('@/lib/db/schema', () => ({ workspaceProvisioning: {} }))
vi.mock('@/lib/controlplane/client', () => ({ getTenant: vi.fn() }))
vi.mock('@/lib/tenant/context', () => ({ getTenantContext: vi.fn() }))
vi.mock('@/lib/dev/tenant-readiness', () => ({
  buildPayload:           vi.fn(),
  erpFailure:             vi.fn(),
  erpFetchForTenant:      vi.fn(),
  erpMethodForTenant:     vi.fn(),
  isMethodRouteMissing:   vi.fn(() => false),
  isProductionEnv:        (v: string | undefined) => v === 'production',
  normalizeSingleMessage: vi.fn(),
  parseTenantOverride:    vi.fn(() => null),
  scrubSensitive:         (s: string) => s,
  upstreamFailure:        vi.fn(),
}))

import { GET } from './route'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('GET /api/dev/tenant-readiness', () => {
  it('returns 404 in production regardless of auth', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const res = await GET(new Request('http://test/api/dev/tenant-readiness'))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toEqual({ error: 'Not found' })
  })

  it('returns 401 in non-production when unauthenticated', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const { auth } = await import('@/lib/auth')
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never)

    const res = await GET(new Request('http://test/api/dev/tenant-readiness'))
    expect(res.status).toBe(401)
  })
})
