'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import {
  buildWorkingDaysRows,
  validateAvailabilityInput,
  type AvailabilityInput,
  type Weekday,
} from '@/lib/availability'
import { getTrainerSettingsDoc, updateTrainerSettingsDoc } from '@/lib/erpnext/client'
import type { ActionResult } from '@/types'

export interface ConfirmAvailabilityResult {
  enabledDays: Weekday[]
  startTime: string
  endTime: string
  initialized: true
}

/**
 * Confirm the trainer's availability at the end of onboarding.
 *
 * Reads FitDesk Trainer Settings, rewrites all 7 working_days rows with
 * the shared start/end time, flips `initialized` to 1, and revalidates
 * the schedule + settings pages.
 *
 * Unrelated settings fields (timezone, buffer_minutes, default_session_duration)
 * are preserved by sending a PATCH-style partial update.
 */
export async function confirmAvailability(
  input: AvailabilityInput,
): Promise<ActionResult<ConfirmAvailabilityResult>> {
  const session = await auth.api.getSession({ headers: headers() })
  if (!session?.user) return { success: false, error: 'Not authenticated.' }

  const v = validateAvailabilityInput(input)
  if (!v.ok) return { success: false, error: v.error }

  try {
    // Touch the singleton first so an early ERP/auth failure surfaces
    // before we attempt the write. We don't need its content — the
    // PATCH below only sets the fields we want to change.
    await getTrainerSettingsDoc()

    const working_days = buildWorkingDaysRows(v.days, input.startTime, input.endTime)

    await updateTrainerSettingsDoc({
      working_days,
      initialized: 1,
    })

    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard/settings')
    revalidatePath('/dashboard')
    revalidatePath('/onboarding')

    return {
      success: true,
      data: {
        enabledDays: v.days,
        startTime: input.startTime,
        endTime: input.endTime,
        initialized: true,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error
        ? `Couldn't save your availability. ${err.message}`
        : "Couldn't save your availability. Please try again.",
    }
  }
}
