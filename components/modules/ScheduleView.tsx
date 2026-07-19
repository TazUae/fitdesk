'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Plus } from 'lucide-react'
import { PlannerShell } from '@/components/scheduling/PlannerShell'
import { SchedulerErrorBoundary } from '@/features/scheduling/components/SchedulerErrorBoundary'
import { BookingSheet } from '@/components/scheduling/BookingSheet'
import { SessionCompletionSheet } from '@/components/scheduling/SessionCompletionSheet'
import type { CalendarSession, FDSession, TrainerConfig } from '@/types/scheduling'
import type { Client } from '@/types'

const SchedulerXAdapter = dynamic(
  () => import('@/components/scheduling/SchedulerXAdapter').then(mod => ({ default: mod.SchedulerXAdapter })),
  { ssr: false, loading: () => <div className="h-full" /> },
)

// ─── Session adapter ──────────────────────────────────────────────────────────

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

// ─── Props ────────────────────────────────────────────────────────────────────

interface ScheduleViewProps {
  sessions:       FDSession[]
  clients:        Client[]
  /** Fetched from FitDesk Trainer Settings — provides timezone for the calendar. */
  trainerConfig?: TrainerConfig
  error?:         string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ScheduleView({ sessions, clients, trainerConfig, error }: ScheduleViewProps) {
  const router = useRouter()
  const [calendarDate, setCalendarDate]       = useState(() => new Date())
  const [bookingOpen, setBookingOpen]         = useState(false)
  const [selectedSlots, setSelectedSlots]     = useState<Date[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

  // Seed timezone from trainerConfig if available; fall back to browser locale.
  const [timezone, setTimezone] = useState(trainerConfig?.timezone ?? 'UTC')
  useEffect(() => {
    if (!trainerConfig?.timezone) {
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
    }
  }, [trainerConfig?.timezone])

  // A stable default TrainerConfig used when trainerConfig is undefined (ERP unavailable).
  // BookingSheet requires a non-optional TrainerConfig so we must always pass one.
  const defaultConfig: TrainerConfig = {
    trainerId:     '',
    timezone,
    workingDays:   ['mon', 'tue', 'wed', 'thu', 'fri'],
    startTime:     '09:00',
    endTime:       '20:00',
    bufferMinutes: 15,
  }
  const effectiveConfig = trainerConfig ?? defaultConfig

  // Ref used to avoid stale-closure issues in the onBooked callback
  const routerRef = useRef(router)
  useEffect(() => { routerRef.current = router }, [router])

  const calendarSessions: CalendarSession[] = toCalendarSessions(sessions)

  const selectedSession = selectedSessionId
    ? (sessions.find(s => s.id === selectedSessionId) ?? null)
    : null

  function handleOpenBooking() {
    setSelectedSlots([])
    setBookingOpen(true)
  }

  function handleBooked() {
    routerRef.current.refresh()
  }

  function handleSelectSession(sessionId: string) {
    setSelectedSessionId(sessionId)
  }

  function handleCompletionClose() {
    setSelectedSessionId(null)
  }

  function handleCompleted() {
    setSelectedSessionId(null)
    routerRef.current.refresh()
  }

  return (
    <PlannerShell
      currentDate={calendarDate}
      onSelectDate={setCalendarDate}
      onCreate={handleOpenBooking}
      rightDrawerOpen={bookingOpen}
      overlays={
        <>
          <BookingSheet
            open={bookingOpen}
            selectedSlots={selectedSlots}
            clients={clients}
            existingSessions={sessions}
            trainerConfig={effectiveConfig}
            onClose={() => setBookingOpen(false)}
            onBooked={handleBooked}
          />
          <SessionCompletionSheet
            session={selectedSession}
            open={selectedSessionId !== null}
            onClose={handleCompletionClose}
            onCompleted={handleCompleted}
          />
          {/* Mobile booking FAB — the toolbar's "Book session" button is md:flex only,
              so mobile needs its own trigger for the same handleOpenBooking/BookingSheet.
              Hidden while the sheet is open so it never sits above the scrim. */}
          {!bookingOpen && (
            <button
              type="button"
              onClick={handleOpenBooking}
              aria-label="Book session"
              className="fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95 md:hidden"
              style={{
                bottom:          'calc(1.5rem + env(safe-area-inset-bottom))',
                backgroundColor: 'var(--fd-primary)',
                color:           'var(--fd-text-on-primary)',
              }}
            >
              <Plus className="h-6 w-6" strokeWidth={2.5} />
            </button>
          )}
        </>
      }
    >
      {/* Error banner — shown above calendar when ERP fetch failed */}
      {error && (
        <div
          className="shrink-0 px-4 py-2 text-center text-sm"
          style={{
            backgroundColor: 'var(--fd-surface)',
            borderBottom:    '1px solid var(--fd-border)',
            color:           'var(--fd-muted)',
          }}
        >
          Schedule data is connecting — calendar will populate once your workspace is ready.
        </div>
      )}

      {/* Calendar area — fills remaining height */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {/* First-run empty state — a blank hour grid explains nothing; this does. */}
        {sessions.length === 0 && !error && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div
              className="pointer-events-auto flex flex-col items-center gap-3 rounded-2xl border px-8 py-6 text-center shadow-sm"
              style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
            >
              <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
                No sessions scheduled
              </p>
              <p className="max-w-[240px] text-xs" style={{ color: 'var(--fd-muted)' }}>
                Book your first session and it will appear here.
              </p>
              <button
                type="button"
                onClick={handleOpenBooking}
                className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-opacity active:opacity-80"
                style={{ backgroundColor: 'var(--fd-primary)', color: 'var(--fd-text-on-primary)' }}
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                Book session
              </button>
            </div>
          </div>
        )}
        <SchedulerErrorBoundary
          fallback={
            <div className="flex h-full items-center justify-center">
              <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
                Calendar failed to load. Please refresh the page.
              </p>
            </div>
          }
        >
          <SchedulerXAdapter
            sessions={calendarSessions}
            timezone={timezone}
            calendarDate={calendarDate}
            onCalendarDateChange={setCalendarDate}
            onSelectSession={handleSelectSession}
          />
        </SchedulerErrorBoundary>
      </div>
    </PlannerShell>
  )
}
