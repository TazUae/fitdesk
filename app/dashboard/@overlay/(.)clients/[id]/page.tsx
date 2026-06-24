import { getClientById } from '@/lib/business-data'
import { getClientHubOverview } from '@/lib/clients/hub'
import { ClientWorkspaceOverlay } from '@/features/clients/components/ClientWorkspaceOverlay'

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

  const [clientResult, hub] = await Promise.all([
    getClientById(clientId),
    getClientHubOverview(clientId),
  ])

  if (!clientResult.success) return null

  return (
    <ClientWorkspaceOverlay
      client={clientResult.data}
      hub={hub}
    />
  )
}
