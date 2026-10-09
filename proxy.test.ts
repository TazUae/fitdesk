import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@better-fetch/fetch', () => ({ betterFetch: vi.fn() }))

import { betterFetch } from '@better-fetch/fetch'
import { proxy } from './proxy'

// Synthetic session and tenant-provisioning responses only; no real auth server or ERP requests.
const fetchMock = vi.mocked(betterFetch)

function dashboardRequest(path = '/dashboard/sessions', cookie?: string) {
  return new NextRequest('https://fitdesk.example' + path, {
    headers: cookie ? { cookie } : {},
  })
}

function authenticated() {
  return {
    data: {
      session: { id: 'session-one', userId: 'user-one', expiresAt: '2026-11-09T00:00:00Z' },
      user: { id: 'user-one', email: 'trainer@example.test', name: 'Trainer' },
    },
    error: null,
  } as never
}

describe('Next 16 dashboard proxy — fail-closed session and provisioning gate', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('redirects anonymous requests to login and preserves the intended dashboard path', async () => {
    fetchMock.mockResolvedValueOnce({ data: null, error: null } as never)
    const response = await proxy(dashboardRequest('/dashboard/sessions'))
    const location = new URL(response.headers.get('location')!)
    expect(response.status).toBe(307)
    expect(location.pathname).toBe('/auth/login')
    expect(location.searchParams.get('callbackUrl')).toBe('/dashboard/sessions')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('never grants dashboard access when the workspace has not completed provisioning', async () => {
    fetchMock.mockResolvedValueOnce(authenticated())
    fetchMock.mockResolvedValueOnce({ data: { status: 'pending' }, error: null } as never)
    const response = await proxy(dashboardRequest())
    expect(new URL(response.headers.get('location')!).pathname).toBe('/onboarding')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('redirects to onboarding if the provisioning call fails', async () => {
    fetchMock.mockResolvedValueOnce(authenticated())
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = await proxy(dashboardRequest())
      expect(new URL(response.headers.get('location')!).pathname).toBe('/onboarding')
    } finally {
      log.mockRestore()
    }
  })

  it('only continues for a valid session with a completed workspace', async () => {
    fetchMock.mockResolvedValueOnce(authenticated())
    fetchMock.mockResolvedValueOnce({ data: { status: 'completed' }, error: null } as never)
    const response = await proxy(dashboardRequest('/dashboard/clients'))
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('forwards the same cookie to session and provisioning reads without changing identities', async () => {
    fetchMock.mockResolvedValueOnce(authenticated())
    fetchMock.mockResolvedValueOnce({ data: { status: 'completed' }, error: null } as never)
    const cookie = 'better-auth.session_token=synthetic-fixture-only'
    await proxy(dashboardRequest('/dashboard/clients', cookie))
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/auth/get-session',
      expect.objectContaining({ headers: { cookie } }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/provisioning/status',
      expect.objectContaining({ headers: { cookie } }),
    )
  })
})
