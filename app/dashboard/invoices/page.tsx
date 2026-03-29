import { fetchClients }  from '@/actions/clients'
import { fetchInvoices } from '@/actions/invoices'
import { InvoicesView }  from '@/components/modules/InvoicesView'

export default async function InvoicesPage() {
  const [invoicesResult, clientsResult] = await Promise.all([
    fetchInvoices(),
    fetchClients(),
  ])

  const activeClients = clientsResult.success
    ? clientsResult.data.filter(c => c.status === 'active')
    : []

  return (
    <InvoicesView
      invoices={invoicesResult.success ? invoicesResult.data : []}
      clients={activeClients}
      error={invoicesResult.success ? undefined : invoicesResult.error}
    />
  )
}
