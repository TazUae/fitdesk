import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { log } from './log'

describe('log', () => {
  let stdout: ReturnType<typeof vi.spyOn>
  let stderr: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    stdout.mockRestore()
    stderr.mockRestore()
  })

  function lastJson(spy: ReturnType<typeof vi.spyOn>) {
    const calls = spy.mock.calls
    if (calls.length === 0) return null
    const raw = calls[calls.length - 1][0] as string
    return JSON.parse(raw.trim())
  }

  it('emits one JSON line per call', () => {
    log.info('test.event', { foo: 'bar' })
    expect(stdout).toHaveBeenCalledOnce()
    const parsed = lastJson(stdout)
    expect(parsed.level).toBe('info')
    expect(parsed.event).toBe('test.event')
    expect(parsed.foo).toBe('bar')
    expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('routes warn/error to stderr', () => {
    log.warn('w.event')
    log.error('e.event')
    expect(stderr).toHaveBeenCalledTimes(2)
    expect(stdout).not.toHaveBeenCalled()
  })

  it('scrubs secret-like substrings in string values', () => {
    log.info('upstream.fail', { detail: 'Authorization Bearer xyz failed' })
    const parsed = lastJson(stdout)
    expect(parsed.detail).not.toContain('Authorization')
    expect(parsed.detail).not.toContain('Bearer')
    expect(parsed.detail).toContain('HIDDEN')
  })

  it('scrubs nested object string values', () => {
    log.info('nested', { req: { headers: { Authorization: 'Bearer abc' } } })
    const parsed = lastJson(stdout)
    const headers = parsed.req.headers
    // The KEY name "Authorization" stays; the VALUE is scrubbed because
    // the regex matches "Bearer".
    expect(headers.Authorization).toContain('HIDDEN')
  })

  it('scrubs Error.message', () => {
    log.error('caught', { err: new Error('JWT signature failed for user token=abc') })
    const parsed = lastJson(stderr)
    expect(parsed.err).not.toContain('JWT')
    expect(parsed.err).not.toContain('token=')
  })

  it('preserves correlationId', () => {
    log.info('chain', { correlationId: 'corr-123', step: 1 })
    const parsed = lastJson(stdout)
    expect(parsed.correlationId).toBe('corr-123')
    expect(parsed.step).toBe(1)
  })
})
