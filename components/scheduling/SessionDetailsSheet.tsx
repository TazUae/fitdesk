'use client'

import { useEffect, useState, useTransition } from 'react'
import { AlertTriangle, CalendarClock, CheckCircle2, Loader2, Trash2, UserX, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  rescheduleSessionAction,
  cancelSessionAction,
  completeSessionAction,
  markNoShowAction,
} from '@/actions/schedulingActions'
import { cn } from '@/lib/utils'
import type { FDSession } from '@/types/scheduling'

/** Format a UTC Date as local YYYY-MM-DD / HH:mm in the given IANA timezone. */
function fdLocalDateTime(session: FDSession): { date: string; time: string } {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: session.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const parts = dtf.formatToParts(session.startAt)
  const get   = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour').replace('24', '00')}:${get('minute')}`,
  }
}

interface SessionDetailsSheetProps {
  session:              FDSession | null
  isOpen:               boolean
  onClose:              () => void
  /** Optimistically merge/replace one row (edit path) */
  onOptimisticReplace:  (s: FDSession) => void
  /** Optimistically remove one row (cancel path) */
  onOptimisticRemove:   (id: string) => void
  /** Reload sessions from server (reconcile / rollback) */
  onReconcile:          () => Promise<void>
}

export function SessionDetailsSheet({
  session,
  isOpen,
  onClose,
  onOptimisticReplace,
  onOptimisticRemove,
  onReconcile,
}: SessionDetailsSheetProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError]            = useState<string | null>(null)
  const [date, setDate]              = useState('')
  const [time, setTime]              = useState('09:00')
  const [rate, setRate]              = useState('')

  useEffect(() => {
    if (!session) return
    const local = fdLocalDateTime(session)
    setDate(local.date)
    setTime(local.time)
    setRate(session.rate > 0 ? String(session.rate) : '')
    setError(null)
  }, [session])

  const clientName  = session?.clientName ?? ''
  const statusText  = session?.status     ?? ''
  const isScheduled = session?.status === 'scheduled' || session?.status === 'confirmed'
  const canFinalize = !!session && isScheduled && session.startAt.getTime() <= Date.now()

  function handleSave() {
    if (!session || !isScheduled) return
    setError(null)

    const rateNum = rate ? parseFloat(rate) : session.rate
    if (Number.isNaN(rateNum) || rateNum < 0) { setError('Invalid session fee'); return }

    startTransition(async () => {
      const result = await rescheduleSessionAction(session.id, {
        newDate:         date,
        newTime:         time,
        expectedVersion: session.version,
        newRate:         rateNum,
      })
      if (result.success) {
        onOptimisticReplace(result.data)
        toast.success('Session updated')
        await onReconcile()
        onClose()
      } else {
        await onReconcile()
        setError(result.message)
        toast.error(result.message)
      }
    })
  }

  function handleComplete() {
    if (!session || !isScheduled) return
    setError(null)

    const id = session.id
    const version = session.version
    startTransition(async () => {
      const result = await completeSessionAction(id, version)
      if (result.success) {
        onOptimisticReplace(result.data)
        toast.success('Session marked complete')
        await onReconcile()
        onClose()
      } else {
        await onReconcile()
        setError(result.message)
        toast.error(result.message)
      }
    })
  }

  function handleMarkNoShow() {
    if (!session || !isScheduled) return
    if (!window.confirm('Mark this session as no-show?')) return
    setError(null)

    const id = session.id
    const version = session.version
    startTransition(async () => {
      const result = await markNoShowAction(id, version)
      if (result.success) {
        onOptimisticReplace(result.data)
        toast.success('Session marked no-show')
        await onReconcile()
        onClose()
      } else {
        await onReconcile()
        setError(result.message)
        toast.error(result.message)
      }
    })
  }

  function handleCancelSession() {
    if (!session || !isScheduled) return
    if (!window.confirm('Cancel this session?')) return
    setError(null)

    const id = session.id
    const version = session.version
    startTransition(async () => {
      onOptimisticRemove(id)
      const result = await cancelSessionAction(id, version)
      if (result.success) {
        toast.success('Session cancelled')
        await onReconcile()
        onClose()
      } else {
        await onReconcile()
        toast.error(result.message)
        onClose()
      }
    })
  }

  if (!session) return null

  return (
    <>
      <div
        aria-hidden="true"
        className={cn(
          'fixed inset-0 z-[60] bg-black/60 transition-opacity duration-200',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => !isPending && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Session details"
        className={cn(
          'fixed bottom-0 left-1/2 z-[70] w-full max-w-[480px] -translate-x-1/2',
          'rounded-t-3xl border-t transition-transform duration-200',
          isOpen ? 'translate-y-0' : 'translate-y-full',
        )}
        style={{
          backgroundColor: 'var(--fd-surface)',
          borderColor: 'var(--fd-border)',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)',
          maxHeight: 'min(88vh, 640px)',
        }}
      >
        <div className="flex justify-center pb-2 pt-3">
          <div className="h-1 w-10 rounded-full" style={{ backgroundColor: 'var(--fd-border)' }} />
        </div>

        <div className="flex items-center justify-between border-b px-5 pb-3" style={{ borderColor: 'var(--fd-border)' }}>
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 shrink-0" style={{ color: 'var(--fd-accent)' }} />
            <h2 className="text-base font-semibold" style={{ color: 'var(--fd-text)' }}>
              Session
            </h2>
          </div>
          <button type="button" onClick={() => !isPending && onClose()} style={{ color: 'var(--fd-muted)' }} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[min(58vh,420px)] overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <p className="text-lg font-bold" style={{ color: 'var(--fd-text)' }}>{clientName}</p>
            <p className="text-xs font-semibold uppercase tracking-wide mt-1" style={{ color: 'var(--fd-muted)' }}>
              {statusText}
            </p>
          </div>

          {!isScheduled && (
            <div
              className="flex items-start gap-2 rounded-xl px-3 py-3 text-sm"
              style={{ backgroundColor: 'var(--fd-card)', border: '1px solid var(--fd-border)', color: 'var(--fd-muted)' }}
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Only scheduled sessions can be edited or cancelled from the planner.</span>
            </div>
          )}

          {isScheduled && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--fd-muted)' }}>Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full rounded-xl border px-2 py-2 text-sm outline-none"
                    style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)', color: 'var(--fd-text)', colorScheme: 'dark' }}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--fd-muted)' }}>Start time</label>
                  <input
                    type="time"
                    value={time}
                    onChange={e => setTime(e.target.value)}
                    className="w-full rounded-xl border px-2 py-2 text-sm outline-none"
                    style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)', color: 'var(--fd-text)', colorScheme: 'dark' }}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--fd-muted)' }}>Session fee</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={rate}
                  onChange={e => setRate(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                  style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)', color: 'var(--fd-text)', colorScheme: 'dark' }}
                />
              </div>
            </>
          )}

          {error && (
            <p className="text-sm" style={{ color: 'var(--fd-red)' }}>{error}</p>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t px-5 pt-3" style={{ borderColor: 'var(--fd-border)' }}>
          {isScheduled && (
            <>
              <button
                type="button"
                disabled={isPending}
                onClick={handleSave}
                className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold transition-opacity disabled:opacity-40"
                style={{ backgroundColor: '#00C853', color: '#0F1117' }}
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save changes
              </button>
              {canFinalize && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleComplete}
                    className="flex items-center justify-center gap-1.5 rounded-2xl border py-2.5 text-sm font-semibold transition-opacity disabled:opacity-40"
                    style={{ borderColor: 'rgba(0,200,83,0.4)', color: 'var(--fd-green)' }}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Complete
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleMarkNoShow}
                    className="flex items-center justify-center gap-1.5 rounded-2xl border py-2.5 text-sm font-semibold transition-opacity disabled:opacity-40"
                    style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-muted)' }}
                  >
                    <UserX className="h-4 w-4" />
                    No-show
                  </button>
                </div>
              )}
              <button
                type="button"
                disabled={isPending}
                onClick={handleCancelSession}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border py-3 text-sm font-semibold transition-opacity disabled:opacity-40"
                style={{ borderColor: 'rgba(232,92,106,0.35)', color: 'var(--fd-red)' }}
              >
                <Trash2 className="h-4 w-4" />
                Cancel session
              </button>
            </>
          )}
          <button
            type="button"
            disabled={isPending}
            onClick={onClose}
            className="w-full rounded-xl py-2.5 text-sm font-medium"
            style={{ color: 'var(--fd-muted)' }}
          >
            Close
          </button>
        </div>
      </div>
    </>
  )
}
