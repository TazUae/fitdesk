import { describe, expect, it, vi } from 'vitest'

// `lib/evolution.ts` imports lib/db at module scope which transitively pulls in
// libsql + Drizzle. Keep the test focused on the pure normalizePhone helper.
vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/db/schema', () => ({ trainerWhatsAppConnection: {} }))
vi.mock('@/lib/log', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { normalizePhone } from './evolution'

describe('normalizePhone', () => {
  it('returns digits-only for E.164 with leading +', () => {
    expect(normalizePhone('+971501234567')).toBe('971501234567')
    expect(normalizePhone('+961 70 123 456')).toBe('96170123456')
    expect(normalizePhone('+966 (50) 123-4567')).toBe('966501234567')
  })

  it('accepts already-normalized international numbers (no +)', () => {
    expect(normalizePhone('971501234567')).toBe('971501234567')
    expect(normalizePhone('96170123456')).toBe('96170123456')
  })

  it('rejects local format with leading 0', () => {
    expect(normalizePhone('0701234567')).toBe('')
    expect(normalizePhone('070 123 456')).toBe('')
  })

  it('rejects too-short or too-long numbers', () => {
    expect(normalizePhone('1234567')).toBe('')          // 7 digits — too short
    expect(normalizePhone('1234567890123456')).toBe('') // 16 digits — too long
  })

  it('rejects numbers with no country code that aren\'t already 10+ international digits', () => {
    expect(normalizePhone('70123456')).toBe('')         // 8 digits, no + prefix → ambiguous
  })

  it('handles empty / non-string / whitespace gracefully', () => {
    expect(normalizePhone('')).toBe('')
    expect(normalizePhone('   ')).toBe('')
    expect(normalizePhone(null as unknown as string)).toBe('')
    expect(normalizePhone(undefined as unknown as string)).toBe('')
    expect(normalizePhone(123 as unknown as string)).toBe('')
  })

  it('does not assume any country (no LB hardcode)', () => {
    // Previously prepended 961 (Lebanon); confirm it doesn't anymore.
    expect(normalizePhone('+971501234567')).not.toContain('961')
    expect(normalizePhone('+1 555 123 4567')).toBe('15551234567')
  })
})
