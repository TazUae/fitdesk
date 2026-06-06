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
vi.mock('@/lib/availability', async () => {
  const actual = await vi.importActual('@/lib/availability')
  return actual
})

import { updateBufferMinutes } from './trainerSettings'
import { auth } from '@/lib/auth'
import { updateTrainerSettingsDoc } from '@/lib/erpnext/client'
import { revalidatePath } from 'next/cache'

const getSession  = auth.api.getSession as unknown as ReturnType<typeof vi.fn>
const updateDoc   = updateTrainerSettingsDoc as unknown as ReturnType<typeof vi.fn>
const revalidate  = revalidatePath as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  getSession.mockResolvedValue({ user: { id: 'user-1' } })
  updateDoc.mockResolvedValue({ buffer_minutes: 15 })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('updateBufferMinutes', () => {
  it('refuses anonymous callers', async () => {
    getSession.mockResolvedValueOnce(null)
    const res = await updateBufferMinutes(15)
    expect(res).toEqual({ success: false, error: 'Not authenticated.' })
    expect(updateDoc).not.toHaveBeenCalled()
  })

  it.each([0, 10, 15, 30, 120])('accepts valid preset/boundary %i', async (minutes) => {
    const res = await updateBufferMinutes(minutes)
    expect(res.success).toBe(true)
    if (res.success) expect(res.data.bufferMinutes).toBe(minutes)
  })

  it.each([-1, 121, 15.5, NaN])('rejects invalid value %s', async (minutes) => {
    const res = await updateBufferMinutes(minutes)
    expect(res.success).toBe(false)
    expect(updateDoc).not.toHaveBeenCalled()
  })

  it('calls updateTrainerSettingsDoc with { buffer_minutes: value }', async () => {
    await updateBufferMinutes(30)
    expect(updateDoc).toHaveBeenCalledTimes(1)
    expect(updateDoc).toHaveBeenCalledWith({ buffer_minutes: 30 })
  })

  it('revalidates /dashboard/settings and /dashboard/schedule', async () => {
    await updateBufferMinutes(15)
    const paths = revalidate.mock.calls.map((c: unknown[]) => c[0])
    expect(paths).toContain('/dashboard/settings')
    expect(paths).toContain('/dashboard/schedule')
  })

  it('surfaces ERP errors without throwing', async () => {
    updateDoc.mockRejectedValueOnce(new Error('Frappe 500'))
    const res = await updateBufferMinutes(15)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/Couldn't save your buffer time/)
  })
})
