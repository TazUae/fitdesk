/**
 * Unit tests for isClientHubEnabled() flag semantics.
 *
 * server-only is globally aliased to an empty stub by vitest.config.ts.
 * All other server-side imports in hub.ts are mocked below.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db',          () => ({ db: {} }))
vi.mock('@/lib/tenant/context', () => ({ getTenantContext: vi.fn() }))
vi.mock('@/lib/clients/repository', () => ({ ClientRepository: vi.fn() }))
vi.mock('@/lib/billing/client-package-purchase-repository', () => ({
  ClientPackagePurchaseRepository: vi.fn(),
}))
vi.mock('@/lib/billing/package-ledger-repository', () => ({
  PackageLedgerRepository: vi.fn(),
}))
vi.mock('@/lib/clients/hub-map', () => ({ mapToClientHubOverview: vi.fn() }))

import { isClientHubEnabled } from '@/lib/clients/hub'

const TENANT = 'tenant-abc'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isClientHubEnabled', () => {
  // 1. env unset → enabled (MVP default)
  it('1. env unset → enabled', () => {
    delete process.env['FITDESK_CLIENT_HUB_ENABLED']
    expect(isClientHubEnabled(TENANT)).toBe(true)
  })

  // 2. env "1" → enabled
  it('2. env "1" → enabled', () => {
    vi.stubEnv('FITDESK_CLIENT_HUB_ENABLED', '1')
    expect(isClientHubEnabled(TENANT)).toBe(true)
  })

  // 3. env "0" → disabled
  it('3. env "0" → disabled', () => {
    vi.stubEnv('FITDESK_CLIENT_HUB_ENABLED', '0')
    expect(isClientHubEnabled(TENANT)).toBe(false)
  })

  // 4. env "false" → disabled
  it('4. env "false" → disabled', () => {
    vi.stubEnv('FITDESK_CLIENT_HUB_ENABLED', 'false')
    expect(isClientHubEnabled(TENANT)).toBe(false)
  })

  it('4b. env "FALSE" (case-insensitive) → disabled', () => {
    vi.stubEnv('FITDESK_CLIENT_HUB_ENABLED', 'FALSE')
    expect(isClientHubEnabled(TENANT)).toBe(false)
  })

  it('empty tenantId → disabled regardless of flag', () => {
    delete process.env['FITDESK_CLIENT_HUB_ENABLED']
    expect(isClientHubEnabled('')).toBe(false)
    expect(isClientHubEnabled('   ')).toBe(false)
  })

  // 5. tenant allowlist behaviour
  it('5a. allowlist set and tenant is in the list → enabled', () => {
    delete process.env['FITDESK_CLIENT_HUB_ENABLED']
    vi.stubEnv('FITDESK_CLIENT_HUB_TENANTS', `${TENANT},other`)
    expect(isClientHubEnabled(TENANT)).toBe(true)
  })

  it('5b. allowlist set and tenant is NOT in the list → disabled', () => {
    delete process.env['FITDESK_CLIENT_HUB_ENABLED']
    vi.stubEnv('FITDESK_CLIENT_HUB_TENANTS', 'other-tenant,another')
    expect(isClientHubEnabled(TENANT)).toBe(false)
  })

  it('5c. allowlist is empty string → allowlist ignored, enabled', () => {
    delete process.env['FITDESK_CLIENT_HUB_ENABLED']
    vi.stubEnv('FITDESK_CLIENT_HUB_TENANTS', '')
    expect(isClientHubEnabled(TENANT)).toBe(true)
  })

  it('5d. allowlist restricts even when flag is explicitly "1"', () => {
    vi.stubEnv('FITDESK_CLIENT_HUB_ENABLED', '1')
    vi.stubEnv('FITDESK_CLIENT_HUB_TENANTS', 'other-tenant')
    expect(isClientHubEnabled(TENANT)).toBe(false)
  })

  it('5e. allowlist with whitespace-padded entries is trimmed correctly', () => {
    delete process.env['FITDESK_CLIENT_HUB_ENABLED']
    vi.stubEnv('FITDESK_CLIENT_HUB_TENANTS', ` ${TENANT} , other `)
    expect(isClientHubEnabled(TENANT)).toBe(true)
  })
})
