import { notFound } from 'next/navigation'
import { getInvoiceById } from '@/lib/business-data'
import { RecordPaymentForm } from './RecordPaymentForm'

type Props = { params: { id: string } }

export default async function PayPage({ params }: Props) {
  const result = await getInvoiceById(params.id)
  if (!result.success) notFound()

  const invoice = result.data
  if (invoice.status !== 'sent' && invoice.status !== 'overdue') notFound()

  return <RecordPaymentForm invoice={invoice} />
}
