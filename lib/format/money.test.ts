/**
 * Unit tests for lib/format/money.ts.
 *
 * Pure currency-formatting helpers used by invoice/statement views (relevant
 * to US-018 Statement of Account: "Currency is visible" acceptance criterion).
 * No production code is changed by this file.
 */
import { describe, expect, it } from 'vitest'
import { fmtMoney, fmtMoneyCompact } from '@/lib/format/money'

describe('fmtMoney', () => {
  it('defaults currency to USD when omitted', () => {
    expect(fmtMoney(100)).toBe('USD 100')
  })

  it('prefixes a custom currency code', () => {
    expect(fmtMoney(100, 'AED')).toBe('AED 100')
  })

  it('formats an integer with no decimal places', () => {
    expect(fmtMoney(1234)).toBe('USD 1,234')
  })

  it('formats a value with cents, capped at 2 decimal places', () => {
    expect(fmtMoney(1234.5)).toBe('USD 1,234.5')
    expect(fmtMoney(1234.56)).toBe('USD 1,234.56')
  })

  it('rounds to 2 decimal places when given more precision', () => {
    expect(fmtMoney(1234.567)).toBe('USD 1,234.57')
  })

  it('formats zero', () => {
    expect(fmtMoney(0)).toBe('USD 0')
  })

  it('formats a negative value', () => {
    expect(fmtMoney(-50)).toBe('USD -50')
  })

  it('adds thousands separators for large amounts', () => {
    expect(fmtMoney(1000000)).toBe('USD 1,000,000')
  })
})

describe('fmtMoneyCompact', () => {
  it('returns "$0" for zero regardless of currency (documented special case)', () => {
    expect(fmtMoneyCompact(0, 'USD')).toBe('$0')
    expect(fmtMoneyCompact(0, 'AED')).toBe('$0')
  })

  it('formats a whole-number USD amount with the currency symbol', () => {
    expect(fmtMoneyCompact(1234, 'USD')).toBe('$1,234')
  })

  it('rounds to 0 decimal places for a fractional amount', () => {
    expect(fmtMoneyCompact(1234.56, 'USD')).toBe('$1,235')
  })

  it('adds thousands separators for large amounts', () => {
    expect(fmtMoneyCompact(1000000, 'USD')).toBe('$1,000,000')
  })

  it('formats a negative amount', () => {
    expect(fmtMoneyCompact(-500, 'USD')).toBe('-$500')
  })
})
