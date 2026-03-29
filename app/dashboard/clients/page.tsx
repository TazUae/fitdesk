import { fetchClients } from '@/actions/clients'
import { ClientsView }  from '@/components/modules/ClientsView'

/**
 * Clients list — Server Component.
 *
 * Data flow:
 *   1. fetchClients() reads the auth session and resolves the trainer ID internally.
 *   2. Returns clients scoped to the authenticated trainer.
 *   3. Hands the result to <ClientsView> which owns search state and the
 *      add-client bottom sheet.
 */
export default async function ClientsPage() {
  const result = await fetchClients()

  return (
    <ClientsView
      clients={result.success ? result.data : []}
      error={result.success ? undefined : result.error}
    />
  )
}
