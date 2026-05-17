'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { listFDSessionsAction } from '@/actions/schedulingActions'
import { BookingSheet } from '@/components/scheduling/BookingSheet'
import { SchedulerXAdapter } from '@/components/scheduling/SchedulerXAdapter'
import { SchedulerErrorBoundary } from '@/components/scheduling/SchedulerErrorBoundary'
import { SelectionTray } from '@/components/scheduling/SelectionTray'
import { SessionDetailsSheet } from '@/components/scheduling/SessionDetailsSheet'
import { PlannerShell } from '@/components/scheduling/PlannerShell'
import { nextAvailableSlot } from '@/lib/scheduling/draft'
import type { Client } from '@/types'
import type { CalendarSession, FDSession, QuickAddRange, TrainerConfig } from '@/types/scheduling'

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

/** Convert nextAvailableSlot's (localDate, localTime) result to a JS Date in browser-local time. */
function localSlotToDate(localDate: string, localTime: string): Date {
  const [y, mo, d] = localDate.split('-').map(Number)
  const [h, m]     = localTime.split(':').map(Number)
  return new Date(y, mo - 1, d, h, m, 0, 0)
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ScheduleViewProps {
  sessions:         FDSession[]
  clients:          Client[]
  trainerConfig:    TrainerConfig
  error?:           string
  /** From `/dashboard/schedule?client=` — opens planner with client pre-selected. */
  initialClientId?: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ScheduleView({
  sessions,
  clients,
  trainerConfig,
  error,
  initialClientId,
}: ScheduleViewProps) {
  const [sessionState,      setSessionState]      = useState<FDSession[]>(sessions)
  const [selectedSlots,     setSelectedSlots]     = useState<Date[]>([])
  const [detailSessionId,   setDetailSessionId]   = useState<string | null>(null)
  const [sheetOpen,         setSheetOpen]         = useState(false)
  const [durationHint,      setDurationHint]      = useState<number | undefined>(undefined)

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

  // ─── Tray / sheet handlers ──────────────────────────────────────────────────

  function openSheet() {
    setSheetOpen(true)
  }
  function closeSheet() {
    setSheetOpen(false)
    setSelectedSlots([])
    setDurationHint(undefined)
  }
  function clearTray() {
    setSelectedSlots([])
  }

  /** SchedulerXAdapter drag emits a QuickAddRange; we treat it as a single-slot
   *  selection with a duration hint and open the sheet directly. */
  function handleRangeSelect(range: QuickAddRange) {
    const [y, mo, d] = range.date.split('-').map(Number)
    const [h, m]     = range.startTime.split(':').map(Number)
    const startDate  = new Date(y, mo - 1, d, h, m, 0, 0)
    const startMin = h * 60 + m
    const endMin   = parseInt(range.endTime.slice(0, 2), 10) * 60 + parseInt(range.endTime.slice(3), 10)
    setSelectedSlots([startDate])
    setDurationHint(endMin - startMin)
    setSheetOpen(true)
  }

  function handleBooked() {
    void reconcile()
  }

  function handleSessionClick(cal: CalendarSession) {
    if (!cal.id) return
    if (sessionState.some(s => s.id === cal.id)) {
      setDetailSessionId(cal.id)
    }
  }

  function handleCloseDetail() {
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

  /** "+ Create" / FAB action — suggest the next available slot in trainer tz and open the sheet. */
  function openSuggestedSlot() {
    const slot = nextAvailableSlot(trainerConfig)
    setSelectedSlots([localSlotToDate(slot.localDate, slot.localTime)])
    setDurationHint(60)
    setSheetOpen(true)
  }

  const isDetailOpen = detailSession !== null

  return (
    <PlannerShell
      currentDate={new Date()}
      onCreate={openSuggestedSlot}
      rightDrawerOpen={sheetOpen || isDetailOpen}
      overlays={
        <>
          <SelectionTray
            selectedSlots={selectedSlots}
            timezone={trainerConfig.timezone}
            onClear={clearTray}
            onOpen={openSheet}
          />

          <BookingSheet
            open={sheetOpen}
            selectedSlots={selectedSlots}
            clients={clients}
            existingSessions={sessionState}
            initialClientId={initialClientId}
            initialDurationMinutes={durationHint}
            trainerConfig={trainerConfig}
            onClose={closeSheet}
            onBooked={handleBooked}
          />

          {error && (
            <p
              className="fixed left-1/2 top-20 z-30 mx-auto max-w-[420px] -translate-x-1/2 rounded-lg border p-3 text-sm shadow-md"
              style={{
                borderColor: 'color-mix(in srgb, var(--fd-red) 40%, transparent)',
                color: 'var(--fd-red)',
                backgroundColor: 'color-mix(in srgb, var(--fd-red) 8%, var(--fd-surface))',
              }}
            >
              {error}
            </p>
          )}

          <SessionDetailsSheet
            session={detailSession}
            isOpen={isDetailOpen}
            onClose={handleCloseDetail}
            onOptimisticReplace={handleOptimisticReplace}
            onOptimisticRemove={handleOptimisticRemove}
            onReconcile={reconcile}
          />

          {/* Mobile-only FAB; desktop uses the sidebar "+ Create" (rendered inside PlannerShell).
              Hidden while the SelectionTray is showing to avoid visual collision
              at the bottom-right of the viewport. */}
          {selectedSlots.length === 0 && (
            <button
              type="button"
              onClick={openSuggestedSlot}
              aria-label="Create new booking"
              className="fixed bottom-6 right-6 z-20 flex h-14 w-14 items-center justify-center rounded-full transition-shadow hover:shadow-lg active:scale-95 md:hidden"
              style={{
                backgroundColor: 'var(--fd-blue)',
                color: 'var(--fd-text-on-primary)',
                boxShadow: '0 4px 8px rgba(60,64,67,0.15), 0 2px 4px rgba(60,64,67,0.10)',
                marginBottom: 'env(safe-area-inset-bottom)',
              }}
            >
              <Plus className="h-6 w-6" />
            </button>
          )}
        </>
      }
    >
      <SchedulerErrorBoundary
        fallback={(
          <p className="px-3 py-6 text-center text-sm" style={{ color: 'var(--fd-red)' }}>
            Calendar failed to load. Please refresh the page.
          </p>
        )}
      >
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
    </PlannerShell>
  )
}
