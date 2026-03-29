'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, CheckCircle2, Clock, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { bookSession, cancelSession, completeSession } from '@/actions/sessions'
import { Avatar } from '@/components/modules/Avatar'
import { Badge } from '@/components/modules/Badge'
import type { BadgeVariant } from '@/components/modules/Badge'
import type { Client, Session, SessionStatus } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterTab = 'upcoming' | 'completed' | 'all'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusVariant(s: SessionStatus): BadgeVariant {
  const map: Record<SessionStatus, BadgeVariant> = {
    scheduled: 'upcoming',
    completed: 'completed',
    missed:    'missed',
    cancelled: 'cancelled',
  }
  return map[s]
}

function filterAndSort(sessions: Session[], tab: FilterTab): Session[] {
  let list: Session[]

  if (tab === 'upcoming') {
    list = sessions.filter(s => s.status === 'scheduled')
    // Nearest session first
    return [...list].sort((a, b) => {
      const ka = a.date + (a.time ?? '00:00')
      const kb = b.date + (b.time ?? '00:00')
      return ka < kb ? -1 : ka > kb ? 1 : 0
    })
  }

  if (tab === 'completed') {
    list = sessions.filter(s => s.status === 'completed')
    // Most recent first (ERP returns desc by default — preserve it)
    return list
  }

  return sessions // 'all' — ERP order (desc)
}

function tabCount(sessions: Session[], tab: FilterTab): number {
  if (tab === 'upcoming')  return sessions.filter(s => s.status === 'scheduled').length
  if (tab === 'completed') return sessions.filter(s => s.status === 'completed').length
  return sessions.length
}

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (dateStr === today.toISOString().slice(0, 10)) return 'Today'
  if (dateStr === tomorrow.toISOString().slice(0, 10)) return 'Tomorrow'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// ─── Book session sheet ───────────────────────────────────────────────────────

interface BookSheetProps {
  isOpen: boolean
  clients: Client[]
  preselectedClientId?: string
  onClose: () => void
  onBooked: () => void
}

function BookSessionSheet({
  isOpen,
  clients,
  preselectedClientId,
  onClose,
  onBooked,
}: BookSheetProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)

    const clientId = fd.get('client_id') as string
    const date     = fd.get('session_date') as string
    const rawTime  = fd.get('session_time') as string
    const rawDur   = fd.get('duration') as string

    if (!clientId) { setError('Select a client'); return }
    if (!date)     { setError('Select a date');   return }

    startTransition(async () => {
      const result = await bookSession({
        client:       clientId,
        session_date: date,
        session_time: rawTime ? `${rawTime}:00` : undefined,
        duration:     rawDur ? Number(rawDur) : undefined,
        notes:        (fd.get('notes') as string) || undefined,
      })

      if (result.success) {
        toast.success('Session booked')
        ;(e.target as HTMLFormElement).reset()
        onBooked()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className={cn(
          'fixed inset-0 z-40 bg-black/60 transition-opacity duration-300',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Book a session"
        className={cn(
          'fixed bottom-0 left-1/2 z-50 w-full max-w-[480px] -translate-x-1/2',
          'rounded-t-3xl border-t transition-transform duration-300',
          isOpen ? 'translate-y-0' : 'translate-y-full',
        )}
        style={{
          backgroundColor: 'var(--fd-surface)',
          borderColor: 'var(--fd-border)',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)',
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pb-2 pt-3">
          <div className="h-1 w-10 rounded-full" style={{ backgroundColor: 'var(--fd-border)' }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-4">
          <h2 className="text-base font-semibold" style={{ color: 'var(--fd-text)' }}>
            Book Session
          </h2>
          <button type="button" onClick={onClose} style={{ color: 'var(--fd-muted)' }}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable form */}
        <div className="max-h-[72vh] overflow-y-auto px-5">
          <form onSubmit={handleSubmit} className="space-y-4 pb-2">

            {/* Client */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                Client *
              </label>
              <select
                name="client_id"
                defaultValue={preselectedClientId ?? ''}
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

            {/* Date + Time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                  Date *
                </label>
                <input
                  name="session_date"
                  type="date"
                  min={today}
                  defaultValue={today}
                  required
                  className="input-base"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                  Time
                </label>
                <input name="session_time" type="time" className="input-base" />
              </div>
            </div>

            {/* Duration */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                Duration
              </label>
              <select name="duration" defaultValue="60" className="input-base">
                <option value="">No duration</option>
                <option value="30">30 min</option>
                <option value="45">45 min</option>
                <option value="60">60 min</option>
                <option value="75">75 min</option>
                <option value="90">90 min</option>
              </select>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                Notes
              </label>
              <textarea
                name="notes"
                rows={2}
                className="input-base resize-none"
                placeholder="Optional session notes"
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
              {isPending ? 'Booking…' : 'Book Session'}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}

// ─── Session card ─────────────────────────────────────────────────────────────

interface SessionCardProps {
  session: Session
  onComplete: (id: string) => void
  onCancel:   (id: string) => void
  isPending:  boolean
}

function SessionCard({ session, onComplete, onCancel, isPending }: SessionCardProps) {
  const isScheduled = session.status === 'scheduled'

  return (
    <div
      className="space-y-3 rounded-2xl border p-4"
      style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
    >
      {/* Header: avatar + client name + status badge */}
      <div className="flex items-center gap-3">
        <Avatar name={session.clientName} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
            {session.clientName}
          </p>

          {/* Date · time · duration · price */}
          <p className="mt-0.5 text-xs" style={{ color: 'var(--fd-muted)' }}>
            {formatDate(session.date)}
            {session.time           && ` · ${session.time}`}
            {session.durationMinutes && ` · ${session.durationMinutes} min`}
            {session.sessionFee      && ` · $${session.sessionFee}`}
          </p>
        </div>
        <Badge variant={statusVariant(session.status)} />
      </div>

      {/* Action buttons — only for scheduled sessions */}
      {isScheduled && (
        <div className="flex gap-2">
          {/* Done / Complete */}
          <button
            onClick={() => onComplete(session.id)}
            disabled={isPending}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-opacity disabled:opacity-50"
            style={{ backgroundColor: 'rgba(78,203,160,0.15)', color: 'var(--fd-green)' }}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Done
          </button>

          {/* Cancel */}
          <button
            onClick={() => onCancel(session.id)}
            disabled={isPending}
            className="flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-opacity disabled:opacity-50"
            style={{ backgroundColor: 'rgba(138,143,168,0.10)', color: 'var(--fd-muted)' }}
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────

const TABS: { id: FilterTab; label: string }[] = [
  { id: 'upcoming',  label: 'Upcoming'  },
  { id: 'completed', label: 'Completed' },
  { id: 'all',       label: 'All'       },
]

// ─── Main component ───────────────────────────────────────────────────────────

interface ScheduleViewProps {
  sessions: Session[]
  clients:  Client[]
  error?:   string
}

export function ScheduleView({ sessions, clients, error }: ScheduleViewProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<FilterTab>('upcoming')
  const [isBooking, setIsBooking]  = useState(false)
  const [pending, startTransition] = useTransition()

  /**
   * Optimistic sessions — safe for complete and cancel because those are
   * simple status updates with no side effects the UI needs to observe.
   * Booking is NOT optimistic because we need the ERP-assigned docname.
   */
  const [optimisticSessions, applyOptimistic] = useOptimistic(
    sessions,
    (state: Session[], update: { id: string; status: SessionStatus }) =>
      state.map(s => (s.id === update.id ? { ...s, status: update.status } : s)),
  )

  const displayed = filterAndSort(optimisticSessions, activeTab)

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleComplete(sessionId: string) {
    startTransition(async () => {
      applyOptimistic({ id: sessionId, status: 'completed' })
      const result = await completeSession(sessionId)
      if (result.success) {
        toast.success('Session marked complete')
        router.refresh() // re-sync server state; optimistic state merges cleanly
      } else {
        toast.error(result.error)
        // useOptimistic reverts automatically when the transition ends
      }
    })
  }

  function handleCancel(sessionId: string) {
    startTransition(async () => {
      applyOptimistic({ id: sessionId, status: 'cancelled' })
      const result = await cancelSession(sessionId)
      if (result.success) {
        toast.success('Session cancelled')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleBooked() {
    setIsBooking(false)
    router.refresh()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 space-y-4">

      {/* Header: count + book button */}
      <div className="flex items-center justify-between">
        <p className="text-base font-semibold" style={{ color: 'var(--fd-muted)' }}>
          {sessions.length} session{sessions.length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={() => setIsBooking(true)}
          className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold"
          style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
        >
          <CalendarPlus className="h-4 w-4" />
          Book
        </button>
      </div>

      {/* Fetch error */}
      {error && (
        <p
          className="rounded-xl border p-3 text-sm"
          style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-red)' }}
        >
          {error}
        </p>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2">
        {TABS.map(tab => {
          const count   = tabCount(optimisticSessions, tab.id)
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors"
              style={{
                backgroundColor: isActive ? 'var(--fd-accent)' : 'var(--fd-card)',
                color:           isActive ? 'var(--fd-bg)'     : 'var(--fd-muted)',
              }}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none"
                  style={{
                    backgroundColor: isActive ? 'rgba(0,0,0,0.20)' : 'rgba(255,255,255,0.07)',
                    color:           isActive ? 'var(--fd-bg)'     : 'var(--fd-muted)',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Session list */}
      {displayed.length === 0 ? (
        <EmptyState tab={activeTab} onBook={() => setIsBooking(true)} />
      ) : (
        <div className="space-y-3">
          {displayed.map(session => (
            <SessionCard
              key={session.id}
              session={session}
              onComplete={handleComplete}
              onCancel={handleCancel}
              isPending={pending}
            />
          ))}
        </div>
      )}

      {/* Book session bottom sheet */}
      <BookSessionSheet
        isOpen={isBooking}
        clients={clients}
        onClose={() => setIsBooking(false)}
        onBooked={handleBooked}
      />
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ tab, onBook }: { tab: FilterTab; onBook: () => void }) {
  const messages: Record<FilterTab, { icon: React.ReactNode; text: string; cta: boolean }> = {
    upcoming: {
      icon: <CalendarPlus className="mx-auto mb-3 h-8 w-8" style={{ color: 'var(--fd-muted)' }} />,
      text: 'No upcoming sessions.',
      cta:  true,
    },
    completed: {
      icon: <CheckCircle2 className="mx-auto mb-3 h-8 w-8" style={{ color: 'var(--fd-muted)' }} />,
      text: 'No completed sessions yet.',
      cta:  false,
    },
    all: {
      icon: <Clock className="mx-auto mb-3 h-8 w-8" style={{ color: 'var(--fd-muted)' }} />,
      text: 'No sessions yet.',
      cta:  true,
    },
  }

  const { icon, text, cta } = messages[tab]

  return (
    <div className="py-10 text-center">
      {icon}
      <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
        {text}
      </p>
      {cta && (
        <button
          onClick={onBook}
          className="mt-3 text-sm font-semibold"
          style={{ color: 'var(--fd-accent)' }}
        >
          Book a session →
        </button>
      )}
    </div>
  )
}
