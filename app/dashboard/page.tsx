import { headers }           from 'next/headers'
import { auth }              from '@/lib/auth'
import { getInvoices, getClients } from '@/lib/business-data'
import { resolveTrainerId }  from '@/lib/auth/resolve-trainer'
import { getTrainerConfig }  from '@/lib/scheduling/trainerConfig'
import { getDashboardSessions } from '@/lib/dashboard/dashboardDataService'
import {
  todayInTimezone,
  localHourInTimezone,
} from '@/lib/dashboard/fdSessionAdapter'
import { DashboardView } from '@/components/modules/DashboardView'
import {
  getNextUp,
  getTodaySections,
  getMoneySnapshot,
  getUpcoming,
  getAttentionItems,
} from '@/lib/dashboard/derive'
import type { Client, Session, Invoice } from '@/types'

// ─── Greeting ─────────────────────────────────────────────────────────────────

function timeGreeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authSession = await auth.api.getSession({ headers: headers() })
  const trainerName = authSession?.user?.name ?? 'Trainer'

  // ── Trainer resolution + timezone ─────────────────────────────────────────
  // resolveTrainerId() calls ensureTrainerIdForUser() — an ERP call used to
  // scope all subsequent queries to this trainer's workspace.
  // getTrainerConfig() is React.cache-memoised per render pass.
  const resolved      = await resolveTrainerId()
  const trainerId     = 'trainerId' in resolved ? resolved.trainerId : null
  const trainerConfig = trainerId ? await getTrainerConfig(trainerId) : null
  const timezone      = trainerConfig?.timezone ?? 'UTC'

  // ── Dates in trainer's local timezone ─────────────────────────────────────
  const now        = new Date()
  const today      = todayInTimezone(timezone)
  const greeting   = timeGreeting(localHourInTimezone(now, timezone))
  const monthStart = today.slice(0, 8) + '01'

  // ── Parallel data fetch ───────────────────────────────────────────────────
  // getDashboardSessions replaces the dead getSessions() path — it reads live
  // FD Sessions via the ERP proxy and maps them to the Session type.
  // getInvoices / getClients are unchanged.
  const [sessionsResult, invoicesResult, clientsResult] = await Promise.allSettled([
    trainerId
      ? getDashboardSessions(trainerId, timezone)
      : Promise.resolve<Session[]>([]),
    getInvoices(),
    getClients(),
  ])

  const sessions: Session[] =
    sessionsResult.status === 'fulfilled' ? sessionsResult.value : []

  const invoices: Invoice[] =
    invoicesResult.status === 'fulfilled' && invoicesResult.value.success
      ? invoicesResult.value.data
      : []

  const clients: Client[] | null =
    clientsResult.status === 'fulfilled' && clientsResult.value.success
      ? clientsResult.value.data
      : null

  const activeClientsCount: number | null =
    clients !== null ? clients.filter(c => c.status === 'active').length : null

  // ── Derived values ────────────────────────────────────────────────────────
  const nextUp         = getNextUp(sessions, today)
  const todaySection   = getTodaySections(sessions, today)
  const moneySnapshot  = getMoneySnapshot(invoices, monthStart)
  const upcoming       = getUpcoming(sessions, today)
  const attentionItems = getAttentionItems(invoices)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardView
      trainerName={trainerName}
      greeting={greeting}
      today={today}
      nextUp={nextUp}
      todaySection={todaySection}
      moneySnapshot={moneySnapshot}
      upcoming={upcoming}
      attentionItems={attentionItems}
      activeClientsCount={activeClientsCount}
    />
  )
}
