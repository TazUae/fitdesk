import { listFDSessionsAction, getSchedulerConfig } from '@/actions/schedulingActions'
import { ScheduleView } from '@/components/modules/ScheduleView'

/**
 * Schedule page — Server Component.
 *
 * Data flow (C2 — read-only):
 *   1. List FD Sessions for the authenticated trainer (7 days ago → 90 days from now).
 *   2. Fetch trainer config (timezone, working hours) for the calendar display.
 *   3. Hand everything to <ScheduleView> — no booking, no mutations.
 */
export default async function SchedulePage() {
  const [sessionsResult, configResult] = await Promise.all([
    listFDSessionsAction(),
    getSchedulerConfig(),
  ])

  return (
    <ScheduleView
      sessions={sessionsResult.success ? sessionsResult.data : []}
      trainerConfig={configResult.success ? configResult.data : undefined}
      error={sessionsResult.success ? undefined : sessionsResult.message}
    />
  )
}
