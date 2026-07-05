/**
 * NextUpCard — the primary hero card on the dashboard.
 *
 * Shows the immediately next scheduled session (today or future).
 * When there is no upcoming session, shows an empty-state prompt.
 */

import Link from 'next/link'
import { CalendarPlus } from 'lucide-react'
import { Avatar } from '@/components/modules/Avatar'
import type { NextUpData } from '@/lib/dashboard/derive'

interface NextUpCardProps {
  nextUp: NextUpData | null
}

export function NextUpCard({ nextUp }: NextUpCardProps) {
  if (!nextUp) {
    return (
      <Link
        href="/dashboard/schedule"
        className="flex flex-col items-center gap-3 rounded-2xl border border-dashed py-8 transition-opacity active:opacity-70"
        style={{ borderColor: 'var(--fd-border)' }}
      >
        <CalendarPlus className="h-7 w-7 opacity-30" style={{ color: 'var(--fd-muted)' }} />
        <div className="text-center">
          <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
            No upcoming sessions
          </p>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--fd-muted)' }}>
            View schedule →
          </p>
        </div>
      </Link>
    )
  }

  const { session, isToday, label } = nextUp

  return (
    <Link
      href="/dashboard/schedule"
      className="flex items-center gap-4 rounded-2xl border p-4 transition-opacity active:opacity-70"
      style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
    >
      {/* Avatar */}
      <Avatar name={session.clientName} size="lg" />

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{
              backgroundColor: isToday
                ? 'rgba(138,198,127,0.15)'
                : 'rgba(138,143,168,0.12)',
              color: isToday ? 'var(--fd-green)' : 'var(--fd-muted)',
            }}
          >
            {isToday ? 'Next Up' : 'Coming Up'}
          </span>
        </div>
        <p
          className="mt-1 truncate text-base font-bold"
          style={{ color: 'var(--fd-text)' }}
        >
          {session.clientName}
        </p>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--fd-muted)' }}>
          {label}
        </p>
      </div>

      {/* Fee */}
      {session.sessionFee !== undefined && (
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold" style={{ color: 'var(--fd-green)' }}>
            ${session.sessionFee}
          </p>
        </div>
      )}
    </Link>
  )
}
