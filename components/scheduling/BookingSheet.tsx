'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { bookPlanAction, buildPlanAction } from '@/actions/schedulingActions'
import { fetchClientById } from '@/actions/clients'
import { BookingStepper, type BookingStep } from '@/components/scheduling/booking/BookingStepper'
import { BookingClientStep } from '@/components/scheduling/booking/BookingClientStep'
import { BookingDateTimeStep } from '@/components/scheduling/booking/BookingDateTimeStep'
import { BookingPatternStep } from '@/components/scheduling/booking/BookingPatternStep'
import { BookingReviewStep } from '@/components/scheduling/booking/BookingReviewStep'
import { BookingSuccessSheet } from '@/components/scheduling/booking/BookingSuccessSheet'
import { BookingStickyFooter } from '@/components/scheduling/booking/BookingStickyFooter'
import { buildBookingPlan } from '@/lib/scheduling/engine'
import { draftToPlanInput, selectedSlotsToPattern } from '@/lib/scheduling/draft'
import { cn } from '@/lib/utils'
import type { Client } from '@/types'
import type {
  BookingDraft,
  BookingPlan,
  BookingValidity,
  FDSession,
  PackageBalanceState,
  PatternSlot,
  TrainerConfig,
} from '@/types/scheduling'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface BookingSheetProps {
  open:              boolean
  selectedSlots:     Date[]
  clients:           Client[]
  existingSessions:  FDSession[]
  trainerConfig:     TrainerConfig
  initialClientId?:  string
  initialDurationMinutes?: number
  onClose:           () => void
  /** Fired after a successful booking; parent should reconcile its calendar. */
  onBooked:          () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

function dateToLocalSlot(d: Date, timezone: string): { localDate: string; localTime: string } {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const parts = dtf.formatToParts(d)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return {
    localDate: `${get('year')}-${get('month')}-${get('day')}`,
    localTime: `${get('hour').replace('24', '00')}:${get('minute')}`,
  }
}

function todayInTz(timezone: string): string {
  return dateToLocalSlot(new Date(), timezone).localDate
}

function emptyDraft(timezone: string, durationMinutes = 60): BookingDraft {
  return {
    clientId:        null,
    date:            todayInTz(timezone),
    startTime:       '09:00',
    durationMinutes,
    packageOptIn:    true,
    repeatMode:      'one_off',
    recurrenceWeeks: 4,
    patternSlots:    null,
    sessionsPerWeek: null,
    sessionType:     null,
    fee:             null,
    notes:           null,
  }
}

function deriveInitialDraft(props: BookingSheetProps): BookingDraft {
  const { selectedSlots, trainerConfig, initialClientId, initialDurationMinutes } = props
  const duration = initialDurationMinutes ?? 60
  const draft = emptyDraft(trainerConfig.timezone, duration)
  draft.clientId = initialClientId ?? null

  if (selectedSlots.length === 0) return draft

  const sortedSlots = [...selectedSlots].sort((a, b) => a.getTime() - b.getTime())
  const local0 = dateToLocalSlot(sortedSlots[0], trainerConfig.timezone)
  draft.date = local0.localDate
  draft.startTime = local0.localTime

  if (selectedSlots.length === 1) {
    return draft
  }

  // Multi-slot → weekly pattern
  const slots = sortedSlots.map(s => dateToLocalSlot(s, trainerConfig.timezone))
  const pattern = selectedSlotsToPattern(slots, trainerConfig.timezone)
  draft.repeatMode = 'weekly'
  draft.patternSlots = pattern
  draft.sessionsPerWeek = pattern.length >= 1 && pattern.length <= 5
    ? (pattern.length as 1 | 2 | 3 | 4 | 5)
    : null
  return draft
}

function deriveInitialStep(draft: BookingDraft): BookingStep {
  if (!draft.clientId) return 'client'
  return 'datetime'
}

/** Suggest N pattern slots when "sessions per week" jumps and the pattern is empty/short. */
function buildSuggestedPattern(n: number, anchorDate: string, anchorTime: string): PatternSlot[] {
  // Anchor weekday derived from the date in the LOCAL (browser) tz —
  // accurate enough for chip-derived suggestions; the user can edit each row.
  const [y, mo, d] = anchorDate.split('-').map(Number)
  const anchor = new Date(y, mo - 1, d)
  const anchorWd = anchor.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6

  // Distribute N slots across the week, anchored on the start date
  const result: PatternSlot[] = []
  const distribution = (() => {
    switch (n) {
      case 1: return [anchorWd]
      case 2: return [anchorWd, ((anchorWd + 3) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6]
      case 3: return [anchorWd, ((anchorWd + 2) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6, ((anchorWd + 4) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6]
      case 4: return [anchorWd, ((anchorWd + 1) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6, ((anchorWd + 3) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6, ((anchorWd + 4) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6]
      case 5: return [anchorWd, ((anchorWd + 1) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6, ((anchorWd + 2) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6, ((anchorWd + 3) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6, ((anchorWd + 4) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6]
      default: return [anchorWd]
    }
  })()
  for (const wd of distribution) result.push({ weekday: wd, localTime: anchorTime })
  return result
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BookingSheet(props: BookingSheetProps) {
  const { open, clients, existingSessions, trainerConfig, onClose, onBooked } = props

  const [draft, setDraft] = useState<BookingDraft>(() => deriveInitialDraft(props))
  const [step, setStep] = useState<BookingStep>(() => deriveInitialStep(deriveInitialDraft(props)))
  const [successIds, setSuccessIds] = useState<string[] | null>(null)
  const [pkgBalance, setPkgBalance] = useState<PackageBalanceState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Reset every time the sheet (re-)opens
  useEffect(() => {
    if (!open) return
    const d = deriveInitialDraft(props)
    setDraft(d)
    setStep(deriveInitialStep(d))
    setSuccessIds(null)
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Fetch package balance when the client changes
  useEffect(() => {
    if (!draft.clientId) {
      setPkgBalance(null)
      return
    }
    let cancelled = false
    fetchClientById(draft.clientId).then(result => {
      if (cancelled) return
      if (!result.success) {
        setPkgBalance(null)
        return
      }
      const remaining = result.data.remainingSessions
      setPkgBalance(prev => ({
        remainingSessions: remaining ?? null,
        willConsume:       prev?.willConsume ?? 0,
        status:            remaining == null ? 'no_package' : remaining > 3 ? 'ok' : remaining > 0 ? 'low' : 'overdraw',
      }))
    })
    return () => { cancelled = true }
  }, [draft.clientId])

  // ── Client-side preview plan (pure engine) ───────────────────────────────
  const previewPlan: BookingPlan | null = useMemo(() => {
    const input = draftToPlanInput(
      draft,
      trainerConfig,
      existingSessions
        .filter(s => s.status === 'scheduled' || s.status === 'confirmed')
        .map(s => ({ startAt: s.startAt, endAt: s.endAt })),
    )
    if (!input) return null
    return buildBookingPlan(input)
  }, [draft, trainerConfig, existingSessions])

  // Recompute willConsume side of pkg balance whenever plan changes
  useEffect(() => {
    if (!pkgBalance || pkgBalance.remainingSessions == null) return
    const willConsume = previewPlan?.occurrences.length ?? 0
    const remaining = pkgBalance.remainingSessions
    const status: PackageBalanceState['status'] =
      remaining <= 0 || willConsume > remaining ? 'overdraw'
      : remaining <= 3                          ? 'low'
      : 'ok'
    if (pkgBalance.willConsume !== willConsume || pkgBalance.status !== status) {
      setPkgBalance({ remainingSessions: remaining, willConsume, status })
    }
  }, [previewPlan, pkgBalance])

  // ── Validity state machine ──────────────────────────────────────────────
  const validity: BookingValidity = useMemo(() => {
    if (!draft.clientId) return { kind: 'invalid', reason: 'NO_CLIENT' }
    if (!draft.date || !draft.startTime) return { kind: 'invalid', reason: 'NO_TIME' }
    if (draft.repeatMode === 'weekly' && draft.patternSlots && draft.patternSlots.length === 0) {
      return { kind: 'invalid', reason: 'NO_PATTERN' }
    }
    if (!previewPlan || previewPlan.occurrences.length === 0) {
      return { kind: 'invalid', reason: 'EMPTY_PLAN' }
    }
    if (previewPlan.conflicts.length > 0) {
      return { kind: 'blocked', reason: 'CONFLICT', details: `${previewPlan.conflicts.length} conflict(s)` }
    }
    if (previewPlan.outOfHours.length > 0) {
      return { kind: 'blocked', reason: 'OUT_OF_HOURS', details: previewPlan.outOfHours[0].reason }
    }
    if (pkgBalance?.status === 'overdraw') {
      return { kind: 'blocked', reason: 'PACKAGE_OVERDRAW', details: `Will consume ${pkgBalance.willConsume} of ${pkgBalance.remainingSessions ?? 0}` }
    }
    return { kind: 'ready', plan: previewPlan, total: previewPlan.occurrences.length }
  }, [draft, previewPlan, pkgBalance])

  // ── Draft mutation handler with auto-pattern suggestion ─────────────────
  const updateDraft = useCallback((patch: Partial<BookingDraft>) => {
    setDraft(prev => {
      const next: BookingDraft = { ...prev, ...patch }
      // If sessions-per-week chip changed and patternSlots is empty/short, seed it
      if (
        patch.sessionsPerWeek != null &&
        patch.sessionsPerWeek !== prev.sessionsPerWeek &&
        (!prev.patternSlots || prev.patternSlots.length <= 1)
      ) {
        next.patternSlots = buildSuggestedPattern(patch.sessionsPerWeek, next.date, next.startTime)
      }
      // Switching to weekly: ensure pattern exists
      if (patch.repeatMode === 'weekly' && (!prev.patternSlots || prev.patternSlots.length === 0)) {
        const n = next.sessionsPerWeek ?? 1
        next.patternSlots = buildSuggestedPattern(n, next.date, next.startTime)
        next.sessionsPerWeek = (n as 1 | 2 | 3 | 4 | 5)
      }
      // Switching to one_off: drop pattern
      if (patch.repeatMode === 'one_off') {
        next.patternSlots = null
        next.sessionsPerWeek = null
      }
      return next
    })
    setError(null)
  }, [])

  // ── Step navigation ─────────────────────────────────────────────────────
  const hidePattern = draft.repeatMode === 'one_off' && (draft.patternSlots == null || draft.patternSlots.length <= 1)

  function goNext() {
    if (step === 'client')   { setStep('datetime'); return }
    if (step === 'datetime') { setStep(hidePattern ? 'review' : 'pattern'); return }
    if (step === 'pattern')  { setStep('review'); return }
    if (step === 'review')   { void handleSubmit(); return }
  }

  function goBack() {
    if (step === 'datetime') { setStep('client'); return }
    if (step === 'pattern')  { setStep('datetime'); return }
    if (step === 'review')   { setStep(hidePattern ? 'datetime' : 'pattern'); return }
  }

  function jumpTo(target: BookingStep) {
    setStep(target)
  }

  // ── Submit ──────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (validity.kind === 'invalid') return
    if (validity.kind === 'blocked' && validity.reason !== 'PACKAGE_OVERDRAW') return
    if (validity.kind === 'blocked' && validity.reason === 'PACKAGE_OVERDRAW') {
      if (!window.confirm('This will exceed the client\'s package balance. Continue anyway?')) return
    }

    const planInput = draftToPlanInput(
      draft,
      trainerConfig,
      existingSessions
        .filter(s => s.status === 'scheduled' || s.status === 'confirmed')
        .map(s => ({ startAt: s.startAt, endAt: s.endAt })),
    )
    if (!planInput) {
      setError('Plan is empty — pick a time first.')
      return
    }

    startTransition(async () => {
      setError(null)
      const planResult = await buildPlanAction({
        selectedSlots:   planInput.selectedSlots,
        clientId:        planInput.clientId,
        durationMinutes: planInput.durationMinutes,
        recurrenceWeeks: planInput.recurrenceWeeks,
      })
      if (!planResult.success) {
        setError(planResult.message)
        return
      }
      if (!planResult.data.valid) {
        const conflict = planResult.data.conflicts[0]
        const outOfHrs = planResult.data.outOfHours[0]
        setError(
          conflict
            ? `Booking blocked: ${conflict.kind === 'buffer' ? 'violates buffer' : 'overlaps existing session'}`
            : outOfHrs
              ? outOfHrs.reason
              : 'Plan has no valid sessions',
        )
        return
      }
      const bookResult = await bookPlanAction(
        planResult.data,
        draft.fee ?? 0,
        draft.sessionType,
        draft.notes,
      )
      if (!bookResult.success) {
        setError(bookResult.message)
        return
      }
      setSuccessIds(bookResult.data.sessionIds)
      onBooked()
      toast.success(
        bookResult.data.sessionIds.length === 1
          ? 'Session booked'
          : `${bookResult.data.sessionIds.length} sessions booked`,
      )
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────
  if (!open) return null

  const selectedClient = clients.find(c => c.id === draft.clientId) ?? null
  const ctaOverride: string | undefined = (() => {
    if (successIds) return undefined
    if (step === 'client')   return 'Next: Date & Time'
    if (step === 'datetime') return hidePattern ? 'Review & Confirm' : 'Next: Configure Recurrence'
    if (step === 'pattern')  return 'Review & Confirm'
    return undefined // review uses validity-driven label
  })()

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-black/40"
        onClick={() => !isPending && onClose()}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Book session"
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-2xl shadow-2xl',
          'md:inset-y-0 md:right-0 md:left-auto md:bottom-0 md:max-h-none md:w-[480px] md:rounded-none md:rounded-l-2xl',
        )}
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        {/* Header */}
        <header
          className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3"
          style={{ borderColor: 'var(--fd-border)' }}
        >
          <div className="flex flex-1 items-center gap-3">
            <h2 className="text-base font-semibold" style={{ color: 'var(--fd-text)' }}>
              {successIds ? 'Booked' : 'New booking'}
            </h2>
            {!successIds && (
              <BookingStepper step={step} onJump={jumpTo} hidePattern={hidePattern} />
            )}
          </div>
          <button
            type="button"
            onClick={() => !isPending && onClose()}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-[var(--fd-card-hover)]"
            style={{ color: 'var(--fd-muted)' }}
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {successIds && previewPlan ? (
            <BookingSuccessSheet
              plan={previewPlan}
              clientName={selectedClient?.name ?? 'Client'}
              sessionIds={successIds}
              onDone={onClose}
            />
          ) : step === 'client' ? (
            <BookingClientStep
              clients={clients}
              selectedId={draft.clientId}
              packageBalance={pkgBalance}
              onSelect={id => updateDraft({ clientId: id })}
            />
          ) : step === 'datetime' ? (
            <BookingDateTimeStep
              date={draft.date}
              startTime={draft.startTime}
              durationMinutes={draft.durationMinutes}
              repeatMode={draft.repeatMode}
              config={trainerConfig}
              onChange={patch => updateDraft(patch)}
            />
          ) : step === 'pattern' ? (
            <BookingPatternStep
              repeatMode={draft.repeatMode}
              recurrenceWeeks={draft.recurrenceWeeks}
              patternSlots={draft.patternSlots ?? []}
              sessionsPerWeek={draft.sessionsPerWeek}
              durationMinutes={draft.durationMinutes}
              plan={previewPlan}
              onChange={patch => updateDraft(patch)}
            />
          ) : previewPlan ? (
            <BookingReviewStep
              plan={previewPlan}
              client={selectedClient}
              packageBalance={pkgBalance}
              sessionType={draft.sessionType}
              fee={draft.fee}
              notes={draft.notes}
              onChange={patch => updateDraft(patch)}
              onSelectDifferentTime={() => setStep(hidePattern ? 'datetime' : 'pattern')}
            />
          ) : (
            <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
              Pick a date and time to start.
            </p>
          )}

          {error && (
            <p
              className="mt-3 rounded-md border p-2 text-xs"
              style={{
                borderColor: 'color-mix(in srgb, var(--fd-red) 30%, transparent)',
                color: 'var(--fd-red)',
                backgroundColor: 'color-mix(in srgb, var(--fd-red) 6%, transparent)',
              }}
            >
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        {!successIds && (
          <BookingStickyFooter
            validity={validity}
            isPending={isPending}
            cta={ctaOverride}
            onPrimary={goNext}
            onBack={step === 'client' ? undefined : goBack}
          />
        )}
      </aside>
    </>
  )
}
