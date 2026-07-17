/**
 * Unit tests for the pilot safety-gate helpers (US-030).
 *
 * All three functions under test accept an explicit env/argument input -
 * no global `process.env` mutation is used or needed. These assert current
 * runtime behavior exactly; no production code is changed by this file.
 */
import { describe, expect, it } from 'vitest'
import { isExternalPaymentsAllowed, isPilotMode, matchAllowlist } from '@/lib/pilot'

describe('isPilotMode', () => {
  it('returns false when PILOT_MODE is unset', () => {
    expect(isPilotMode({})).toBe(false)
  })

  it('returns true for "1"', () => {
    expect(isPilotMode({ PILOT_MODE: '1' })).toBe(true)
  })

  it('returns true for "true"', () => {
    expect(isPilotMode({ PILOT_MODE: 'true' })).toBe(true)
  })

  it('returns false for "0"', () => {
    expect(isPilotMode({ PILOT_MODE: '0' })).toBe(false)
  })

  it('returns false for "false"', () => {
    expect(isPilotMode({ PILOT_MODE: 'false' })).toBe(false)
  })

  it('returns false for an unrelated/other value', () => {
    expect(isPilotMode({ PILOT_MODE: 'yes' })).toBe(false)
  })
})

describe('isExternalPaymentsAllowed', () => {
  it('returns false when PILOT_ALLOW_EXTERNAL_PAYMENTS is unset (safe default)', () => {
    expect(isExternalPaymentsAllowed({})).toBe(false)
  })

  it('returns true for "1"', () => {
    expect(isExternalPaymentsAllowed({ PILOT_ALLOW_EXTERNAL_PAYMENTS: '1' })).toBe(true)
  })

  it('returns true for "true"', () => {
    expect(isExternalPaymentsAllowed({ PILOT_ALLOW_EXTERNAL_PAYMENTS: 'true' })).toBe(true)
  })

  it('returns false for "0"', () => {
    expect(isExternalPaymentsAllowed({ PILOT_ALLOW_EXTERNAL_PAYMENTS: '0' })).toBe(false)
  })

  it('returns false for "false"', () => {
    expect(isExternalPaymentsAllowed({ PILOT_ALLOW_EXTERNAL_PAYMENTS: 'false' })).toBe(false)
  })

  it('returns false for an unrelated/other value', () => {
    expect(isExternalPaymentsAllowed({ PILOT_ALLOW_EXTERNAL_PAYMENTS: 'enabled' })).toBe(false)
  })
})

describe('matchAllowlist', () => {
  it('fails closed when no allowlist is configured', () => {
    expect(matchAllowlist('971501234567', undefined, undefined)).toEqual({
      allowed: false,
      reason:  'Pilot mode: no allowlisted test phone configured.',
    })
  })

  it('returns false for an empty destination', () => {
    expect(matchAllowlist('', '971501234567', undefined)).toEqual({
      allowed: false,
      reason:  'Destination phone is missing or invalid.',
    })
  })

  it('allows an exact phone match', () => {
    expect(matchAllowlist('971501234567', '971501234567', undefined)).toEqual({ allowed: true })
  })

  it('allows a prefix match', () => {
    expect(matchAllowlist('971501234567', undefined, '971501')).toEqual({ allowed: true })
  })

  it('denies a destination that matches neither exact nor prefix', () => {
    expect(matchAllowlist('971509999999', '971501234567', '971502')).toEqual({
      allowed: false,
      reason:  'Pilot mode: target phone is not on the test allowlist.',
    })
  })

  it('tolerates a "+" prefix written by mistake in the allowlist', () => {
    expect(matchAllowlist('971501234567', '+971501234567', undefined)).toEqual({ allowed: true })
  })

  it('matches against multiple comma-separated exact values', () => {
    expect(matchAllowlist('971502222222', '971501111111,971502222222,971503333333', undefined)).toEqual({
      allowed: true,
    })
  })

  it('matches against multiple comma-separated prefix values', () => {
    expect(matchAllowlist('971502999999', undefined, '971501,971502,971503')).toEqual({ allowed: true })
  })

  it('denies when destination matches none of multiple exact/prefix values', () => {
    expect(matchAllowlist('971509999999', '971501111111,971502222222', '971503,971504')).toEqual({
      allowed: false,
      reason:  'Pilot mode: target phone is not on the test allowlist.',
    })
  })
})
