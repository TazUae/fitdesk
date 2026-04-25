import { getClients } from '@/lib/business-data'
import { ScheduleView } from '@/components/modules/ScheduleView'
import { getSchedulerConfig, listFDSessionsAction } from '@/actions/schedulingActions'

/**
 * Schedule page — Server Component.
 *
 * Data flow:
 *   1. Resolve trainer from auth session and derive TrainerConfig.
 *   2. Fetch ALL FD Sessions in the 7-days-ago → 90-days-from-now window.
 *   3. Fetch active clients for the booking selector.
 *   4. Hand everything to <ScheduleView>.
 *
 * Query: `?client=` or `?clientId=` — pre-select client in the booking picker.
 */
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { client?: string; clientId?: string }
}) {
  const [configResult, fdResult, clientsResult] = await Promise.all([
    getSchedulerConfig(),
    listFDSessionsAction(),
    getClients(),
  ])

  const clients         = clientsResult.success ? clientsResult.data : []
  const initialClientId = searchParams.client ?? searchParams.clientId
  const uiEngine: 'custom' | 'schedulex' =
    process.env.SCHEDULER_UI === 'custom' ? 'custom' : 'schedulex'

  if (!configResult.success) {
    return (
      <div className="p-4 text-sm" style={{ color: 'var(--fd-red)' }}>
        Could not load scheduler: {configResult.message}
      </div>
    )
  }

  return (
    <ScheduleView
      sessions={fdResult.success ? fdResult.data : []}
      clients={clients}
      trainerConfig={configResult.data}
      error={fdResult.success ? undefined : fdResult.message}
      initialClientId={initialClientId}
      uiEngine={uiEngine}
    />
  )
}
