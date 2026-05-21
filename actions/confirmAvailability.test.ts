import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({
  headers: vi.fn(() => new Headers()),
}))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}))
vi.mock('@/lib/erpnext/client', () => ({
  getTrainerSettingsDoc: vi.fn(),
  updateTrainerSettingsDoc: vi.fn(),
}))

import { confirmAvailability } from './confirmAvailability'
import { auth } from '@/lib/auth'
import { getTrainerSettingsDoc, updateTrainerSettingsDoc } from '@/lib/erpnext/client'
import { revalidatePath } from 'next/cache'

const getSession = auth.api.getSession as unknown as ReturnType<typeof vi.fn>
const getDoc     = getTrainerSettingsDoc as unknown as ReturnType<typeof vi.fn>
const updateDoc  = updateTrainerSettingsDoc as unknown as ReturnType<typeof vi.fn>
const revalidate = revalidatePath as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  getSession.mockResolvedValue({ user: { id: 'user-1' } })
  getDoc.mockResolvedValue({
    timezone: 'Asia/Beirut',
    buffer_minutes: 15,
    default_session_duration: 60,
    working_days: [],
    initialized: 0,
  })
  updateDoc.mockResolvedValue({ initialized: 1, working_days: [] })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('confirmAvailability', () => {
  it('refuses anonymous callers', async () => {
    getSession.mockResolvedValueOnce(null)
    const res = await confirmAvailability({
      enabledDays: ['mon'],
      startTime: '09:00',
      endTime: '20:00',
    })
    expect(res).toEqual({ success: false, error: 'Not authenticated.' })
    expect(updateDoc).not.toHaveBeenCalled()
  })

  it('rejects invalid payloads without writing', async () => {
    const res = await confirmAvailability({
      enabledDays: [],
      startTime: '09:00',
      endTime: '20:00',
    })
    expect(res.success).toBe(false)
    expect(updateDoc).not.toHaveBeenCalled()
  })

  it('writes all 7 working_day rows and sets initialized=1', async () => {
    const res = await confirmAvailability({
      enabledDays: ['mon', 'wed', 'fri'],
      startTime: '08:00',
      endTime: '18:00',
    })

    expect(res.success).toBe(true)
    expect(updateDoc).toHaveBeenCalledTimes(1)
    const payload = updateDoc.mock.calls[0][0]

    expect(payload.initialized).toBe(1)
    expect(payload.working_days).toHaveLength(7)

    const byDay = Object.fromEntries(
      (payload.working_days as Array<{ weekday: string; enabled: 0 | 1; start_time: string; end_time: string }>).map(
        r => [r.weekday, r],
      ),
    )
    expect(byDay.mon.enabled).toBe(1)
    expect(byDay.wed.enabled).toBe(1)
    expect(byDay.fri.enabled).toBe(1)
    expect(byDay.sun.enabled).toBe(0)
    expect(byDay.sat.enabled).toBe(0)
    expect(byDay.mon.start_time).toBe('08:00:00')
    expect(byDay.mon.end_time).toBe('18:00:00')
  })

  it('revalidates dashboard, schedule, settings, and onboarding paths', async () => {
    await confirmAvailability({
      enabledDays: ['mon'],
      startTime: '09:00',
      endTime: '20:00',
    })
    const called = revalidate.mock.calls.map(c => c[0])
    expect(called).toEqual(
      expect.arrayContaining([
        '/dashboard/schedule',
        '/dashboard/settings',
        '/dashboard',
        '/onboarding',
      ]),
    )
  })

  it('surfaces ERP errors without throwing and does not claim success', async () => {
    updateDoc.mockRejectedValueOnce(new Error('Frappe 500'))
    const res = await confirmAvailability({
      enabledDays: ['mon'],
      startTime: '09:00',
      endTime: '20:00',
    })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/Couldn't save your availability/)
  })
})
