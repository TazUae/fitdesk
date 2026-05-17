import { vi } from 'vitest'

// sessionRepository.ts imports 'server-only' and erpFetch — mock both before
// any import runs so vitest does not throw on the server-only guard.
vi.mock('server-only', () => ({}))
vi.mock('@/lib/erpnext/client', () => ({ erpFetch: vi.fn() }))

import { describe, expect, it } from 'vitest'
import { sessionFields, normalizeSession } from './sessionRepository'
import type { ERPFDSession } from '@/lib/erpnext/types'

// Minimal valid ERPFDSession — fields that normalizeSession always reads.
const minimal: ERPFDSession = {
  name:             'FD-SESSION-001',
  trainer_id:       'TRAINER-1',
  client_id:        'CUST-1',
  start_at:         '2026-05-17 08:00:00',
  end_at:           '2026-05-17 09:00:00',
  duration_minutes: 60,
  timezone:         'Asia/Riyadh',
  status:           'scheduled',
  is_override:      0,
  rate:             100,
  version:          1,
  creation:         '2026-05-17 07:00:00',
  modified:         '2026-05-17 07:00:00',
}

describe('sessionFields', () => {
  it('returns valid JSON array', () => {
    const parsed = JSON.parse(sessionFields())
    expect(Array.isArray(parsed)).toBe(true)
  })

  it('includes required FD Session fields', () => {
    const fields: string[] = JSON.parse(sessionFields())
    expect(fields).toContain('name')
    expect(fields).toContain('trainer_id')
    expect(fields).toContain('client_id')
    expect(fields).toContain('start_at')
    expect(fields).toContain('end_at')
    expect(fields).toContain('status')
    expect(fields).toContain('version')
  })

  it('includes Phase B trial and package fields', () => {
    const fields: string[] = JSON.parse(sessionFields())
    expect(fields).toContain('is_trial_session')
    expect(fields).toContain('session_consumed_package')
  })
})

describe('normalizeSession', () => {
  it('maps is_trial_session: 1 → isTrialSession: true', () => {
    const session = normalizeSession({ ...minimal, is_trial_session: 1 })
    expect(session.isTrialSession).toBe(true)
  })

  it('maps is_trial_session: 0 → isTrialSession: false', () => {
    const session = normalizeSession({ ...minimal, is_trial_session: 0 })
    expect(session.isTrialSession).toBe(false)
  })

  it('maps absent is_trial_session → isTrialSession: false', () => {
    const session = normalizeSession(minimal)
    expect(session.isTrialSession).toBe(false)
  })

  it('maps session_consumed_package: 1 → sessionConsumedPackage: true', () => {
    const session = normalizeSession({ ...minimal, session_consumed_package: 1 })
    expect(session.sessionConsumedPackage).toBe(true)
  })

  it('maps session_consumed_package: 0 → sessionConsumedPackage: false', () => {
    const session = normalizeSession({ ...minimal, session_consumed_package: 0 })
    expect(session.sessionConsumedPackage).toBe(false)
  })

  it('maps absent session_consumed_package → sessionConsumedPackage: false', () => {
    const session = normalizeSession(minimal)
    expect(session.sessionConsumedPackage).toBe(false)
  })

  it('maps required fields correctly', () => {
    const session = normalizeSession(minimal)
    expect(session.id).toBe('FD-SESSION-001')
    expect(session.trainerId).toBe('TRAINER-1')
    expect(session.clientId).toBe('CUST-1')
    expect(session.durationMinutes).toBe(60)
    expect(session.timezone).toBe('Asia/Riyadh')
    expect(session.status).toBe('scheduled')
    expect(session.isOverride).toBe(false)
    expect(session.rate).toBe(100)
    expect(session.version).toBe(1)
  })
})
