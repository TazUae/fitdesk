import { describe, expect, it } from 'vitest'

import {
  enabledPaymentMethods,
  isPaymentMethod,
  paymentMethodLabel,
  paymentMethodToErpMode,
} from './methods'

describe('paymentMethodToErpMode', () => {
  it('maps internal values to ERPNext Mode of Payment names', () => {
    expect(paymentMethodToErpMode('cash')).toBe('Cash')
    expect(paymentMethodToErpMode('whish_money')).toBe('Whish Money')
    expect(paymentMethodToErpMode('omt')).toBe('OMT')
  })
})

describe('isPaymentMethod', () => {
  it('accepts the three internal MVP methods', () => {
    expect(isPaymentMethod('cash')).toBe(true)
    expect(isPaymentMethod('whish_money')).toBe(true)
    expect(isPaymentMethod('omt')).toBe(true)
  })

  it('rejects retired methods', () => {
    expect(isPaymentMethod('whish')).toBe(false)
    expect(isPaymentMethod('bank_transfer')).toBe(false)
  })

  it('rejects ERPNext mode names sent as an internal value', () => {
    expect(isPaymentMethod('Cash')).toBe(false)
    expect(isPaymentMethod('Whish Money')).toBe(false)
  })

  it('rejects unknown, empty, and non-string values', () => {
    expect(isPaymentMethod('unknown')).toBe(false)
    expect(isPaymentMethod('')).toBe(false)
    expect(isPaymentMethod(undefined)).toBe(false)
    expect(isPaymentMethod(null)).toBe(false)
    expect(isPaymentMethod(123)).toBe(false)
  })
})

describe('paymentMethodLabel', () => {
  it('returns trainer-facing labels', () => {
    expect(paymentMethodLabel('cash')).toBe('Cash')
    expect(paymentMethodLabel('whish_money')).toBe('Whish Money')
    expect(paymentMethodLabel('omt')).toBe('OMT')
  })
})

describe('enabledPaymentMethods', () => {
  it('returns exactly cash, whish_money, and omt', () => {
    expect(enabledPaymentMethods().map(m => m.value)).toEqual(['cash', 'whish_money', 'omt'])
  })
})
