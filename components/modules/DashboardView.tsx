/**
 * DashboardView — Dashboard Command Center presenter.
 *
 * Pure server component. All data is pre-computed by app/dashboard/page.tsx
 * and passed as props. No 'use client'. No ERP calls.
 *
 * Canonical section order (locked per blueprint):
 *   1. Daily Brief        — orientation
 *   2. Needs Attention    — urgent, transactional, action-required-now
 *   3. Today Timeline     — what is happening today
 *   4. AI Copilot         — assistive suggestions (mobile: inline; desktop xl+: right rail)
 *   5. Business Health    — calm KPIs (awareness, not action)
 *   6. Client Pulse       — strategic awareness (slot reserved; no data yet)
 *   7. Quick Actions      — desktop bar only (mobile uses FAB in shell)
 *
 * Layout:
 *   Mobile (< lg)  : single column, AI Copilot inline at section 4
 *   Desktop (xl+)  : Main Workspace + AI Rail; AI Copilot moves to right rail
 */

import { Sparkles, Users } from 'lucide-react'
import { TodayHero }     from '@/components/modules/dashboard/TodayHero'
import { NextUpCard }    from '@/components/modules/dashboard/NextUpCard'
import { MoneySnapshot } from '@/components/modules/dashboard/MoneySnapshot'
import { ActionCenter }  from '@/components/modules/dashboard/ActionCenter'
import { NeedsAttentionEmpty } from '@/components/modules/dashboard/NeedsAttentionEmpty'
import { TodayTimeline } from '@/components/modules/dashboard/TodayTimeline'
import { UpcomingList }  from '@/components/modules/dashboard/UpcomingList'
import { QuickActions }  from '@/components/modules/dashboard/QuickActions'
import { AiCopilotRail } from '@/components/modules/dashboard/AiCopilotRail'
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
  trainerName:        string
  greeting:           string
  today:              string
  nextUp:             NextUpData | null
  todaySection:       TodaySection
  moneySnapshot:      MoneySnapshotData
  upcoming:           Session[]
  attentionItems:     AttentionItem[]
  isLocalBackend:     boolean
  activeClientsCount: number | null
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
  activeClientsCount,
}: DashboardViewProps) {
  const firstName    = trainerName.split(' ')[0] ?? trainerName
  const hasUpcoming  = upcoming.length > 0
  const hasAttention = attentionItems.length > 0

  const totalToday = todaySection.upcoming.length + todaySection.completed.length
  const briefLine = (() => {
    if (totalToday === 0)
      return nextUp
        ? `Nothing today — next session is ${nextUp.label}.`
        : 'No sessions on the schedule right now.'
    if (todaySection.upcoming.length === 0) return 'All done for today.'
    return `${todaySection.upcoming.length} session${todaySection.upcoming.length !== 1 ? 's' : ''} ahead today.`
  })()

  return (
    <div className="xl:flex">

      {/* ── Main Workspace ──────────────────────────────────────────────────── */}
      <div className="xl:flex-1 xl:min-w-0">
        <div className="space-y-5 p-4 pb-24 lg:space-y-6 lg:p-6 lg:pb-8 xl:max-w-4xl">

          {/* Dev warning */}
          <LocalBackendWarning show={isLocalBackend} />

          {/* 1. Daily Brief */}
          <div className="space-y-3">
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
            <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
              {briefLine}
            </p>
            {nextUp && <NextUpCard nextUp={nextUp} />}
          </div>

          {/* 2. Needs Attention — always renders */}
          <div className="space-y-2">
            <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
              Needs attention
            </p>
            {hasAttention
              ? <ActionCenter items={attentionItems} />
              : <NeedsAttentionEmpty />
            }
          </div>

          {/* 3. Today Timeline */}
          <div className="space-y-3">
            <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
              Today
            </p>
            <TodayTimeline sections={todaySection} />

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
          </div>

          {/* 4. AI Copilot — inline on mobile / tablet (hidden at xl+) */}
          <div className="xl:hidden space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles
                className="h-4 w-4 shrink-0"
                style={{ color: 'var(--fd-accent)' }}
              />
              <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
                AI Copilot
              </p>
            </div>
            <div
              className="rounded-xl border p-4"
              style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
            >
              <p className="text-sm font-medium" style={{ color: 'var(--fd-text)' }}>
                AI Copilot is standing by.
              </p>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--fd-muted)' }}>
                It will surface useful suggestions when there is something worth
                reviewing.
              </p>
              <p className="mt-3 text-[11px]" style={{ color: 'var(--fd-muted)' }}>
                AI suggests. You decide.
              </p>
            </div>
          </div>

          {/* 5. Business Health */}
          <div className="space-y-3">
            <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
              Business Health
            </p>
            <MoneySnapshot snapshot={moneySnapshot} />
            <div
              className="flex items-center justify-between rounded-2xl border p-4"
              style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--fd-muted)' }}>
                  Active Clients
                </p>
                <p className="mt-0.5 text-2xl font-bold tabular-nums" style={{ color: 'var(--fd-text)' }}>
                  {activeClientsCount !== null ? activeClientsCount : '—'}
                </p>
              </div>
              <Users className="h-6 w-6 opacity-25" style={{ color: 'var(--fd-accent)' }} />
            </div>
          </div>

          {/* 6. Client Pulse — slot reserved; no data in Phase 1 */}

          {/* 7. Quick Actions — desktop only; mobile uses FAB in shell */}
          <div className="hidden lg:block space-y-3">
            <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
              Quick actions
            </p>
            <QuickActions />
          </div>

        </div>
      </div>

      {/* ── AI Copilot Rail — xl+ only (hidden below xl) ──────────────────── */}
      <AiCopilotRail />

    </div>
  )
}
