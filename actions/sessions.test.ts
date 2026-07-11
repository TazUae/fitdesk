import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Session } from '@/types'

// Mock the external boundaries so the action logic runs without Next/Better Auth/ERP.
vi.mock('next/headers', () => ({ headers: () => ({}) }))
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn(async () => ({ user: { id: 'u1', name: 'T', email: 't@example.com', phone: null } })) } },
}))
vi.mock('@/lib/trainer', () => ({ ensureTrainerIdForUser: vi.fn(async () => 'trainer-1') }))
vi.mock('@/lib/business-data/erp-adapter', () => ({
  getSessionById: vi.fn(),
  markSessionComplete: vi.fn(),
  markSessionMissed: vi.fn(),
  cancelSession: vi.fn(),
  createSession: vi.fn(),
  getSessions: vi.fn(),
  // Invoice primitives — mocked so the P-A lock test can assert they are never called.
  createInvoice: vi.fn(),
  submitSalesInvoice: vi.fn(),
  createAndSubmitPaymentEntry: vi.fn(),
}))

import { completeSession, cancelSession, noShowSession } from '@/actions/sessions'
import * as erp from '@/lib/business-data/erp-adapter'

const ownedSession = { id: 'S1', trainerId: 'trainer-1' } as unknown as Session
const forbidden = Object.assign(new Error('Session does not belong to this trainer.'), { status: 403 })

beforeEach(() => { vi.clearAllMocks() })

describe('completeSession — trainer ownership', () => {
  it('denies a non-owned session and never calls markSessionComplete', async () => {
    vi.mocked(erp.getSessionById).mockRejectedValue(forbidden)
    const res = await completeSession('S-other')
    expect(res.success).toBe(false)
    expect(erp.markSessionComplete).not.toHaveBeenCalled()
  })

  it('completes an owned session (ERP completion/billing hook path intact)', async () => {
    vi.mocked(erp.getSessionById).mockResolvedValue(ownedSession)
    vi.mocked(erp.markSessionComplete).mockResolvedValue({ ...ownedSession, status: 'completed' } as unknown as Session)
    const res = await completeSession('S1', 'great work')
    expect(res.success).toBe(true)
    expect(erp.getSessionById).toHaveBeenCalledWith('S1', 'trainer-1')
    expect(erp.markSessionComplete).toHaveBeenCalledWith('S1', 'great work')
  })
})

describe('cancelSession — trainer ownership', () => {
  it('denies a non-owned session and never calls the ERP cancel', async () => {
    vi.mocked(erp.getSessionById).mockRejectedValue(forbidden)
    const res = await cancelSession('S-other')
    expect(res.success).toBe(false)
    expect(erp.cancelSession).not.toHaveBeenCalled()
  })

  it('cancels an owned session', async () => {
    vi.mocked(erp.getSessionById).mockResolvedValue(ownedSession)
    vi.mocked(erp.cancelSession).mockResolvedValue({ ...ownedSession, status: 'cancelled' } as unknown as Session)
    const res = await cancelSession('S1')
    expect(res.success).toBe(true)
    expect(erp.getSessionById).toHaveBeenCalledWith('S1', 'trainer-1')
    expect(erp.cancelSession).toHaveBeenCalledWith('S1')
  })
})

describe('noShowSession — trainer ownership', () => {
  it('denies a non-owned session and never calls markSessionMissed', async () => {
    vi.mocked(erp.getSessionById).mockRejectedValue(forbidden)
    const res = await noShowSession('S-other')
    expect(res.success).toBe(false)
    expect(erp.markSessionMissed).not.toHaveBeenCalled()
  })

  it('marks an owned session as missed', async () => {
    vi.mocked(erp.getSessionById).mockResolvedValue(ownedSession)
    vi.mocked(erp.markSessionMissed).mockResolvedValue({ ...ownedSession, status: 'missed' } as unknown as Session)
    const res = await noShowSession('S1')
    expect(res.success).toBe(true)
    expect(erp.getSessionById).toHaveBeenCalledWith('S1', 'trainer-1')
    expect(erp.markSessionMissed).toHaveBeenCalledWith('S1')
  })
})

// ─── Fail-safe lock-in — Sprint 1 follow-up Item 2 ─────────────────────────────
//
// The tests above mock the ERP layer to fake success once ownership passes —
// useful for proving the ownership *gate* works, but they don't reflect what
// actually happens today: the underlying ERP functions (lib/erpnext/client.ts,
// see its "PT Session stubs" describe block) always throw. These tests use
// that same real failure shape to prove the action layer converts it into a
// safe { success: false } result — never a thrown exception past the action
// boundary, and never a false { success: true } — so a future half-finished
// wiring attempt (e.g. someone "fixes" the ownership gate without also
// wiring the mutation to a real backend) can't regress this into reporting
// success for a mutation that didn't happen.

const erpNotImplemented = Object.assign(
  new Error('ERPNext 503 Not Implemented → /api/resource/PT Session/S1: Session management is not available in this workspace.'),
  { status: 503 },
)

describe('completeSession / cancelSession / noShowSession — fail safe, never a false success', () => {
  it('completeSession returns success:false when the underlying ERP call fails as it does today', async () => {
    vi.mocked(erp.getSessionById).mockResolvedValue(ownedSession)
    vi.mocked(erp.markSessionComplete).mockRejectedValue(erpNotImplemented)

    const res = await completeSession('S1')

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain('Not Implemented')
  })

  it('cancelSession returns success:false when the underlying ERP call fails as it does today', async () => {
    vi.mocked(erp.getSessionById).mockResolvedValue(ownedSession)
    vi.mocked(erp.cancelSession).mockRejectedValue(erpNotImplemented)

    const res = await cancelSession('S1')

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain('Not Implemented')
  })

  it('noShowSession returns success:false when the underlying ERP call fails as it does today', async () => {
    vi.mocked(erp.getSessionById).mockResolvedValue(ownedSession)
    vi.mocked(erp.markSessionMissed).mockRejectedValue(erpNotImplemented)

    const res = await noShowSession('S1')

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain('Not Implemented')
  })

  it('a real (unmocked-shape) ownership-check failure also fails safe, matching getSessionById\'s actual 404 stub', async () => {
    const realShape404 = Object.assign(
      new Error('ERPNext 404 Not Found → /api/resource/PT Session/S1: Session DocType is not available in this workspace.'),
      { status: 404 },
    )
    vi.mocked(erp.getSessionById).mockRejectedValue(realShape404)

    const [completeRes, cancelRes, noShowRes] = await Promise.all([
      completeSession('S1'),
      cancelSession('S1'),
      noShowSession('S1'),
    ])

    expect(completeRes.success).toBe(false)
    expect(cancelRes.success).toBe(false)
    expect(noShowRes.success).toBe(false)
    expect(erp.markSessionComplete).not.toHaveBeenCalled()
    expect(erp.cancelSession).not.toHaveBeenCalled()
    expect(erp.markSessionMissed).not.toHaveBeenCalled()
  })
})

describe('completeSession — P-A billing lock (no invoice, no decrement)', () => {
  it('completes an owned session without calling any invoice primitive (P-A lock)', async () => {
    vi.mocked(erp.getSessionById).mockResolvedValue(ownedSession)
    vi.mocked(erp.markSessionComplete).mockResolvedValue({ ...ownedSession, status: 'completed' } as unknown as Session)
    const res = await completeSession('S1')
    expect(res.success).toBe(true)
    // P-A lock: no invoice primitives must ever be called during completion.
    // Billing-mode dispatch (Pay Per Session / Package / Trial) is deferred to
    // the P-C / Path-A reconciliation phase when billing_mode + invoice_id
    // fields will exist on PT Session.
    expect(erp.createInvoice).not.toHaveBeenCalled()
    expect(erp.submitSalesInvoice).not.toHaveBeenCalled()
    expect(erp.createAndSubmitPaymentEntry).not.toHaveBeenCalled()
  })
})
