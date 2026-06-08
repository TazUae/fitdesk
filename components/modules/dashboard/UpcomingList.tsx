/**
 * UpcomingList — compact list of sessions after today.
 *
 * Rendered only when there are upcoming sessions. Links to schedule.
 */

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Avatar } from '@/components/modules/Avatar'
import { fmtShortDate, fmtTime } from '@/lib/date'
import type { Session } from '@/types'

interface UpcomingListProps {
  sessions: Session[]
  today: string
}

export function UpcomingList({ sessions, today }: UpcomingListProps) {
  if (sessions.length === 0) return null

  return (
    <div className="space-y-2">
      {sessions.map(s => {
        const timeLabel = fmtTime(s.time)
        const dateLabel = fmtShortDate(s.date, today)

        return (
          <Link
            key={s.id}
            href="/dashboard/schedule"
            className="flex items-center gap-3 rounded-2xl border px-4 py-3 transition-opacity active:opacity-70"
            style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
          >
            <Avatar name={s.clientName} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
                {s.clientName}
              </p>
              <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
                {dateLabel}
                {timeLabel && ` · ${timeLabel}`}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--fd-muted)' }} />
          </Link>
        )
      })}
    </div>
  )
}
