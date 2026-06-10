'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { PlannerShell } from '@/components/scheduling/PlannerShell'
import { SchedulerErrorBoundary } from '@/components/scheduling/SchedulerErrorBoundary'
import type { Client, Session, SessionStatus } from '@/types'
import type { CalendarSession, FDSessionStatus } from '@/types/scheduling'

const SchedulerXAdapter = dynamic(
  () => import('@/components/scheduling/SchedulerXAdapter').then(mod => ({ default: mod.SchedulerXAdapter })),
  { ssr: false, loading: () => <div className="h-full" /> },
)

// ─── Session adapter ──────────────────────────────────────────────────────────

const STATUS_MAP: Record<SessionStatus, FDSessionStatus> = {
  scheduled: 'scheduled',
  completed: 'completed',
  missed:    'no_show',
  cancelled: 'cancelled',
}

function toCalendarSession(s: Session): CalendarSession {
  const [h, m] = (s.time ?? '09:00').split(':').map(Number)
  const start = new Date(`${s.date}T00:00:00`)
  start.setHours(h, m ?? 0, 0, 0)
  const end = new Date(start.getTime() + (s.durationMinutes ?? 60) * 60_000)
  return {
    id:         s.id,
    start,
    end,
    clientName: s.clientName,
    status:     STATUS_MAP[s.status] ?? 'scheduled',
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ScheduleViewProps {
  sessions: Session[]
  clients:  Client[]
  error?:   string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ScheduleView({ sessions, error }: ScheduleViewProps) {
  const [calendarDate, setCalendarDate] = useState(() => new Date())
  const [timezone, setTimezone] = useState('UTC')

  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  }, [])

  const calendarSessions: CalendarSession[] = sessions.map(toCalendarSession)

  return (
    <PlannerShell
      currentDate={calendarDate}
      onSelectDate={setCalendarDate}
      // onCreate not passed → toolbar "Book session" button is hidden in D1
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
