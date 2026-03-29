import { fetchClients }  from '@/actions/clients'
import { fetchSessions } from '@/actions/sessions'
import { ScheduleView }  from '@/components/modules/ScheduleView'

/**
 * Schedule page — Server Component.
 *
 * Data flow:
 *   1. Both actions resolve the trainer ID from the auth session internally.
 *   2. Fetch ALL sessions (unfiltered by status); ScheduleView does client-side
 *      tab filtering so switching tabs needs no extra network request.
 *   3. Fetch active clients for the booking selector.
 *   4. Hand everything to <ScheduleView>.
 */
export default async function SchedulePage() {
  const [sessionsResult, clientsResult] = await Promise.all([
    fetchSessions(),
    fetchClients(),
  ])

  const activeClients = clientsResult.success
    ? clientsResult.data.filter(c => c.status === 'active')
    : []

  return (
    <ScheduleView
      sessions={sessionsResult.success ? sessionsResult.data : []}
      clients={activeClients}
      error={sessionsResult.success ? undefined : sessionsResult.error}
    />
  )
}
