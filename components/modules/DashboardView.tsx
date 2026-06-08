/**
 * DashboardView — H-adapted dashboard presenter.
 *
 * Pure server component. All data is pre-computed by app/dashboard/page.tsx
 * and passed as props. No 'use client'. No FDSession. No schedulingActions.
 *
 * Mobile order:
 *   LocalBackendWarning (conditional)
 *   → Greeting header (compact)
 *   → NextUpCard (hero)
 *   → MoneySnapshot (prominent)
 *   → ActionCenter (only when non-empty)
 *   → Today section header + TodayTimeline
 *   → Upcoming sessions (UpcomingList, only when non-empty)
 *   → QuickActions (secondary, always last)
 */

import { TodayHero }     from '@/components/modules/dashboard/TodayHero'
import { NextUpCard }    from '@/components/modules/dashboard/NextUpCard'
import { MoneySnapshot } from '@/components/modules/dashboard/MoneySnapshot'
import { ActionCenter }  from '@/components/modules/dashboard/ActionCenter'
import { TodayTimeline } from '@/components/modules/dashboard/TodayTimeline'
import { UpcomingList }  from '@/components/modules/dashboard/UpcomingList'
import { QuickActions }  from '@/components/modules/dashboard/QuickActions'
import { LocalBackendWarning } from '@/components/dev/LocalBackendWarning'
import type {
  NextUpData,
  TodaySection,
  MoneySnapshot as MoneySnapshotData,
  AttentionItem,
} from '@/lib/dashboard/derive'
import type { Session } from '@/types'

// ─── Props ────────────────────────────────────────────────────────────────────

interface DashboardViewProps {
  trainerName:     string
  greeting:        string
  today:           string
  nextUp:          NextUpData | null
  todaySection:    TodaySection
  moneySnapshot:   MoneySnapshotData
  upcoming:        Session[]
  attentionItems:  AttentionItem[]
  isLocalBackend:  boolean
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DashboardView({
  trainerName,
  greeting,
  today,
  nextUp,
  todaySection,
  moneySnapshot,
  upcoming,
  attentionItems,
  isLocalBackend,
}: DashboardViewProps) {
  const firstName      = trainerName.split(' ')[0] ?? trainerName
  const hasUpcoming    = upcoming.length > 0
  const hasAttention   = attentionItems.length > 0

  return (
    <div className="space-y-5 p-4 pb-24">

      {/* ── Dev warning ──────────────────────────────────────────────────── */}
      <LocalBackendWarning show={isLocalBackend} />

      {/* ── Greeting ─────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--fd-text)' }}>
          {greeting}, {firstName} 👋
        </h2>
        <TodayHero
          today={today}
          scheduledCount={todaySection.upcoming.length}
          completedCount={todaySection.completed.length}
        />
      </div>

      {/* ── Next Up (hero) ────────────────────────────────────────────────── */}
      <NextUpCard nextUp={nextUp} />

      {/* ── Money to collect ──────────────────────────────────────────────── */}
      <MoneySnapshot snapshot={moneySnapshot} />

      {/* ── Action Center — only when there are real items ────────────────── */}
      {hasAttention && <ActionCenter items={attentionItems} />}

      {/* ── Today's timeline ──────────────────────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
          Today
        </p>
        <TodayTimeline sections={todaySection} />
      </div>

      {/* ── Upcoming sessions (after today) ───────────────────────────────── */}
      {hasUpcoming && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
              Coming up
            </p>
            <span className="text-xs" style={{ color: 'var(--fd-muted)' }}>
              {upcoming.length} session{upcoming.length !== 1 ? 's' : ''}
            </span>
          </div>
          <UpcomingList sessions={upcoming} today={today} />
        </div>
      )}

      {/* ── Quick Actions (always last) ───────────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
          Quick actions
        </p>
        <QuickActions />
      </div>

    </div>
  )
}
