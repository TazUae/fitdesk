import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/tenant/context', () => ({ getTenantContext: vi.fn() }))

import { toUserError } from './errors'
import { ERPNextError } from './erpnext/client'

describe('toUserError', () => {
  it('maps ERPNextError 401 → AUTH', () => {
    const r = toUserError(new ERPNextError(401, 'Unauthorized', '/api/x'))
    expect(r.code).toBe('AUTH')
  })

  it('maps ERPNextError 403 → AUTH', () => {
    const r = toUserError(new ERPNextError(403, 'Forbidden', '/api/x'))
    expect(r.code).toBe('AUTH')
  })

  it('maps ERPNextError 404 → NOT_FOUND', () => {
    const r = toUserError(new ERPNextError(404, 'Not Found', '/api/x'))
    expect(r.code).toBe('NOT_FOUND')
  })

  it('maps ERPNextError 409 → CONFLICT', () => {
    const r = toUserError(new ERPNextError(409, 'Conflict', '/api/x'))
    expect(r.code).toBe('CONFLICT')
  })

  it('maps ERPNextError 4xx (other) → VALIDATION', () => {
    const r = toUserError(new ERPNextError(417, 'Expectation Failed', '/api/x'))
    expect(r.code).toBe('VALIDATION')
  })

  it('maps ERPNextError 5xx → UPSTREAM', () => {
    const r = toUserError(new ERPNextError(502, 'Bad Gateway', '/api/x'))
    expect(r.code).toBe('UPSTREAM')
  })

  it('maps generic Error → INTERNAL with scrubbed message', () => {
    const r = toUserError(new Error('Authorization Bearer xyz expired'))
    expect(r.code).toBe('INTERNAL')
    expect(r.message).not.toContain('Authorization')
    expect(r.message).not.toContain('Bearer')
  })

  it('maps unknown thrown value → INTERNAL with generic message', () => {
    const r = toUserError('a thrown string')
    expect(r.code).toBe('INTERNAL')
    expect(r.message).toBe('Unexpected error')
  })

  it('does not leak ERPNextError detail body to the user message', () => {
    const r = toUserError(
      new ERPNextError(500, 'Internal', '/api/x', 'Stack trace api_key=secret-value xyz'),
    )
    expect(r.message).not.toContain('secret-value')
    expect(r.message).not.toContain('Stack')
  })
})
