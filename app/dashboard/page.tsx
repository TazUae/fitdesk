import { headers }      from 'next/headers'
import { auth }          from '@/lib/auth'
import { getClients, getInvoices, getSessions } from '@/lib/business-data'
import { DashboardView } from '@/components/modules/DashboardView'
import {
  getNextUp,
  getTodaySections,
  getMoneySnapshot,
  getUpcoming,
  getAttentionItems,
} from '@/lib/dashboard/derive'
import type { Client, Session, Invoice } from '@/types'

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

  // ── Local backend warning ───────────────────────────────────────────────────
  const isLocalBackend =
    (process.env.NEXT_PUBLIC_FRAPPE_URL ?? '').includes('localhost')

  // ── Parallel data fetch ─────────────────────────────────────────────────────
  // Promise.allSettled — a single ERP failure must not blank the whole dashboard.
  const [sessionsResult, invoicesResult, clientsResult] = await Promise.allSettled([
    getSessions(),
    getInvoices(),
    getClients(),
  ])

  const sessions: Session[] =
    sessionsResult.status === 'fulfilled' && sessionsResult.value.success
      ? sessionsResult.value.data
      : []

  const invoices: Invoice[] =
    invoicesResult.status === 'fulfilled' && invoicesResult.value.success
      ? invoicesResult.value.data
      : []

  const clients: Client[] | null =
    clientsResult.status === 'fulfilled' && clientsResult.value.success
      ? clientsResult.value.data
      : null

  const activeClientsCount: number | null =
    clients !== null ? clients.filter((c) => c.status === 'active').length : null

  // ── Derived values ──────────────────────────────────────────────────────────
  const nextUp         = getNextUp(sessions, today)
  const todaySection   = getTodaySections(sessions, today)
  const moneySnapshot  = getMoneySnapshot(invoices, monthStart)
  const upcoming       = getUpcoming(sessions, today)
  const attentionItems = getAttentionItems(invoices)

  // ── Render ──────────────────────────────────────────────────────────────────
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
      isLocalBackend={isLocalBackend}
      activeClientsCount={activeClientsCount}
    />
  )
}
