'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, ChevronLeft, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { WorkspaceShell } from '@/components/ui/WorkspaceShell'
import {
  completeSessionAction,
  markNoShowAction,
  previewBatchCompletionAction,
} from '@/actions/schedulingActions'
import {
  mapCompletionError,
  mapNoShowError,
  canComplete,
  canMarkNoShow,
  getNoShowFinancialChoice,
  type NoShowFinancialAction,
  type NoShowFinancialChoice,
} from '@/lib/scheduling/completionUI'
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

  // ─── No-show sub-view state (US-017) ───────────────────────────────────────
  // A focused section inside this same sheet, not a separate flow — swapping
  // header/body/footer content, so a trainer picking "Mark as no-show" never
  // leaves the sheet they're already in.
  const [noShowOpen, setNoShowOpen]         = useState(false)
  const [previewStatus, setPreviewStatus]   = useState<'idle' | 'loading' | 'error' | 'ready'>('idle')
  const [noShowChoice, setNoShowChoice]     = useState<NoShowFinancialChoice | null>(null)
  const [selectedAction, setSelectedAction] = useState<NoShowFinancialAction | null>(null)
  const [noShowReason, setNoShowReason]     = useState('')
  const [noShowError, setNoShowError]       = useState<string | null>(null)

  function resetNoShow() {
    setNoShowOpen(false)
    setPreviewStatus('idle')
    setNoShowChoice(null)
    setSelectedAction(null)
    setNoShowReason('')
    setNoShowError(null)
  }

  function handleClose() {
    setError(null)
    resetNoShow()
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

  /**
   * Opens the no-show sub-view and fetches a billing-aware preview via the
   * same previewBatchCompletionAction US-057 batch-resolve already uses (one
   * session id in the array) — reused rather than duplicated so the no-show
   * options shown here can never drift from the billing-mode read the rest of
   * the app already trusts. FDSession itself carries no billingMode field.
   */
  function handleOpenNoShow() {
    if (!session) return
    setNoShowOpen(true)
    setPreviewStatus('loading')
    setNoShowError(null)
    startTransition(async () => {
      const result = await previewBatchCompletionAction([session.id])
      const item = result.success ? result.data[0] : undefined
      if (!item?.preview) {
        setPreviewStatus('error')
        return
      }
      setNoShowChoice(getNoShowFinancialChoice(item.preview))
      setPreviewStatus('ready')
    })
  }

  function handleBackFromNoShow() {
    resetNoShow()
  }

  function handleSelectNoShowAction(action: NoShowFinancialAction) {
    setSelectedAction(action)
    setNoShowError(null)
  }

  /**
   * The actual mutation — only reachable after the trainer has both selected a
   * financial option (handleSelectNoShowAction) and tapped the distinct
   * "Confirm no-show" button. Retry-safe: on failure, session.version is
   * unchanged (no mutation happened), so tapping Confirm again re-attempts
   * safely with the same version, mirroring markNoShow's own idempotency.
   */
  function handleConfirmNoShow() {
    if (!session || !selectedAction) return
    setNoShowError(null)
    startTransition(async () => {
      const result = await markNoShowAction(
        session.id,
        session.version,
        selectedAction,
        noShowReason.trim() || undefined,
      )
      if (result.success) {
        toast.success('Session marked as no-show')
        resetNoShow()
        onClose()
        onCompleted()
      } else {
        setNoShowError(mapNoShowError(result.code))
      }
    })
  }

  const eligible       = !!session && canComplete(session)
  const noShowEligible = !!session && canMarkNoShow(session)
  const isTerminal = !!session && !['scheduled', 'confirmed'].includes(session.status)
  const isFuture   = !!session && !isTerminal && session.startAt.getTime() > Date.now()

  const selectedOption = noShowChoice?.options.find(o => o.action === selectedAction) ?? null

  return (
    <WorkspaceShell
      open={open}
      onClose={handleClose}
      label={noShowOpen ? 'Mark as no-show' : 'Complete session'}
      header={
        <div className="flex items-center justify-between px-5 pb-3 pt-4">
          <div className="flex items-center gap-2">
            {noShowOpen && (
              <button
                type="button"
                onClick={handleBackFromNoShow}
                className="flex h-8 w-8 items-center justify-center rounded-full transition-opacity hover:opacity-70"
                style={{ backgroundColor: 'var(--fd-card)', color: 'var(--fd-muted)' }}
                aria-label="Back"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <p className="text-base font-semibold" style={{ color: 'var(--fd-text)' }}>
              {noShowOpen ? 'Mark as no-show' : 'Complete session'}
            </p>
          </div>
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
        noShowOpen ? (
          <div
            className="flex flex-col gap-2 border-t px-5 pb-5 pt-3"
            style={{ borderColor: 'var(--fd-border)' }}
          >
            {previewStatus === 'ready' && noShowChoice && !noShowChoice.blocked && selectedAction && (
              <button
                type="button"
                disabled={isPending}
                onClick={handleConfirmNoShow}
                className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold transition-opacity disabled:opacity-40"
                style={{ backgroundColor: 'var(--fd-blue)', color: '#fff' }}
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm no-show
              </button>
            )}
            <button
              type="button"
              disabled={isPending}
              onClick={handleBackFromNoShow}
              className="w-full rounded-xl py-2.5 text-sm font-medium disabled:opacity-40"
              style={{ color: 'var(--fd-muted)' }}
            >
              Back
            </button>
          </div>
        ) : (
          <div
            className="flex flex-col gap-2 border-t px-5 pb-5 pt-3"
            style={{
              borderColor:   'var(--fd-border)',
              paddingBottom: 'max(env(safe-area-inset-bottom), 20px)',
            }}
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
            {noShowEligible && (
              <button
                type="button"
                disabled={isPending}
                onClick={handleOpenNoShow}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border py-3 text-sm font-semibold transition-opacity disabled:opacity-40"
                style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-text)', backgroundColor: 'var(--fd-card)' }}
              >
                Mark as no-show
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
        )
      }
    >
      {noShowOpen ? (
        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
          {session && (
            <>
              {/* Session mini-summary */}
              <div
                className="flex flex-col gap-1 rounded-2xl p-4"
                style={{ backgroundColor: 'var(--fd-card)', border: '1px solid var(--fd-border)' }}
              >
                <p className="text-base font-semibold" style={{ color: 'var(--fd-text)' }}>
                  {session.clientName}
                </p>
                <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
                  {formatLocalDateTime(session)}
                </p>
              </div>

              {previewStatus === 'loading' && (
                <div className="flex items-center justify-center gap-2 py-6">
                  <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--fd-muted)' }} />
                  <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>Checking billing…</p>
                </div>
              )}

              {previewStatus === 'error' && (
                <div
                  className="rounded-xl px-4 py-3 text-sm"
                  style={{
                    backgroundColor: 'rgba(232,92,106,0.08)',
                    border:          '1px solid rgba(232,92,106,0.25)',
                    color:           'var(--fd-red)',
                  }}
                >
                  <p>Couldn&apos;t check this client&apos;s billing setup.</p>
                  <button
                    type="button"
                    onClick={handleOpenNoShow}
                    className="mt-2 text-sm font-semibold underline"
                  >
                    Retry
                  </button>
                </div>
              )}

              {previewStatus === 'ready' && noShowChoice?.blocked && (
                <div
                  className="rounded-xl px-4 py-3 text-sm"
                  style={{
                    backgroundColor: 'rgba(232,197,71,0.08)',
                    border:          '1px solid rgba(232,197,71,0.35)',
                    color:           '#d4a017',
                  }}
                >
                  {noShowChoice.blockedReason}
                </div>
              )}

              {previewStatus === 'ready' && noShowChoice && !noShowChoice.blocked && (
                <>
                  {noShowChoice.note && (
                    <div
                      className="rounded-xl px-4 py-3 text-sm"
                      style={{
                        backgroundColor: 'rgba(232,197,71,0.08)',
                        border:          '1px solid rgba(232,197,71,0.35)',
                        color:           '#d4a017',
                      }}
                    >
                      {noShowChoice.note}
                    </div>
                  )}

                  {/* Financial-handling options — selecting one does not mutate yet */}
                  <div className="flex flex-col gap-2">
                    {noShowChoice.options.map(option => (
                      <button
                        key={option.action}
                        type="button"
                        onClick={() => handleSelectNoShowAction(option.action)}
                        className="flex flex-col items-start gap-0.5 rounded-2xl border p-4 text-left transition-opacity active:opacity-70"
                        style={{
                          borderColor:     selectedAction === option.action ? 'var(--fd-blue)' : 'var(--fd-border)',
                          backgroundColor: selectedAction === option.action ? 'rgba(59,130,246,0.06)' : 'var(--fd-card)',
                        }}
                      >
                        <span className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
                          {option.label}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--fd-muted)' }}>
                          {option.description}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Optional reason — appended to the session's existing notes server-side, never overwritten */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                      Reason (optional)
                    </label>
                    <textarea
                      value={noShowReason}
                      onChange={e => setNoShowReason(e.target.value)}
                      rows={2}
                      placeholder="e.g. client didn't show, no call"
                      className="input-base resize-none"
                    />
                  </div>

                  {/* Explicit confirmation summary of what tapping Confirm will do */}
                  {selectedOption && (
                    <div
                      className="rounded-xl px-4 py-3 text-sm"
                      style={{
                        backgroundColor: 'var(--fd-card)',
                        border:          '1px solid var(--fd-border)',
                        color:           'var(--fd-text)',
                      }}
                    >
                      {selectedOption.description}
                    </div>
                  )}
                </>
              )}

              {noShowError && (
                <p className="text-sm" style={{ color: 'var(--fd-red)' }}>
                  {noShowError}
                </p>
              )}
            </>
          )}
        </div>
      ) : (
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
      )}
    </WorkspaceShell>
  )
}
