/**
 * Pure helpers for the onboarding availability step + settings business
 * hours editor. No `'use server'`, no I/O — exported so server actions
 * and tests can share the same validation + row-building logic.
 */

import type { ERPFitDeskWorkingDay } from '@/lib/erpnext/types'

export const ALL_WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
export type Weekday = typeof ALL_WEEKDAYS[number]

/** Default selection used by both onboarding and the settings editor: Mon–Fri. */
export const DEFAULT_ENABLED_DAYS: ReadonlyArray<Weekday> = ['mon', 'tue', 'wed', 'thu', 'fri']
export const DEFAULT_START_TIME = '09:00'
export const DEFAULT_END_TIME = '20:00'

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export interface AvailabilityInput {
  enabledDays: Weekday[]
  /** 'HH:MM', 24h, local. */
  startTime: string
  /** 'HH:MM', 24h, local. */
  endTime: string
}

export function isWeekday(value: unknown): value is Weekday {
  return typeof value === 'string' && (ALL_WEEKDAYS as ReadonlyArray<string>).includes(value)
}

export function isValidHHmm(value: unknown): value is string {
  return typeof value === 'string' && HHMM.test(value)
}

export function validateAvailabilityInput(
  input: AvailabilityInput,
): { ok: true; days: Weekday[] } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Missing availability payload.' }
  }

  const days = Array.isArray(input.enabledDays)
    ? Array.from(new Set(input.enabledDays.filter(isWeekday)))
    : []

  if (days.length === 0) {
    return { ok: false, error: 'Pick at least one working day.' }
  }
  if (!isValidHHmm(input.startTime)) {
    return { ok: false, error: 'Start time must be in HH:MM format.' }
  }
  if (!isValidHHmm(input.endTime)) {
    return { ok: false, error: 'End time must be in HH:MM format.' }
  }
  if (input.endTime <= input.startTime) {
    return { ok: false, error: 'End time must be after start time.' }
  }
  return { ok: true, days }
}

/**
 * Build the full 7-row working_days table. Every row carries the shared
 * start/end time; disabled rows keep the times so toggling a day back on
 * later doesn't lose the trainer's chosen hours.
 */
export function buildWorkingDaysRows(
  enabledDays: ReadonlyArray<Weekday>,
  startTime: string,
  endTime: string,
): ERPFitDeskWorkingDay[] {
  const enabled = new Set<Weekday>(enabledDays)
  const start = `${startTime}:00`
  const end = `${endTime}:00`
  return ALL_WEEKDAYS.map(day => ({
    weekday: day,
    enabled: (enabled.has(day) ? 1 : 0) as 0 | 1,
    start_time: start,
    end_time: end,
  }))
}
