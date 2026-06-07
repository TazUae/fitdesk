/**
 * DashboardView — pure presenter, no client hooks.
 *
 * All data is pre-computed by the server component (app/dashboard/page.tsx)
 * and passed as props. This component only lays out and composes sub-sections.
 *
 * Do NOT add 'use client'. It renders in the server component tree.
 *
 * Desktop layout:
 *   compact header (full width)
 *   top row:    NextUpCard (left) | MoneySnapshot (right)
 *   full width: ActionCenter — only when actions > 0
 *   second row: Today+Upcoming (left) | QuickActions (right)
 *
 * Mobile layout: single column in source order.
 */

import { TodayHero }     from '@/components/modules/dashboard/TodayHero'
import { NextUpCard }    from '@/components/modules/dashboard/NextUpCard'
import { ActionCenter }  from '@/components/modules/dashboard/ActionCenter'
import { TodayTimeline } from '@/components/modules/dashboard/TodayTimeline'
import { MoneySnapshot } from '@/components/modules/dashboard/MoneySnapshot'
import { QuickActions }  from '@/components/modules/dashboard/QuickActions'
import { UpcomingList }  from '@/components/modules/dashboard/UpcomingList'
import { SetupChecklist, type ChecklistItem } from '@/components/dashboard/SetupChecklist'
import { LocalBackendWarning } from '@/components/dev/LocalBackendWarning'
import type {
  DashboardActionItem,
  TodayTimelineSections,
  MoneySnapshot as MoneySnapshotData,
  TodayCounts,
  NextUpData,
} from '@/lib/dashboard/derive'
import type { FDSession } from '@/types/scheduling'

// ─── Props ────────────────────────────────────────────────────────────────────

interface DashboardViewProps {
  trainerName:       string
  greeting:          string
  today:             string
  timezone:          string

  actionItems:       DashboardActionItem[]
  todayHeroSentence: string
  todayTotal:        number
  timeline:          TodayTimelineSections
  money:             MoneySnapshotData
  upcomingSessions:  FDSession[]
  /** First upcoming session (tomorrow onwards), or null. */
  nextSession:        FDSession | null
  /** Count of sessions completed on the trainer's previous local day. */
  completedYesterday: number

  activeClients:     number | null
  sessionsThisWeek:  number | null
  whatsappConnected: boolean

  setupChecklist?:   ChecklistItem[]

  /** True when a dashboard backend fetch failed. */
  backendDegraded?:  boolean

  /** New: compact header status line. */
  headerStatus:      string
  /** New: cleaned today session counts. */
  todayCounts:       TodayCounts
  /** New: resolved next-up data. */
  nextUp:            NextUpData
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DashboardView({
  trainerName,
  greeting,
  today,
  timezone,
  actionItems,
  timeline,
  money,
  upcomingSessions,
  completedYesterday,
  whatsappConnected,
  setupChecklist,
  backendDegraded,
  headerStatus,
  nextUp,
}: DashboardViewProps) {
  const firstName = trainerName.split(' ')[0] ?? trainerName

  // TodayTimeline only renders when it has real content.
  const hasTodayContent = !!(
    timeline.inProgress ||
    timeline.next ||
    timeline.remainingToday.length > 0 ||
    timeline.recentlyFinished.length > 0
  )

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 pt-4 pb-28 lg:px-8 lg:pt-6 lg:pb-12">

      {/* ── Dev/local-only backend warning ─────────────────────────────── */}
      <LocalBackendWarning degraded={!!backendDegraded} />

      {/* ── Setup checklist (while incomplete) ─────────────────────────── */}
      {setupChecklist && setupChecklist.length > 0 && (
        <div className="mb-4">
          <SetupChecklist items={setupChecklist} hideWhenAllDone />
        </div>
      )}

      {/* ── Compact header ─────────────────────────────────────────────── */}
      <div className="mb-5">
        <TodayHero
          greeting={greeting}
          firstName={firstName}
          status={headerStatus}
          today={today}
        />
      </div>

      {/* ── Top row: Next up | Money ────────────────────────────────────── */}
      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6 lg:items-start">
        <NextUpCard nextUp={nextUp} today={today} timezone={timezone} />
        <MoneySnapshot money={money} />
      </div>

      {/* ── Action Center — full width, only when there are real actions ── */}
      {actionItems.length > 0 && (
        <div className="mb-5">
          <ActionCenter items={actionItems} />
        </div>
      )}

      {/* ── Second row: Today+Upcoming | QuickActions ──────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,62fr)_minmax(0,38fr)] lg:gap-8 lg:items-start">

        {/* LEFT: Today timeline (only when active) then Upcoming */}
        <div className="space-y-5">
          {hasTodayContent && (
            <TodayTimeline
              timeline={timeline}
              timezone={timezone}
              nextSession={null}
              completedYesterday={completedYesterday}
              today={today}
            />
          )}
          <UpcomingList
            sessions={upcomingSessions}
            today={today}
            timezone={timezone}
          />
        </div>

        {/* RIGHT: Quick actions */}
        <aside className="space-y-5 lg:sticky lg:top-[5rem]">
          <QuickActions whatsappConnected={whatsappConnected} />
        </aside>

      </div>
    </div>
  )
}
