import { describe, expect, it } from 'vitest'
import { normalizePhoneToE164 } from '@/lib/clients/phone'

describe('normalizePhoneToE164', () => {
  describe('valid numbers', () => {
    it('normalizes a full Lebanese E.164 number', () => {
      const result = normalizePhoneToE164('+96170123456')
      expect(result).toEqual({ ok: true, e164: '+96170123456' })
    })

    it('normalizes a local Lebanese number with default region LB', () => {
      const result = normalizePhoneToE164('70123456', 'LB')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.e164).toMatch(/^\+961/)
      }
    })

    it('normalizes a Lebanese number with spaces', () => {
      const result = normalizePhoneToE164('70 123 456', 'LB')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.e164).toMatch(/^\+961/)
      }
    })

    it('normalizes a UAE number with full country prefix', () => {
      const result = normalizePhoneToE164('+971501234567')
      expect(result).toEqual({ ok: true, e164: '+971501234567' })
    })

    it('normalizes a UAE number without prefix using AE region', () => {
      const result = normalizePhoneToE164('0501234567', 'AE')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.e164).toMatch(/^\+971/)
      }
    })

    it('trims leading/trailing whitespace before parsing', () => {
      const result = normalizePhoneToE164('  +96170123456  ')
      expect(result).toEqual({ ok: true, e164: '+96170123456' })
    })
  })

  describe('invalid numbers', () => {
    it('returns ok:false for an empty string', () => {
      const result = normalizePhoneToE164('')
      expect(result).toEqual({ ok: false, reason: 'Phone number is empty' })
    })

    it('returns ok:false for whitespace-only string', () => {
      const result = normalizePhoneToE164('   ')
      expect(result).toEqual({ ok: false, reason: 'Phone number is empty' })
    })

    it('returns ok:false for a non-phone string', () => {
      const result = normalizePhoneToE164('not-a-phone')
      expect(result.ok).toBe(false)
    })

    it('returns ok:false for an incomplete number', () => {
      const result = normalizePhoneToE164('123')
      expect(result.ok).toBe(false)
    })
  })
})
