import { listFDSessionsAction, getSchedulerConfig } from '@/actions/schedulingActions'
import { fetchClients } from '@/actions/clients'
import { ScheduleView } from '@/components/modules/ScheduleView'

/**
 * Schedule page — Server Component.
 *
 * Data flow (C3 — read + booking):
 *   1. List FD Sessions for the authenticated trainer (7 days ago → 90 days from now).
 *   2. Fetch trainer config (timezone, working hours) for the calendar display.
 *   3. Fetch active clients for the BookingSheet client picker.
 *   4. Hand everything to <ScheduleView> — BookingSheet is wired for create.
 */
export default async function SchedulePage() {
  const [sessionsResult, configResult, clientsResult] = await Promise.all([
    listFDSessionsAction(),
    getSchedulerConfig(),
    fetchClients(),
  ])

  return (
    <ScheduleView
      sessions={sessionsResult.success ? sessionsResult.data : []}
      clients={clientsResult.success ? clientsResult.data : []}
      trainerConfig={configResult.success ? configResult.data : undefined}
      error={sessionsResult.success ? undefined : sessionsResult.message}
    />
  )
}
