'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { AlertTriangle, CalendarDays, CheckCircle2, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { buildPlanAction, bookPlanAction } from '@/actions/schedulingActions'
import { fetchClientById } from '@/actions/clients'
import { SmartClientPicker } from '@/components/clients/SmartClientPicker'
import { SessionPreviewByWeek } from '@/components/scheduling/SessionPreviewByWeek'
import { buildBookingPlan } from '@/lib/scheduling/engine'
import { scheduleTokens } from '@/lib/ui/scheduleDesignTokens'
import { cn } from '@/lib/utils'
import { downloadICS, icsDataUri, isIOS, googleCalendarUrl, type CalendarEvent } from '@/utils/calendar'
import type { Client } from '@/types'
import type { FDSession, TrainerConfig } from '@/types/scheduling'

const DURATION_WEEKS_OPTIONS = [2, 4, 8] as const
const SESSION_DURATIONS = [30, 45, 60, 90] as const
const SESSION_TYPES = ['Strength', 'Cardio', 'Rehab', 'Mobility', 'Flexibility'] as const

const WEEKDAY_LABELS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

/** Convert a JS Date to {localDate, localTime} in the given IANA timezone. */
function dateToLocalSlot(d: Date, timezone: string): { localDate: string; localTime: string } {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const parts = dtf.formatToParts(d)
  const get   = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return {
    localDate: `${get('year')}-${get('month')}-${get('day')}`,
    localTime: `${get('hour').replace('24', '00')}:${get('minute')}`,
  }
}

function formatPreviewStart(d: Date): string {
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
}

/** Weekly pattern chips: unique weekday+time pairs across selected slots. */
function deriveWeeklyPattern(slots: Date[]): Array<{ day: string; time: string }> {
  const seen = new Map<string, { day: string; time: string }>()
  for (const d of slots) {
    const day = WEEKDAY_LABELS[d.getDay()]
    const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    const key = `${day}:${time}`
    if (!seen.has(key)) seen.set(key, { day, time })
  }
  return [...seen.values()]
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--fd-muted)' }}>
      {children}
    </p>
  )
}

function Chip({
  active, onClick, children, disabled,
}: { active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-xl border px-3.5 py-2 text-sm font-medium transition-all active:scale-[0.97] disabled:opacity-40"
      style={active ? {
        backgroundColor: 'rgba(78,203,160,0.12)',
        borderColor: 'var(--fd-green)',
        color: 'var(--fd-green)',
      } : {
        backgroundColor: 'var(--fd-surface)',
        borderColor: 'var(--fd-border)',
        color: 'var(--fd-muted)',
      }}
    >
      {children}
    </button>
  )
}

export interface BookingPanelProps {
  selectedSlots:     Date[]
  clients:           Client[]
  existingSessions:  FDSession[]
  trainerConfig:     TrainerConfig
  onDismiss:         () => void
  /** Called after a successful booking so the parent can reconcile its calendar. */
  onBooked:          () => void
  /** Deep-link from client profile / onboarding — pre-selects client in picker */
  initialClientId?:  string
  /** Pre-fills session length when opened from QuickAdd "More options". */
  initialDurationMinutes?: number
}

export function BookingPanel({
  selectedSlots,
  clients,
  existingSessions,
  trainerConfig,
  onDismiss,
  onBooked,
  initialClientId,
  initialDurationMinutes,
}: BookingPanelProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [remainingSessions, setRemainingSessions] = useState<number | undefined>(undefined)
  const [bookedEvent, setBookedEvent] = useState<CalendarEvent | null>(null)

  const [clientId, setClientId] = useState(initialClientId ?? '')
  const [sessionDuration, setSessionDuration] = useState<number>(initialDurationMinutes ?? 60)
  const [durationWeeks, setDurationWeeks] = useState<number>(4)
  /** One slot: one-time vs weekly repeat. Multiple slots: weekly pattern only. */
  const [singleMode, setSingleMode] = useState<'one_time' | 'repeat'>('one_time')
  const [sessionType, setSessionType] = useState('')
  const [fee, setFee] = useState('')

  useEffect(() => {
    if (initialClientId) setClientId(initialClientId)
  }, [initialClientId])

  const weeklyPattern = useMemo(() => deriveWeeklyPattern(selectedSlots), [selectedSlots])
  const sessionsPerWeek = weeklyPattern.length

  const isMultiSlot = selectedSlots.length > 1
  const isRecurringPattern = isMultiSlot || singleMode === 'repeat'

  useEffect(() => {
    if (!clientId) {
      setRemainingSessions(undefined)
      return
    }
    fetchClientById(clientId).then(result => {
      setRemainingSessions(result.success ? result.data.remainingSessions : undefined)
    })
  }, [clientId])

  // ── Client-side preview plan ─────────────────────────────────────────────────
  // Pure engine; server rebuilds and re-validates on submit.
  const bookingPlan = useMemo(() => {
    const localSlots = selectedSlots.map(d => dateToLocalSlot(d, trainerConfig.timezone))
    const existingIntervals = existingSessions
      .filter(s => s.status === 'scheduled' || s.status === 'confirmed')
      .map(s => ({ startAt: s.startAt, endAt: s.endAt }))

    return buildBookingPlan({
      selectedSlots:    localSlots,
      trainerId:        trainerConfig.trainerId,
      clientId:         clientId || '',
      durationMinutes:  sessionDuration,
      timezone:         trainerConfig.timezone,
      recurrenceWeeks:  isRecurringPattern ? durationWeeks : null,
      config:           trainerConfig,
      existingSessions: existingIntervals,
    })
  }, [selectedSlots, trainerConfig, clientId, sessionDuration, isRecurringPattern, durationWeeks, existingSessions])

  const sessionCount = bookingPlan.occurrences.length

  const previewRows = useMemo(
    () => bookingPlan.occurrences.map(o => ({ start: o.startAt })),
    [bookingPlan.occurrences],
  )

  const conflictStartTimes = useMemo(
    () => new Set(bookingPlan.conflicts.map(c => c.occurrence.startAt.getTime())),
    [bookingPlan.conflicts],
  )

  const hasBlockingConflict = bookingPlan.conflicts.length > 0
  const conflictKindLabel = bookingPlan.conflicts[0]?.kind
  const outOfHoursReason = bookingPlan.outOfHours[0]?.reason

  const isValid =
    !!clientId &&
    selectedSlots.length > 0 &&
    bookingPlan.valid

  function handleSubmit() {
    if (!isValid) return
    setError(null)
    const rate = fee ? parseFloat(fee) : 0

    startTransition(async () => {
      const slots = selectedSlots.map(d => dateToLocalSlot(d, trainerConfig.timezone))

      const planResult = await buildPlanAction({
        selectedSlots:   slots,
        clientId,
        durationMinutes: sessionDuration,
        recurrenceWeeks: isRecurringPattern ? durationWeeks : null,
      })

      if (!planResult.success) {
        setError(planResult.message)
        return
      }

      if (!planResult.data.valid) {
        const conflict = planResult.data.conflicts[0]
        const outOfHrs = planResult.data.outOfHours[0]
        setError(
          conflict  ? `Booking blocked: occurrence ${conflict.kind === 'buffer' ? 'violates buffer' : 'overlaps existing session'}` :
          outOfHrs  ? outOfHrs.reason :
          'Plan has no valid sessions',
        )
        return
      }

      const bookResult = await bookPlanAction(
        planResult.data,
        rate,
        sessionType || null,
        null,
      )

      if (!bookResult.success) {
        setError(bookResult.message)
        return
      }

      const count      = bookResult.data.sessionIds.length
      const clientName = clients.find(c => c.id === clientId)?.name ?? 'Client'
      const firstOcc   = planResult.data.occurrences[0]

      onBooked()

      if (count === 1 && firstOcc) {
        const event: CalendarEvent = {
          id:    bookResult.data.sessionIds[0],
          title: `PT Session – ${clientName}`,
          start: firstOcc.startAt,
          end:   new Date(firstOcc.startAt.getTime() + sessionDuration * 60_000),
        }
        downloadICS(event, `session-${firstOcc.localDate}.ics`)
        setBookedEvent(event)
        toast.success('Session booked')
      } else {
        if (firstOcc) {
          const ev: CalendarEvent = {
            id:    bookResult.data.sessionIds[0] ?? '',
            title: `PT Session – ${clientName}`,
            start: firstOcc.startAt,
            end:   new Date(firstOcc.startAt.getTime() + sessionDuration * 60_000),
          }
          downloadICS(ev, `sessions-${firstOcc.localDate}.ics`)
        }
        toast.success(`${count} sessions booked`)
        onDismiss()
      }
    })
  }

  function handleSuccessDone() {
    setBookedEvent(null)
    onDismiss()
  }

  const slotSummary = useMemo(() => {
    return [...selectedSlots]
      .sort((a, b) => a.getTime() - b.getTime())
      .map(d => formatPreviewStart(d))
  }, [selectedSlots])

  return (
    <aside
      className={cn(
        'flex max-h-[88vh] flex-col border shadow-2xl lg:max-h-[min(720px,calc(100vh-6rem))]',
        'fixed inset-x-0 bottom-0 z-40 rounded-t-2xl lg:sticky lg:top-4 lg:max-w-[400px] lg:rounded-2xl',
      )}
      style={{
        borderColor: scheduleTokens.borderStrong,
        backgroundColor: 'var(--fd-surface)',
        borderRadius: scheduleTokens.radiusXl,
        boxShadow: scheduleTokens.shadowCard,
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)',
      }}
    >
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--fd-border)' }}>
        <h2 className="text-base font-semibold" style={{ color: 'var(--fd-text)' }}>
          Book session
        </h2>
        <button type="button" onClick={onDismiss} aria-label="Close" style={{ color: 'var(--fd-muted)' }}>
          <X className="h-5 w-5" />
        </button>
      </div>

      {bookedEvent && (
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          <div className="flex flex-col items-center gap-3 text-center">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full"
              style={{ backgroundColor: 'rgba(78,203,160,0.15)' }}
            >
              <CheckCircle2 className="h-8 w-8" style={{ color: 'var(--fd-green)' }} />
            </div>
            <p className="text-base font-semibold" style={{ color: 'var(--fd-text)' }}>
              Session booked
            </p>
            <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>{bookedEvent.title}</p>
            <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
              Open the downloaded file to add to your calendar.
            </p>
          </div>
          <div className="space-y-2">
            {isIOS() ? (
              <a
                href={icsDataUri(bookedEvent)}
                download={`session-${bookedEvent.start.toISOString().slice(0, 10)}.ics`}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border py-3.5 text-sm font-semibold"
                style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-text)', backgroundColor: 'var(--fd-card)' }}
              >
                <CalendarDays className="h-4 w-4" />
                Add to Calendar (ICS)
              </a>
            ) : (
              <button
                type="button"
                onClick={() => downloadICS(bookedEvent, `session-${bookedEvent.start.toISOString().slice(0, 10)}.ics`)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border py-3.5 text-sm font-semibold"
                style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-text)', backgroundColor: 'var(--fd-card)' }}
              >
                <CalendarDays className="h-4 w-4" />
                Add to Calendar (ICS)
              </button>
            )}
            <a
              href={googleCalendarUrl(bookedEvent)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-2xl border py-3.5 text-sm font-semibold"
              style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-text)', backgroundColor: 'var(--fd-card)' }}
            >
              Add to Google Calendar
            </a>
            <button
              type="button"
              onClick={handleSuccessDone}
              className="w-full rounded-2xl py-4 text-sm font-bold"
              style={{ backgroundColor: '#00C853', color: '#0F1117' }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {!bookedEvent && (
        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <div
            className="space-y-3 rounded-xl border p-3.5"
            style={{
              borderColor: 'rgba(94,127,255,0.35)',
              background: 'linear-gradient(145deg, rgba(94,127,255,0.12) 0%, rgba(19,24,38,0.55) 100%)',
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--fd-muted)' }}>Total sessions</p>
                <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--fd-text)' }}>{sessionCount}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--fd-muted)' }}>Duration</p>
                <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--fd-text)' }}>{sessionDuration} min</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--fd-muted)' }}>Recurrence</p>
                <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--fd-text)' }}>
                  {isRecurringPattern ? `${durationWeeks} weeks` : 'One-time'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--fd-muted)' }}>Per week</p>
                <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--fd-text)' }}>{sessionsPerWeek || '—'}</p>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--fd-muted)' }}>Weekly pattern</p>
              <div className="flex flex-wrap gap-1">
                {weeklyPattern.length === 0 ? (
                  <span className="text-xs" style={{ color: 'var(--fd-muted)' }}>Select slots on the planner</span>
                ) : (
                  weeklyPattern.map(p => (
                    <span
                      key={`${p.day}-${p.time}`}
                      className="rounded-lg border px-2 py-1 text-[11px] font-bold"
                      style={{
                        borderColor: 'rgba(78,203,160,0.35)',
                        backgroundColor: 'rgba(78,203,160,0.10)',
                        color: 'var(--fd-green)',
                      }}
                    >
                      {p.day.toUpperCase()} {p.time}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <SectionLabel>Calendar selection</SectionLabel>
            <ul className="space-y-1 rounded-xl border p-3 text-sm" style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)' }}>
              {slotSummary.map((line, i) => (
                <li key={i} style={{ color: 'var(--fd-text)' }}>{line}</li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <SectionLabel>Client</SectionLabel>
            <SmartClientPicker
              clients={clients}
              selectedId={clientId}
              remainingSessions={remainingSessions}
              onSelect={id => { setClientId(id); setError(null) }}
            />
          </div>

          <div className="space-y-2">
            <SectionLabel>Session length</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {SESSION_DURATIONS.map(min => (
                <button
                  key={min}
                  type="button"
                  onClick={() => { setSessionDuration(min); setError(null) }}
                  className="rounded-xl border px-3 py-2 text-xs font-semibold"
                  style={sessionDuration === min ? {
                    backgroundColor: 'rgba(78,203,160,0.12)',
                    borderColor: 'var(--fd-green)',
                    color: 'var(--fd-green)',
                  } : {
                    backgroundColor: 'var(--fd-surface)',
                    borderColor: 'var(--fd-border)',
                    color: 'var(--fd-muted)',
                  }}
                >
                  {min}m
                </button>
              ))}
            </div>
          </div>

          {!isMultiSlot && (
            <div className="space-y-2">
              <SectionLabel>Repeat</SectionLabel>
              <div className="flex gap-2">
                <Chip active={singleMode === 'one_time'} onClick={() => setSingleMode('one_time')}>
                  One-time
                </Chip>
                <Chip active={singleMode === 'repeat'} onClick={() => setSingleMode('repeat')}>
                  Weekly
                </Chip>
              </div>
            </div>
          )}

          {isRecurringPattern && (
            <div className="space-y-2">
              <SectionLabel>Duration (weeks)</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {DURATION_WEEKS_OPTIONS.map(w => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setDurationWeeks(w)}
                    className="rounded-xl border px-3 py-2 text-xs font-semibold"
                    style={durationWeeks === w ? {
                      backgroundColor: 'rgba(78,203,160,0.15)',
                      borderColor: 'var(--fd-green)',
                      color: 'var(--fd-green)',
                    } : {
                      backgroundColor: 'var(--fd-surface)',
                      borderColor: 'var(--fd-border)',
                      color: 'var(--fd-muted)',
                    }}
                  >
                    {w} weeks
                  </button>
                ))}
              </div>
              {sessionCount > 0 && bookingPlan.valid && (
                <p className="text-xs font-medium" style={{ color: 'var(--fd-green)' }}>
                  {sessionCount} sessions over {durationWeeks} weeks
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <SectionLabel>Full preview (by week)</SectionLabel>
            <SessionPreviewByWeek
              sessions={previewRows}
              conflictTimes={conflictStartTimes}
              maxHeightClass="max-h-56"
            />
            <p className="text-[10px] leading-snug" style={{ color: 'var(--fd-muted)' }}>
              Book is blocked if any row conflicts with the calendar (includes {trainerConfig.bufferMinutes} min buffer). Same check on the server.
            </p>
          </div>

          <div className="space-y-2">
            <SectionLabel>Session type</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {SESSION_TYPES.map(type => (
                <Chip
                  key={type}
                  active={sessionType === type}
                  onClick={() => setSessionType(sessionType === type ? '' : type)}
                >
                  {type}
                </Chip>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <SectionLabel>Session fee</SectionLabel>
            <div
              className="flex items-center gap-2 rounded-xl border px-3.5 py-3"
              style={{ backgroundColor: 'var(--fd-card)', borderColor: 'var(--fd-border)' }}
            >
              <span className="text-sm" style={{ color: 'var(--fd-muted)' }}>Fee</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={fee}
                onChange={e => setFee(e.target.value)}
                placeholder="0.00"
                className="ml-auto w-24 bg-transparent text-right text-sm outline-none"
                style={{ color: 'var(--fd-text)', colorScheme: 'dark' }}
              />
            </div>
          </div>

          {outOfHoursReason && (
            <div
              className="flex items-start gap-2 rounded-xl px-3.5 py-3 text-sm"
              style={{
                backgroundColor: 'rgba(232,92,106,0.08)',
                border: '1px solid rgba(232,92,106,0.3)',
                color: 'var(--fd-red)',
              }}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{outOfHoursReason}</span>
            </div>
          )}

          {hasBlockingConflict && (
            <div
              className="flex items-start gap-2 rounded-xl px-3.5 py-3 text-sm"
              style={{
                backgroundColor: 'rgba(232,92,106,0.08)',
                border: '1px solid rgba(232,92,106,0.3)',
                color: 'var(--fd-red)',
              }}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {bookingPlan.conflicts.length === 1
                  ? conflictKindLabel === 'buffer'
                    ? `Booking blocked: not enough gap (${trainerConfig.bufferMinutes} min buffer) on one occurrence.`
                    : 'Booking blocked: one occurrence overlaps an existing session.'
                  : `Booking blocked: ${bookingPlan.conflicts.length} occurrences conflict with the calendar (overlap or buffer).`}
              </span>
            </div>
          )}

          {error && <p className="text-sm" style={{ color: 'var(--fd-red)' }}>{error}</p>}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || isPending}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold transition-opacity disabled:opacity-40"
            style={{ backgroundColor: '#00C853', color: '#0F1117' }}
          >
            {isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Booking…</>
            ) : sessionCount > 1 ? (
              `Book ${sessionCount} sessions`
            ) : (
              'Book session'
            )}
          </button>
        </div>
      )}
    </aside>
  )
}
