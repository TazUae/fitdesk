'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { toast } from 'sonner'
import { listFDSessionsAction } from '@/actions/schedulingActions'
import { Avatar } from '@/components/modules/Avatar'
import { BookingPanel } from '@/components/scheduling/BookingPanel'
import { CalendarView, type CalendarSession, type QuickAddRange } from '@/components/scheduling/CalendarView'
import { SchedulerXAdapter } from '@/components/scheduling/SchedulerXAdapter'
import { SchedulerErrorBoundary } from '@/components/scheduling/SchedulerErrorBoundary'
import { QuickAddPopover } from '@/components/scheduling/QuickAddPopover'
import { SessionDetailsSheet } from '@/components/scheduling/SessionDetailsSheet'
import { MobileShell } from '@/components/ui/MobileShell'
import type { Client } from '@/types'
import type { FDSession, TrainerConfig } from '@/types/scheduling'

// ─── Converters ───────────────────────────────────────────────────────────────

function toCalendarSessions(sessions: FDSession[]): CalendarSession[] {
  return sessions.map(s => ({
    id:         s.id,
    clientId:   s.clientId,
    start:      s.startAt,
    end:        s.endAt,
    clientName: s.clientName,
    status:     s.status,
  }))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Next 30-min slot from now within 09:00–20:30 today, or tomorrow 09:00. */
function nextBookableSlot(): Date {
  const d = new Date()
  const mins = d.getHours() * 60 + d.getMinutes()
  const windowStart = 9 * 60
  const windowEnd = 21 * 60 - 30
  if (mins < windowStart) {
    d.setHours(9, 0, 0, 0)
    return d
  }
  if (mins > windowEnd) {
    d.setDate(d.getDate() + 1)
    d.setHours(9, 0, 0, 0)
    return d
  }
  const slot = Math.ceil((mins + 1) / 30) * 30
  const h = Math.floor(slot / 60)
  const m = slot % 60
  d.setHours(h, m, 0, 0)
  return d
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ScheduleViewProps {
  sessions:         FDSession[]
  clients:          Client[]
  trainerConfig:    TrainerConfig
  error?:           string
  /** From `/dashboard/schedule?client=` — opens planner with client pre-selected */
  initialClientId?: string
  /** Phase 3: 'schedulex' renders SchedulerXAdapter instead of CalendarView */
  uiEngine?:        'custom' | 'schedulex'
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ScheduleView({
  sessions,
  clients,
  trainerConfig,
  error,
  initialClientId,
  uiEngine = 'custom',
}: ScheduleViewProps) {
  const [sessionState,       setSessionState]       = useState<FDSession[]>(sessions)
  const [selectedSlots,      setSelectedSlots]      = useState<Date[]>([])
  const [detailSessionId,    setDetailSessionId]    = useState<string | null>(null)
  const [quickAddRange,      setQuickAddRange]      = useState<QuickAddRange | null>(null)
  const [panelDurationHint,  setPanelDurationHint]  = useState<number | undefined>(undefined)

  const detailSession = useMemo(
    () => (detailSessionId ? sessionState.find(s => s.id === detailSessionId) ?? null : null),
    [detailSessionId, sessionState],
  )

  useEffect(() => { setSessionState(sessions) }, [sessions])

  useEffect(() => {
    if (detailSessionId && !detailSession) setDetailSessionId(null)
  }, [detailSessionId, detailSession])

  const calendarSessions = useMemo(
    () => toCalendarSessions(sessionState),
    [sessionState],
  )

  // ─── Reconcile ──────────────────────────────────────────────────────────────

  const reconcile = useCallback(async () => {
    const r = await listFDSessionsAction()
    if (r.success) setSessionState(r.data)
    else toast.error(r.message)
  }, [])

  // ─── Event handlers ─────────────────────────────────────────────────────────

  function handleBooked() {
    void reconcile()
  }

  function handleDismissPanel() {
    setSelectedSlots([])
    setPanelDurationHint(undefined)
  }

  function handleRangeSelect(range: QuickAddRange) {
    setSelectedSlots([])
    setQuickAddRange(range)
  }

  function handleQuickAddBooked() {
    void reconcile()
  }

  function handleCloseQuickAdd() {
    setQuickAddRange(null)
  }

  /** QuickAdd → "More options": promote range into BookingPanel (one slot + hint duration). */
  function handleQuickAddMoreOptions(range: QuickAddRange) {
    const [y, mo, d] = range.date.split('-').map(Number)
    const [h, m]     = range.startTime.split(':').map(Number)
    const startDate  = new Date(y, mo - 1, d, h, m, 0, 0)

    const endMin   = parseInt(range.endTime.slice(0, 2), 10) * 60 + parseInt(range.endTime.slice(3), 10)
    const startMin = h * 60 + m

    setQuickAddRange(null)
    setSelectedSlots([startDate])
    setPanelDurationHint(endMin - startMin)
  }

  function handleSessionClick(cal: CalendarSession) {
    if (!cal.id) return
    if (sessionState.some(s => s.id === cal.id)) {
      setDetailSessionId(cal.id)
    }
  }

  function handleClose() {
    setDetailSessionId(null)
  }

  function handleOptimisticReplace(next: FDSession) {
    setSessionState(prev => {
      const i = prev.findIndex(s => s.id === next.id)
      if (i === -1) return [...prev, next]
      const copy = [...prev]
      copy[i] = next
      return copy
    })
  }

  function handleOptimisticRemove(id: string) {
    setSessionState(prev => prev.filter(s => s.id !== id))
  }

  const isDetailOpen = detailSession !== null

  return (
    <div
      className="min-h-full pb-24 pt-5"
      style={{
        background:
          'radial-gradient(140% 100% at 50% -8%, rgba(94,127,255,0.22) 0%, rgba(12,15,24,0) 45%), linear-gradient(180deg, rgba(10,13,21,0.98) 0%, rgba(7,10,17,0.98) 100%)',
      }}
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-0 lg:flex-row lg:items-start lg:justify-center lg:px-4">
        <MobileShell
          stickyHeader={(
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em]" style={{ color: 'rgba(182,192,218,0.75)' }}>
                  FitDesk
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: 'var(--fd-text)' }}>
                  Planner
                </h1>
              </div>
              <div className="rounded-full border p-1" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
                <Avatar name="Trainer" size="sm" />
              </div>
            </div>
          )}
        >
          <div
            className="rounded-[28px] border px-3 pb-4 pt-2 backdrop-blur-2xl lg:px-4"
            style={{
              borderColor: 'rgba(255,255,255,0.12)',
              background: 'linear-gradient(180deg, rgba(19,24,38,0.72) 0%, rgba(13,17,28,0.78) 100%)',
              boxShadow: '0 28px 70px rgba(6,9,18,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
            }}
          >
            {(() => {
              const legacyCalendar = (
                <CalendarView
                  sessions={calendarSessions}
                  weekOnly
                  selectedSlots={selectedSlots}
                  onSlotsChange={setSelectedSlots}
                  onSessionClick={handleSessionClick}
                  onRangeSelect={handleRangeSelect}
                />
              )
              if (uiEngine !== 'schedulex') return legacyCalendar
              return (
                <SchedulerErrorBoundary fallback={legacyCalendar}>
                  <SchedulerXAdapter
                    sessions={calendarSessions}
                    rawSessions={sessionState}
                    selectedSlots={selectedSlots}
                    onSlotsChange={setSelectedSlots}
                    onSessionClick={handleSessionClick}
                    onRangeSelect={handleRangeSelect}
                    onOptimisticReplace={handleOptimisticReplace}
                    onReconcile={reconcile}
                    timezone={trainerConfig.timezone}
                  />
                </SchedulerErrorBoundary>
              )
            })()}
          </div>

          <p className="mt-3 text-xs" style={{ color: 'var(--fd-muted)' }}>
            Tap empty cells to book. Tap a session to edit or cancel.
          </p>
        </MobileShell>

        {selectedSlots.length > 0 && (
          <BookingPanel
            selectedSlots={selectedSlots}
            clients={clients}
            existingSessions={sessionState}
            initialClientId={initialClientId}
            initialDurationMinutes={panelDurationHint}
            trainerConfig={trainerConfig}
            onDismiss={handleDismissPanel}
            onBooked={handleBooked}
          />
        )}
      </div>

      {quickAddRange && (
        <QuickAddPopover
          range={quickAddRange}
          clients={clients}
          trainerConfig={trainerConfig}
          initialClientId={initialClientId}
          onClose={handleCloseQuickAdd}
          onBooked={handleQuickAddBooked}
          onMoreOptions={handleQuickAddMoreOptions}
        />
      )}

      {error && (
        <p
          className="mx-auto mt-4 max-w-[420px] rounded-xl border p-3 text-sm px-4"
          style={{ borderColor: 'rgba(232,92,106,0.45)', color: 'var(--fd-red)', background: 'rgba(232,92,106,0.08)' }}
        >
          {error}
        </p>
      )}

      <SessionDetailsSheet
        session={detailSession}
        isOpen={isDetailOpen}
        onClose={handleClose}
        onOptimisticReplace={handleOptimisticReplace}
        onOptimisticRemove={handleOptimisticRemove}
        onReconcile={reconcile}
      />

      <button
        type="button"
        onClick={() => {
          const slot = nextBookableSlot()
          setSelectedSlots(prev => {
            const exists = prev.some(s => s.getTime() === slot.getTime())
            if (exists) return prev
            return [...prev, slot]
          })
        }}
        aria-label="Add suggested slot"
        className="fixed bottom-6 right-6 z-20 flex h-14 w-14 items-center justify-center rounded-full border shadow-2xl transition-transform hover:scale-105 active:scale-95"
        style={{
          borderColor: 'rgba(255,255,255,0.20)',
          background: 'linear-gradient(180deg, rgba(76,145,255,0.98) 0%, rgba(50,114,245,0.96) 100%)',
          color: 'white',
          boxShadow: '0 18px 38px rgba(42,98,232,0.5), 0 0 0 6px rgba(70,131,255,0.16), inset 0 1px 0 rgba(255,255,255,0.35)',
        }}
      >
        <CalendarPlus className="h-7 w-7" />
      </button>
    </div>
  )
}
