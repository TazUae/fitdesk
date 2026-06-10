import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, MessageCircle } from 'lucide-react'
import { getInvoiceById } from '@/lib/business-data'
import { invoiceStatusLabel, isOutstandingInvoiceStatus } from '@/lib/invoices/status'
import { FinalizeInvoiceButton } from './FinalizeInvoiceButton'
import { Badge } from '@/components/modules/Badge'
import { Avatar } from '@/components/modules/Avatar'
import type { BadgeVariant } from '@/components/modules/Badge'
import type { InvoiceStatus } from '@/types'

function statusVariant(s: InvoiceStatus): BadgeVariant {
  const map: Record<InvoiceStatus, BadgeVariant> = {
    draft:          'draft',
    sent:           'pending',
    partially_paid: 'pending',
    paid:           'paid',
    overdue:        'overdue',
    cancelled:      'cancelled',
  }
  return map[s]
}

function fmtMoney(n: number, currency = 'USD'): string {
  return `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

type Props = { params: { id: string } }

export default async function InvoiceDetailPage({ params }: Props) {
  const result = await getInvoiceById(params.id)
  if (!result.success) notFound()

  const invoice = result.data
  const canCollectPayment =
    invoice.status === 'draft' || isOutstandingInvoiceStatus(invoice.status)

  return (
    <div className="space-y-5 p-4">

      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/invoices" style={{ color: 'var(--fd-muted)' }}>
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <span className="flex-1" />
        <Badge variant={statusVariant(invoice.status)} label={invoiceStatusLabel(invoice.status)} />
      </div>

      {/* ── Invoice header card ─────────────────────────────────────────── */}
      <div
        className="space-y-4 rounded-2xl border p-5"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        {/* Client + amount */}
        <div className="flex items-start gap-4">
          <Avatar name={invoice.clientName} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold" style={{ color: 'var(--fd-text)' }}>
              {invoice.clientName}
            </h2>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--fd-muted)' }}>
              {invoice.id}
            </p>
          </div>
          <p className="shrink-0 text-xl font-bold" style={{ color: 'var(--fd-text)' }}>
            {fmtMoney(invoice.amount, invoice.currency)}
          </p>
        </div>

        {/* Date info */}
        <div className="grid grid-cols-2 gap-3">
          <div
            className="rounded-xl border p-3"
            style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)' }}
          >
            <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>Issued</p>
            <p className="mt-0.5 text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
              {invoice.issuedAt}
            </p>
          </div>
          <div
            className="rounded-xl border p-3"
            style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)' }}
          >
            <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
              {invoice.status === 'paid' ? 'Paid on' : 'Due'}
            </p>
            <p
              className="mt-0.5 text-sm font-semibold"
              style={{ color: invoice.status === 'overdue' ? 'var(--fd-red)' : 'var(--fd-text)' }}
            >
              {invoice.status === 'paid' && invoice.paidAt ? invoice.paidAt : invoice.dueDate}
            </p>
          </div>
        </div>

        {/* Outstanding amount */}
        {invoice.outstandingAmount > 0 && (
          <div
            className="rounded-xl border px-4 py-3"
            style={{
              backgroundColor: 'rgba(232,92,106,0.08)',
              borderColor:     'rgba(232,92,106,0.25)',
            }}
          >
            <p className="text-xs font-medium" style={{ color: 'var(--fd-red)' }}>
              Outstanding
            </p>
            <p className="text-xl font-bold" style={{ color: 'var(--fd-red)' }}>
              {fmtMoney(invoice.outstandingAmount, invoice.currency)}
            </p>
          </div>
        )}

        {/* Record payment CTA */}
        {canCollectPayment && (
          <div className="flex gap-2">
            <Link
              href={`/dashboard/invoices/${invoice.id}/pay`}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold"
              style={{ backgroundColor: 'rgba(232,197,71,0.12)', color: 'var(--fd-accent)' }}
            >
              <CheckCircle2 className="h-4 w-4" />
              Record Payment
            </Link>

            <Link
              href={`/dashboard/messages/${invoice.clientId}`}
              className="flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold"
              style={{ backgroundColor: 'rgba(78,203,160,0.10)', color: 'var(--fd-green)' }}
            >
              <MessageCircle className="h-4 w-4" />
              Send
            </Link>
          </div>
        )}

        {/* Mark as sent — draft invoices only */}
        {invoice.status === 'draft' && (
          <FinalizeInvoiceButton invoiceId={invoice.id} />
        )}
      </div>

      {/* ── Client link ─────────────────────────────────────────────────── */}
      <Link
        href={`/dashboard/clients/${invoice.clientId}`}
        className="flex items-center justify-between rounded-2xl border px-4 py-3"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        <div className="flex items-center gap-3">
          <Avatar name={invoice.clientName} size="sm" />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
              {invoice.clientName}
            </p>
            <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>View client profile</p>
          </div>
        </div>
        <ArrowLeft className="h-4 w-4 rotate-180" style={{ color: 'var(--fd-muted)' }} />
      </Link>

    </div>
  )
}
