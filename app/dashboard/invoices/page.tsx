import { getClients, getInvoices } from '@/lib/business-data'
import { InvoicesView }  from '@/components/modules/InvoicesView'

export default async function InvoicesPage() {
  const [invoicesResult, clientsResult] = await Promise.all([
    getInvoices(),
    getClients(),
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
