import { describe, expect, it, vi } from 'vitest'
import { inspectEnv, isPlaceholderValue, validateEnvAtStartup } from './env'

const VALID_BASE = {
  BETTER_AUTH_SECRET:    'a'.repeat(32),
  DATABASE_URL:          'file:./auth.db',
  CONTROL_PLANE_URL:     'http://cp:4000',
  CONTROL_PLANE_API_KEY: 'a'.repeat(16),
  FITDESK_JWT_SECRET:    'a'.repeat(32),
}

describe('isPlaceholderValue', () => {
  it.each([
    'dev-only-control-plane-api-key',
    'DEV-ONLY-something',
    'build-only-placeholder-not-for-prod',
    'REPLACE-ME-IN-PRODUCTION',
    'ReplaceMe-now',
    'changeme',
    'your-api-key',
  ])('detects placeholder: %s', value => {
    expect(isPlaceholderValue(value)).toBe(true)
  })

  it.each([
    'a'.repeat(32),
    'libsql://real-db.turso.io',
    'sk_real-looking-secret-1234567890abcdef',
  ])('passes real-looking value: %s', value => {
    expect(isPlaceholderValue(value)).toBe(false)
  })
})

describe('inspectEnv', () => {
  it('reports zero errors for a fully-valid env', () => {
    const issues = inspectEnv(VALID_BASE)
    expect(issues.filter(i => i.level === 'error')).toEqual([])
  })

  it('reports error for missing required var', () => {
    const env = { ...VALID_BASE, BETTER_AUTH_SECRET: undefined }
    const issues = inspectEnv(env)
    expect(issues.find(i => i.name === 'BETTER_AUTH_SECRET' && i.level === 'error')).toBeDefined()
  })

  it('reports error for too-short required var', () => {
    const env = { ...VALID_BASE, FITDESK_JWT_SECRET: 'short' }
    const issues = inspectEnv(env)
    const e = issues.find(i => i.name === 'FITDESK_JWT_SECRET' && i.level === 'error')
    expect(e?.reason).toMatch(/shorter than/)
  })

  it('reports error for placeholder in required var', () => {
    const env = { ...VALID_BASE, CONTROL_PLANE_API_KEY: 'dev-only-control-plane-api-key-xx' }
    const issues = inspectEnv(env)
    const e = issues.find(i => i.name === 'CONTROL_PLANE_API_KEY' && i.level === 'error')
    expect(e?.reason).toMatch(/placeholder/i)
  })

  it('reports warn for missing optional var', () => {
    const issues = inspectEnv(VALID_BASE)
    const w = issues.find(i => i.name === 'EVOLUTION_API_URL')
    expect(w?.level).toBe('warn')
  })

  it('does NOT flag placeholder pattern in optional vars', () => {
    // Placeholder check is required-only (don't punish a contributor for
    // setting WHISH_API_KEY=your-key in dev when they don't have Whish creds).
    const env = { ...VALID_BASE, WHISH_API_KEY: 'your-whish-key' }
    const issues = inspectEnv(env)
    const w = issues.find(i => i.name === 'WHISH_API_KEY')
    // It still appears in the issue list (as a warn for short value? no — minLength is undefined)
    // We just want to confirm it's NOT flagged as a placeholder error.
    expect(w?.level).not.toBe('error')
  })
})

describe('validateEnvAtStartup', () => {
  it('strict mode throws when there are error-level issues', () => {
    const log = vi.fn()
    expect(() =>
      validateEnvAtStartup({ strict: true, env: { ...VALID_BASE, BETTER_AUTH_SECRET: undefined }, log }),
    ).toThrowError(/Environment validation failed/)
  })

  it('strict mode does not throw when env is valid', () => {
    expect(() => validateEnvAtStartup({ strict: true, env: VALID_BASE, log: () => {} })).not.toThrow()
  })

  it('non-strict mode warns but does not throw on errors', () => {
    const log = vi.fn()
    expect(() =>
      validateEnvAtStartup({ strict: false, env: { ...VALID_BASE, BETTER_AUTH_SECRET: undefined }, log }),
    ).not.toThrow()
    expect(log).toHaveBeenCalled()
    const calls = log.mock.calls.map(c => c[0])
    expect(calls.some(s => s.includes('ERROR') && s.includes('BETTER_AUTH_SECRET'))).toBe(true)
  })

  it('strict mode rejects placeholder secret', () => {
    expect(() =>
      validateEnvAtStartup({
        strict: true,
        env: { ...VALID_BASE, CONTROL_PLANE_API_KEY: 'dev-only-control-plane-api-key-123' },
        log: () => {},
      }),
    ).toThrowError(/Environment validation failed/)
  })
})
