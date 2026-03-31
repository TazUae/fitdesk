'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { recordPayment } from '@/lib/business-data'
import type { Invoice } from '@/types'

interface RecordPaymentFormProps {
  invoice: Invoice
}

export function RecordPaymentForm({ invoice }: RecordPaymentFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)

    const amount = Number(fd.get('amount'))
    if (!amount || amount <= 0) { setError('Enter a valid amount'); return }

    startTransition(async () => {
      const result = await recordPayment({
        invoiceId: invoice.id,
        clientId: invoice.clientId,
        amount,
        modeOfPayment: fd.get('mode_of_payment') as string,
        date: fd.get('payment_date') as string,
        reference: (fd.get('reference') as string) || undefined,
        note: (fd.get('note') as string) || undefined,
      })

      if (result.success) {
        toast.success('Payment recorded')
        router.push('/dashboard/invoices')
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} style={{ color: 'var(--fd-muted)' }}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-base font-semibold" style={{ color: 'var(--fd-text)' }}>
            Record Payment
          </h1>
          <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
            {invoice.id} · {invoice.clientName}
          </p>
        </div>
      </div>

      {/* Invoice summary */}
      <div
        className="rounded-2xl border p-4 space-y-1"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: 'var(--fd-muted)' }}>Total</span>
          <span className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
            {invoice.currency} {invoice.amount.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: 'var(--fd-muted)' }}>Outstanding</span>
          <span className="text-sm font-bold" style={{ color: 'var(--fd-red)' }}>
            {invoice.currency} {invoice.outstandingAmount.toLocaleString()}
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            Amount *
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

        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            Payment method *
          </label>
          <select name="mode_of_payment" className="input-base" required>
            <option value="Cash">Cash</option>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="Whish">Whish</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            Date *
          </label>
          <input
            name="payment_date"
            type="date"
            defaultValue={today}
            required
            className="input-base"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            Reference / Transaction ID
          </label>
          <input
            name="reference"
            className="input-base"
            placeholder="Optional — Whish ref, bank ref, etc."
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            Note
          </label>
          <textarea name="note" rows={2} className="input-base resize-none" placeholder="Optional note" />
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
    </div>
  )
}
