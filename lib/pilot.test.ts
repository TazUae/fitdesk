import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { isExternalPaymentsAllowed, isPilotMode, matchAllowlist } from './pilot'

describe('isPilotMode', () => {
  it.each([
    ['true', true],
    ['1', true],
    ['false', false],
    ['0', false],
    ['', false],
    [undefined, false],
    ['TRUE', false], // strict — only literal "true" / "1"
  ])('PILOT_MODE=%s → %s', (value, expected) => {
    expect(isPilotMode({ PILOT_MODE: value } as never)).toBe(expected)
  })
})

describe('isExternalPaymentsAllowed', () => {
  it('defaults to false', () => {
    expect(isExternalPaymentsAllowed({} as never)).toBe(false)
  })

  it('allows when set to "true"', () => {
    expect(isExternalPaymentsAllowed({ PILOT_ALLOW_EXTERNAL_PAYMENTS: 'true' } as never)).toBe(true)
  })
})

describe('matchAllowlist', () => {
  it('blocks when destination is empty', () => {
    const r = matchAllowlist('', '971501234567', undefined)
    expect(r.allowed).toBe(false)
    expect(r.reason).toMatch(/missing/)
  })

  it('blocks when no allowlist is configured', () => {
    const r = matchAllowlist('971501234567', undefined, undefined)
    expect(r.allowed).toBe(false)
    expect(r.reason).toMatch(/no allowlisted test phone configured/)
  })

  it('allows exact match', () => {
    const r = matchAllowlist('971501234567', '971501234567', undefined)
    expect(r.allowed).toBe(true)
    expect(r.reason).toBeUndefined()
  })

  it('blocks unmatched destination when only exact configured', () => {
    const r = matchAllowlist('971502222222', '971501234567', undefined)
    expect(r.allowed).toBe(false)
    expect(r.reason).toMatch(/not on the test allowlist/)
  })

  it('allows prefix match', () => {
    const r = matchAllowlist('971501234567', undefined, '971')
    expect(r.allowed).toBe(true)
  })

  it('allows prefix match in multi-prefix list', () => {
    const r = matchAllowlist('15551234567', undefined, '961,1555')
    expect(r.allowed).toBe(true)
  })

  it('blocks prefix mismatch', () => {
    const r = matchAllowlist('966501234567', undefined, '961,971')
    expect(r.allowed).toBe(false)
  })

  it('tolerates leading + in prefix env (helpful UX)', () => {
    const r = matchAllowlist('971501234567', undefined, '+971')
    expect(r.allowed).toBe(true)
  })

  it('tolerates whitespace in prefix env', () => {
    const r = matchAllowlist('971501234567', undefined, ' 971 , 961 ')
    expect(r.allowed).toBe(true)
  })

  it('exact match takes priority alongside prefix mismatch', () => {
    const r = matchAllowlist('966501234567', '966501234567', '971,961')
    expect(r.allowed).toBe(true)
  })
})
