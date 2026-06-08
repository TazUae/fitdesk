/**
 * TodayHero — compact header row showing the current day label and today's
 * session count. Rendered as a server component section header.
 */

import { fmtLongDate } from '@/lib/date'

interface TodayHeroProps {
  today: string
  /** Number of scheduled sessions remaining today. */
  scheduledCount: number
  /** Number of completed sessions today. */
  completedCount: number
}

export function TodayHero({ today, scheduledCount, completedCount }: TodayHeroProps) {
  const hasActivity = scheduledCount > 0 || completedCount > 0

  return (
    <div className="flex items-baseline justify-between">
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--fd-muted)' }}>
        {fmtLongDate(today)}
      </p>
      {hasActivity && (
        <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
          {completedCount > 0 && `${completedCount} done`}
          {completedCount > 0 && scheduledCount > 0 && ' · '}
          {scheduledCount > 0 && `${scheduledCount} upcoming`}
        </p>
      )}
    </div>
  )
}
