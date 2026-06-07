import { headers }      from 'next/headers'
import { auth }          from '@/lib/auth'
import { ymdInTz, hourInTz } from '@/lib/date'
import { getClients, getInvoices, getSessions } from '@/lib/business-data'
import { DashboardView } from '@/components/modules/DashboardView'
import {
  countActiveClients,
  countSessionsCompletedThisWeek,
  findLowBalanceClients,
} from '@/lib/dashboard/metrics'
import {
  getDashboardActionItems,
  getTodayTimelineSections,
  getMoneySnapshot,
  getYesterdayRecap,
  buildTodayHeroSentence,
  getTodayCounts,
  buildHeaderStatus,
  resolveNextUp,
} from '@/lib/dashboard/derive'
import { buildSetupChecklist } from '@/lib/dashboard/setup-checklist'
import { getTrainerSettingsDoc } from '@/lib/erpnext/client'
import { getTrainerWhatsAppConnection } from '@/lib/evolution'
import { getTrainerId } from '@/lib/trainer'
import type { Client, Invoice } from '@/types'
import type { FDSession } from '@/types/scheduling'

// ─── Greeting ────────────────────────────────────────────────────────────────

function timeGreeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const session     = await auth.api.getSession({ headers: headers() })
  const trainerName = session?.user?.name ?? 'Trainer'

  // ── Parallel data fetch ─────────────────────────────────────────────────────
  // Capture `now` before awaiting so the timestamp is consistent even if ERP
  // is slow. Promise.allSettled so a single failure doesn't blank the dashboard.
  const now = new Date()

  const [clientsResult, sessionsResult, invoicesResult, trainerSettingsResult] = await Promise.allSettled([
    getClients(),
    getSessions(),
    getInvoices(),
    getTrainerSettingsDoc(),
  ])

  // ── Dates (resolved in the trainer's configured timezone) ───────────────────
  const tz =
    trainerSettingsResult.status === 'fulfilled' &&
    typeof trainerSettingsResult.value?.timezone === 'string' &&
    trainerSettingsResult.value.timezone.trim()
      ? trainerSettingsResult.value.timezone.trim()
      : 'UTC'

  const today      = ymdInTz(now, tz)
  const greeting   = timeGreeting(hourInTz(now, tz))
  const monthStart = today.slice(0, 8) + '01'
  const nowMs      = now.getTime()

  const clients: Client[] | null =
    clientsResult.status  === 'fulfilled' && clientsResult.value.success
      ? clientsResult.value.data
      : null

  const sessions: FDSession[] | null =
    sessionsResult.status === 'fulfilled' && sessionsResult.value.success
      ? sessionsResult.value.data
      : null

  const invoices: Invoice[] | null =
    invoicesResult.status === 'fulfilled' && invoicesResult.value.success
      ? invoicesResult.value.data
      : null

  const availabilityConfirmed =
    trainerSettingsResult.status === 'fulfilled'
      ? trainerSettingsResult.value?.initialized === 1
      : false

  // Backend health for the dev-only warning. Derived purely from the
  // allSettled results above — no extra fetches, no change to the graceful
  // empty-state behavior. The banner itself is gated to non-production.
  const backendDegraded =
    clients  === null ||
    sessions === null ||
    invoices === null ||
    trainerSettingsResult.status === 'rejected'

  // WhatsApp status — best-effort, never blanks the dashboard
  let whatsappConnected = false
  if (session?.user?.id) {
    try {
      const trainerId = await getTrainerId(session.user.id)
      if (trainerId) {
        const conn = await getTrainerWhatsAppConnection(trainerId)
        whatsappConnected = conn?.status === 'connected'
      }
    } catch {
      whatsappConnected = false
    }
  }

  // ── Setup checklist ─────────────────────────────────────────────────────────
  const setupChecklist = buildSetupChecklist({
    workspaceReady:        true,
    availabilityConfirmed,
    hasFirstClient:        (clients?.length ?? 0) > 0,
    hasFirstSession:       (sessions?.length ?? 0) > 0,
    whatsappConnected,
    paymentsAcknowledged:  true,
  })

  // ── Derived values ──────────────────────────────────────────────────────────
  const allSessions  = sessions ?? []
  const allInvoices  = invoices ?? []
  const allClients   = clients  ?? []

  const lowBalanceClients: Client[] = findLowBalanceClients(allClients)

  const money = getMoneySnapshot(allInvoices, monthStart)

  const actionItems = getDashboardActionItems({
    sessions:          allSessions,
    invoices:          allInvoices,
    lowBalanceClients,
    clients:           allClients,
    nowMs,
    tz,
    todayYmd:          today,
    whatsappConnected,
  })

  const timeline = getTodayTimelineSections(allSessions, nowMs, tz, today)

  const todayTotal = allSessions.filter(s => ymdInTz(s.startAt, tz) === today).length

  // Upcoming: active sessions from tomorrow onwards, sorted, capped at 5
  const upcomingSessions: FDSession[] =
    allSessions
      .filter(
        s =>
          (s.status === 'scheduled' || s.status === 'confirmed') &&
          ymdInTz(s.startAt, tz) > today,
      )
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
      .slice(0, 5)

  // Empty-day context — reuses already-fetched sessions, no new data source.
  const nextSession: FDSession | null = upcomingSessions[0] ?? null
  const { completedYesterday } = getYesterdayRecap(allSessions, tz, today)

  const todayCounts   = getTodayCounts(allSessions, tz, today)
  const headerStatus  = buildHeaderStatus(todayCounts)
  const nextUp        = resolveNextUp({
    inProgress:       timeline.inProgress,
    nextToday:        timeline.next,
    remainingToday:   timeline.remainingToday,
    recentlyFinished: timeline.recentlyFinished,
    nextFuture:       nextSession,
    clients:          allClients,
    todayTotal:       todayCounts.total,
  })

  const todayHeroSentence = buildTodayHeroSentence({
    actionItems,
    todayTotal,
    money,
    inProgress: timeline.inProgress,
    nextSession,
    completedYesterday,
    tz,
    todayYmd: today,
  })

  const activeClients: number | null =
    sessions === null ? null : countActiveClients(sessions, nowMs)

  const sessionsThisWeek: number | null =
    sessions === null ? null : countSessionsCompletedThisWeek(sessions, nowMs)

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <DashboardView
      trainerName={trainerName}
      greeting={greeting}
      today={today}
      timezone={tz}
      actionItems={actionItems}
      todayHeroSentence={todayHeroSentence}
      todayTotal={todayTotal}
      timeline={timeline}
      money={money}
      upcomingSessions={upcomingSessions}
      nextSession={nextSession}
      completedYesterday={completedYesterday}
      activeClients={activeClients}
      sessionsThisWeek={sessionsThisWeek}
      whatsappConnected={whatsappConnected}
      setupChecklist={setupChecklist}
      backendDegraded={backendDegraded}
      headerStatus={headerStatus}
      todayCounts={todayCounts}
      nextUp={nextUp}
    />
  )
}
