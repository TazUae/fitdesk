import { getDirectoryClients } from '@/lib/clients/directory'
import { getInvoices } from '@/lib/business-data'
import { deriveClientRoster } from '@/lib/clients/list-derive'
import { ClientsView } from '@/components/modules/ClientsView'

/**
 * Clients list — Server Component.
 *
 * Data flow:
 *   1. getDirectoryClients() — resolves the tenant, flag-gated local-read or
 *      live ERP fallback (fetchClients). Returns Client[].
 *   2. getInvoices({}) — all invoices for this workspace; used to derive
 *      per-client outstanding signals. Fetched in parallel; failure suppresses
 *      money signals but never breaks the roster.
 *   3. deriveClientRoster() converts both into sorted ClientRosterCard VMs.
 *
 * Feature flag — server-side only, never reaches the client bundle:
 *   FITDESK_ADD_CLIENT_SHEET_ENABLED = '1'  → opens Add Client sheet instead of /new
 */
const ADD_CLIENT_SHEET_FLAG = 'FITDESK_ADD_CLIENT_SHEET_ENABLED'

export default async function ClientsPage() {
  const enableAddClientSheet = process.env[ADD_CLIENT_SHEET_FLAG] === '1'
  const [clientsSettled, invoicesSettled] = await Promise.allSettled([
    getDirectoryClients(),
    getInvoices({}),
  ])

  const clientsResult =
    clientsSettled.status === 'fulfilled'
      ? clientsSettled.value
      : { success: false as const, error: 'Failed to load clients' }

  const invoicesResult =
    invoicesSettled.status === 'fulfilled' ? invoicesSettled.value : null

  const clients           = clientsResult.success ? clientsResult.data : []
  const invoices          = invoicesResult?.success ? invoicesResult.data : []
  const invoicesAvailable = invoicesResult?.success ?? false

  const rosterCards = deriveClientRoster(clients, invoices, { invoicesAvailable })

  return (
    <ClientsView
      rosterCards={rosterCards}
      error={clientsResult.success ? undefined : clientsResult.error}
      invoicesAvailable={invoicesAvailable}
      enableAddClientSheet={enableAddClientSheet}
    />
  )
}
