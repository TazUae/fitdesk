import { notFound } from 'next/navigation'
import { getInvoiceById } from '@/lib/business-data'
import { RecordPaymentForm } from './RecordPaymentForm'

type Props = { params: { id: string } }

export default async function PayPage({ params }: Props) {
  const result = await getInvoiceById(params.id)
  if (!result.success) notFound()

  const invoice = result.data
  // A draft (Preparing) invoice is allowed — collectPayment finalizes it
  // first. Only paid and cancelled invoices cannot take a payment.
  if (invoice.status === 'paid' || invoice.status === 'cancelled') notFound()

  return <RecordPaymentForm invoice={invoice} />
}
