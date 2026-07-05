/**
 * TodayTimeline — today's session list (scheduled + recently completed).
 *
 * Upcoming sessions link to /dashboard/schedule.
 * Completed sessions show a completion indicator.
 * No inline actions — no schedulingActions.
 */

import Link from 'next/link'
import { CheckCircle2, CalendarPlus } from 'lucide-react'
import { Avatar } from '@/components/modules/Avatar'
import { fmtTime } from '@/lib/date'
import type { TodaySection } from '@/lib/dashboard/derive'
import type { Session } from '@/types'

interface TodayTimelineProps {
  sections: TodaySection
}

function ScheduledRow({ session }: { session: Session }) {
  const timeLabel = fmtTime(session.time)
  const durLabel  = session.durationMinutes ? `${session.durationMinutes} min` : null

  return (
    <Link
      href="/dashboard/schedule"
      className="flex items-center gap-3 rounded-2xl border p-3.5 transition-opacity active:opacity-70"
      style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
    >
      <Avatar name={session.clientName} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
          {session.clientName}
        </p>
        <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
          {[timeLabel, durLabel].filter(Boolean).join(' · ') || 'Time TBD'}
        </p>
      </div>
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
        style={{ backgroundColor: 'rgba(138,198,127,0.12)', color: 'var(--fd-green)' }}
      >
        Scheduled
      </span>
    </Link>
  )
}

function CompletedRow({ session }: { session: Session }) {
  const timeLabel = fmtTime(session.time)

  return (
    <div
      className="flex items-center gap-3 rounded-2xl border p-3.5 opacity-60"
      style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
    >
      <Avatar name={session.clientName} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold line-through" style={{ color: 'var(--fd-text)' }}>
          {session.clientName}
        </p>
        {timeLabel && (
          <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
            {timeLabel}
          </p>
        )}
      </div>
      <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: 'var(--fd-green)' }} />
    </div>
  )
}

export function TodayTimeline({ sections }: TodayTimelineProps) {
  const { upcoming, completed } = sections
  const hasUpcoming  = upcoming.length > 0
  const hasCompleted = completed.length > 0
  const hasAny       = hasUpcoming || hasCompleted

  if (!hasAny) {
    return (
      <Link
        href="/dashboard/schedule"
        className="flex items-center gap-3 rounded-2xl border border-dashed px-4 py-4 transition-opacity active:opacity-70"
        style={{ borderColor: 'var(--fd-border)' }}
      >
        <CalendarPlus className="h-5 w-5 shrink-0 opacity-30" style={{ color: 'var(--fd-muted)' }} />
        <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
          Nothing scheduled today · View schedule
        </p>
      </Link>
    )
  }

  return (
    <div className="space-y-2">
      {upcoming.map(s => (
        <ScheduledRow key={s.id} session={s} />
      ))}
      {hasCompleted && hasUpcoming && (
        <div className="border-t" style={{ borderColor: 'var(--fd-border)' }} />
      )}
      {completed.map(s => (
        <CompletedRow key={s.id} session={s} />
      ))}
    </div>
  )
}
