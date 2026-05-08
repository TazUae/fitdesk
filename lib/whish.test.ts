import { afterEach, beforeEach, describe, expect, it } from 'vitest'

vi.mock('server-only', () => ({}))

import { getWhishReadiness } from './whish'
import { vi } from 'vitest'

describe('getWhishReadiness', () => {
  const ENV_KEYS = ['WHISH_API_URL', 'WHISH_API_KEY', 'WHISH_MERCHANT_ID'] as const
  const original: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      original[k] = process.env[k]
      delete process.env[k]
    }
  })

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (original[k] === undefined) delete process.env[k]
      else process.env[k] = original[k]
    }
  })

  it('reports not configured when all three env vars are missing', () => {
    expect(getWhishReadiness()).toEqual({
      configured: false,
      hasApiUrl: false,
      hasApiKey: false,
      hasMerchantId: false,
    })
  })

  it('reports configured when all three env vars are present', () => {
    process.env.WHISH_API_URL     = 'https://example.test'
    process.env.WHISH_API_KEY     = 'k'
    process.env.WHISH_MERCHANT_ID = 'm'
    expect(getWhishReadiness().configured).toBe(true)
  })

  it('reports not configured when one var is missing', () => {
    process.env.WHISH_API_URL = 'https://example.test'
    process.env.WHISH_API_KEY = 'k'
    // merchant id missing
    const r = getWhishReadiness()
    expect(r.configured).toBe(false)
    expect(r.hasMerchantId).toBe(false)
  })

  it('does not return env values themselves', () => {
    process.env.WHISH_API_URL     = 'https://secret.example/v1'
    process.env.WHISH_API_KEY     = 'super-secret-key'
    process.env.WHISH_MERCHANT_ID = 'merchant-xyz'
    const r = getWhishReadiness()
    const serialized = JSON.stringify(r)
    expect(serialized).not.toContain('secret.example')
    expect(serialized).not.toContain('super-secret-key')
    expect(serialized).not.toContain('merchant-xyz')
  })
})
