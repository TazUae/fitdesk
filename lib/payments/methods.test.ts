import { describe, expect, it } from 'vitest'

import {
  enabledPaymentMethods,
  isEnabledPaymentMethod,
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
  it('returns only the enabled MVP methods — Cash and Whish Money', () => {
    expect(enabledPaymentMethods().map(m => m.value)).toEqual(['cash', 'whish_money'])
  })

  it('does not offer OMT while it is disabled', () => {
    expect(enabledPaymentMethods().map(m => m.value)).not.toContain('omt')
  })
})

describe('isEnabledPaymentMethod', () => {
  it('accepts the enabled MVP methods', () => {
    expect(isEnabledPaymentMethod('cash')).toBe(true)
    expect(isEnabledPaymentMethod('whish_money')).toBe(true)
  })

  it('rejects OMT while it is disabled (still a known value, just not enabled)', () => {
    expect(isPaymentMethod('omt')).toBe(true)
    expect(isEnabledPaymentMethod('omt')).toBe(false)
  })

  it('rejects retired, mode-name, and non-string values', () => {
    expect(isEnabledPaymentMethod('whish')).toBe(false)
    expect(isEnabledPaymentMethod('bank_transfer')).toBe(false)
    expect(isEnabledPaymentMethod('Cash')).toBe(false)
    expect(isEnabledPaymentMethod('')).toBe(false)
    expect(isEnabledPaymentMethod(undefined)).toBe(false)
    expect(isEnabledPaymentMethod(null)).toBe(false)
  })
})
