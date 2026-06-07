import Link from 'next/link'
import { ChevronRight, Calendar } from 'lucide-react'
import { Avatar } from '@/components/modules/Avatar'
import { ymdInTz, hhmInTz } from '@/lib/date'
import type { FDSession } from '@/types/scheduling'

interface Props {
  sessions: FDSession[]
  today:    string
  timezone: string
}

function fmtSessionDate(dateStr: string, today: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const tomorrow = new Date(
    Date.UTC(...today.split('-').map(Number) as [number, number, number])
  )
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  const tomorrowStr = tomorrow.toISOString().slice(0, 10)

  if (dateStr === tomorrowStr) return 'Tomorrow'
  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday:  'short',
    month:    'short',
    day:      'numeric',
  })
}

export function UpcomingList({ sessions, today, timezone }: Props) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-0.5">
        <p className="text-sm font-bold" style={{ color: 'var(--fd-text)' }}>
          Upcoming
        </p>
        <Link
          href="/dashboard/schedule"
          className="text-xs font-semibold transition-opacity active:opacity-70"
          style={{ color: 'var(--fd-blue)' }}
        >
          See all →
        </Link>
      </div>

      <div
        className="rounded-2xl border overflow-hidden"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-6 text-center">
            <Calendar className="h-5 w-5" style={{ color: 'var(--fd-muted)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--fd-text)' }}>
              No upcoming sessions
            </p>
            <Link
              href="/dashboard/schedule"
              className="text-xs font-semibold transition-opacity hover:opacity-80"
              style={{ color: 'var(--fd-blue)' }}
            >
              Book a session
            </Link>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--fd-border)' }}>
            {sessions.map(session => {
              const dateStr   = ymdInTz(session.startAt, timezone)
              const dateLabel = fmtSessionDate(dateStr, today)
              const timeLabel = hhmInTz(session.startAt, timezone)

              return (
                <Link
                  key={session.id}
                  href="/dashboard/schedule"
                  className="flex items-center gap-3 px-4 py-3 transition-opacity hover:opacity-90 active:opacity-70"
                >
                  <Avatar name={session.clientName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
                      {session.clientName}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
                      {dateLabel} · {timeLabel}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--fd-muted)' }} />
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
