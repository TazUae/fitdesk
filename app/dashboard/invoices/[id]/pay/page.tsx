import { notFound } from 'next/navigation'
import { getInvoiceById } from '@/lib/business-data'
import { isOutstandingInvoiceStatus } from '@/lib/invoices/status'
import { RecordPaymentForm } from './RecordPaymentForm'

type Props = { params: { id: string } }

export default async function PayPage({ params }: Props) {
  const result = await getInvoiceById(params.id)
  if (!result.success) notFound()

  const invoice = result.data
  if (!isOutstandingInvoiceStatus(invoice.status)) notFound()

  return <RecordPaymentForm invoice={invoice} />
}
