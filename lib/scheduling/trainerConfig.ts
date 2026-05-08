import 'server-only'
import * as React from 'react'
import { getTrainerSettingsDoc } from '@/lib/erpnext/client'
import type { ERPTrainerSettings } from '@/lib/erpnext/types'
import type { TrainerConfig } from '@/types/scheduling'

// React.cache is RSC-only and may be undefined in test/non-RSC environments.
// Fall back to identity so tests can import this module.
type CacheFn = <T extends (...a: never[]) => unknown>(fn: T) => T
const cache: CacheFn = (React as { cache?: CacheFn }).cache ?? ((fn) => fn)

// ─── Defaults ─────────────────────────────────────────────────────────────────
// Used when the field is missing on the doc OR when the ERP fetch fails.
// Match the previous PHASE1_* constants so the schedule page degrades cleanly.

const DEFAULT_BUFFER_MIN = 15
const DEFAULT_START_TIME = '09:00'
const DEFAULT_END_TIME   = '20:00'
const DEFAULT_WORKING_DAYS: TrainerConfig['workingDays'] =
  ['mon', 'tue', 'wed', 'thu', 'fri']

type Weekday = TrainerConfig['workingDays'][number]

const WEEKDAY_MAP: Record<string, Weekday> = {
  sun: 'sun', sunday: 'sun',
  mon: 'mon', monday: 'mon',
  tue: 'tue', tuesday: 'tue',
  wed: 'wed', wednesday: 'wed',
  thu: 'thu', thursday: 'thu',
  fri: 'fri', friday: 'fri',
  sat: 'sat', saturday: 'sat',
}

function normalizeWeekday(raw: unknown): Weekday | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  return WEEKDAY_MAP[raw.trim().toLowerCase()] ?? null
}

/** "09:00:00" → "09:00"; tolerates already-trimmed input. */
function trimSeconds(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const m = /^(\d{2}:\d{2})/.exec(raw.trim())
  return m ? m[1] : null
}

function isEnabledRow(v: unknown): boolean {
  return v === 1 || v === true || v === '1'
}

/**
 * Pure mapper: ERP Trainer Settings doc → TrainerConfig.
 *
 * Per-day start/end times in working_days are reduced to a single global
 * window using min(start) and max(end) across enabled days. This is an
 * approximation matching the current single-window TrainerConfig shape.
 * Modeling per-day windows requires a TrainerConfig schema change.
 *
 * Falls back to PHASE1_* defaults for any missing/invalid field.
 */
export function mapTrainerSettings(
  raw: ERPTrainerSettings | null | undefined,
  trainerId: string,
): TrainerConfig {
  const timezone = (typeof raw?.timezone === 'string' && raw.timezone.trim())
    ? raw.timezone.trim()
    : (process.env.TRAINER_DEFAULT_TIMEZONE ?? 'UTC')

  const bufferMinutes = (() => {
    const v = raw?.buffer_minutes
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v
    if (typeof v === 'string' && (v as string).trim()) {
      const n = Number(v)
      if (Number.isFinite(n) && n >= 0) return n
    }
    return DEFAULT_BUFFER_MIN
  })()

  const enabledRows = (raw?.working_days ?? [])
    .filter(d => isEnabledRow(d.enabled))
    .map(d => ({
      wd:    normalizeWeekday(d.weekday),
      start: trimSeconds(d.start_time),
      end:   trimSeconds(d.end_time),
    }))
    .filter((d): d is { wd: Weekday; start: string | null; end: string | null } => d.wd !== null)

  const workingDays: TrainerConfig['workingDays'] = enabledRows.length > 0
    ? Array.from(new Set(enabledRows.map(d => d.wd)))
    : DEFAULT_WORKING_DAYS

  let startTime = DEFAULT_START_TIME
  let endTime   = DEFAULT_END_TIME
  if (enabledRows.length > 0) {
    const starts = enabledRows.map(d => d.start).filter((t): t is string => t !== null).sort()
    const ends   = enabledRows.map(d => d.end).filter((t): t is string => t !== null).sort()
    if (starts.length > 0) startTime = starts[0]                  // earliest
    if (ends.length   > 0) endTime   = ends[ends.length - 1]      // latest
  }

  return { trainerId, timezone, workingDays, startTime, endTime, bufferMinutes }
}

/**
 * Per-request cached fetch of FitDesk Trainer Settings → TrainerConfig.
 *
 * React.cache deduplicates calls within a single render pass — when
 * /dashboard/schedule loads, getSchedulerConfig + listFDSessionsAction
 * + buildPlanAction can each ask for the config without triggering
 * multiple ERP round-trips.
 *
 * Falls back to PHASE1_* defaults if ERP is unreachable so the schedule
 * still renders something usable.
 */
export const getTrainerConfig = cache(
  async (trainerId: string): Promise<TrainerConfig> => {
    try {
      const doc = await getTrainerSettingsDoc()
      return mapTrainerSettings(doc, trainerId)
    } catch {
      return mapTrainerSettings(null, trainerId)
    }
  },
)
