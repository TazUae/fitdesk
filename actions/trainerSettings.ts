'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { getTrainerSettingsDoc, updateTrainerSettingsDoc } from '@/lib/erpnext/client'
import type { ActionResult } from '@/types'

const ALL_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
type Weekday = typeof ALL_DAYS[number]

/**
 * Update which working days are enabled on FitDesk Trainer Settings.
 *
 * Reads the current working_days table, flips the `enabled` flag for each
 * row to match the input set, and saves. Per-day start/end times are
 * preserved exactly as they were (this action does not edit them).
 *
 * Schedule and Settings pages are revalidated so the new working-days set
 * is reflected on the next render.
 */
export async function updateWorkingDays(
  enabledDays: Weekday[],
): Promise<ActionResult<{ workingDays: Weekday[] }>> {
  const session = await auth.api.getSession({ headers: headers() })
  if (!session?.user) return { success: false, error: 'Not authenticated.' }

  const wanted = new Set<Weekday>(
    enabledDays.filter((d): d is Weekday => ALL_DAYS.includes(d)),
  )

  try {
    const current = await getTrainerSettingsDoc()
    const rows = current.working_days ?? []

    // Update existing rows in place; add rows for any wanted day that's missing.
    const present = new Set<string>()
    const updated = rows.map(r => {
      const wd = r.weekday
      if (wd) present.add(wd)
      return wd && wanted.has(wd as Weekday)
        ? { ...r, enabled: 1 as const }
        : { ...r, enabled: 0 as const }
    })

    for (const day of wanted) {
      if (!present.has(day)) {
        updated.push({
          weekday:    day,
          enabled:    1,
          start_time: '09:00:00',
          end_time:   '20:00:00',
        })
      }
    }

    await updateTrainerSettingsDoc({ working_days: updated })

    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard/settings')

    return { success: true, data: { workingDays: Array.from(wanted) } }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update working days.',
    }
  }
}
