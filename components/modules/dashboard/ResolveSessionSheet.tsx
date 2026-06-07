'use client'

import { useState, useTransition, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  CheckCircle2,
  Loader2,
  Trash2,
  UserX,
  X,
  CalendarClock,
  ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import {
  completeSessionAction,
  cancelSessionAction,
  markNoShowAction,
} from '@/actions/schedulingActions'
import { cn } from '@/lib/utils'
import type { SessionResolvable } from '@/lib/dashboard/derive'

interface Props {
  session: SessionResolvable | null
  isOpen:  boolean
  onClose: () => void
}

function fmtLocalTime(isoStr: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour:     'numeric',
      minute:   '2-digit',
      hour12:   true,
    }).format(new Date(isoStr))
  } catch {
    return isoStr.slice(11, 16)
  }
}

function fmtLocalDate(isoStr: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday:  'short',
      month:    'short',
      day:      'numeric',
    }).format(new Date(isoStr))
  } catch {
    return isoStr.slice(0, 10)
  }
}

export function ResolveSessionSheet({ session, isOpen, onClose }: Props) {
  const router                    = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError]         = useState<string | null>(null)
  const [mounted, setMounted]     = useState(false)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { if (!isOpen) setError(null) }, [isOpen])

  if (!session || !mounted) return null

  // Package clients: Complete is not supported (PackageCompletionNotReadyError).
  // Approved decision: hide Complete entirely for Package clients in this MVP.
  const isPackage     = session.billingMode === 'Package'
  const canComplete   = !isPackage

  function handleComplete() {
    if (!session || !canComplete) return
    setError(null)
    startTransition(async () => {
      const result = await completeSessionAction(session.id, session.version)
      if (result.success) {
        toast.success('Session marked complete')
        router.refresh()
        onClose()
      } else {
        setError(result.message)
        toast.error(result.message)
      }
    })
  }

  function handleNoShow() {
    if (!session) return
    setError(null)
    startTransition(async () => {
      const result = await markNoShowAction(session.id, session.version)
      if (result.success) {
        toast.success('Session marked no-show')
        router.refresh()
        onClose()
      } else {
        setError(result.message)
        toast.error(result.message)
      }
    })
  }

  function handleCancel() {
    if (!session) return
    if (!window.confirm('Cancel this session?')) return
    setError(null)
    startTransition(async () => {
      const result = await cancelSessionAction(session.id, session.version)
      if (result.success) {
        toast.success('Session cancelled')
        router.refresh()
        onClose()
      } else {
        setError(result.message)
        toast.error(result.message)
      }
    })
  }

  const startLabel = fmtLocalTime(session.startAtISO, session.timezone)
  const endLabel   = fmtLocalTime(session.endAtISO,   session.timezone)
  const dateLabel  = fmtLocalDate(session.startAtISO, session.timezone)

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className={cn(
          'fixed inset-0 z-[60] backdrop-blur-[2px] transition-opacity duration-200',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        style={{ backgroundColor: 'rgba(15,23,42,0.55)' }}
        onClick={() => !isPending && onClose()}
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Resolve session"
        className={cn(
          'fixed bottom-0 left-1/2 z-[70] flex max-h-[min(80vh,560px)] w-full max-w-[480px] -translate-x-1/2 flex-col overflow-hidden',
          'rounded-t-[28px] border-t shadow-2xl transition-transform duration-200',
          'md:inset-y-0 md:right-0 md:left-auto md:bottom-0 md:max-h-none md:w-[520px] md:max-w-[92vw]',
          'md:translate-x-0 md:rounded-none md:rounded-l-2xl md:border-l md:border-t-0',
          isOpen ? 'translate-y-0 md:translate-x-0' : 'translate-y-full md:translate-x-full',
        )}
        style={{
          backgroundColor: 'var(--fd-surface)',
          borderColor:     'var(--fd-border)',
          paddingBottom:   'calc(env(safe-area-inset-bottom) + 1rem)',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pb-2 pt-3 md:hidden">
          <div className="h-1 w-10 rounded-full" style={{ backgroundColor: 'var(--fd-border)' }} />
        </div>

        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-5 pb-3"
          style={{ borderColor: 'var(--fd-border)' }}
        >
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 shrink-0" style={{ color: 'var(--fd-accent)' }} />
            <h2 className="text-base font-semibold" style={{ color: 'var(--fd-text)' }}>
              Resolve Session
            </h2>
          </div>
          <button
            type="button"
            onClick={() => !isPending && onClose()}
            className="flex h-11 w-11 items-center justify-center rounded-full"
            style={{ color: 'var(--fd-muted)' }}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Session info */}
          <div>
            <p className="text-lg font-bold" style={{ color: 'var(--fd-text)' }}>
              {session.clientName}
            </p>
            <p className="mt-0.5 text-sm" style={{ color: 'var(--fd-muted)' }}>
              {dateLabel} · {startLabel} – {endLabel}
            </p>
            {session.rate > 0 && (
              <p className="mt-0.5 text-sm font-medium" style={{ color: 'var(--fd-text)' }}>
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(session.rate)}
              </p>
            )}
          </div>

          {/* Package notice */}
          {isPackage && (
            <div
              className="rounded-xl px-3 py-3 text-sm"
              style={{
                backgroundColor: 'rgba(232,197,71,0.1)',
                border:          '1px solid rgba(232,197,71,0.3)',
                color:           'var(--fd-muted)',
              }}
            >
              This is a package session. Mark complete from the{' '}
              <a href="/dashboard/schedule" className="font-semibold" style={{ color: 'var(--fd-accent)' }}>
                Schedule
              </a>{' '}
              when package billing is ready.
            </div>
          )}

          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm" style={{ color: 'var(--fd-red)' }}>
              {error}
            </p>
          )}
        </div>

        {/* Actions */}
        <div
          className="flex flex-col gap-2 border-t px-5 pt-3"
          style={{ borderColor: 'var(--fd-border)' }}
        >
          {/* Complete — hidden for Package clients */}
          {canComplete && (
            <button
              type="button"
              disabled={isPending}
              onClick={handleComplete}
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold transition-opacity disabled:opacity-40"
              style={{ backgroundColor: 'var(--fd-green)', color: '#fff' }}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Mark complete
            </button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={handleNoShow}
              className="flex items-center justify-center gap-1.5 rounded-2xl border py-2.5 text-sm font-semibold transition-opacity disabled:opacity-40"
              style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-muted)' }}
            >
              <UserX className="h-4 w-4" />
              No-show
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={handleCancel}
              className="flex items-center justify-center gap-1.5 rounded-2xl border py-2.5 text-sm font-semibold transition-opacity disabled:opacity-40"
              style={{ borderColor: 'rgba(232,92,106,0.35)', color: 'var(--fd-red)' }}
            >
              <Trash2 className="h-4 w-4" />
              Cancel
            </button>
          </div>

          {/* Open in Schedule for rescheduling */}
          <a
            href="/dashboard/schedule"
            className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
            style={{ color: 'var(--fd-muted)' }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open in Schedule to reschedule
          </a>

          <button
            type="button"
            disabled={isPending}
            onClick={onClose}
            className="w-full rounded-xl py-2 text-sm font-medium"
            style={{ color: 'var(--fd-muted)' }}
          >
            Close
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
}
