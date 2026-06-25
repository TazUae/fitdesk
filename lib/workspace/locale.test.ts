import { describe, expect, it, vi, afterEach } from 'vitest'
import { DEFAULT_LOCALE, detectLocale } from '@/lib/workspace/locale'

// Utility: mock Intl.DateTimeFormat to return a fixed timezone.
function mockTimezone(tz: string) {
  vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
    resolvedOptions: () => ({ timeZone: tz }),
  } as unknown as Intl.DateTimeFormat)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('detectLocale', () => {
  it('maps Asia/Beirut to Lebanon (LB)', () => {
    mockTimezone('Asia/Beirut')
    const locale = detectLocale()
    expect(locale.countryName).toBe('Lebanon')
    expect(locale.countryCode).toBe('LB')
    expect(locale.timezone).toBe('Asia/Beirut')
    expect(locale.currency).toBe('USD')
  })

  it('maps Asia/Dubai to United Arab Emirates (AE)', () => {
    mockTimezone('Asia/Dubai')
    const locale = detectLocale()
    expect(locale.countryName).toBe('United Arab Emirates')
    expect(locale.countryCode).toBe('AE')
    expect(locale.currency).toBe('AED')
  })

  it('maps Asia/Riyadh to Saudi Arabia (SA)', () => {
    mockTimezone('Asia/Riyadh')
    const locale = detectLocale()
    expect(locale.countryName).toBe('Saudi Arabia')
    expect(locale.countryCode).toBe('SA')
    expect(locale.currency).toBe('SAR')
  })

  it('maps Asia/Kuwait to Kuwait (KW)', () => {
    mockTimezone('Asia/Kuwait')
    const locale = detectLocale()
    expect(locale.countryName).toBe('Kuwait')
    expect(locale.countryCode).toBe('KW')
    expect(locale.currency).toBe('KWD')
  })

  it('maps Asia/Qatar to Qatar (QA)', () => {
    mockTimezone('Asia/Qatar')
    const locale = detectLocale()
    expect(locale.countryName).toBe('Qatar')
    expect(locale.countryCode).toBe('QA')
    expect(locale.currency).toBe('QAR')
  })

  it('falls back to UAE (AE) for an unknown timezone', () => {
    mockTimezone('America/New_York')
    const locale = detectLocale()
    expect(locale.countryName).toBe('United Arab Emirates')
    expect(locale.countryCode).toBe('AE')
    expect(locale.currency).toBe('AED')
  })

  it('falls back to UAE (AE) for an empty timezone string', () => {
    mockTimezone('')
    const locale = detectLocale()
    expect(locale.countryCode).toBe('AE')
  })
})

describe('DEFAULT_LOCALE', () => {
  it('is UAE with code AE', () => {
    expect(DEFAULT_LOCALE.countryName).toBe('United Arab Emirates')
    expect(DEFAULT_LOCALE.countryCode).toBe('AE')
    expect(DEFAULT_LOCALE.currency).toBe('AED')
  })
})
