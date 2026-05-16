'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { finalizeInvoice } from '@/lib/business-data'

interface FinalizeInvoiceButtonProps {
  invoiceId: string
}

/**
 * Secondary fallback action on a Preparing invoice: issues the invoice
 * without recording a payment, for the "send now, collect later" case.
 * The normal path is "Record payment", which issues and pays in one step.
 */
export function FinalizeInvoiceButton({ invoiceId }: FinalizeInvoiceButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await finalizeInvoice(invoiceId)
      if (result.success) {
        toast.success('Invoice marked as sent — you can record payment later.')
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="flex w-full items-center justify-center rounded-xl border py-2 text-sm font-semibold transition-opacity disabled:opacity-50"
        style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-muted)' }}
      >
        {isPending ? 'Marking…' : 'Mark as sent'}
      </button>
      {error && (
        <p className="text-sm" style={{ color: 'var(--fd-red)' }}>
          {error}
        </p>
      )}
    </div>
  )
}
