'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  MessageCircle,
  ReceiptText,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { getAvailablePaymentMethods, getPaymentLink, recordPayment } from '@/actions/invoices'
import { PAYMENT_PROVIDERS } from '@/lib/whish'
import { type PaymentMethod } from '@/lib/payments/methods'
import {
  deriveSelectableMethodOptions,
  hasNoAvailableMethods,
  isSubmitBlockedByAvailability,
  methodsToRender,
  type SelectorAvailState,
} from '@/lib/payments/selector-view'
import { isOutstandingInvoiceStatus } from '@/lib/invoices/status'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'
import { isErpUnavailableError } from '@/lib/errors/is-unavailable-error'
import { fmtMoney } from '@/lib/format/money'
import type { Client, Invoice, InvoiceStatus } from '@/types'
import type { PaymentProvider } from '@/lib/whish'

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterTab = 'outstanding' | 'paid' | 'all'

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function filterInvoices(invoices: Invoice[], tab: FilterTab): Invoice[] {
  if (tab === 'outstanding') {
    const list = invoices.filter(i => isOutstandingInvoiceStatus(i.status))
    // Overdue first
    return [...list].sort((a, b) => (a.status === 'overdue' ? -1 : b.status === 'overdue' ? 1 : 0))
  }
  if (tab === 'paid') return invoices.filter(i => i.status === 'paid')
  return invoices
}

function tabCount(invoices: Invoice[], tab: FilterTab): number {
  if (tab === 'outstanding') return invoices.filter(i => isOutstandingInvoiceStatus(i.status)).length
  if (tab === 'paid')        return invoices.filter(i => i.status === 'paid').length
  return invoices.length
}

// ─── Summary cards ────────────────────────────────────────────────────────────

function SummaryCards({ invoices }: { invoices: Invoice[] }) {
  const outstanding = invoices
    .filter(i => isOutstandingInvoiceStatus(i.status))
    .reduce((s, i) => s + i.outstandingAmount, 0)

  const collected = invoices
    .filter(i => i.status === 'paid')
    .reduce((s, i) => s + i.amount, 0)

  if (outstanding === 0 && collected === 0) return null

  return (
    <div className="grid grid-cols-2 gap-3">
      {outstanding > 0 && (
        <div
          className="rounded-2xl border p-4"
          style={{
            backgroundColor: 'rgba(232,92,106,0.08)',
            borderColor:     'rgba(232,92,106,0.25)',
          }}
        >
          <p className="text-xs font-medium" style={{ color: 'var(--fd-red)' }}>
            Outstanding
          </p>
          <p className="mt-1 text-xl font-bold" style={{ color: 'var(--fd-red)' }}>
            ${outstanding.toLocaleString()}
          </p>
        </div>
      )}
      {collected > 0 && (
        <div
          className="rounded-2xl border p-4"
          style={{
            backgroundColor: 'rgba(78,203,160,0.08)',
            borderColor:     'rgba(78,203,160,0.25)',
          }}
        >
          <p className="text-xs font-medium" style={{ color: 'var(--fd-green)' }}>
            Collected
          </p>
          <p className="mt-1 text-xl font-bold" style={{ color: 'var(--fd-green)' }}>
            ${collected.toLocaleString()}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Invoice card ─────────────────────────────────────────────────────────────

interface InvoiceCardProps {
  invoice:   Invoice
  onMarkPaid: (invoice: Invoice) => void
}

function InvoiceCard({ invoice, onMarkPaid }: InvoiceCardProps) {
  const isActionable = invoice.status === 'sent' || invoice.status === 'overdue'

  return (
    <div className="space-y-3">
      <Link
        href={`/dashboard/invoices/${invoice.id}`}
        className="block rounded-2xl border p-4"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        {/* Row 1: avatar + client info + amount + badge */}
        <div className="flex items-start gap-3">
          <Avatar name={invoice.clientName} size="md" />

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
              {invoice.clientName}
            </p>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--fd-muted)' }}>
              {invoice.id}
            </p>
            {/* Due / paid date */}
            {invoice.status === 'paid' && invoice.paidAt ? (
              <p className="mt-0.5 text-xs" style={{ color: 'var(--fd-green)' }}>
                Paid {invoice.paidAt}
              </p>
            ) : (
              <p
                className="mt-0.5 text-xs"
                style={{ color: invoice.status === 'overdue' ? 'var(--fd-red)' : 'var(--fd-muted)' }}
              >
                Due {invoice.dueDate}
              </p>
            )}
            {/* Sessions count — placeholder: requires linking invoices to sessions in ERP */}
            {/* TODO: show sessions count when invoice-session linking is implemented */}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <p className="text-sm font-bold" style={{ color: 'var(--fd-text)' }}>
              {fmtMoney(invoice.amount, invoice.currency)}
            </p>
            {invoice.outstandingAmount > 0 && invoice.outstandingAmount < invoice.amount && (
              <p className="text-[11px]" style={{ color: 'var(--fd-muted)' }}>
                owed {fmtMoney(invoice.outstandingAmount, invoice.currency)}
              </p>
            )}
            <Badge variant={statusVariant(invoice.status)} />
          </div>
        </div>
      </Link>

      {/* Row 2: actions (only for actionable invoices) — outside the Link to avoid nested elements */}
      {isActionable && (
        <div className="flex gap-2">
          <button
            onClick={() => onMarkPaid(invoice)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold"
            style={{ backgroundColor: 'rgba(232,197,71,0.12)', color: 'var(--fd-accent)' }}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Mark Paid
          </button>

          <Link
            href={`/dashboard/messages/${invoice.clientId}`}
            className="flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold"
            style={{ backgroundColor: 'rgba(78,203,160,0.10)', color: 'var(--fd-green)' }}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Send
          </Link>
        </div>
      )}
    </div>
  )
}

// ─── Mark paid sheet ──────────────────────────────────────────────────────────

interface MarkPaidSheetProps {
  invoice: Invoice | null
  onClose: () => void
  onPaid:  () => void
}

function MarkPaidSheet({ invoice, onClose, onPaid }: MarkPaidSheetProps) {
  const isOpen = invoice !== null

  const [isPending, startTransition]        = useTransition()
  const [isLinkPending, startLinkTransition] = useTransition()
  const [error, setError]                   = useState<string | null>(null)
  // `method` is the internal PaymentMethod passed to recordPayment (server validates it).
  // `provider` is the PaymentProvider kept separately for getPaymentLink and the
  // supportsLink check — never sent to recordPayment.
  const [method, setMethod]               = useState<PaymentMethod>('cash')
  const [provider, setProvider]           = useState<PaymentProvider>('cash')
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)

  // Tenant-aware, ERP-validated methods to offer (plan §4.3/§4.5). Resolved
  // when the sheet opens for a given invoice. 'loading' → probing; the empty
  // 'ready' list renders a recoverable configuration-unavailable state.
  const [avail, setAvail] = useState<SelectorAvailState>({ phase: 'loading' })

  useEffect(() => {
    if (!invoice) return
    let cancelled = false
    setAvail({ phase: 'loading' })
    getAvailablePaymentMethods(invoice.id).then((res) => {
      if (cancelled) return
      const methods = deriveSelectableMethodOptions(res)
      setAvail({ phase: 'ready', methods })
      // Select the first available method so `method`/`provider` never point at
      // an option the tenant can't actually use.
      const first = methods[0]
      if (first) {
        setMethod(first.value)
        setProvider(first.value === 'whish_money' ? 'whish' : 'cash')
      }
    })
    return () => { cancelled = true }
  }, [invoice])

  const today = new Date().toISOString().slice(0, 10)

  const availableMethods = methodsToRender(avail)
  const noMethods        = hasNoAvailableMethods(avail)
  const selectedProviderMeta = PAYMENT_PROVIDERS.find(p => p.provider === provider)

  // Reset state when a different invoice is opened
  function handleClose() {
    setError(null)
    setGeneratedLink(null)
    setMethod('cash')
    setProvider('cash')
    onClose()
  }

  function handleMethodChange(m: PaymentMethod) {
    setMethod(m)
    // Derive the PaymentProvider counterpart so getPaymentLink still works.
    setProvider(m === 'whish_money' ? 'whish' : 'cash')
    setGeneratedLink(null)
  }

  function handleGenerateLink() {
    if (!invoice) return
    setError(null)

    startLinkTransition(async () => {
      const result = await getPaymentLink({
        invoiceId:  invoice.id,
        amount:     invoice.outstandingAmount,
        clientName: invoice.clientName,
        provider,
        currency:   invoice.currency,
      })

      if (result.success) {
        setGeneratedLink(result.data.url ?? null)
        toast.success('Payment link generated')
      } else {
        setError(result.error)
      }
    })
  }

  function handleCopyLink() {
    if (!generatedLink) return
    navigator.clipboard.writeText(generatedLink).then(
      () => toast.success('Link copied'),
      () => toast.error('Could not copy — please copy manually'),
    )
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!invoice) return
    // Never submit without a validated, tenant-available method selected.
    if (isSubmitBlockedByAvailability(avail)) {
      setError('No payment method is available right now. Please try again.')
      return
    }
    setError(null)
    const fd = new FormData(e.currentTarget)

    const amount = Number(fd.get('amount'))
    if (!amount || amount <= 0) { setError('Enter a valid amount'); return }

    startTransition(async () => {
      const result = await recordPayment({
        invoiceId: invoice.id,
        clientId:  invoice.clientId,
        amount,
        method,
        date:      fd.get('payment_date') as string,
        reference: (fd.get('reference') as string) || generatedLink?.split('/').pop() || undefined,
        note:      (fd.get('note') as string) || undefined,
      })

      if (result.success) {
        toast.success('Payment recorded')
        handleClose()
        onPaid()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className={cn(
          'fixed inset-0 z-40 bg-black/60 transition-opacity duration-300',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={handleClose}
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Record payment"
        className={cn(
          'fixed bottom-0 left-1/2 z-50 w-full max-w-[480px] -translate-x-1/2',
          'rounded-t-3xl border-t transition-transform duration-300',
          isOpen ? 'translate-y-0' : 'translate-y-full',
        )}
        style={{
          backgroundColor: 'var(--fd-surface)',
          borderColor:     'var(--fd-border)',
          paddingBottom:   'calc(env(safe-area-inset-bottom) + 1.5rem)',
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pb-2 pt-3">
          <div className="h-1 w-10 rounded-full" style={{ backgroundColor: 'var(--fd-border)' }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3">
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--fd-text)' }}>
              Record Payment
            </h2>
            {invoice && (
              <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
                {invoice.id} · {invoice.clientName}
              </p>
            )}
          </div>
          <button type="button" onClick={handleClose} style={{ color: 'var(--fd-muted)' }}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="max-h-[76vh] overflow-y-auto px-5">
          {invoice && (
            <>
              {/* Invoice summary */}
              <div
                className="mb-4 grid grid-cols-2 gap-3 rounded-2xl border p-4"
                style={{ backgroundColor: 'var(--fd-card)', borderColor: 'var(--fd-border)' }}
              >
                <div>
                  <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>Total</p>
                  <p className="font-semibold text-sm" style={{ color: 'var(--fd-text)' }}>
                    {fmtMoney(invoice.amount, invoice.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>Outstanding</p>
                  <p className="font-bold text-sm" style={{ color: 'var(--fd-red)' }}>
                    {fmtMoney(invoice.outstandingAmount, invoice.currency)}
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 pb-2">
                {/* Payment method — tenant-aware, ERP-validated (plan §4.5) */}
                <div className="space-y-2">
                  <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                    Payment method
                  </label>
                  {avail.phase === 'loading' ? (
                    <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
                      Checking available methods…
                    </p>
                  ) : noMethods ? (
                    <div
                      className="rounded-xl border px-4 py-3 space-y-1"
                      style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)' }}
                    >
                      <p className="text-xs font-semibold" style={{ color: 'var(--fd-text)' }}>
                        No payment methods available
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--fd-muted)' }}>
                        We couldn&apos;t load a method your workspace can accept right now. Check{' '}
                        <Link href="/dashboard/settings" style={{ color: 'var(--fd-accent)' }}>
                          payment settings
                        </Link>{' '}
                        or try again in a moment.
                      </p>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      {availableMethods.map(m => (
                        <button
                          key={m.value}
                          type="button"
                          onClick={() => handleMethodChange(m.value)}
                          className="flex-1 rounded-xl py-2 text-xs font-semibold transition-colors"
                          style={{
                            backgroundColor:
                              method === m.value ? 'var(--fd-accent)' : 'var(--fd-card)',
                            color:
                              method === m.value ? 'var(--fd-bg)' : 'var(--fd-muted)',
                          }}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Whish: generate link before recording */}
                {selectedProviderMeta?.supportsLink && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={handleGenerateLink}
                      disabled={isLinkPending}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-semibold transition-opacity disabled:opacity-50"
                      style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-accent)' }}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {isLinkPending ? 'Generating…' : 'Generate Whish Link'}
                    </button>

                    {generatedLink && (
                      <div
                        className="flex items-start gap-2 rounded-xl border p-3"
                        style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)' }}
                      >
                        <p
                          className="min-w-0 flex-1 break-all text-xs"
                          style={{ color: 'var(--fd-muted)' }}
                        >
                          {generatedLink}
                        </p>
                        <button
                          type="button"
                          onClick={handleCopyLink}
                          className="shrink-0"
                          style={{ color: 'var(--fd-accent)' }}
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                    )}

                    <p className="text-[11px]" style={{ color: 'var(--fd-muted)' }}>
                      Share this link with the client. Record payment only after you confirm receipt.
                    </p>
                  </div>
                )}

                {/* Amount */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                    Amount received *
                  </label>
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    defaultValue={invoice.outstandingAmount}
                    required
                    className="input-base"
                  />
                </div>

                {/* Date */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                    Payment date *
                  </label>
                  <input
                    name="payment_date"
                    type="date"
                    defaultValue={today}
                    required
                    className="input-base"
                  />
                </div>

                {/* Reference */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                    Reference / transaction ID
                  </label>
                  <input
                    name="reference"
                    className="input-base"
                    placeholder="Whish ref, bank ref, receipt no., etc."
                    defaultValue={generatedLink ? generatedLink.split('/').pop() : ''}
                  />
                </div>

                {/* Note */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                    Note
                  </label>
                  <textarea
                    name="note"
                    rows={2}
                    className="input-base resize-none"
                    placeholder="Optional note"
                  />
                </div>

                {error && (
                  <p className="text-sm" style={{ color: 'var(--fd-red)' }}>
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isPending || isSubmitBlockedByAvailability(avail)}
                  className="w-full rounded-xl py-3 text-sm font-bold transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
                >
                  {isPending ? 'Recording…' : 'Record Payment'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────

const TABS: { id: FilterTab; label: string }[] = [
  { id: 'outstanding', label: 'Outstanding' },
  { id: 'paid',        label: 'Paid'        },
  { id: 'all',         label: 'All'         },
]

// ─── Main component ───────────────────────────────────────────────────────────

interface InvoicesViewProps {
  invoices: Invoice[]
  clients:  Client[]
  error?:   string
}

export function InvoicesView({ invoices, error }: InvoicesViewProps) {
  const router = useRouter()
  const [activeTab, setActiveTab]           = useState<FilterTab>('outstanding')
  const [payingInvoice, setPayingInvoice]   = useState<Invoice | null>(null)

  const displayed = filterInvoices(invoices, activeTab)

  function handlePaid() {
    setPayingInvoice(null)
    router.refresh()
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-base font-semibold" style={{ color: 'var(--fd-muted)' }}>
          {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* ERP unavailable — calm connecting message replaces list entirely */}
      {error && isErpUnavailableError(error) ? (
        <div className="py-8 text-center">
          <p className="text-sm font-medium" style={{ color: 'var(--fd-muted)' }}>
            Invoice list is still connecting
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--fd-muted)' }}>
            Invoices will appear here once your workspace data connection is ready.
          </p>
        </div>
      ) : (
        <>
          {/* Real (non-ERP-unavailable) fetch error */}
          {error && (
            <p
              className="rounded-xl border p-3 text-sm"
              style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-red)' }}
            >
              {error}
            </p>
          )}

          {/* Summary */}
          <SummaryCards invoices={invoices} />

          {/* Filter tabs */}
          <div className="flex gap-2">
            {TABS.map(tab => {
              const count    = tabCount(invoices, tab.id)
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors"
                  style={{
                    backgroundColor: isActive ? 'var(--fd-accent)' : 'var(--fd-card)',
                    color:           isActive ? 'var(--fd-bg)'     : 'var(--fd-muted)',
                  }}
                >
                  {tab.label}
                  {count > 0 && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none"
                      style={{
                        backgroundColor: isActive ? 'rgba(0,0,0,0.20)' : 'rgba(255,255,255,0.07)',
                        color:           isActive ? 'var(--fd-bg)'     : 'var(--fd-muted)',
                      }}
                    >
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Invoice list */}
          {displayed.length === 0 ? (
            <div className="py-10 text-center">
              <ReceiptText
                className="mx-auto mb-3 h-8 w-8"
                style={{ color: 'var(--fd-muted)' }}
              />
              <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
                {activeTab === 'outstanding' ? 'No outstanding invoices.' :
                 activeTab === 'paid'        ? 'No paid invoices yet.'    :
                 'No invoices yet.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayed.map(invoice => (
                <InvoiceCard
                  key={invoice.id}
                  invoice={invoice}
                  onMarkPaid={setPayingInvoice}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Sheets */}
      <MarkPaidSheet
        invoice={payingInvoice}
        onClose={() => setPayingInvoice(null)}
        onPaid={handlePaid}
      />
    </div>
  )
}
