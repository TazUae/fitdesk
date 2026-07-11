import { describe, expect, it } from 'vitest'
import { previewSessionCompletion, type SessionCompletionPreviewInput } from './sessionCompletionPreview'

function baseInput(overrides: Partial<SessionCompletionPreviewInput> = {}): SessionCompletionPreviewInput {
  return {
    isTrialSession:         false,
    billingMode:            'package',
    rate:                   0,
    currency:               'USD',
    sessionConsumedPackage: false,
    totalPackageBalance:    5,
    ...overrides,
  }
}

describe('previewSessionCompletion', () => {
  it('trial session wins over any billing mode', () => {
    const result = previewSessionCompletion(baseInput({ isTrialSession: true, billingMode: 'pay_per_session', rate: 100 }))
    expect(result).toEqual({ kind: 'trial' })
  })

  it('billingMode null → unconfigured', () => {
    const result = previewSessionCompletion(baseInput({ billingMode: null }))
    expect(result).toEqual({ kind: 'unconfigured' })
  })

  it('billingMode "unset" → unconfigured', () => {
    const result = previewSessionCompletion(baseInput({ billingMode: 'unset' }))
    expect(result).toEqual({ kind: 'unconfigured' })
  })

  describe('pay_per_session', () => {
    it('previews the invoice amount from the session rate', () => {
      const result = previewSessionCompletion(baseInput({ billingMode: 'pay_per_session', rate: 150, currency: 'AED' }))
      expect(result).toEqual({ kind: 'pay_per_session', amount: 150, currency: 'AED' })
    })

    it('flags a missing rate (zero) rather than previewing a zero-amount invoice', () => {
      const result = previewSessionCompletion(baseInput({ billingMode: 'pay_per_session', rate: 0 }))
      expect(result).toEqual({ kind: 'pay_per_session_rate_missing' })
    })

    it('flags a negative rate the same way as missing', () => {
      const result = previewSessionCompletion(baseInput({ billingMode: 'pay_per_session', rate: -10 }))
      expect(result).toEqual({ kind: 'pay_per_session_rate_missing' })
    })
  })

  describe('package', () => {
    it('previews balanceAfter as one less than the current total', () => {
      const result = previewSessionCompletion(baseInput({ billingMode: 'package', totalPackageBalance: 5 }))
      expect(result).toEqual({ kind: 'package', balanceAfter: 4 })
    })

    it('flags no balance rather than previewing a negative balanceAfter', () => {
      const result = previewSessionCompletion(baseInput({ billingMode: 'package', totalPackageBalance: 0 }))
      expect(result).toEqual({ kind: 'package_no_balance' })
    })

    it('flags no balance for a negative balance too (defensive)', () => {
      const result = previewSessionCompletion(baseInput({ billingMode: 'package', totalPackageBalance: -1 }))
      expect(result).toEqual({ kind: 'package_no_balance' })
    })

    it('reports already-consumed when this session already recorded its debit — no new mutation preview', () => {
      const result = previewSessionCompletion(baseInput({
        billingMode: 'package', sessionConsumedPackage: true, totalPackageBalance: 5,
      }))
      expect(result).toEqual({ kind: 'package_already_consumed' })
    })

    it('already-consumed takes priority over zero balance', () => {
      const result = previewSessionCompletion(baseInput({
        billingMode: 'package', sessionConsumedPackage: true, totalPackageBalance: 0,
      }))
      expect(result).toEqual({ kind: 'package_already_consumed' })
    })
  })
})
