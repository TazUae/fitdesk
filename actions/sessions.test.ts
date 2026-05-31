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
  cancelSession: vi.fn(),
  createSession: vi.fn(),
  getSessions: vi.fn(),
}))

import { completeSession, cancelSession } from '@/actions/sessions'
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
