import { describe, expect, it } from 'vitest'
import { getSafeRedirectUrl } from '../redirect'

describe('getSafeRedirectUrl', () => {
  it('allows /dashboard', () => {
    expect(getSafeRedirectUrl('/dashboard')).toBe('/dashboard')
  })

  it('allows nested dashboard paths', () => {
    expect(getSafeRedirectUrl('/dashboard/clients/abc')).toBe('/dashboard/clients/abc')
  })

  it('allows /onboarding', () => {
    expect(getSafeRedirectUrl('/onboarding')).toBe('/onboarding')
  })

  it('allows nested onboarding paths', () => {
    expect(getSafeRedirectUrl('/onboarding/step-2')).toBe('/onboarding/step-2')
  })

  it('allows a query string appended to an allowed path', () => {
    expect(getSafeRedirectUrl('/dashboard?tab=clients')).toBe('/dashboard?tab=clients')
  })

  it('rejects protocol-relative URLs', () => {
    expect(getSafeRedirectUrl('//evil.example')).toBe('/dashboard')
  })

  it('rejects mixed-slash URLs', () => {
    expect(getSafeRedirectUrl('/\\evil.example')).toBe('/dashboard')
  })

  it('rejects backslash-prefixed URLs', () => {
    expect(getSafeRedirectUrl('\\evil.example')).toBe('/dashboard')
  })

  it('rejects absolute http URLs', () => {
    expect(getSafeRedirectUrl('http://evil.example')).toBe('/dashboard')
  })

  it('rejects absolute https URLs', () => {
    expect(getSafeRedirectUrl('https://evil.example')).toBe('/dashboard')
  })

  it('rejects javascript: URLs', () => {
    expect(getSafeRedirectUrl('javascript:alert(1)')).toBe('/dashboard')
  })

  it('rejects unapproved internal paths', () => {
    expect(getSafeRedirectUrl('/admin')).toBe('/dashboard')
  })

  it('rejects paths that merely start with an allowed prefix string', () => {
    expect(getSafeRedirectUrl('/dashboardevil.example')).toBe('/dashboard')
  })

  it('falls back to /dashboard for empty string', () => {
    expect(getSafeRedirectUrl('')).toBe('/dashboard')
  })

  it('falls back to /dashboard for null', () => {
    expect(getSafeRedirectUrl(null)).toBe('/dashboard')
  })

  it('falls back to /dashboard for undefined', () => {
    expect(getSafeRedirectUrl(undefined)).toBe('/dashboard')
  })
})
