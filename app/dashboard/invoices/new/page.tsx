'use client'

import { Suspense, useEffect, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { addInvoice } from '@/actions/invoices'
import { fetchClients } from '@/actions/clients'
import type { Client } from '@/types'

interface LineItem {
  description: string
  qty: number
  rate: number
}

function NewInvoiceForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedClientId = searchParams.get('client') ?? ''

  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [items, setItems] = useState<LineItem[]>([
    { description: 'PT Sessions', qty: 1, rate: 0 },
  ])

  const today = new Date().toISOString().slice(0, 10)
  const defaultDue = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)

  useEffect(() => {
    fetchClients().then(res => {
      if (res.success) setClients(res.data)
    })
  }, [])

  function addItem() {
    setItems(prev => [...prev, { description: '', qty: 1, rate: 0 }])
  }

  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateItem(i: number, field: keyof LineItem, value: string | number) {
    setItems(prev => prev.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)))
  }

  const total = items.reduce((s, item) => s + item.qty * item.rate, 0)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    const clientId = fd.get('client_id') as string

    if (!clientId) { setError('Please select a client'); return }
    if (items.some(i => !i.description || i.rate <= 0)) {
      setError('Fill in all item descriptions and rates')
      return
    }

    startTransition(async () => {
      const result = await addInvoice({
        customer: clientId,
        posting_date: today,
        due_date: fd.get('due_date') as string,
        items: items.map(i => ({
          item_code: 'PT-SESSION',
          description: i.description,
          qty: i.qty,
          rate: i.rate,
        })),
        remarks: (fd.get('remarks') as string) || undefined,
      })

      if (result.success) {
        toast.success('Invoice created')
        router.push('/dashboard/invoices')
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/invoices" style={{ color: 'var(--fd-muted)' }}>
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-base font-semibold" style={{ color: 'var(--fd-text)' }}>
          New Invoice
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            Client *
          </label>
          <select
            name="client_id"
            defaultValue={preselectedClientId}
            required
            className="input-base"
          >
            <option value="">Select client…</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            Due date *
          </label>
          <input
            name="due_date"
            type="date"
            defaultValue={defaultDue}
            required
            className="input-base"
          />
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
              Add item
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
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    style={{ color: 'var(--fd-muted)' }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-[11px]" style={{ color: 'var(--fd-muted)' }}>
                    Qty
                  </span>
                  <input
                    type="number"
                    min="1"
                    className="input-base"
                    value={item.qty}
                    onChange={e => updateItem(i, 'qty', Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[11px]" style={{ color: 'var(--fd-muted)' }}>
                    Rate
                  </span>
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

        {total > 0 && (
          <div
            className="flex items-center justify-between rounded-xl border px-4 py-3"
            style={{ borderColor: 'var(--fd-border)' }}
          >
            <span className="text-sm font-medium" style={{ color: 'var(--fd-muted)' }}>
              Total
            </span>
            <span className="text-lg font-bold" style={{ color: 'var(--fd-text)' }}>
              ${total.toFixed(2)}
            </span>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            Notes
          </label>
          <textarea
            name="remarks"
            rows={2}
            className="input-base resize-none"
            placeholder="Optional remarks"
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
          {isPending ? 'Creating…' : 'Create Invoice'}
        </button>
      </form>
    </div>
  )
}

export default function NewInvoicePage() {
  return (
    <Suspense
      fallback={
        <div className="p-4 text-sm" style={{ color: 'var(--fd-muted)' }}>
          Loading…
        </div>
      }
    >
      <NewInvoiceForm />
    </Suspense>
  )
}
