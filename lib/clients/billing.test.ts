import { describe, expect, it } from 'vitest'
import {
  BILLING_MODES,
  billingPayloadFields,
  describeBilling,
  emptyBillingDraft,
  validateBillingDraft,
  type BillingDraft,
} from './billing'

// Helper — build a draft from a partial override.
function draft(overrides: Partial<BillingDraft>): BillingDraft {
  return { ...emptyBillingDraft, ...overrides }
}

describe('BILLING_MODES', () => {
  it('lists the three modes', () => {
    expect(BILLING_MODES).toEqual(['Package', 'Pay Per Session', 'Trial'])
  })
})

describe('validateBillingDraft', () => {
  it('rejects when no mode is selected', () => {
    const res = validateBillingDraft(emptyBillingDraft)
    expect(res).toEqual({ ok: false, error: 'Choose how this client will be billed.' })
  })

  it('accepts Trial with no extra fields', () => {
    expect(validateBillingDraft(draft({ mode: 'Trial' }))).toEqual({ ok: true })
  })

  // ── Pay Per Session ──
  it('accepts Pay Per Session with a valid rate', () => {
    expect(validateBillingDraft(draft({ mode: 'Pay Per Session', sessionRate: '50' }))).toEqual({ ok: true })
  })

  it('accepts Pay Per Session with a decimal rate', () => {
    expect(validateBillingDraft(draft({ mode: 'Pay Per Session', sessionRate: '49.99' }))).toEqual({ ok: true })
  })

  it('rejects Pay Per Session with an empty rate', () => {
    expect(validateBillingDraft(draft({ mode: 'Pay Per Session', sessionRate: '' }))).toEqual({
      ok: false, error: 'Enter a session rate.',
    })
  })

  it('rejects Pay Per Session with a zero rate', () => {
    expect(validateBillingDraft(draft({ mode: 'Pay Per Session', sessionRate: '0' }))).toEqual({
      ok: false, error: 'Session rate must be greater than 0.',
    })
  })

  it('rejects Pay Per Session with a negative rate', () => {
    expect(validateBillingDraft(draft({ mode: 'Pay Per Session', sessionRate: '-5' }))).toEqual({
      ok: false, error: 'Session rate must be greater than 0.',
    })
  })

  it('rejects Pay Per Session with a non-numeric rate', () => {
    expect(validateBillingDraft(draft({ mode: 'Pay Per Session', sessionRate: 'abc' }))).toEqual({
      ok: false, error: 'Session rate must be greater than 0.',
    })
  })

  // ── Package ──
  it('accepts Package with a name and session count', () => {
    expect(validateBillingDraft(draft({
      mode: 'Package', packageName: 'Gold 10-pack', packageSessions: '10',
    }))).toEqual({ ok: true })
  })

  it('rejects Package with an empty name', () => {
    expect(validateBillingDraft(draft({
      mode: 'Package', packageName: '   ', packageSessions: '10',
    }))).toEqual({ ok: false, error: 'Enter a package name.' })
  })

  it('rejects Package with an empty session count', () => {
    expect(validateBillingDraft(draft({
      mode: 'Package', packageName: 'Gold', packageSessions: '',
    }))).toEqual({ ok: false, error: 'Enter the number of sessions in this package.' })
  })

  it('rejects Package with a zero session count', () => {
    expect(validateBillingDraft(draft({
      mode: 'Package', packageName: 'Gold', packageSessions: '0',
    }))).toEqual({ ok: false, error: 'Sessions must be a whole number greater than 0.' })
  })

  it('rejects Package with a negative session count', () => {
    expect(validateBillingDraft(draft({
      mode: 'Package', packageName: 'Gold', packageSessions: '-3',
    }))).toEqual({ ok: false, error: 'Sessions must be a whole number greater than 0.' })
  })

  it('rejects Package with a decimal session count', () => {
    expect(validateBillingDraft(draft({
      mode: 'Package', packageName: 'Gold', packageSessions: '10.5',
    }))).toEqual({ ok: false, error: 'Sessions must be a whole number greater than 0.' })
  })

  it('rejects Package with a non-numeric session count', () => {
    expect(validateBillingDraft(draft({
      mode: 'Package', packageName: 'Gold', packageSessions: 'abc',
    }))).toEqual({ ok: false, error: 'Sessions must be a whole number greater than 0.' })
  })
})

describe('billingPayloadFields', () => {
  it('emits only the billing mode for Trial', () => {
    expect(billingPayloadFields(draft({ mode: 'Trial' }))).toEqual({
      custom_billing_mode: 'Trial',
    })
  })

  it('emits mode and rate for Pay Per Session', () => {
    expect(billingPayloadFields(draft({ mode: 'Pay Per Session', sessionRate: '50' }))).toEqual({
      custom_billing_mode:         'Pay Per Session',
      custom_default_session_rate: 50,
    })
  })

  it('emits mode, package name and remaining sessions for Package', () => {
    expect(billingPayloadFields(draft({
      mode: 'Package', packageName: 'Gold 10-pack', packageSessions: '10',
    }))).toEqual({
      custom_billing_mode:       'Package',
      custom_package_name:       'Gold 10-pack',
      custom_remaining_sessions: 10,
    })
  })

  it('does not leak a stale package name from a Pay Per Session draft', () => {
    const fields = billingPayloadFields(draft({
      mode: 'Pay Per Session', sessionRate: '50', packageName: 'leftover',
    }))
    expect(fields).not.toHaveProperty('custom_package_name')
    expect(fields).not.toHaveProperty('custom_remaining_sessions')
  })

  it('does not leak a stale session rate from a Package draft', () => {
    const fields = billingPayloadFields(draft({
      mode: 'Package', packageName: 'Gold', packageSessions: '10', sessionRate: '999',
    }))
    expect(fields).not.toHaveProperty('custom_default_session_rate')
  })

  it('trims the package name', () => {
    expect(billingPayloadFields(draft({
      mode: 'Package', packageName: '  Gold  ', packageSessions: '5',
    }))).toMatchObject({ custom_package_name: 'Gold' })
  })

  it('emits nothing when no mode is selected', () => {
    expect(billingPayloadFields(emptyBillingDraft)).toEqual({})
  })
})

describe('describeBilling', () => {
  it('describes Trial', () => {
    expect(describeBilling({ billingMode: 'Trial' })).toBe('Trial — no charge')
  })

  it('describes Pay Per Session with a rate', () => {
    expect(describeBilling({ billingMode: 'Pay Per Session', defaultSessionRate: 50 }))
      .toBe('Pay per session · 50/session')
  })

  it('describes Pay Per Session without a rate', () => {
    expect(describeBilling({ billingMode: 'Pay Per Session' })).toBe('Pay per session')
  })

  it('describes Package with a name and session count', () => {
    expect(describeBilling({ billingMode: 'Package', packageName: 'Gold 10-pack', remainingSessions: 10 }))
      .toBe('Package: Gold 10-pack · 10 sessions')
  })

  it('uses the singular for a one-session package', () => {
    expect(describeBilling({ billingMode: 'Package', packageName: 'Trial pack', remainingSessions: 1 }))
      .toBe('Package: Trial pack · 1 session')
  })

  it('returns an empty string when no mode is set', () => {
    expect(describeBilling({})).toBe('')
  })
})
