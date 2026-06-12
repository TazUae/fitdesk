import { getDirectoryClients } from '@/lib/clients/directory'
import { ClientsView }  from '@/components/modules/ClientsView'

/**
 * Clients list — Server Component.
 *
 * Data flow:
 *   1. getDirectoryClients() resolves the tenant and, behind a server-side
 *      feature flag, reads the local client_index read model — otherwise it
 *      falls back to the live ERP read (fetchClients) used previously.
 *   2. Returns clients scoped to the authenticated tenant/trainer.
 *   3. Hands the result to <ClientsView> which owns search state and the
 *      add-client bottom sheet.
 */
export default async function ClientsPage() {
  const result = await getDirectoryClients()

  return (
    <ClientsView
      clients={result.success ? result.data : []}
      error={result.success ? undefined : result.error}
    />
  )
}
