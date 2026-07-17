import { ReceiptText } from 'lucide-react'
import { listPendingPaymentNotifications } from '@/actions/pending-notifications'
import { Badge } from '@/components/ui/Badge'

// Server Component: shows invoices whose payment link is awaiting the trainer.
// The send action is intentionally DISABLED until the real Whish integration exists —
// this component never generates a payment link and never sends WhatsApp.

function fmtMoney(amount: string | null, currency: string | null): string {
  if (!amount) return ''
  const n = Number(amount)
  if (Number.isNaN(n)) return `${currency ?? ''} ${amount}`.trim()
  return `${currency ?? 'USD'} ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export async function PendingPaymentNotifications() {
  const result = await listPendingPaymentNotifications()

  // Non-fatal: a load failure must not break the invoices page, but must be visible.
  if (!result.success) {
    return (
      <section className="mb-6">
        <p className="text-sm text-amber-400/80">Couldn’t load pending payment links.</p>
      </section>
    )
  }

  const items = result.data
  if (items.length === 0) return null // nothing pending → don't clutter the page

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center gap-2">
        <ReceiptText className="h-4 w-4 text-white/60" aria-hidden />
        <h2 className="text-sm font-semibold text-white/80">Payment links to send</h2>
        <Badge variant="pending" label={String(items.length)} />
      </div>

      <ul className="space-y-2">
        {items.map((n) => (
          <li
            key={n.invoiceName}
            className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-4"
          >
            <div className="min-w-0">
              <div className="truncate font-semibold text-white">{n.customerName ?? n.customer}</div>
              <div className="mt-0.5 text-xs text-white/50">
                {n.invoiceName}
                {n.sessionDate ? ` · ${n.sessionDate}` : ''}
              </div>
              {fmtMoney(n.grandTotal, n.currency) && (
                <div className="mt-1 text-sm text-white/80">{fmtMoney(n.grandTotal, n.currency)}</div>
              )}
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              <Badge variant="pending" />
              <button
                type="button"
                disabled
                title="Whish payment integration is not configured yet"
                className="cursor-not-allowed rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white/40"
              >
                Send payment link — Whish not configured
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
