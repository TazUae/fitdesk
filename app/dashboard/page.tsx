import { headers }      from 'next/headers'
import { auth }          from '@/lib/auth'
import { getClients, getInvoices, getSessions } from '@/lib/business-data'
import { isOutstandingInvoiceStatus } from '@/lib/invoices/status'
import { DashboardView } from '@/components/modules/DashboardView'
import {
  countActiveClients,
  countSessionsCompletedThisWeek,
  findLowBalanceClients,
} from '@/lib/dashboard/metrics'
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

  // ── Dates ───────────────────────────────────────────────────────────────────
  const now        = new Date()
  const today      = now.toISOString().slice(0, 10)
  const greeting   = timeGreeting(now.getUTCHours())
  const monthStart = today.slice(0, 8) + '01'

  // ── Parallel data fetch ─────────────────────────────────────────────────────
  // Actions resolve the trainer ID from the auth session internally.
  // Promise.allSettled so a single ERP failure doesn't blank the whole dashboard.
  const [clientsResult, sessionsResult, invoicesResult, trainerSettingsResult] = await Promise.allSettled([
    getClients(),
    getSessions(),
    getInvoices(),
    getTrainerSettingsDoc(),
  ])

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

  // WhatsApp status is best-effort — a missing mapping or Evolution outage
  // must never blank the dashboard. Default to "not connected".
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

  const setupChecklist = buildSetupChecklist({
    workspaceReady:        true, // middleware only lets users in once provisioning is complete
    availabilityConfirmed,
    hasFirstClient:        (clients?.length ?? 0) > 0,
    hasFirstSession:       (sessions?.length ?? 0) > 0,
    whatsappConnected,
    // Cash is on by default; we don't auto-tick this — the trainer can
    // open Settings to enable extra providers later. Future work: persist
    // a per-trainer "payments-ack" flag once a method beyond Cash is added.
    paymentsAcknowledged:  false,
  })

  // ── Derived values ──────────────────────────────────────────────────────────

  // Customer DocType has no trainer-link field today, so we can't filter active
  // clients at the ERP query. Derive "active" from the trainer's session list:
  // any client with an upcoming session or a completion in the last 30 days.
  const totalClients  = clients?.length ?? null
  const activeClients = sessions === null
    ? null
    : countActiveClients(sessions, now.getTime())

  const sessionYmd = (s: FDSession) => s.startAt.toISOString().slice(0, 10)
  const isActive   = (s: FDSession) => s.status === 'scheduled' || s.status === 'confirmed'

  const todaySessions: FDSession[] =
    sessions
      ?.filter(s => sessionYmd(s) === today && isActive(s))
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
    ?? []

  const upcomingSessions: FDSession[] =
    sessions
      ?.filter(s => sessionYmd(s) > today && isActive(s))
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
      .slice(0, 3)
    ?? []

  const sessionsThisMonth: number | null =
    sessions === null
      ? null
      : sessions.filter(s => s.status === 'completed' && sessionYmd(s) >= monthStart).length

  const sessionsThisWeek: number | null =
    sessions === null ? null : countSessionsCompletedThisWeek(sessions, now.getTime())

  const overdueInvoices: Invoice[] =
    invoices?.filter(i => i.status === 'overdue') ?? []

  const lowBalanceClients: Client[] = clients ? findLowBalanceClients(clients) : []

  const outstandingBalance: number | null =
    invoices === null
      ? null
      : invoices
          .filter(i => isOutstandingInvoiceStatus(i.status))
          .reduce((sum, i) => sum + i.outstandingAmount, 0)

  const monthlyRevenue: number | null =
    invoices === null
      ? null
      : invoices
          .filter(i => i.status === 'paid' && i.issuedAt >= monthStart)
          .reduce((sum, i) => sum + i.amount, 0)

  const currency =
    invoices?.find(i => i.currency)?.currency ?? 'USD'

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <DashboardView
      trainerName={trainerName}
      greeting={greeting}
      today={today}
      stats={{
        activeClients,
        totalClients,
        outstandingBalance,
        currency,
        monthlyRevenue,
        sessionsThisMonth,
        sessionsThisWeek,
      }}
      todaySessions={todaySessions}
      upcomingSessions={upcomingSessions}
      overdueInvoices={overdueInvoices}
      lowBalanceClients={lowBalanceClients}
      setupChecklist={setupChecklist}
    />
  )
}
