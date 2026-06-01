'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  CheckCircle2,
  MessageCircle,
  ReceiptText,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { invoiceStatusLabel, isOutstandingInvoiceStatus } from '@/lib/invoices/status'
import { enabledPaymentMethods, type PaymentMethod } from '@/lib/payments/methods'
import { recordPayment } from '@/actions/invoices'
import { Avatar } from '@/components/modules/Avatar'
import { Badge } from '@/components/modules/Badge'
import { ErrorState } from '@/components/modules/ErrorState'
import type { BadgeVariant } from '@/components/modules/Badge'
import type { Client, Invoice, InvoiceStatus } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterTab = 'outstanding' | 'preparing' | 'paid' | 'all'

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
  if (tab === 'preparing') return invoices.filter(i => i.status === 'draft')
  if (tab === 'paid')      return invoices.filter(i => i.status === 'paid')
  return invoices
}

function tabCount(invoices: Invoice[], tab: FilterTab): number {
  if (tab === 'outstanding') return invoices.filter(i => isOutstandingInvoiceStatus(i.status)).length
  if (tab === 'preparing')   return invoices.filter(i => i.status === 'draft').length
  if (tab === 'paid')        return invoices.filter(i => i.status === 'paid').length
  return invoices.length
}

function fmtMoney(n: number, currency = 'USD'): string {
  return `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
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
  const isActionable = isOutstandingInvoiceStatus(invoice.status)

  return (
    <div
      className="space-y-3 rounded-2xl border p-4"
      style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
    >
      {/* Row 1: avatar + client info + amount + badge */}
      <div className="flex items-start gap-3">
        <Avatar name={invoice.clientName} size="md" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
            {invoice.clientName}
          </p>
          <Link
            href={`/dashboard/invoices/${invoice.id}`}
            className="mt-0.5 text-xs"
            style={{ color: 'var(--fd-accent)' }}
          >
            {invoice.id}
          </Link>
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
          <Badge variant={statusVariant(invoice.status)} label={invoiceStatusLabel(invoice.status)} />
        </div>
      </div>

      {/* Row 2: actions (only for actionable invoices) */}
      {isActionable && (
        <div className="flex gap-2">
          <button
            onClick={() => onMarkPaid(invoice)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold"
            style={{ backgroundColor: 'rgba(232,197,71,0.12)', color: 'var(--fd-accent)' }}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Record payment
          </button>

          {invoice.clientId && (
            <Link
              href={`/dashboard/messages/${encodeURIComponent(invoice.clientId)}`}
              className="flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold"
              style={{ backgroundColor: 'rgba(78,203,160,0.10)', color: 'var(--fd-green)' }}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Send
            </Link>
          )}
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

  const [isPending, startTransition] = useTransition()
  const [error, setError]            = useState<string | null>(null)
  const [method, setMethod]          = useState<PaymentMethod>('cash')

  const today = new Date().toISOString().slice(0, 10)

  // Reset state when a different invoice is opened
  function handleClose() {
    setError(null)
    setMethod('cash')
    onClose()
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!invoice) return
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
        reference: (fd.get('reference') as string) || undefined,
        note:      (fd.get('note') as string) || undefined,
      })

      if (result.success) {
        const { fullyPaid, remainingAmount, invoice: paid } = result.data
        toast.success(
          fullyPaid
            ? 'Payment recorded. Invoice is now paid.'
            : `Payment recorded. ${paid.currency} ${remainingAmount.toLocaleString()} remaining.`,
        )
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
                {/* Payment method */}
                <div className="space-y-2">
                  <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                    Payment method
                  </label>
                  <div className="flex gap-2">
                    {enabledPaymentMethods().map(m => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setMethod(m.value)}
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
                </div>

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
                  disabled={isPending}
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
  { id: 'outstanding', label: 'To collect' },
  { id: 'preparing',   label: 'Preparing'  },
  { id: 'paid',        label: 'Paid'       },
  { id: 'all',         label: 'All'        },
]

// ─── Main component ───────────────────────────────────────────────────────────

interface InvoicesViewProps {
  invoices: Invoice[]
  clients:  Client[]
  error?:   string
}

export function InvoicesView({ invoices, clients: _clients, error }: InvoicesViewProps) {
  const router = useRouter()
  const [activeTab, setActiveTab]         = useState<FilterTab>('outstanding')
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null)

  const displayed  = filterInvoices(invoices, activeTab)
  const hasDrafts  = invoices.some(i => i.status === 'draft')

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

      {/* Fetch error */}
      {error && <ErrorState title="Could not load invoices" message={error} inline />}

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
          {activeTab === 'outstanding' ? (
            <>
              <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
                Nothing to collect right now.
              </p>
              <p className="mt-1.5 text-xs" style={{ color: 'var(--fd-muted)' }}>
                {hasDrafts
                  ? 'You have invoices still preparing. Open Preparing to review them.'
                  : 'Invoices will appear automatically after package sales or completed pay-per-session sessions.'}
              </p>
            </>
          ) : activeTab === 'preparing' ? (
            <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
              No invoices preparing.
            </p>
          ) : activeTab === 'paid' ? (
            <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
              No paid invoices yet.
            </p>
          ) : (
            <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
              No invoices yet.
            </p>
          )}
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

      {/* Sheets */}
      <MarkPaidSheet
        invoice={payingInvoice}
        onClose={() => setPayingInvoice(null)}
        onPaid={handlePaid}
      />
    </div>
  )
}
