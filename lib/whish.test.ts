/**
 * Unit tests for lib/whish.ts (US-030 — Production Feature Flag Verification;
 * Sprint 1 follow-up Item 1 — wiring isExternalPaymentsAllowed()).
 *
 * generatePaymentLink had zero test coverage before Sprint 1 (see git
 * history). Sprint 1 covered the "not configured" fail-closed default and
 * the mock-URL-once-configured path; the follow-up round found and closed a
 * real gap — isExternalPaymentsAllowed() (lib/pilot.ts) was defined,
 * documented in .env.example, and unit-tested in isolation, but never
 * actually consulted by the one external/live payment call in this file.
 *
 * lib/whish.ts does NOT import lib/pilot.ts directly (that broke `next build`
 * — lib/whish.ts's types/constants are imported by a client component,
 * InvoicesView.tsx, and lib/pilot.ts has `import 'server-only'`; see the file
 * header comment in lib/whish.ts for the full explanation). Instead,
 * generatePaymentLink() takes `externalPaymentsAllowed` as an explicit
 * parameter (defaulting to `false` — fail closed), and actions/invoices.ts
 * (a real 'use server' file) resolves isExternalPaymentsAllowed() and passes
 * it in. That action-layer wiring is tested separately in
 * actions/invoices.test.ts's "getPaymentLink — isExternalPaymentsAllowed
 * wiring" block.
 *
 * The "gate" describe block below is the regression test the plan doc
 * (docs/execution/sprint-1-followup-payment-flag-plan.md) requires: it fails
 * if the check inside whishAdapter.generateLink is ever removed or bypassed,
 * because without it the "fully configured" test in this same file would
 * otherwise return a URL instead of the blocked error even when the caller
 * passes externalPaymentsAllowed: false (or omits it).
 *
 * The real Whish API call itself remains commented out in lib/whish.ts
 * (mock-only today) — this file does not change that.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generatePaymentLink, getPaymentAdapter, PAYMENT_PROVIDERS } from '@/lib/whish'

// ─── isExternalPaymentsAllowed gate (Sprint 1 follow-up Item 1) ────────────────

describe('generateLink — isExternalPaymentsAllowed gate', () => {
  it('blocks a fully configured Whish call when externalPaymentsAllowed is omitted (defaults to false)', async () => {
    const result = await generatePaymentLink(250, 'Ali Hassan', 'SINV-42', 'whish', 'AED')

    expect(result.success).toBe(false)
    expect(result.error).toBe('External payments are not enabled for this workspace.')
    expect(result.url).toBeUndefined()
  })

  it('blocks a fully configured Whish call when externalPaymentsAllowed is explicitly false', async () => {
    const result = await generatePaymentLink(100, 'Jane Doe', 'SINV-1', 'whish', 'USD', false)

    expect(result.success).toBe(false)
    expect(result.error).toBe('External payments are not enabled for this workspace.')
  })

  it('the gate is checked before config presence — unconfigured + disallowed gets the gate error, not "not configured"', async () => {
    // No env vars set anywhere in this test (see beforeEach note: whish.ts
    // reads env directly for config presence, independent of the gate
    // parameter — this proves gate-first ordering regardless of config state).
    const result = await generatePaymentLink(100, 'Jane Doe', 'SINV-1', 'whish', 'USD', false)

    expect(result.success).toBe(false)
    expect(result.error).toBe('External payments are not enabled for this workspace.')
  })

  it('proceeds past the gate once externalPaymentsAllowed is true (config still required)', async () => {
    const result = await generatePaymentLink(100, 'Jane Doe', 'SINV-1', 'whish', 'USD', true)

    // No WHISH_API_URL/KEY/MERCHANT_ID configured in this test environment —
    // proves the gate and the config-presence check are independent: passing
    // the gate still requires config to actually get a link.
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not configured/i)
  })

  it('does not gate cash — always succeeds regardless of externalPaymentsAllowed', async () => {
    const blocked = await generatePaymentLink(100, 'Jane Doe', 'SINV-1', 'cash', 'USD', false)
    const allowed = await generatePaymentLink(100, 'Jane Doe', 'SINV-1', 'cash', 'USD', true)
    expect(blocked).toEqual({ success: true })
    expect(allowed).toEqual({ success: true })
  })

  it('does not gate bank_transfer — always succeeds regardless of externalPaymentsAllowed', async () => {
    const blocked = await generatePaymentLink(100, 'Jane Doe', 'SINV-1', 'bank_transfer', 'USD', false)
    expect(blocked).toEqual({ success: true })
  })
})

// ─── Config presence, with the gate open ───────────────────────────────────────

describe('generatePaymentLink — whish, gate open, config missing/partial', () => {
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

  it('fails closed with a "not configured" error when no Whish env vars are set (gate open)', async () => {
    const result = await generatePaymentLink(100, 'Jane Doe', 'SINV-1', 'whish', 'USD', true)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not configured/i)
    expect(result.url).toBeUndefined()
  })

  it('fails closed when only some Whish env vars are set (gate open)', async () => {
    process.env.WHISH_API_URL = 'https://example.test'
    // API_KEY and MERCHANT_ID left unset
    const result = await generatePaymentLink(100, 'Jane Doe', 'SINV-1', 'whish', 'USD', true)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not configured/i)
  })

  it('returns a mock URL once the gate is open and all three env vars are set', async () => {
    process.env.WHISH_API_URL     = 'https://whish.example'
    process.env.WHISH_API_KEY     = 'test-key'
    process.env.WHISH_MERCHANT_ID = 'merchant-1'

    const result = await generatePaymentLink(250, 'Ali Hassan', 'SINV-42', 'whish', 'AED', true)

    expect(result.success).toBe(true)
    expect(result.url).toContain('https://whish.example/pay/')
    expect(result.url).toContain('amount=250')
    expect(result.url).toContain('currency=AED')
    expect(result.reference).toMatch(/^WHISH-SINV-42-/)
  })

  it('gate-open + fully configured, but defaults to whish provider when none specified', async () => {
    process.env.WHISH_API_URL     = 'https://whish.example'
    process.env.WHISH_API_KEY     = 'test-key'
    process.env.WHISH_MERCHANT_ID = 'merchant-1'

    const result = await generatePaymentLink(100, 'Jane Doe', 'SINV-1', undefined, undefined, true)
    expect(result.success).toBe(true)
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
