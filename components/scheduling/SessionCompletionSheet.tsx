'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { WorkspaceShell } from '@/components/ui/WorkspaceShell'
import { completeSessionAction } from '@/actions/schedulingActions'
import { mapCompletionError, canComplete } from '@/lib/scheduling/completionUI'
import type { FDSession } from '@/types/scheduling'

export { mapCompletionError, canComplete }

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show:   'No-show',
  skipped:   'Skipped',
}

function formatLocalDateTime(session: FDSession): string {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: session.timezone,
    weekday:  'short',
    month:    'short',
    day:      'numeric',
    hour:     'numeric',
    minute:   '2-digit',
    hour12:   true,
  })
  return dtf.format(session.startAt)
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SessionCompletionSheetProps {
  session:     FDSession | null
  open:        boolean
  onClose:     () => void
  onCompleted: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SessionCompletionSheet({
  session,
  open,
  onClose,
  onCompleted,
}: SessionCompletionSheetProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError]            = useState<string | null>(null)

  function handleClose() {
    setError(null)
    onClose()
  }

  function handleComplete() {
    if (!session) return
    setError(null)
    startTransition(async () => {
      const result = await completeSessionAction(session.id, session.version)
      if (result.success) {
        toast.success('Session marked complete')
        onClose()
        onCompleted()
      } else {
        setError(mapCompletionError(result.code))
      }
    })
  }

  const eligible   = !!session && canComplete(session)
  const isTerminal = !!session && !['scheduled', 'confirmed'].includes(session.status)
  const isFuture   = !!session && !isTerminal && session.startAt.getTime() > Date.now()

  return (
    <WorkspaceShell
      open={open}
      onClose={handleClose}
      label="Complete session"
      header={
        <div className="flex items-center justify-between px-5 pb-3 pt-4">
          <p className="text-base font-semibold" style={{ color: 'var(--fd-text)' }}>
            Complete session
          </p>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-opacity hover:opacity-70"
            style={{ backgroundColor: 'var(--fd-card)', color: 'var(--fd-muted)' }}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      }
      footer={
        <div
          className="flex flex-col gap-2 border-t px-5 pb-5 pt-3"
          style={{ borderColor: 'var(--fd-border)' }}
        >
          {eligible && (
            <button
              type="button"
              disabled={isPending}
              onClick={handleComplete}
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold transition-opacity disabled:opacity-40"
              style={{ backgroundColor: 'var(--fd-green)', color: '#fff' }}
            >
              {isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <CheckCircle2 className="h-4 w-4" />}
              Complete session
            </button>
          )}
          <button
            type="button"
            disabled={isPending}
            onClick={handleClose}
            className="w-full rounded-xl py-2.5 text-sm font-medium disabled:opacity-40"
            style={{ color: 'var(--fd-muted)' }}
          >
            Close
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
        {session && (
          <>
            {/* Session summary card */}
            <div
              className="flex flex-col gap-2 rounded-2xl p-4"
              style={{ backgroundColor: 'var(--fd-card)', border: '1px solid var(--fd-border)' }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-base font-semibold" style={{ color: 'var(--fd-text)' }}>
                  {session.clientName}
                </p>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    backgroundColor: 'var(--fd-surface)',
                    color:           'var(--fd-muted)',
                    border:          '1px solid var(--fd-border)',
                  }}
                >
                  {STATUS_LABELS[session.status] ?? session.status}
                </span>
              </div>

              <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
                {formatLocalDateTime(session)}
              </p>

              {session.sessionType && (
                <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
                  {session.sessionType}
                </p>
              )}

              <div className="flex items-center gap-2">
                {session.isTrialSession && (
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{ backgroundColor: 'var(--fd-blue)', color: '#fff' }}
                  >
                    Trial
                  </span>
                )}
                {session.sessionConsumedPackage && (
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{ backgroundColor: 'var(--fd-green)', color: '#fff' }}
                  >
                    Package
                  </span>
                )}
                {session.rate > 0 && (
                  <p className="text-sm font-medium" style={{ color: 'var(--fd-text)' }}>
                    {session.rate.toLocaleString()} fee
                  </p>
                )}
              </div>
            </div>

            {/* PPS invoice hint — visible when completing will trigger invoice creation */}
            {eligible && session.rate > 0 && !session.isTrialSession && !session.sessionConsumedPackage && !session.invoiceId && (
              <div
                className="rounded-xl px-4 py-3 text-sm"
                style={{
                  backgroundColor: 'var(--fd-card)',
                  color:           'var(--fd-muted)',
                  border:          '1px solid var(--fd-border)',
                }}
              >
                Completing this session will issue an invoice for {session.rate.toLocaleString()}.
              </div>
            )}

            {/* Eligibility notices */}
            {isFuture && (
              <div
                className="rounded-xl px-4 py-3 text-sm"
                style={{
                  backgroundColor: 'var(--fd-card)',
                  color:           'var(--fd-muted)',
                  border:          '1px solid var(--fd-border)',
                }}
              >
                This session hasn&apos;t started yet and cannot be completed.
              </div>
            )}

            {isTerminal && (
              <div
                className="rounded-xl px-4 py-3 text-sm"
                style={{
                  backgroundColor: 'var(--fd-card)',
                  color:           'var(--fd-muted)',
                  border:          '1px solid var(--fd-border)',
                }}
              >
                This session is already finalized.
              </div>
            )}

            {/* Action error */}
            {error && (
              <p className="text-sm" style={{ color: 'var(--fd-red)' }}>
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </WorkspaceShell>
  )
}
