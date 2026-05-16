'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { finalizeInvoice } from '@/lib/business-data'

interface FinalizeInvoiceButtonProps {
  invoiceId: string
}

/**
 * Primary action shown on a draft (Preparing) invoice. Submits the Sales
 * Invoice in ERPNext so it becomes payable, then refreshes the page — after
 * which the detail page renders the Record Payment action instead.
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
        toast.success('Invoice finalized — you can now record payment.')
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
        className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold transition-opacity disabled:opacity-50"
        style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
      >
        <CheckCircle2 className="h-4 w-4" />
        {isPending ? 'Finalizing…' : 'Finalize invoice'}
      </button>
      <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
        Finalize this invoice before recording payment.
      </p>
      {error && (
        <p className="text-sm" style={{ color: 'var(--fd-red)' }}>
          {error}
        </p>
      )}
    </div>
  )
}
