'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  MessageCircle,
  Plus,
  ReceiptText,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { addInvoice, getPaymentLink, recordPayment } from '@/actions/invoices'
import { PAYMENT_PROVIDERS } from '@/lib/whish'
import { Avatar } from '@/components/modules/Avatar'
import { Badge } from '@/components/modules/Badge'
import type { BadgeVariant } from '@/components/modules/Badge'
import type { Client, Invoice, InvoiceStatus } from '@/types'
import type { PaymentProvider } from '@/lib/whish'

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterTab = 'outstanding' | 'paid' | 'all'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusVariant(s: InvoiceStatus): BadgeVariant {
  const map: Record<InvoiceStatus, BadgeVariant> = {
    draft:     'draft',
    sent:      'pending',
    paid:      'paid',
    overdue:   'overdue',
    cancelled: 'cancelled',
  }
  return map[s]
}

function filterInvoices(invoices: Invoice[], tab: FilterTab): Invoice[] {
  if (tab === 'outstanding') {
    const list = invoices.filter(i => i.status === 'overdue' || i.status === 'sent')
    // Overdue first
    return [...list].sort((a, b) => (a.status === 'overdue' ? -1 : b.status === 'overdue' ? 1 : 0))
  }
  if (tab === 'paid') return invoices.filter(i => i.status === 'paid')
  return invoices
}

function tabCount(invoices: Invoice[], tab: FilterTab): number {
  if (tab === 'outstanding') return invoices.filter(i => i.status === 'overdue' || i.status === 'sent').length
  if (tab === 'paid')        return invoices.filter(i => i.status === 'paid').length
  return invoices.length
}

function fmtMoney(n: number, currency = 'USD'): string {
  return `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

// ─── Summary cards ────────────────────────────────────────────────────────────

function SummaryCards({ invoices }: { invoices: Invoice[] }) {
  const outstanding = invoices
    .filter(i => i.status === 'overdue' || i.status === 'sent')
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

      {/* Row 2: actions (only for actionable invoices) */}
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
  const [provider, setProvider]             = useState<PaymentProvider>('cash')
  const [generatedLink, setGeneratedLink]   = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  const selectedProviderMeta = PAYMENT_PROVIDERS.find(p => p.provider === provider)

  // Reset state when a different invoice is opened
  function handleClose() {
    setError(null)
    setGeneratedLink(null)
    setProvider('cash')
    onClose()
  }

  function handleProviderChange(p: PaymentProvider) {
    setProvider(p)
    setGeneratedLink(null) // reset any previously generated link
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
    setError(null)
    const fd = new FormData(e.currentTarget)

    const amount = Number(fd.get('amount'))
    if (!amount || amount <= 0) { setError('Enter a valid amount'); return }

    startTransition(async () => {
      const result = await recordPayment({
        invoiceId:     invoice.id,
        clientId:      invoice.clientId,
        amount,
        modeOfPayment: provider === 'cash'          ? 'Cash'
                     : provider === 'bank_transfer'  ? 'Bank Transfer'
                     : 'Whish',
        date:          fd.get('payment_date') as string,
        reference:     (fd.get('reference') as string) || generatedLink?.split('/').pop() || undefined,
        note:          (fd.get('note') as string) || undefined,
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
                {/* Payment method */}
                <div className="space-y-2">
                  <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                    Payment method
                  </label>
                  <div className="flex gap-2">
                    {PAYMENT_PROVIDERS.map(p => (
                      <button
                        key={p.provider}
                        type="button"
                        onClick={() => handleProviderChange(p.provider)}
                        className="flex-1 rounded-xl py-2 text-xs font-semibold transition-colors"
                        style={{
                          backgroundColor:
                            provider === p.provider ? 'var(--fd-accent)' : 'var(--fd-card)',
                          color:
                            provider === p.provider ? 'var(--fd-bg)' : 'var(--fd-muted)',
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
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

// ─── Create invoice sheet ─────────────────────────────────────────────────────

interface LineItem {
  description: string
  qty:         number
  rate:        number
}

interface CreateInvoiceSheetProps {
  isOpen:    boolean
  clients:   Client[]
  onClose:   () => void
  onCreated: () => void
}

function CreateInvoiceSheet({
  isOpen,
  clients,
  onClose,
  onCreated,
}: CreateInvoiceSheetProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError]            = useState<string | null>(null)
  const [items, setItems]            = useState<LineItem[]>([
    { description: 'PT Sessions', qty: 1, rate: 0 },
  ])

  const today      = new Date().toISOString().slice(0, 10)
  const defaultDue = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
  const total      = items.reduce((s, i) => s + i.qty * i.rate, 0)

  function addItem() {
    setItems(prev => [...prev, { description: '', qty: 1, rate: 0 }])
  }

  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateItem(i: number, field: keyof LineItem, value: string | number) {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item))
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd       = new FormData(e.currentTarget)
    const clientId = fd.get('client_id') as string

    if (!clientId)                                       { setError('Select a client'); return }
    if (items.some(i => !i.description || i.rate <= 0)) { setError('Fill in all item descriptions and rates'); return }

    startTransition(async () => {
      const result = await addInvoice({
        customer:     clientId,
        posting_date: today,
        due_date:     fd.get('due_date') as string,
        items: items.map(i => ({
          item_code:   'PT-SESSION',
          description: i.description,
          qty:         i.qty,
          rate:        i.rate,
        })),
        remarks: (fd.get('remarks') as string) || undefined,
      })

      if (result.success) {
        toast.success('Invoice created')
        ;(e.target as HTMLFormElement).reset()
        setItems([{ description: 'PT Sessions', qty: 1, rate: 0 }])
        onCreated()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <>
      <div
        aria-hidden="true"
        className={cn(
          'fixed inset-0 z-40 bg-black/60 transition-opacity duration-300',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create invoice"
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
        <div className="flex justify-center pb-2 pt-3">
          <div className="h-1 w-10 rounded-full" style={{ backgroundColor: 'var(--fd-border)' }} />
        </div>

        <div className="flex items-center justify-between px-5 pb-4">
          <h2 className="text-base font-semibold" style={{ color: 'var(--fd-text)' }}>
            New Invoice
          </h2>
          <button type="button" onClick={onClose} style={{ color: 'var(--fd-muted)' }}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[76vh] overflow-y-auto px-5">
          <form onSubmit={handleSubmit} className="space-y-4 pb-2">
            {/* Client */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                Client *
              </label>
              <select name="client_id" required className="input-base">
                <option value="">Select client…</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Due date */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                Due date *
              </label>
              <input name="due_date" type="date" defaultValue={defaultDue} required className="input-base" />
            </div>

            {/* Line items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                  Line items
                </label>
                <button
                  type="button"
                  onClick={addItem}
                  className="flex items-center gap-1 text-xs font-semibold"
                  style={{ color: 'var(--fd-accent)' }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              </div>

              {items.map((item, i) => (
                <div
                  key={i}
                  className="space-y-2 rounded-xl border p-3"
                  style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)' }}
                >
                  <div className="flex items-center gap-2">
                    <input
                      className="input-base flex-1"
                      placeholder="Description"
                      value={item.description}
                      onChange={e => updateItem(i, 'description', e.target.value)}
                    />
                    {items.length > 1 && (
                      <button type="button" onClick={() => removeItem(i)} style={{ color: 'var(--fd-muted)' }}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[11px]" style={{ color: 'var(--fd-muted)' }}>Qty</span>
                      <input
                        type="number"
                        min="1"
                        className="input-base"
                        value={item.qty}
                        onChange={e => updateItem(i, 'qty', Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <span className="text-[11px]" style={{ color: 'var(--fd-muted)' }}>Rate</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        className="input-base"
                        value={item.rate || ''}
                        onChange={e => updateItem(i, 'rate', Number(e.target.value))}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Total preview */}
            {total > 0 && (
              <div
                className="flex items-center justify-between rounded-xl border px-4 py-3"
                style={{ borderColor: 'var(--fd-border)' }}
              >
                <span className="text-sm font-medium" style={{ color: 'var(--fd-muted)' }}>Total</span>
                <span className="text-lg font-bold" style={{ color: 'var(--fd-text)' }}>
                  ${total.toFixed(2)}
                </span>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>Notes</label>
              <textarea name="remarks" rows={2} className="input-base resize-none" placeholder="Optional remarks" />
            </div>

            {error && (
              <p className="text-sm" style={{ color: 'var(--fd-red)' }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-xl py-3 text-sm font-bold transition-opacity disabled:opacity-50"
              style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
            >
              {isPending ? 'Creating…' : 'Create Invoice'}
            </button>
          </form>
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

export function InvoicesView({ invoices, clients, error }: InvoicesViewProps) {
  const router = useRouter()
  const [activeTab, setActiveTab]           = useState<FilterTab>('outstanding')
  const [isCreating, setIsCreating]         = useState(false)
  const [payingInvoice, setPayingInvoice]   = useState<Invoice | null>(null)

  const displayed = filterInvoices(invoices, activeTab)

  function handlePaid() {
    setPayingInvoice(null)
    router.refresh()
  }

  function handleCreated() {
    setIsCreating(false)
    router.refresh()
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-base font-semibold" style={{ color: 'var(--fd-muted)' }}>
          {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold"
          style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
        >
          <Plus className="h-4 w-4" />
          Create
        </button>
      </div>

      {/* Fetch error */}
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
          {activeTab !== 'paid' && (
            <button
              onClick={() => setIsCreating(true)}
              className="mt-3 text-sm font-semibold"
              style={{ color: 'var(--fd-accent)' }}
            >
              Create an invoice →
            </button>
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
      <CreateInvoiceSheet
        isOpen={isCreating}
        clients={clients}
        onClose={() => setIsCreating(false)}
        onCreated={handleCreated}
      />
    </div>
  )
}
