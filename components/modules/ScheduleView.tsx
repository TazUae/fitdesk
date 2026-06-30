'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { PlannerShell } from '@/components/scheduling/PlannerShell'
import { SchedulerErrorBoundary } from '@/components/scheduling/SchedulerErrorBoundary'
import { BookingSheet } from '@/components/scheduling/BookingSheet'
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
  const [calendarDate, setCalendarDate] = useState(() => new Date())
  const [bookingOpen, setBookingOpen] = useState(false)
  const [selectedSlots, setSelectedSlots] = useState<Date[]>([])

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

  function handleOpenBooking() {
    setSelectedSlots([])
    setBookingOpen(true)
  }

  function handleBooked() {
    // Refresh the Server Component to reload the session list from ERP.
    routerRef.current.refresh()
  }

  return (
    <PlannerShell
      currentDate={calendarDate}
      onSelectDate={setCalendarDate}
      onCreate={handleOpenBooking}
      rightDrawerOpen={bookingOpen}
      overlays={
        <BookingSheet
          open={bookingOpen}
          selectedSlots={selectedSlots}
          clients={clients}
          existingSessions={sessions}
          trainerConfig={effectiveConfig}
          onClose={() => setBookingOpen(false)}
          onBooked={handleBooked}
        />
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
      <div className="flex-1 min-h-0 overflow-hidden">
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
          />
        </SchedulerErrorBoundary>
      </div>
    </PlannerShell>
  )
}
