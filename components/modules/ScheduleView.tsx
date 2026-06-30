'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { PlannerShell } from '@/components/scheduling/PlannerShell'
import { SchedulerErrorBoundary } from '@/components/scheduling/SchedulerErrorBoundary'
import type { CalendarSession, FDSession, TrainerConfig } from '@/types/scheduling'

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
  /** Fetched from FitDesk Trainer Settings — provides timezone for the calendar. */
  trainerConfig?: TrainerConfig
  error?:         string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ScheduleView({ sessions, trainerConfig, error }: ScheduleViewProps) {
  const [calendarDate, setCalendarDate] = useState(() => new Date())

  // Seed timezone from trainerConfig if available; fall back to browser locale.
  const [timezone, setTimezone] = useState(trainerConfig?.timezone ?? 'UTC')
  useEffect(() => {
    if (!trainerConfig?.timezone) {
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
    }
  }, [trainerConfig?.timezone])

  const calendarSessions: CalendarSession[] = toCalendarSessions(sessions)

  return (
    <PlannerShell
      currentDate={calendarDate}
      onSelectDate={setCalendarDate}
      // onCreate not passed — booking button is hidden in C2
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
