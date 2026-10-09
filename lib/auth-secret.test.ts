import { afterEach, describe, expect, it, vi } from 'vitest'
import { requireAuthSecret } from './auth-secret'
afterEach(() => vi.unstubAllEnvs())

describe('runtime Better Auth secret cannot fall back to a build placeholder', () => {
  it('rejects a missing secret even with NEXT_PHASE spoofed as build', () => {
    vi.stubEnv('BETTER_AUTH_SECRET', '')
    vi.stubEnv('NEXT_PHASE', 'phase-production-build')
    expect(() => requireAuthSecret()).toThrow('BETTER_AUTH_SECRET must be set')
  })
  it('rejects short secrets', () => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'too-short')
    expect(() => requireAuthSecret()).toThrow()
  })
  it('preserves an explicitly configured strong secret', () => {
    const synthetic = 'synthetic-test-only-secret-with-adequate-length-123'
    vi.stubEnv('BETTER_AUTH_SECRET', synthetic)
    expect(requireAuthSecret()).toBe(synthetic)
  })
})
