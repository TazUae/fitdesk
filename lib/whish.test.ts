/**
 * Unit tests for lib/whish.ts (US-030 — Production Feature Flag Verification).
 *
 * Found while building the Sprint 1 flag inventory
 * (docs/execution/sprint-1-us-030-flag-inventory.md): generatePaymentLink had
 * zero test coverage, and its most safety-relevant behavior — Whish fails
 * closed with "not configured" when WHISH_API_URL/KEY/MERCHANT_ID are unset,
 * which is the actual default in .env.example — was unverified. The real
 * Whish API call is commented out in lib/whish.ts (mock-only today), and
 * isExternalPaymentsAllowed() from lib/pilot.ts is not consulted anywhere in
 * this file; that gap is documented in the flag inventory, not fixed here
 * (fixing it is a payment-logic change requiring approval per CLAUDE.md §4).
 *
 * No production code is changed by this file.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generatePaymentLink, getPaymentAdapter, PAYMENT_PROVIDERS } from '@/lib/whish'

const ENV_KEYS = ['WHISH_API_URL', 'WHISH_API_KEY', 'WHISH_MERCHANT_ID'] as const
let savedEnv: Record<string, string | undefined>

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]))
  for (const k of ENV_KEYS) delete process.env[k]
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

describe('generatePaymentLink — whish, unconfigured (the real default per .env.example)', () => {
  it('fails closed with a "not configured" error when no Whish env vars are set', async () => {
    const result = await generatePaymentLink(100, 'Jane Doe', 'SINV-1', 'whish', 'USD')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not configured/i)
    expect(result.url).toBeUndefined()
  })

  it('fails closed when only some Whish env vars are set', async () => {
    process.env.WHISH_API_URL = 'https://example.test'
    // API_KEY and MERCHANT_ID left unset
    const result = await generatePaymentLink(100, 'Jane Doe', 'SINV-1', 'whish', 'USD')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not configured/i)
  })

  it('defaults to the whish provider when none is specified', async () => {
    const result = await generatePaymentLink(100, 'Jane Doe', 'SINV-1')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not configured/i)
  })
})

describe('generatePaymentLink — whish, fully configured (mock URL — real API call is commented out)', () => {
  it('returns a mock URL once all three env vars are set', async () => {
    process.env.WHISH_API_URL     = 'https://whish.example'
    process.env.WHISH_API_KEY     = 'test-key'
    process.env.WHISH_MERCHANT_ID = 'merchant-1'

    const result = await generatePaymentLink(250, 'Ali Hassan', 'SINV-42', 'whish', 'AED')

    expect(result.success).toBe(true)
    expect(result.url).toContain('https://whish.example/pay/')
    expect(result.url).toContain('amount=250')
    expect(result.url).toContain('currency=AED')
    expect(result.reference).toMatch(/^WHISH-SINV-42-/)
  })
})

describe('generatePaymentLink — manual providers (cash, bank_transfer)', () => {
  it('cash returns success with no url regardless of Whish env config', async () => {
    const result = await generatePaymentLink(100, 'Jane Doe', 'SINV-1', 'cash')
    expect(result).toEqual({ success: true })
  })

  it('bank_transfer returns success with no url', async () => {
    const result = await generatePaymentLink(100, 'Jane Doe', 'SINV-1', 'bank_transfer')
    expect(result).toEqual({ success: true })
  })
})

describe('getPaymentAdapter', () => {
  it('returns the correct provider for each known value', () => {
    expect(getPaymentAdapter('whish').provider).toBe('whish')
    expect(getPaymentAdapter('cash').provider).toBe('cash')
    expect(getPaymentAdapter('bank_transfer').provider).toBe('bank_transfer')
  })
})

describe('PAYMENT_PROVIDERS', () => {
  it('lists all three providers with correct supportsLink flags', () => {
    const byProvider = Object.fromEntries(PAYMENT_PROVIDERS.map(p => [p.provider, p]))
    expect(byProvider.whish.supportsLink).toBe(true)
    expect(byProvider.cash.supportsLink).toBe(false)
    expect(byProvider.bank_transfer.supportsLink).toBe(false)
  })
})
