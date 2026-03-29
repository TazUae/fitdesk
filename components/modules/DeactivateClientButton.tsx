'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { deleteClient } from '@/actions/clients'

interface DeactivateClientButtonProps {
  clientId: string
  clientName: string
}

/**
 * Soft-deletes a client by marking them Inactive in ERPNext.
 * Sessions and invoices are preserved; the client is hidden from active lists.
 *
 * Uses window.confirm for MVP — replace with a custom modal if needed.
 */
export function DeactivateClientButton({ clientId, clientName }: DeactivateClientButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    if (
      !window.confirm(
        `Deactivate ${clientName}?\n\nTheir sessions and invoices are preserved. You can reactivate them from ERPNext.`,
      )
    )
      return

    startTransition(async () => {
      const result = await deleteClient(clientId)
      if (result.success) {
        toast.success(`${clientName} deactivated`)
        router.push('/dashboard/clients')
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="w-full rounded-xl py-2.5 text-sm font-semibold transition-opacity disabled:opacity-50"
      style={{ backgroundColor: 'rgba(232,92,106,0.10)', color: 'var(--fd-red)' }}
    >
      {isPending ? 'Deactivating…' : 'Deactivate Client'}
    </button>
  )
}
