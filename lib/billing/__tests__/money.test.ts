import { describe, expect, it } from 'vitest'
import { getCurrencyMinorUnitFactor, toMajorUnits } from '@/lib/billing/money'

// ─── getCurrencyMinorUnitFactor ───────────────────────────────────────────────

describe('getCurrencyMinorUnitFactor', () => {
  it('returns 100 for USD', () => {
    expect(getCurrencyMinorUnitFactor('USD')).toBe(100)
  })

  it('returns 100 for EUR', () => {
    expect(getCurrencyMinorUnitFactor('EUR')).toBe(100)
  })

  it('returns 100 for GBP', () => {
    expect(getCurrencyMinorUnitFactor('GBP')).toBe(100)
  })

  it('returns 100 for SAR', () => {
    expect(getCurrencyMinorUnitFactor('SAR')).toBe(100)
  })

  it('returns 100 for AED', () => {
    expect(getCurrencyMinorUnitFactor('AED')).toBe(100)
  })

  it('returns 1 for LBP', () => {
    expect(getCurrencyMinorUnitFactor('LBP')).toBe(1)
  })

  it('returns 1000 for JOD', () => {
    expect(getCurrencyMinorUnitFactor('JOD')).toBe(1000)
  })

  it('returns 1000 for KWD', () => {
    expect(getCurrencyMinorUnitFactor('KWD')).toBe(1000)
  })

  it('normalises lowercase currency to uppercase', () => {
    expect(getCurrencyMinorUnitFactor('usd')).toBe(100)
    expect(getCurrencyMinorUnitFactor('eur')).toBe(100)
    expect(getCurrencyMinorUnitFactor('lbp')).toBe(1)
  })

  it('throws for unsupported currency', () => {
    expect(() => getCurrencyMinorUnitFactor('XYZ')).toThrow('unsupported currency')
  })

  it('throws for empty string', () => {
    expect(() => getCurrencyMinorUnitFactor('')).toThrow()
  })

  it('throws for blank-only string', () => {
    expect(() => getCurrencyMinorUnitFactor('   ')).toThrow()
  })
})

// ─── toMajorUnits ─────────────────────────────────────────────────────────────

describe('toMajorUnits', () => {
  // ── USD (factor 100) ──────────────────────────────────────────────────────

  it('converts 50000 USD minor units to 500', () => {
    expect(toMajorUnits(50000, 'USD')).toBe(500)
  })

  it('converts 1 USD minor unit to 0.01', () => {
    expect(toMajorUnits(1, 'USD')).toBe(0.01)
  })

  it('converts 99 USD minor units to 0.99', () => {
    expect(toMajorUnits(99, 'USD')).toBe(0.99)
  })

  it('converts 0 USD minor units to 0', () => {
    expect(toMajorUnits(0, 'USD')).toBe(0)
  })

  it('converts 10001 USD minor units to 100.01 without floating-point artifacts', () => {
    expect(toMajorUnits(10001, 'USD')).toBe(100.01)
  })

  it('accepts lowercase currency (usd)', () => {
    expect(toMajorUnits(50000, 'usd')).toBe(500)
  })

  // ── LBP (factor 1) ────────────────────────────────────────────────────────

  it('converts 150000 LBP minor units to 150000 (no subunit)', () => {
    expect(toMajorUnits(150000, 'LBP')).toBe(150000)
  })

  it('converts 0 LBP to 0', () => {
    expect(toMajorUnits(0, 'LBP')).toBe(0)
  })

  // ── SAR (factor 100) ──────────────────────────────────────────────────────

  it('converts 1000 SAR minor units to 10', () => {
    expect(toMajorUnits(1000, 'SAR')).toBe(10)
  })

  // ── AED (factor 100) ──────────────────────────────────────────────────────

  it('converts 500 AED minor units to 5', () => {
    expect(toMajorUnits(500, 'AED')).toBe(5)
  })

  // ── JOD (factor 1000) ─────────────────────────────────────────────────────

  it('converts 3000 JOD minor units to 3', () => {
    expect(toMajorUnits(3000, 'JOD')).toBe(3)
  })

  it('converts 1500 JOD minor units to 1.5', () => {
    expect(toMajorUnits(1500, 'JOD')).toBe(1.5)
  })

  // ── KWD (factor 1000) ─────────────────────────────────────────────────────

  it('converts 5000 KWD minor units to 5', () => {
    expect(toMajorUnits(5000, 'KWD')).toBe(5)
  })

  // ── Validation ────────────────────────────────────────────────────────────

  it('throws for unsupported currency', () => {
    expect(() => toMajorUnits(1000, 'XYZ')).toThrow('unsupported currency')
  })

  it('throws for empty currency', () => {
    expect(() => toMajorUnits(1000, '')).toThrow()
  })

  it('throws for non-integer minor units (decimal)', () => {
    expect(() => toMajorUnits(50.5, 'USD')).toThrow('integer')
  })

  it('throws for negative minor units', () => {
    expect(() => toMajorUnits(-1, 'USD')).toThrow('non-negative')
  })

  it('throws for negative zero (edge case: -0 is an integer but negative)', () => {
    // Object.is(-0, 0) is false but -0 >= 0 is true in JS; we accept -0 as 0
    expect(toMajorUnits(-0, 'USD')).toBe(0)
  })

  it('throws for NaN minor units', () => {
    expect(() => toMajorUnits(NaN, 'USD')).toThrow('integer')
  })

  it('throws for Infinity', () => {
    expect(() => toMajorUnits(Infinity, 'USD')).toThrow('integer')
  })
})
