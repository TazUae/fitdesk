'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cancelSession as removeSession, completeSession } from '@/actions/sessions'

interface SessionActionsProps {
  sessionId: string
}

export function SessionActions({ sessionId }: SessionActionsProps) {
  const router = useRouter()
  const [isCompletePending, startComplete] = useTransition()
  const [isCancelPending, startCancel] = useTransition()

  function handleComplete() {
    startComplete(async () => {
      const result = await completeSession(sessionId)
      if (result.success) {
        toast.success('Session marked complete')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleCancel() {
    startCancel(async () => {
      const result = await removeSession(sessionId)
      if (result.success) {
        toast.success('Session cancelled')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  const busy = isCompletePending || isCancelPending

  return (
    <div className="flex gap-2 pt-1">
      <button
        onClick={handleComplete}
        disabled={busy}
        className="flex-1 rounded-xl py-2 text-xs font-bold transition-opacity disabled:opacity-50"
        style={{ backgroundColor: 'rgba(78,203,160,0.15)', color: 'var(--fd-green)' }}
      >
        {isCompletePending ? 'Completing…' : 'Complete'}
      </button>
      <button
        onClick={handleCancel}
        disabled={busy}
        className="flex-1 rounded-xl py-2 text-xs font-bold transition-opacity disabled:opacity-50"
        style={{ backgroundColor: 'rgba(138,143,168,0.10)', color: 'var(--fd-muted)' }}
      >
        {isCancelPending ? 'Cancelling…' : 'Cancel'}
      </button>
    </div>
  )
}
