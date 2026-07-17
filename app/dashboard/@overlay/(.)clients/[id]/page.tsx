import { getClientById } from '@/lib/business-data'
import { getClientHubOverview } from '@/lib/clients/hub'
import { ClientWorkspaceOverlay } from '@/features/clients/components/ClientWorkspaceOverlay'
import { resolveTrainerId } from '@/lib/auth/resolve-trainer'
import { getTrainerConfig } from '@/lib/scheduling/trainerConfig'
import { getClientSessions } from '@/lib/clients/clientSessions'
import { getNextUp } from '@/lib/dashboard/derive'
import { todayInTimezone, localTimeString } from '@/lib/dashboard/fdSessionAdapter'
import type { Session } from '@/types'

type Props = { params: { id: string } }

/**
 * Intercepting overlay route: (.)clients/[id]
 *
 * Matches soft-nav to /dashboard/clients/:id from within the dashboard,
 * rendering the client as a WorkspaceShell overlay while the underlying
 * route (e.g. /dashboard/clients) stays mounted.
 *
 * Hard-nav and refresh skip this page entirely — Next.js serves the
 * canonical app/dashboard/clients/[id]/page.tsx instead.
 *
 * Returns null on any fetch failure so a broken ERP connection never
 * crashes the parent dashboard layout.
 */
export default async function ClientOverlayPage({ params }: Props) {
  const clientId = decodeURIComponent(params.id)

  // Same pattern as the canonical client detail page (app/dashboard/clients/[id]/page.tsx):
  // resolve trainer/timezone so the "Next session" chip can be derived live
  // from fetched sessions rather than the stale client_index.nextSessionAtUtc
  // projection (never written in production — reconcile is dry-run only).
  const resolved      = await resolveTrainerId()
  const trainerId     = 'trainerId' in resolved ? resolved.trainerId : null
  const trainerConfig = trainerId ? await getTrainerConfig(trainerId) : null
  const timezone      = trainerConfig?.timezone ?? 'UTC'

  const [clientResult, hub, sessions] = await Promise.all([
    getClientById(clientId),
    getClientHubOverview(clientId),
    trainerId ? getClientSessions(trainerId, clientId, timezone) : Promise.resolve<Session[]>([]),
  ])

  if (!clientResult.success) return null

  const today   = todayInTimezone(timezone)
  const nowTime = localTimeString(new Date(), timezone)
  const nextUp  = getNextUp(sessions, today, nowTime)

  return (
    <ClientWorkspaceOverlay
      client={clientResult.data}
      hub={hub}
      nextSessionLabel={nextUp?.label ?? null}
    />
  )
}
