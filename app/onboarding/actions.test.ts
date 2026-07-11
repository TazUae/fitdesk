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
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { createTenant } from '@/lib/controlplane/client'

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

// ─────────────────────────────────────────────────────────────────────────────
// US-026 — Zero-Row Onboarding Validation (fully mocked, behavior-neutral).
//
// Proves the zero-row Start-Workspace path and the no-reset guarantee for
// existing users, plus fail-closed validation and safe failure copy. No live
// provisioning, no real Control Plane call, no DB writes — every dependency is
// mocked. These document current behavior only; no production code is changed.
// Error strings are asserted verbatim against app/onboarding/actions.ts.
// ─────────────────────────────────────────────────────────────────────────────

const TEST_USER_ID = 'user-onboarding-1'
const TENANT_ID = 'tenant-abc'
const JOB_ID = 'job-123'

describe('startWorkspace — zero-row onboarding (US-026)', () => {
  let valuesMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    // Authenticated user by default.
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: TEST_USER_ID } } as never)
    // Zero-row by default: idempotency + slug-collision lookups find nothing.
    vi.mocked(db.query.workspaceProvisioning.findFirst).mockResolvedValue(undefined as never)
    // Control Plane returns a fresh tenant/job by default.
    vi.mocked(createTenant).mockResolvedValue({ tenantId: TENANT_ID, jobId: JOB_ID, status: 'queued' } as never)
    // Local insert succeeds by default: db.insert(table).values({...}).
    valuesMock = vi.fn().mockResolvedValue(undefined)
    vi.mocked(db.insert).mockReturnValue({ values: valuesMock } as never)
  })

  // 1. Existing-row idempotency / no reset ─────────────────────────────────────
  it.each(['completed', 'queued', 'running'])(
    'resumes an existing %s row without re-provisioning (existing users are never reset)',
    async (status) => {
      const existingRow = {
        id:       'row-existing',
        userId:   TEST_USER_ID,
        slug:     'existing-workspace',
        tenantId: 'existing-tenant',
        jobId:    'existing-job',
        status,
      }
      vi.mocked(db.query.workspaceProvisioning.findFirst).mockResolvedValue(existingRow as never)

      const result = await startWorkspace({ workspaceName: 'My Gym', countryCode: 'LB' })

      expect(result).toEqual({ success: true, jobId: 'existing-job', status })
      // The critical no-reset guarantee: no new tenant, no new row.
      expect(createTenant).not.toHaveBeenCalled()
      expect(db.insert).not.toHaveBeenCalled()
    },
  )

  // 2. Zero-row happy path ─────────────────────────────────────────────────────
  it('creates a workspace on the zero-row path and inserts exactly one provisioning row', async () => {
    const result = await startWorkspace({ workspaceName: 'My Gym', countryCode: 'LB' })

    expect(result).toEqual({ success: true, jobId: JOB_ID, status: 'queued' })

    // Control Plane called exactly once with the real contract fields.
    expect(createTenant).toHaveBeenCalledTimes(1)
    const cpArg = vi.mocked(createTenant).mock.calls[0][0]
    expect(cpArg).toEqual(
      expect.objectContaining({
        country:     'LB',
        companyName: 'My Gym',
        slug:        expect.any(String),
        companyAbbr: expect.any(String),
      }),
    )

    // Exactly one WorkspaceProvisioning row inserted, carrying the CP response.
    expect(db.insert).toHaveBeenCalledTimes(1)
    expect(valuesMock).toHaveBeenCalledTimes(1)
    const insertArg = valuesMock.mock.calls[0][0]
    expect(insertArg).toEqual(
      expect.objectContaining({
        userId:   TEST_USER_ID,
        slug:     expect.any(String),
        tenantId: TENANT_ID,
        jobId:    JOB_ID,
        status:   'queued',
      }),
    )
    // The slug is generated once and used consistently for the CP call and the row.
    expect(insertArg.slug).toBe(cpArg.slug)
  })

  // 3. Fail-closed validation ──────────────────────────────────────────────────
  it('rejects a blank workspace name before any Control Plane or DB write', async () => {
    const result = await startWorkspace({ workspaceName: '   ', countryCode: 'LB' })

    expect(result).toEqual({ success: false, error: 'Workspace name is required.' })
    expect(createTenant).not.toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('rejects an invalid country before any Control Plane or DB write', async () => {
    const result = await startWorkspace({ workspaceName: 'My Gym', countryCode: 'US' })

    // Actual runtime copy (confirmed against app/onboarding/actions.ts).
    expect(result).toEqual({ success: false, error: 'Invalid country. Please reload the page and try again.' })
    expect(createTenant).not.toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
  })

  // 4. Control Plane failure ────────────────────────────────────────────────────
  it('returns safe retry copy and writes no row when createTenant fails', async () => {
    vi.mocked(createTenant).mockRejectedValue(new Error('control plane down'))

    const result = await startWorkspace({ workspaceName: 'My Gym', countryCode: 'LB' })

    expect(result).toEqual({ success: false, error: 'Failed to create workspace. Please try again.' })
    expect(db.insert).not.toHaveBeenCalled()
  })

  // 5. Local persistence / orphan-safe failure ──────────────────────────────────
  it('returns safe support copy when the tenant is created but the local insert fails', async () => {
    valuesMock.mockRejectedValue(new Error('db unavailable'))

    const result = await startWorkspace({ workspaceName: 'My Gym', countryCode: 'LB' })

    expect(result).toEqual({
      success: false,
      error:   'Workspace was created but could not be saved. Please contact support.',
    })
    // Tenant creation was attempted (the orphan scenario) but no row was persisted.
    expect(createTenant).toHaveBeenCalledTimes(1)
  })

  // 6. Stale failed-only row does not block re-provisioning (US-026 "no stale
  //    mapping reappears") ───────────────────────────────────────────────────
  //
  // The idempotency check (step 4) only resumes 'queued'/'running'/'completed'
  // rows — 'failed' is deliberately excluded. A user whose only prior row is
  // 'failed' must fall through to slug generation (step 5), where the
  // collision check on their OWN stale slug must be recognized as
  // "same user, safe to proceed" rather than blocking as a real collision.
  // This exact fallthrough path had no test before this addition — every
  // existing idempotency test only covered 'completed'/'queued'/'running'.
  it('does not resume a stale failed-only row — proceeds to create a fresh workspace', async () => {
    // 1st findFirst call = idempotency check (status in queued/running/completed):
    // the failed row is excluded by that filter, so this returns undefined.
    // 2nd findFirst call = slug collision check: the stale failed row for this
    // same user is what a real DB would return here (matching slug, same userId).
    vi.mocked(db.query.workspaceProvisioning.findFirst)
      .mockResolvedValueOnce(undefined as never)
      .mockResolvedValueOnce({
        id: 'row-stale-failed', userId: TEST_USER_ID, slug: 'my-gym',
        tenantId: 'stale-tenant', jobId: 'stale-job', status: 'failed',
      } as never)

    const result = await startWorkspace({ workspaceName: 'My Gym', countryCode: 'LB' })

    expect(result).toEqual({ success: true, jobId: JOB_ID, status: 'queued' })
    // A genuinely new tenant/row was created — the stale failed mapping was
    // not resumed or reused as the "current" workspace.
    expect(createTenant).toHaveBeenCalledTimes(1)
    expect(db.insert).toHaveBeenCalledTimes(1)
    const insertArg = valuesMock.mock.calls[0][0]
    expect(insertArg.tenantId).toBe(TENANT_ID) // the NEW tenant, not 'stale-tenant'
    expect(insertArg.jobId).toBe(JOB_ID)       // the NEW job, not 'stale-job'
  })

  it('does not let another user\'s slug collision block or leak into this user\'s workspace', async () => {
    // 1st call = idempotency check: none for this user.
    // 2nd call = slug collision check: a DIFFERENT user already holds this
    // exact slug — the code must regenerate a suffixed slug rather than
    // resuming/reusing that other user's row.
    vi.mocked(db.query.workspaceProvisioning.findFirst)
      .mockResolvedValueOnce(undefined as never)
      .mockResolvedValueOnce({
        id: 'row-other-user', userId: 'a-different-user', slug: 'my-gym',
        tenantId: 'other-tenant', jobId: 'other-job', status: 'completed',
      } as never)
      // 3rd call = re-check of the suffixed slug ("my-gym-2") — no collision.
      .mockResolvedValueOnce(undefined as never)

    const result = await startWorkspace({ workspaceName: 'My Gym', countryCode: 'LB' })

    expect(result).toEqual({ success: true, jobId: JOB_ID, status: 'queued' })
    const cpArg = vi.mocked(createTenant).mock.calls[0][0]
    expect(cpArg.slug).toBe('my-gym-2')
    expect(cpArg.slug).not.toBe('my-gym') // never reuses the other user's slug
    const insertArg = valuesMock.mock.calls[0][0]
    expect(insertArg.userId).toBe(TEST_USER_ID)
    expect(insertArg.tenantId).toBe(TENANT_ID) // the NEW tenant, not 'other-tenant'
  })
})
