/**
 * Focused tests for startWorkspace input-shape guard.
 *
 * These tests exercise the defensive check at the top of startWorkspace that
 * runs BEFORE auth/session checks. A stale or malformed client call (e.g. during
 * a server action signature transition) must return a structured error rather than
 * throwing a TypeError.
 *
 * Auth, DB, and Control Plane are mocked because they are imported at module level,
 * but they are never reached by these tests — the guard short-circuits first.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({ headers: () => ({}) }))
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn(async () => null) } },
}))
vi.mock('@/lib/db', () => ({ db: { query: { workspaceProvisioning: { findFirst: vi.fn() } }, insert: vi.fn() } }))
vi.mock('@/lib/controlplane/client', () => ({ createTenant: vi.fn() }))

const { startWorkspace } = await import('@/app/onboarding/actions')

describe('startWorkspace — input shape guard', () => {
  it('returns structured error for undefined input', async () => {
    const result = await startWorkspace(undefined as never)
    expect(result).toEqual({ success: false, error: 'Workspace name is required.' })
  })

  it('returns structured error for null input', async () => {
    const result = await startWorkspace(null as never)
    expect(result).toEqual({ success: false, error: 'Workspace name is required.' })
  })

  it('returns structured error for empty object (both fields missing)', async () => {
    const result = await startWorkspace({} as never)
    expect(result).toEqual({ success: false, error: 'Workspace name is required.' })
  })

  it('returns structured error when workspaceName is not a string', async () => {
    const result = await startWorkspace({ workspaceName: 42, countryCode: 'LB' } as never)
    expect(result).toEqual({ success: false, error: 'Workspace name is required.' })
  })

  it('returns structured error when countryCode is missing', async () => {
    const result = await startWorkspace({ workspaceName: 'My Gym' } as never)
    expect(result).toEqual({ success: false, error: 'Workspace name is required.' })
  })

  it('returns structured error when countryCode is not a string', async () => {
    const result = await startWorkspace({ workspaceName: 'My Gym', countryCode: null } as never)
    expect(result).toEqual({ success: false, error: 'Workspace name is required.' })
  })

  it('passes the guard for a well-formed input (proceeds to auth check, not a CP call)', async () => {
    // Well-formed input clears the guard and reaches the auth check.
    // Auth mock returns null → structured "Not authenticated" error, not a TypeError.
    const result = await startWorkspace({ workspaceName: 'My Gym', countryCode: 'LB' })
    expect(result).toEqual({ success: false, error: 'Not authenticated. Please sign in again.' })
  })
})
