import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getInvoiceById } from '@/lib/business-data'
import { getAvailablePaymentMethods } from '@/actions/invoices'
import { deriveSelectableMethodOptions } from '@/lib/payments/selector-view'
import { isErpUnavailableError } from '@/lib/errors/is-unavailable-error'
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

  // Tenant-aware availability: show only what this tenant's ERP site can accept.
  // A failed probe (or no configured method) yields a recoverable
  // configuration-unavailable state — never a wrong or assumed method.
  const availability = await getAvailablePaymentMethods(params.id)
  const availableMethods = deriveSelectableMethodOptions(availability)

  if (availableMethods.length === 0) {
    return <PaymentConfigUnavailable invoiceId={invoice.id} clientName={invoice.clientName} />
  }

  return <RecordPaymentForm invoice={invoice} availableMethods={availableMethods} />
}

function PaymentConfigUnavailable({ invoiceId, clientName }: { invoiceId: string; clientName: string }) {
  return (
    <div className="p-4 space-y-5">
      <div>
        <h1 className="text-base font-semibold" style={{ color: 'var(--fd-text)' }}>
          Record payment
        </h1>
        <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
          {invoiceId} · {clientName}
        </p>
      </div>

      <div
        className="rounded-2xl border p-4 space-y-2"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
          No payment methods available yet
        </p>
        <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
          We couldn&apos;t load a payment method your workspace can accept right now. Check your payment
          settings, or try again in a moment.
        </p>
        <div className="flex gap-3 pt-1">
          <Link
            href="/dashboard/settings"
            className="text-sm font-semibold"
            style={{ color: 'var(--fd-accent)' }}
          >
            Payment settings
          </Link>
          <Link
            href="/dashboard/invoices"
            className="text-sm font-semibold"
            style={{ color: 'var(--fd-muted)' }}
          >
            Back to invoices
          </Link>
        </div>
      </div>
    </div>
  )
}
