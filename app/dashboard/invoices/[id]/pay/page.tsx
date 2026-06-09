import { notFound, redirect } from 'next/navigation'
import { getInvoiceById } from '@/lib/business-data'
import { isErpUnavailableError } from '@/lib/erpnext/is-unavailable-error'
import { RecordPaymentForm } from './RecordPaymentForm'

type Props = { params: { id: string } }

export default async function PayPage({ params }: Props) {
  const result = await getInvoiceById(params.id)
  if (!result.success) {
    if (isErpUnavailableError(result.error)) redirect('/dashboard/invoices')
    notFound()
  }

  const invoice = result.data
  if (invoice.status !== 'sent' && invoice.status !== 'overdue') notFound()

  return <RecordPaymentForm invoice={invoice} />
}
