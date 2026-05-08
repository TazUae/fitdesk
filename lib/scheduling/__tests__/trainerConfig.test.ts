import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/erpnext/client', () => ({ getTrainerSettingsDoc: vi.fn() }))

import { mapTrainerSettings } from '../trainerConfig'

describe('mapTrainerSettings', () => {
  const TRAINER_ID = 'trainer-x'

  it('falls back to defaults when doc is null', () => {
    const cfg = mapTrainerSettings(null, TRAINER_ID)
    expect(cfg.trainerId).toBe(TRAINER_ID)
    expect(cfg.workingDays).toEqual(['mon', 'tue', 'wed', 'thu', 'fri'])
    expect(cfg.startTime).toBe('09:00')
    expect(cfg.endTime).toBe('20:00')
    expect(cfg.bufferMinutes).toBe(15)
  })

  it('uses raw timezone when present', () => {
    const cfg = mapTrainerSettings({ timezone: 'Asia/Beirut' }, TRAINER_ID)
    expect(cfg.timezone).toBe('Asia/Beirut')
  })

  it('uses raw buffer_minutes when present', () => {
    expect(mapTrainerSettings({ buffer_minutes: 30 }, TRAINER_ID).bufferMinutes).toBe(30)
    expect(mapTrainerSettings({ buffer_minutes: 0 }, TRAINER_ID).bufferMinutes).toBe(0)
  })

  it('falls back when buffer_minutes is invalid', () => {
    expect(mapTrainerSettings({ buffer_minutes: -5 }, TRAINER_ID).bufferMinutes).toBe(15)
    expect(mapTrainerSettings({ buffer_minutes: NaN }, TRAINER_ID).bufferMinutes).toBe(15)
  })

  it('extracts enabled weekdays only', () => {
    const cfg = mapTrainerSettings({
      working_days: [
        { weekday: 'mon', enabled: 1, start_time: '09:00:00', end_time: '17:00:00' },
        { weekday: 'tue', enabled: 0, start_time: '09:00:00', end_time: '17:00:00' },
        { weekday: 'sat', enabled: 1, start_time: '10:00:00', end_time: '14:00:00' },
      ],
    }, TRAINER_ID)
    expect(cfg.workingDays).toEqual(['mon', 'sat'])
  })

  it('reduces per-day windows to min(start) and max(end)', () => {
    const cfg = mapTrainerSettings({
      working_days: [
        { weekday: 'mon', enabled: 1, start_time: '09:00:00', end_time: '17:00:00' },
        { weekday: 'tue', enabled: 1, start_time: '07:00:00', end_time: '20:30:00' },
        { weekday: 'wed', enabled: 1, start_time: '08:00:00', end_time: '18:00:00' },
      ],
    }, TRAINER_ID)
    expect(cfg.startTime).toBe('07:00')
    expect(cfg.endTime).toBe('20:30')
  })

  it('falls back to default working days if no rows are enabled', () => {
    const cfg = mapTrainerSettings({
      working_days: [
        { weekday: 'mon', enabled: 0 },
        { weekday: 'tue', enabled: 0 },
      ],
    }, TRAINER_ID)
    expect(cfg.workingDays).toEqual(['mon', 'tue', 'wed', 'thu', 'fri'])
  })

  it('accepts both 3-letter and full day names', () => {
    const cfg = mapTrainerSettings({
      working_days: [
        { weekday: 'monday' as never,    enabled: 1, start_time: '09:00:00', end_time: '17:00:00' },
        { weekday: 'WEDNESDAY' as never, enabled: 1, start_time: '09:00:00', end_time: '17:00:00' },
        { weekday: 'sat',                enabled: 1, start_time: '09:00:00', end_time: '17:00:00' },
      ],
    }, TRAINER_ID)
    expect(cfg.workingDays).toEqual(['mon', 'wed', 'sat'])
  })

  it('treats enabled string "1" and boolean true as enabled', () => {
    const cfg = mapTrainerSettings({
      working_days: [
        { weekday: 'sun', enabled: '1' as never, start_time: '09:00:00', end_time: '17:00:00' },
        { weekday: 'fri', enabled: true as never, start_time: '09:00:00', end_time: '17:00:00' },
      ],
    }, TRAINER_ID)
    expect(cfg.workingDays).toEqual(['sun', 'fri'])
  })

  it('skips rows with unrecognized weekday', () => {
    const cfg = mapTrainerSettings({
      working_days: [
        { weekday: 'funday' as never, enabled: 1, start_time: '09:00:00', end_time: '17:00:00' },
        { weekday: 'mon',             enabled: 1, start_time: '09:00:00', end_time: '17:00:00' },
      ],
    }, TRAINER_ID)
    expect(cfg.workingDays).toEqual(['mon'])
  })

  it('handles missing start/end on enabled rows by falling back', () => {
    const cfg = mapTrainerSettings({
      working_days: [
        { weekday: 'mon', enabled: 1 },
      ],
    }, TRAINER_ID)
    expect(cfg.workingDays).toEqual(['mon'])
    expect(cfg.startTime).toBe('09:00')
    expect(cfg.endTime).toBe('20:00')
  })
})
