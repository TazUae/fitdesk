'use client'

import { useEffect, useState, useTransition } from 'react'
import { CheckCircle2, ChevronLeft, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { WorkspaceShell } from '@/components/ui/WorkspaceShell'
import { Button } from '@/components/ui/primitives'
import {
  completeSessionAction,
  markNoShowAction,
  cancelSessionAction,
  rescheduleSessionAction,
  previewBatchCompletionAction,
} from '@/actions/schedulingActions'
import {
  mapCompletionError,
  mapNoShowError,
  mapCancelError,
  mapRescheduleError,
  canComplete,
  canMarkNoShow,
  canCancel,
  canReschedule,
  getNoShowFinancialChoice,
  type NoShowFinancialAction,
  type NoShowFinancialChoice,
} from '@/lib/scheduling/completionUI'
import type { SessionCompletionPreview } from '@/lib/scheduling/sessionCompletionPreview'
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

  // ─── Consequence preview (doctrine: show the exact business effect before
  // the trainer confirms). Fetched via the same US-057 billing preview the
  // no-show path already trusts — one session id, no new server surface.
  const [completionPreview, setCompletionPreview] = useState<SessionCompletionPreview | null>(null)
  useEffect(() => {
    if (!open || !session || !canComplete(session)) {
      setCompletionPreview(null)
      return
    }
    let cancelled = false
    previewBatchCompletionAction([session.id]).then(result => {
      if (cancelled) return
      const item = result.success ? result.data[0] : undefined
      setCompletionPreview(item?.preview ?? null)
    })
    return () => { cancelled = true }
  }, [open, session])

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

  // ─── Cancel sub-view state (US-039) ────────────────────────────────────────
  // Simpler than no-show: cancellation has exactly one outcome (no financial
  // branching), so there is no billing preview to fetch — just an explanation,
  // an optional reason, and a confirm step.
  const [cancelOpen, setCancelOpen]     = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelError, setCancelError]   = useState<string | null>(null)

  function resetCancel() {
    setCancelOpen(false)
    setCancelReason('')
    setCancelError(null)
  }

  // ─── Reschedule sub-view state (US-039) ────────────────────────────────────
  // Also simple like cancel: no billing branching, just a new date/time (via
  // minimal native inputs), an optional reason, and a confirm step.
  const [rescheduleOpen, setRescheduleOpen]     = useState(false)
  const [newDate, setNewDate]                   = useState('')
  const [newTime, setNewTime]                   = useState('')
  const [rescheduleReason, setRescheduleReason] = useState('')
  const [rescheduleError, setRescheduleError]   = useState<string | null>(null)

  function resetReschedule() {
    setRescheduleOpen(false)
    setNewDate('')
    setNewTime('')
    setRescheduleReason('')
    setRescheduleError(null)
  }

  function handleClose() {
    setError(null)
    resetNoShow()
    resetCancel()
    resetReschedule()
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

  function handleOpenCancel() {
    setCancelOpen(true)
    setCancelError(null)
  }

  function handleBackFromCancel() {
    resetCancel()
  }

  /**
   * Retry-safe like handleConfirmNoShow: on failure session.version is
   * unchanged (no mutation happened), so tapping Confirm again re-attempts
   * safely with the same version.
   */
  function handleConfirmCancel() {
    if (!session) return
    setCancelError(null)
    startTransition(async () => {
      const result = await cancelSessionAction(
        session.id,
        session.version,
        cancelReason.trim() || undefined,
      )
      if (result.success) {
        toast.success('Session cancelled')
        resetCancel()
        onClose()
        onCompleted()
      } else {
        setCancelError(mapCancelError(result.code))
      }
    })
  }

  function handleOpenReschedule() {
    setRescheduleOpen(true)
    setRescheduleError(null)
  }

  function handleBackFromReschedule() {
    resetReschedule()
  }

  /**
   * Only reachable once both newDate and newTime are filled in — the Confirm
   * control itself is not rendered until then (see the footer below).
   * Retry-safe like the other confirm handlers: on failure session.version is
   * unchanged, so tapping Confirm again re-attempts safely.
   */
  function handleConfirmReschedule() {
    if (!session || !newDate || !newTime) return
    setRescheduleError(null)
    startTransition(async () => {
      const result = await rescheduleSessionAction(
        session.id,
        session.version,
        newDate,
        newTime,
        rescheduleReason.trim() || undefined,
      )
      if (result.success) {
        toast.success('Session rescheduled')
        resetReschedule()
        onClose()
        onCompleted()
      } else {
        setRescheduleError(mapRescheduleError(result.code))
      }
    })
  }

  const eligible           = !!session && canComplete(session)
  const noShowEligible     = !!session && canMarkNoShow(session)
  const cancelEligible     = !!session && canCancel(session)
  const rescheduleEligible = !!session && canReschedule(session)
  const isTerminal = !!session && !['scheduled', 'confirmed'].includes(session.status)
  const isFuture   = !!session && !isTerminal && session.startAt.getTime() > Date.now()

  const selectedOption = noShowChoice?.options.find(o => o.action === selectedAction) ?? null

  // Derived header state — shared across all four sub-views (main/no-show/cancel/reschedule).
  const sheetTitle =
    noShowOpen      ? 'Mark as no-show' :
    cancelOpen      ? 'Cancel session' :
    rescheduleOpen  ? 'Reschedule session' :
    'Complete session'
  const showBackButton = noShowOpen || cancelOpen || rescheduleOpen
  const handleBack =
    noShowOpen ? handleBackFromNoShow :
    cancelOpen ? handleBackFromCancel :
    handleBackFromReschedule

  return (
    <WorkspaceShell
      open={open}
      onClose={handleClose}
      label={sheetTitle}
      header={
        <div className="flex items-center justify-between px-5 pb-3 pt-4">
          <div className="flex items-center gap-2">
            {showBackButton && (
              <button
                type="button"
                onClick={handleBack}
                className="flex h-8 w-8 items-center justify-center rounded-full transition-opacity hover:opacity-70"
                style={{ backgroundColor: 'var(--fd-card)', color: 'var(--fd-muted)' }}
                aria-label="Back"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <p className="text-base font-semibold" style={{ color: 'var(--fd-text)' }}>
              {sheetTitle}
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
            {/* Disabled-with-reason (a11y standard §7): the confirm control is
                always present — no layout jump — and states why it's disabled. */}
            {previewStatus === 'ready' && noShowChoice && !noShowChoice.blocked && !selectedAction && (
              <p className="text-center text-xs" style={{ color: 'var(--fd-muted)' }}>
                Choose how to handle billing above to confirm.
              </p>
            )}
            {!(previewStatus === 'ready' && noShowChoice?.blocked) && (
              <Button
                size="lg"
                block
                loading={isPending}
                disabled={previewStatus !== 'ready' || !noShowChoice || noShowChoice.blocked || !selectedAction}
                onClick={handleConfirmNoShow}
              >
                Confirm no-show
              </Button>
            )}
            <Button variant="ghost" block disabled={isPending} onClick={handleBackFromNoShow}>
              Back
            </Button>
          </div>
        ) : cancelOpen ? (
          <div
            className="flex flex-col gap-2 border-t px-5 pb-5 pt-3"
            style={{ borderColor: 'var(--fd-border)' }}
          >
            <Button variant="destructive" size="lg" block loading={isPending} onClick={handleConfirmCancel}>
              Confirm cancellation
            </Button>
            <Button variant="ghost" block disabled={isPending} onClick={handleBackFromCancel}>
              Back
            </Button>
          </div>
        ) : rescheduleOpen ? (
          <div
            className="flex flex-col gap-2 border-t px-5 pb-5 pt-3"
            style={{ borderColor: 'var(--fd-border)' }}
          >
            {/* Disabled-with-reason: always rendered, no layout jump. */}
            {(!newDate || !newTime) && (
              <p className="text-center text-xs" style={{ color: 'var(--fd-muted)' }}>
                Pick a new date and time to confirm.
              </p>
            )}
            <Button
              size="lg"
              block
              loading={isPending}
              disabled={!newDate || !newTime}
              onClick={handleConfirmReschedule}
            >
              Confirm reschedule
            </Button>
            <Button variant="ghost" block disabled={isPending} onClick={handleBackFromReschedule}>
              Back
            </Button>
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
              <Button variant="success" size="lg" block loading={isPending} onClick={handleComplete}>
                {!isPending && <CheckCircle2 className="h-4 w-4" />}
                Complete session
              </Button>
            )}
            {noShowEligible && (
              <Button variant="secondary" size="lg" block disabled={isPending} onClick={handleOpenNoShow}>
                Mark as no-show
              </Button>
            )}
            {cancelEligible && (
              <Button variant="secondary" size="lg" block disabled={isPending} onClick={handleOpenCancel}>
                Cancel session
              </Button>
            )}
            {rescheduleEligible && (
              <Button variant="secondary" size="lg" block disabled={isPending} onClick={handleOpenReschedule}>
                Reschedule session
              </Button>
            )}
            <Button variant="ghost" block disabled={isPending} onClick={handleClose}>
              Close
            </Button>
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
                          borderColor: selectedAction === option.action ? 'var(--fd-primary-strong)' : 'var(--fd-border)',
                          backgroundColor: selectedAction === option.action ? 'color-mix(in oklch, var(--fd-primary) 10%, transparent)' : 'var(--fd-card)',
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
      ) : cancelOpen ? (
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

              {/* What cancellation does and does not do */}
              <div
                className="rounded-xl px-4 py-3 text-sm"
                style={{
                  backgroundColor: 'var(--fd-card)',
                  border:          '1px solid var(--fd-border)',
                  color:           'var(--fd-text)',
                }}
              >
                <p>Cancelling removes this session from your calendar, but it stays in the client&apos;s history.</p>
                <p className="mt-2" style={{ color: 'var(--fd-muted)' }}>
                  No invoice is created, voided, refunded, or credited, and no package session is
                  used or reversed — cancelling never changes billing.
                </p>
              </div>

              {/* Optional reason — appended to the session's existing notes server-side, never overwritten */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                  Reason (optional)
                </label>
                <textarea
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  rows={2}
                  placeholder="e.g. client requested cancellation"
                  className="input-base resize-none"
                />
              </div>

              {cancelError && (
                <p className="text-sm" style={{ color: 'var(--fd-red)' }}>
                  {cancelError}
                </p>
              )}
            </>
          )}
        </div>
      ) : rescheduleOpen ? (
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
                  Currently: {formatLocalDateTime(session)}
                </p>
              </div>

              {/* What rescheduling does and does not do */}
              <div
                className="rounded-xl px-4 py-3 text-sm"
                style={{
                  backgroundColor: 'var(--fd-card)',
                  border:          '1px solid var(--fd-border)',
                  color:           'var(--fd-text)',
                }}
              >
                Rescheduling changes this session&apos;s time. It has no financial effect — no
                invoice, refund, credit, or package change.
              </div>

              {/* Minimal native date/time inputs */}
              <div className="flex gap-3">
                <div className="flex-1 space-y-1.5">
                  <label className="block text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                    New date
                  </label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={e => setNewDate(e.target.value)}
                    className="input-base"
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <label className="block text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                    New time
                  </label>
                  <input
                    type="time"
                    value={newTime}
                    onChange={e => setNewTime(e.target.value)}
                    className="input-base"
                  />
                </div>
              </div>

              {/* Optional reason — appended to the session's existing notes server-side, never overwritten */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                  Reason (optional)
                </label>
                <textarea
                  value={rescheduleReason}
                  onChange={e => setRescheduleReason(e.target.value)}
                  rows={2}
                  placeholder="e.g. client asked to move to Tuesday"
                  className="input-base resize-none"
                />
              </div>

              {rescheduleError && (
                <p className="text-sm" style={{ color: 'var(--fd-red)' }}>
                  {rescheduleError}
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
                      style={{ backgroundColor: 'var(--fd-primary)', color: 'var(--fd-text-on-primary)' }}
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

              {/* Consequence preview — exact business effect of completing,
                  from the server-side billing preview (never a client guess). */}
              {eligible && completionPreview?.kind === 'package' && (
                <div
                  className="rounded-xl px-4 py-3 text-sm"
                  style={{
                    backgroundColor: 'rgba(78,203,160,0.08)',
                    color:           'var(--fd-text)',
                    border:          '1px solid rgba(78,203,160,0.30)',
                  }}
                >
                  Completing uses 1 package session — balance{' '}
                  <span className="font-semibold">
                    {completionPreview.balanceAfter + 1} → {completionPreview.balanceAfter}
                  </span>{' '}
                  session{completionPreview.balanceAfter !== 1 ? 's' : ''} left.
                </div>
              )}

              {eligible && completionPreview?.kind === 'pay_per_session' && (
                <div
                  className="rounded-xl px-4 py-3 text-sm"
                  style={{
                    backgroundColor: 'var(--fd-card)',
                    color: 'var(--fd-text)',
                    border: '1px solid var(--fd-border)',
                  }}
                >
                  Completing this session will issue an invoice for{' '}
                  <span className="font-semibold">
                    {completionPreview.amount.toLocaleString()} {completionPreview.currency}
                  </span>.
                </div>
              )}

              {/* Eligibility notices */}
              {isFuture && (
                <div
                  className="rounded-xl px-4 py-3 text-sm"
                  style={{
                    backgroundColor: 'var(--fd-card)',
                    color: 'var(--fd-muted)',
                    border: '1px solid var(--fd-border)',
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
                    color: 'var(--fd-muted)',
                    border: '1px solid var(--fd-border)',
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