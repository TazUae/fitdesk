/**
 * Unit tests for lib/scheduling/sessionRepository.ts
 *
 * erpFetch is mocked — these tests cover field normalization, path construction,
 * and the bulk/series persistence flows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/erpnext/client', () => ({
  erpFetch: vi.fn(),
}))

import {
  sessionFields,
  normalizeSession,
  findSessionsInRange,
  findSessionsForClient,
  findSessionById,
  bulkCreateSessions,
  updateSession,
  cancelSession,
  createSeries,
} from '@/lib/scheduling/sessionRepository'
import * as erpClient from '@/lib/erpnext/client'
import type { ERPFDSession, ERPFDSessionSeries } from '@/lib/erpnext/types'

const mockErpFetch = vi.mocked(erpClient.erpFetch)

beforeEach(() => mockErpFetch.mockReset())

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_SESSION: ERPFDSession = {
  name:                     'fds-001',
  trainer_id:               'trainer-1',
  client_id:                'CUST-001',
  client_name:              'Alice',
  series_id:                null,
  start_at:                 '2026-01-05 09:00:00',
  end_at:                   '2026-01-05 10:00:00',
  duration_minutes:         60,
  timezone:                 'Asia/Riyadh',
  status:                   'scheduled',
  occurrence_key:           '2026-01-05:09:00',
  occurrence_index:         0,
  is_override:              0,
  rate:                     100,
  session_type:             null,
  notes:                    null,
  invoice_id:               null,
  version:                  1,
  is_trial_session:         0,
  session_consumed_package: 0,
  creation:                 '2026-01-01 00:00:00',
  modified:                 '2026-01-01 00:00:00',
}

const BASE_SERIES_RAW: ERPFDSessionSeries = {
  name:             'series-001',
  trainer_id:       'trainer-1',
  client_id:        'CUST-001',
  pattern:          '{"frequency":"weekly","interval":1,"slots":[{"weekday":1,"localTime":"09:00"}],"count":null,"until":null}',
  start_date:       '2026-01-05',
  end_date:         '2026-01-25',
  duration_minutes: 60,
  timezone:         'Asia/Riyadh',
  default_rate:     100,
  status:           'active',
  version:          1,
  creation:         '2026-01-01 00:00:00',
  modified:         '2026-01-01 00:00:00',
}

// ─── sessionFields ─────────────────────────────────────────────────────────────

describe('sessionFields', () => {
  it('returns parseable JSON containing required field names', () => {
    const fields = JSON.parse(sessionFields()) as string[]
    expect(Array.isArray(fields)).toBe(true)
    expect(fields).toContain('name')
    expect(fields).toContain('trainer_id')
    expect(fields).toContain('client_id')
    expect(fields).toContain('start_at')
    expect(fields).toContain('end_at')
    expect(fields).toContain('status')
    expect(fields).toContain('version')
    expect(fields).toContain('is_trial_session')
    expect(fields).toContain('session_consumed_package')
  })
})

// ─── normalizeSession ──────────────────────────────────────────────────────────

describe('normalizeSession', () => {
  it('maps all core fields', () => {
    const s = normalizeSession(BASE_SESSION)
    expect(s.id).toBe('fds-001')
    expect(s.trainerId).toBe('trainer-1')
    expect(s.clientId).toBe('CUST-001')
    expect(s.clientName).toBe('Alice')
    expect(s.durationMinutes).toBe(60)
    expect(s.timezone).toBe('Asia/Riyadh')
    expect(s.status).toBe('scheduled')
    expect(s.rate).toBe(100)
    expect(s.version).toBe(1)
    expect(s.occurrenceKey).toBe('2026-01-05:09:00')
    expect(s.occurrenceIndex).toBe(0)
  })

  it('converts Frappe UTC datetime strings to Date objects', () => {
    const s = normalizeSession(BASE_SESSION)
    expect(s.startAt).toEqual(new Date('2026-01-05T09:00:00Z'))
    expect(s.endAt).toEqual(new Date('2026-01-05T10:00:00Z'))
  })

  it('maps is_trial_session=1 to isTrialSession=true', () => {
    expect(normalizeSession({ ...BASE_SESSION, is_trial_session: 1 }).isTrialSession).toBe(true)
  })

  it('maps is_trial_session=0 to isTrialSession=false', () => {
    expect(normalizeSession({ ...BASE_SESSION, is_trial_session: 0 }).isTrialSession).toBe(false)
  })

  it('maps absent is_trial_session to isTrialSession=false', () => {
    const { is_trial_session: _, ...noFlag } = BASE_SESSION
    expect(normalizeSession(noFlag as ERPFDSession).isTrialSession).toBe(false)
  })

  it('maps session_consumed_package=1 to sessionConsumedPackage=true', () => {
    expect(normalizeSession({ ...BASE_SESSION, session_consumed_package: 1 }).sessionConsumedPackage).toBe(true)
  })

  it('maps is_override=1 to isOverride=true', () => {
    expect(normalizeSession({ ...BASE_SESSION, is_override: 1 }).isOverride).toBe(true)
  })

  it('maps is_override=0 to isOverride=false', () => {
    expect(normalizeSession({ ...BASE_SESSION, is_override: 0 }).isOverride).toBe(false)
  })

  it('falls back clientName to clientId when client_name is absent', () => {
    const { client_name: _, ...noName } = BASE_SESSION
    expect(normalizeSession(noName as ERPFDSession).clientName).toBe('CUST-001')
  })

  it('sets seriesId to null when series_id is null', () => {
    expect(normalizeSession({ ...BASE_SESSION, series_id: null }).seriesId).toBeNull()
  })

  it('sets seriesId to null when series_id is undefined', () => {
    const { series_id: _, ...noSeries } = BASE_SESSION
    expect(normalizeSession(noSeries as ERPFDSession).seriesId).toBeNull()
  })

  it('preserves seriesId when present', () => {
    expect(normalizeSession({ ...BASE_SESSION, series_id: 'ser-001' }).seriesId).toBe('ser-001')
  })
})

// ─── findSessionsInRange ──────────────────────────────────────────────────────

describe('findSessionsInRange', () => {
  it('calls erpFetch with the FD Session doctype path', async () => {
    mockErpFetch.mockResolvedValue({ data: [] })
    await findSessionsInRange('trainer-1', new Date('2026-01-05T00:00:00Z'), new Date('2026-01-05T23:59:59Z'))
    const [path] = mockErpFetch.mock.calls[0]
    expect(path).toContain('FD%20Session')
  })

  it('returns normalized sessions', async () => {
    mockErpFetch.mockResolvedValue({ data: [BASE_SESSION] })
    const result = await findSessionsInRange('trainer-1', new Date('2026-01-05T00:00:00Z'), new Date('2026-01-05T23:59:59Z'))
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('fds-001')
    expect(result[0].startAt).toEqual(new Date('2026-01-05T09:00:00Z'))
  })

  it('returns empty array when no sessions exist', async () => {
    mockErpFetch.mockResolvedValue({ data: [] })
    const result = await findSessionsInRange('trainer-1', new Date('2026-01-05T00:00:00Z'), new Date('2026-01-05T23:59:59Z'))
    expect(result).toEqual([])
  })
})

// ─── findSessionsForClient (Phase 4 — client detail session history) ─────────

describe('findSessionsForClient', () => {
  it('calls erpFetch with the FD Session doctype path', async () => {
    mockErpFetch.mockResolvedValue({ data: [] })
    await findSessionsForClient('trainer-1', 'CUST-001')
    const [path] = mockErpFetch.mock.calls[0]
    expect(path).toContain('FD%20Session')
  })

  it('filters by both trainer_id and client_id (tenant/trainer ownership boundary)', async () => {
    mockErpFetch.mockResolvedValue({ data: [] })
    await findSessionsForClient('trainer-1', 'CUST-001')
    const [, opts] = mockErpFetch.mock.calls[0]
    const filters = JSON.parse((opts as { params: { filters: string } }).params.filters)
    expect(filters).toContainEqual(['trainer_id', '=', 'trainer-1'])
    expect(filters).toContainEqual(['client_id', '=', 'CUST-001'])
  })

  it('does NOT exclude cancelled/skipped sessions (history should show them)', async () => {
    mockErpFetch.mockResolvedValue({ data: [] })
    await findSessionsForClient('trainer-1', 'CUST-001')
    const [, opts] = mockErpFetch.mock.calls[0]
    const filters = JSON.parse((opts as { params: { filters: string } }).params.filters) as unknown[]
    expect(filters.some(f => Array.isArray(f) && f[0] === 'status')).toBe(false)
  })

  it('orders by start_at desc (most recent first)', async () => {
    mockErpFetch.mockResolvedValue({ data: [] })
    await findSessionsForClient('trainer-1', 'CUST-001')
    const [, opts] = mockErpFetch.mock.calls[0]
    expect((opts as { params: { orderby: string } }).params.orderby).toBe('start_at desc')
  })

  it('returns normalized sessions for the requested client only', async () => {
    mockErpFetch.mockResolvedValue({ data: [BASE_SESSION] })
    const result = await findSessionsForClient('trainer-1', 'CUST-001')
    expect(result).toHaveLength(1)
    expect(result[0].clientId).toBe('CUST-001')
  })

  it('returns empty array when the client has no sessions', async () => {
    mockErpFetch.mockResolvedValue({ data: [] })
    const result = await findSessionsForClient('trainer-1', 'CUST-999')
    expect(result).toEqual([])
  })
})

// ─── findSessionById ──────────────────────────────────────────────────────────

describe('findSessionById', () => {
  it('calls erpFetch with the encoded session name in the path', async () => {
    mockErpFetch.mockResolvedValue({ data: BASE_SESSION })
    await findSessionById('fds-001')
    const [path] = mockErpFetch.mock.calls[0]
    expect(path).toContain('fds-001')
  })

  it('returns a normalized session', async () => {
    mockErpFetch.mockResolvedValue({ data: BASE_SESSION })
    const result = await findSessionById('fds-001')
    expect(result.id).toBe('fds-001')
    expect(result.status).toBe('scheduled')
  })
})

// ─── bulkCreateSessions ───────────────────────────────────────────────────────

describe('bulkCreateSessions', () => {
  it('returns empty array immediately when given no sessions', async () => {
    const result = await bulkCreateSessions([])
    expect(result).toEqual([])
    expect(mockErpFetch).not.toHaveBeenCalled()
  })

  it('calls the bulk_create_sessions method endpoint with POST', async () => {
    mockErpFetch.mockResolvedValue({ message: { created: ['fds-001'] } })
    await bulkCreateSessions([{
      trainerId: 'trainer-1', clientId: 'CUST-001', seriesId: null,
      startAt: new Date('2026-01-05T09:00:00Z'), endAt: new Date('2026-01-05T10:00:00Z'),
      durationMinutes: 60, timezone: 'Asia/Riyadh',
      occurrenceKey: '2026-01-05:09:00', occurrenceIndex: 0, rate: 100,
    }])
    const [path, opts] = mockErpFetch.mock.calls[0]
    expect(path).toContain('bulk_create_sessions')
    expect((opts as { method: string }).method).toBe('POST')
  })

  it('returns the created session docnames', async () => {
    mockErpFetch.mockResolvedValue({ message: { created: ['fds-001', 'fds-002'] } })
    const result = await bulkCreateSessions([
      { trainerId: 'trainer-1', clientId: 'CUST-001', seriesId: null,
        startAt: new Date('2026-01-05T09:00:00Z'), endAt: new Date('2026-01-05T10:00:00Z'),
        durationMinutes: 60, timezone: 'Asia/Riyadh',
        occurrenceKey: '2026-01-05:09:00', occurrenceIndex: 0, rate: 100 },
      { trainerId: 'trainer-1', clientId: 'CUST-001', seriesId: null,
        startAt: new Date('2026-01-05T11:00:00Z'), endAt: new Date('2026-01-05T12:00:00Z'),
        durationMinutes: 60, timezone: 'Asia/Riyadh',
        occurrenceKey: '2026-01-05:11:00', occurrenceIndex: 1, rate: 100 },
    ])
    expect(result).toEqual(['fds-001', 'fds-002'])
  })

  it('serializes start_at and end_at as Frappe datetime strings', async () => {
    mockErpFetch.mockResolvedValue({ message: { created: ['fds-001'] } })
    await bulkCreateSessions([{
      trainerId: 'trainer-1', clientId: 'CUST-001', seriesId: null,
      startAt: new Date('2026-01-05T09:00:00Z'), endAt: new Date('2026-01-05T10:00:00Z'),
      durationMinutes: 60, timezone: 'Asia/Riyadh',
      occurrenceKey: '2026-01-05:09:00', occurrenceIndex: 0, rate: 100,
    }])
    const body = (mockErpFetch.mock.calls[0][1] as { body: { sessions: Array<{ start_at: string; end_at: string }> } }).body
    expect(body.sessions[0].start_at).toBe('2026-01-05 09:00:00')
    expect(body.sessions[0].end_at).toBe('2026-01-05 10:00:00')
  })
})

// ─── updateSession ─────────────────────────────────────────────────────────────

describe('updateSession', () => {
  it('calls erpFetch with PUT method on the session path', async () => {
    mockErpFetch.mockResolvedValue({ data: { ...BASE_SESSION, status: 'confirmed' } })
    await updateSession('fds-001', { status: 'confirmed' })
    const [path, opts] = mockErpFetch.mock.calls[0]
    expect(path).toContain('fds-001')
    expect((opts as { method: string }).method).toBe('PUT')
  })

  it('only sends fields that are present in the patch', async () => {
    mockErpFetch.mockResolvedValue({ data: { ...BASE_SESSION, status: 'confirmed' } })
    await updateSession('fds-001', { status: 'confirmed' })
    const body = (mockErpFetch.mock.calls[0][1] as { body: Record<string, unknown> }).body
    expect(body).toHaveProperty('status', 'confirmed')
    expect(body).not.toHaveProperty('start_at')
    expect(body).not.toHaveProperty('rate')
  })

  it('serializes sessionConsumedPackage: true → session_consumed_package: 1', async () => {
    mockErpFetch.mockResolvedValue({ data: { ...BASE_SESSION, status: 'completed', session_consumed_package: 1 } })
    await updateSession('fds-001', { status: 'completed', sessionConsumedPackage: true, version: 2 })
    const body = (mockErpFetch.mock.calls[0][1] as { body: Record<string, unknown> }).body
    expect(body).toHaveProperty('session_consumed_package', 1)
    expect(body).toHaveProperty('status', 'completed')
    expect(body).toHaveProperty('version', 2)
  })

  it('serializes sessionConsumedPackage: false → session_consumed_package: 0', async () => {
    mockErpFetch.mockResolvedValue({ data: { ...BASE_SESSION, session_consumed_package: 0 } })
    await updateSession('fds-001', { sessionConsumedPackage: false })
    const body = (mockErpFetch.mock.calls[0][1] as { body: Record<string, unknown> }).body
    expect(body).toHaveProperty('session_consumed_package', 0)
  })

  it('does not include modified in the PUT body', async () => {
    mockErpFetch.mockResolvedValue({ data: { ...BASE_SESSION, status: 'completed', session_consumed_package: 1 } })
    await updateSession('fds-001', { status: 'completed', sessionConsumedPackage: true, version: 2 })
    const body = (mockErpFetch.mock.calls[0][1] as { body: Record<string, unknown> }).body
    expect(body).not.toHaveProperty('modified')
  })
})

// ─── cancelSession ─────────────────────────────────────────────────────────────

describe('cancelSession', () => {
  it('calls erpFetch PUT with status=cancelled', async () => {
    mockErpFetch.mockResolvedValue({ data: { ...BASE_SESSION, status: 'cancelled' } })
    const result = await cancelSession('fds-001')
    const [path, opts] = mockErpFetch.mock.calls[0]
    expect(path).toContain('fds-001')
    expect((opts as { method: string; body: Record<string, unknown> }).method).toBe('PUT')
    expect((opts as { method: string; body: Record<string, unknown> }).body).toMatchObject({ status: 'cancelled' })
    expect(result.status).toBe('cancelled')
  })
})

// ─── createSeries ─────────────────────────────────────────────────────────────

describe('createSeries', () => {
  const SERIES_INPUT = {
    trainerId: 'trainer-1',
    clientId: 'CUST-001',
    pattern: { frequency: 'weekly' as const, interval: 1, slots: [{ weekday: 1 as const, localTime: '09:00' }], count: null, until: null },
    startDate: '2026-01-05',
    endDate: '2026-01-25',
    durationMinutes: 60,
    timezone: 'Asia/Riyadh',
    defaultRate: 100,
  }

  it('calls create_series method then fetches the created series doc', async () => {
    mockErpFetch
      .mockResolvedValueOnce({ message: { name: 'series-001' } })
      .mockResolvedValueOnce({ data: BASE_SERIES_RAW })
    await createSeries(SERIES_INPUT)
    expect(mockErpFetch).toHaveBeenCalledTimes(2)
    const [firstPath, firstOpts] = mockErpFetch.mock.calls[0]
    expect(firstPath).toContain('create_series')
    expect((firstOpts as { method: string }).method).toBe('POST')
    const [secondPath] = mockErpFetch.mock.calls[1]
    expect(secondPath).toContain('series-001')
  })

  it('returns a normalized series with parsed pattern', async () => {
    mockErpFetch
      .mockResolvedValueOnce({ message: { name: 'series-001' } })
      .mockResolvedValueOnce({ data: BASE_SERIES_RAW })
    const result = await createSeries(SERIES_INPUT)
    expect(result.id).toBe('series-001')
    expect(result.pattern.frequency).toBe('weekly')
    expect(result.defaultRate).toBe(100)
    expect(result.status).toBe('active')
  })

  it('serializes the pattern as a JSON string in the payload', async () => {
    mockErpFetch
      .mockResolvedValueOnce({ message: { name: 'series-001' } })
      .mockResolvedValueOnce({ data: BASE_SERIES_RAW })
    await createSeries(SERIES_INPUT)
    const body = (mockErpFetch.mock.calls[0][1] as { body: { series: { pattern: string } } }).body
    expect(typeof body.series.pattern).toBe('string')
    expect(JSON.parse(body.series.pattern)).toMatchObject({ frequency: 'weekly' })
  })
})
