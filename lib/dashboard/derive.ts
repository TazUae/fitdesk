/**
 * Pure dashboard derivation helpers.
 *
 * No I/O, no React, no ERP — just functions over pre-fetched arrays.
 * Tested in derive.test.ts.
 *
 * All helpers accept already-fetched data plus `nowMs` / `tz` / `todayYmd`
 * so the server component stays in control of time and timezone resolution.
 */

import { ymdInTz, hhmInTz } from '@/lib/date'
import { isOutstandingInvoiceStatus } from '@/lib/invoices/status'
import type { Client, Invoice } from '@/types'
import type { FDSession } from '@/types/scheduling'

// ─── Session classification ───────────────────────────────────────────────────

export type DashboardSessionClass =
  | 'upcoming'
  | 'in_progress'
  | 'needs_resolution'
  | 'recently_finished'
  | 'cancelled'

/**
 * Classify a single FDSession relative to `nowMs`.
 *
 * - in_progress:       scheduled/confirmed, startAt ≤ now < endAt
 * - needs_resolution:  scheduled/confirmed, endAt ≤ now (unresolved past session)
 * - upcoming:          scheduled/confirmed, startAt > now
 * - recently_finished: status === 'completed'
 * - cancelled:         cancelled | no_show | skipped
 */
export function classifySessionForDashboard(
  s: FDSession,
  nowMs: number,
): DashboardSessionClass {
  const startMs = s.startAt.getTime()
  const endMs   = s.endAt.getTime()
  const active  = s.status === 'scheduled' || s.status === 'confirmed'

  if (active) {
    if (startMs <= nowMs && nowMs < endMs) return 'in_progress'
    if (endMs <= nowMs)                    return 'needs_resolution'
    return 'upcoming'
  }
  if (s.status === 'completed') return 'recently_finished'
  return 'cancelled'
}

// ─── Today timeline ───────────────────────────────────────────────────────────

export interface TodayTimelineSections {
  inProgress:       FDSession | null
  next:             FDSession | null
  remainingToday:   FDSession[]  // upcoming today after `next`
  recentlyFinished: FDSession[]  // completed today, newest first, capped at 3
}

/**
 * Partition today's sessions into timeline sections.
 * Accepts ALL sessions and filters to `todayYmd` internally.
 */
export function getTodayTimelineSections(
  sessions: FDSession[],
  nowMs: number,
  tz: string,
  todayYmd: string,
): TodayTimelineSections {
  const today = sessions.filter(s => ymdInTz(s.startAt, tz) === todayYmd)

  const inProgress = today
    .filter(s => classifySessionForDashboard(s, nowMs) === 'in_progress')
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0] ?? null

  const upcomingToday = today
    .filter(s => classifySessionForDashboard(s, nowMs) === 'upcoming')
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())

  const recentlyFinished = today
    .filter(s => s.status === 'completed')
    .sort((a, b) => b.startAt.getTime() - a.startAt.getTime())
    .slice(0, 3)

  return {
    inProgress,
    next:           upcomingToday[0] ?? null,
    remainingToday: upcomingToday.slice(1),
    recentlyFinished,
  }
}

// ─── Money snapshot ───────────────────────────────────────────────────────────

export interface MoneySnapshot {
  toCollect:          number
  collectedThisMonth: number
  pendingCount:       number
  currency:           string
}

/**
 * Derive the three money figures shown in the right-rail Money Snapshot.
 * `monthStart` is a YYYY-MM-01 string (same as in page.tsx today).
 */
export function getMoneySnapshot(invoices: Invoice[], monthStart: string): MoneySnapshot {
  const outstanding = invoices.filter(i => isOutstandingInvoiceStatus(i.status))

  return {
    toCollect:          outstanding.reduce((sum, i) => sum + i.outstandingAmount, 0),
    collectedThisMonth: invoices
      .filter(i => i.status === 'paid' && i.issuedAt >= monthStart)
      .reduce((sum, i) => sum + i.amount, 0),
    pendingCount: outstanding.length,
    currency:     invoices.find(i => i.currency)?.currency ?? 'USD',
  }
}

// ─── Action items ─────────────────────────────────────────────────────────────

export type DashboardActionKind =
  | 'needs_resolution'
  | 'payment'
  | 'low_package'
  | 'reminder'

/**
 * Serializable session summary for the ResolveSessionSheet.
 * Uses ISO strings instead of Date objects so it can be safely passed
 * from a server component to a client component as a prop.
 */
export interface SessionResolvable {
  id:          string
  version:     number
  clientName:  string
  /** null when clients fetch failed or billing mode is not configured. */
  billingMode: 'Package' | 'Pay Per Session' | 'Trial' | null
  startAtISO:  string
  endAtISO:    string
  rate:        number
  timezone:    string
}

export interface DashboardActionItem {
  id:                 string
  kind:               DashboardActionKind
  title:              string
  subtitle:           string
  /** Present when the item is navigation-only (no sheet). */
  href?:              string
  severity:           'high' | 'medium' | 'low'
  /** Present only for `needs_resolution` kind. */
  sessionResolvable?: SessionResolvable
}

function fmtMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Build the prioritised Action Center item list.
 *
 * Priority order:
 *   1. needs_resolution — past-end sessions still scheduled/confirmed
 *   2. payment          — outstanding invoices (grouped)
 *   3. low_package      — clients with ≤ threshold sessions remaining
 *   4. reminder         — overdue invoices + WhatsApp connected
 */
export function getDashboardActionItems(input: {
  sessions:          FDSession[]
  invoices:          Invoice[]
  lowBalanceClients: Client[]
  clients:           Client[]
  nowMs:             number
  tz:                string
  todayYmd:          string
  whatsappConnected: boolean
}): DashboardActionItem[] {
  const { sessions, invoices, lowBalanceClients, clients, nowMs, tz, todayYmd, whatsappConnected } = input
  const items: DashboardActionItem[] = []

  // 1. Sessions needing resolution — oldest first so the trainer resolves in order
  const toResolve = sessions
    .filter(s => classifySessionForDashboard(s, nowMs) === 'needs_resolution')
    .sort((a, b) => a.endAt.getTime() - b.endAt.getTime())

  for (const s of toResolve) {
    const dateYmd   = ymdInTz(s.startAt, tz)
    const timeStr   = hhmInTz(s.startAt, tz)
    const isToday   = dateYmd === todayYmd
    const whenLabel = isToday ? `today at ${timeStr}` : `${dateYmd} at ${timeStr}`

    const clientForSession = clients.find(c => c.id === s.clientId)
    const billingMode      = clientForSession?.billingMode ?? null

    items.push({
      id:       `resolve-${s.id}`,
      kind:     'needs_resolution',
      title:    s.clientName,
      subtitle: `Session ended ${whenLabel} — mark it`,
      severity: 'high',
      sessionResolvable: {
        id:          s.id,
        version:     s.version,
        clientName:  s.clientName,
        billingMode,
        startAtISO:  s.startAt.toISOString(),
        endAtISO:    s.endAt.toISOString(),
        rate:        s.rate,
        timezone:    s.timezone,
      },
    })
  }

  // 2. Payments to collect — grouped into one item
  const outstanding = invoices.filter(i => isOutstandingInvoiceStatus(i.status))
  if (outstanding.length > 0) {
    const total    = outstanding.reduce((sum, i) => sum + i.outstandingAmount, 0)
    const currency = outstanding[0]?.currency ?? 'USD'
    items.push({
      id:       'payments',
      kind:     'payment',
      title:    `Collect ${fmtMoney(total, currency)}`,
      subtitle: `${outstanding.length} invoice${outstanding.length === 1 ? '' : 's'} to collect`,
      href:     '/dashboard/invoices',
      severity: 'medium',
    })
  }

  // 3. Low package warnings — one item per client
  for (const c of lowBalanceClients) {
    const n = c.remainingSessions ?? 0
    items.push({
      id:       `low-${c.id}`,
      kind:     'low_package',
      title:    c.name,
      subtitle: `${n} session${n === 1 ? '' : 's'} left in package`,
      href:     `/dashboard/clients/${encodeURIComponent(c.id)}`,
      severity: 'low',
    })
  }

  // 4. Reminders for overdue invoices — only when WhatsApp is connected
  if (whatsappConnected) {
    const overdue = invoices.filter(i => i.status === 'overdue')
    for (const inv of overdue) {
      if (inv.clientId) {
        items.push({
          id:       `reminder-${inv.id}`,
          kind:     'reminder',
          title:    inv.clientName,
          subtitle: `Invoice overdue — send a reminder`,
          href:     `/dashboard/messages/${encodeURIComponent(inv.clientId)}?type=reminder&invoiceId=${encodeURIComponent(inv.id)}`,
          severity: 'medium',
        })
      }
    }
  }

  return items
}

// ─── Yesterday recap ──────────────────────────────────────────────────────────

export interface YesterdayRecap {
  /** Count of sessions completed on the trainer's previous local day. */
  completedYesterday: number
  /** The resolved 'YYYY-MM-DD' for yesterday (calendar-derived from todayYmd). */
  yesterdayYmd:       string
}

/**
 * Shift a 'YYYY-MM-DD' string by a number of whole calendar days.
 *
 * Pure calendar arithmetic on the date string (via UTC) — deliberately
 * timezone-agnostic so it never drifts across DST transitions. This is the
 * same approach UpcomingList uses to derive "tomorrow".
 */
function shiftYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + deltaDays)
  return dt.toISOString().slice(0, 10)
}

/**
 * Human label for a session's local day relative to today, for mid-sentence
 * use (lowercase). e.g. 'tomorrow' / 'Mon, Jun 8'.
 */
function relativeDayLabel(ymd: string, todayYmd: string): string {
  if (ymd === shiftYmd(todayYmd, 1)) return 'tomorrow'
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday:  'short',
    month:    'short',
    day:      'numeric',
  })
}

/**
 * Count sessions the trainer completed on their previous local day.
 *
 * Pure over already-fetched sessions — no new data source. `todayYmd` is the
 * 'YYYY-MM-DD' the dashboard already resolved in the trainer's timezone.
 */
export function getYesterdayRecap(
  sessions: FDSession[],
  tz: string,
  todayYmd: string,
): YesterdayRecap {
  const yesterdayYmd = shiftYmd(todayYmd, -1)
  const completedYesterday = sessions.filter(
    s => s.status === 'completed' && ymdInTz(s.startAt, tz) === yesterdayYmd,
  ).length
  return { completedYesterday, yesterdayYmd }
}

// ─── Today hero sentence ──────────────────────────────────────────────────────

/**
 * Build the smart one-line summary shown in the Today Hero card.
 * e.g. "1 session today · $30 to collect · 2 sessions need an update"
 *
 * On an empty day (no sessions today) the optional `nextSession` /
 * `completedYesterday` inputs, when provided, produce a forward- or
 * backward-looking lead clause so the hero never reads as merely blank.
 * Callers that omit those optional inputs keep the original behaviour.
 */
export function buildTodayHeroSentence(input: {
  actionItems: DashboardActionItem[]
  todayTotal:  number
  money:       MoneySnapshot
  inProgress:  FDSession | null
  nextSession?:        FDSession | null
  completedYesterday?: number
  tz?:                 string
  todayYmd?:           string
}): string {
  const {
    actionItems, todayTotal, money, inProgress,
    nextSession, completedYesterday, tz, todayYmd,
  } = input
  const parts: string[] = []

  if (inProgress) {
    parts.push(`${inProgress.clientName} in progress`)
  } else if (todayTotal > 0) {
    parts.push(`${todayTotal} session${todayTotal === 1 ? '' : 's'} today`)
  } else {
    // Empty-today enrichment — only when callers supply the optional context.
    if (nextSession && tz && todayYmd) {
      const label = relativeDayLabel(ymdInTz(nextSession.startAt, tz), todayYmd)
      const time  = hhmInTz(nextSession.startAt, tz)
      const first = nextSession.clientName.split(' ')[0] ?? nextSession.clientName
      parts.push(`No sessions today — next ${label} at ${time} with ${first}`)
    } else if (completedYesterday && completedYesterday > 0) {
      parts.push(
        `No sessions today — you completed ${completedYesterday} session${completedYesterday === 1 ? '' : 's'} yesterday`,
      )
    }
  }

  if (money.toCollect > 0) {
    parts.push(`${fmtMoney(money.toCollect, money.currency)} to collect`)
  }

  const needsUpdate = actionItems.filter(a => a.kind === 'needs_resolution').length
  if (needsUpdate > 0) {
    parts.push(`${needsUpdate} session${needsUpdate === 1 ? '' : 's'} need an update`)
  }

  return parts.length === 0 ? "You're all caught up" : parts.join(' · ')
}

// ─── Today counts ─────────────────────────────────────────────────────────────

export interface TodayCounts {
  /** Scheduled/confirmed + completed today (excludes cancelled/no_show/skipped). */
  total:     number
  /** Sessions with status === 'completed' today. */
  completed: number
  /** Scheduled/confirmed sessions today that haven't ended yet (upcoming + in-progress). */
  remaining: number
}

/**
 * Count today's sessions split into total / completed / remaining.
 *
 * - total     = scheduled/confirmed (any time) + completed; cancelled/no_show/skipped excluded.
 * - completed = status 'completed' today.
 * - remaining = scheduled/confirmed today (not yet cancelled/done).
 */
export function getTodayCounts(
  sessions: FDSession[],
  tz: string,
  todayYmd: string,
): TodayCounts {
  const today = sessions.filter(s => ymdInTz(s.startAt, tz) === todayYmd)
  const completed = today.filter(s => s.status === 'completed').length
  const remaining = today.filter(
    s => s.status === 'scheduled' || s.status === 'confirmed',
  ).length
  return { total: completed + remaining, completed, remaining }
}

// ─── Header status line ───────────────────────────────────────────────────────

/**
 * One-line status for the compact dashboard header.
 *
 * Empty day:  "0 sessions today · All caught up"
 * Active day: "3 sessions today · 1 completed · 2 remaining"
 */
export function buildHeaderStatus(counts: TodayCounts): string {
  const { total, completed, remaining } = counts
  if (total === 0) return '0 sessions today · All caught up'
  const sessionWord = total === 1 ? 'session' : 'sessions'
  const parts = [`${total} ${sessionWord} today`]
  if (completed > 0) parts.push(`${completed} completed`)
  if (remaining > 0) parts.push(`${remaining} remaining`)
  return parts.join(' · ')
}

// ─── Next-up resolution ───────────────────────────────────────────────────────

export type NextUpMode =
  | 'in_progress'   // a today session is currently running
  | 'next_today'    // a today session hasn't started yet (next on the agenda)
  | 'all_done_future' // today's sessions are all done; next is a future session
  | 'next_future'   // no sessions today; next booked session is a future one
  | 'none'          // no upcoming sessions at all

export interface NextUpData {
  mode:              NextUpMode
  session:           FDSession | null
  /** billingMode from the already-fetched clients array; null when not found. */
  billingMode:       'Package' | 'Pay Per Session' | 'Trial' | null
  /** remainingSessions from the already-fetched clients array; null when not found. */
  remainingSessions: number | null
}

/**
 * Resolve what the "Next Up" hero card should show.
 *
 * Priority (highest first):
 *   1. in_progress today session
 *   2. next_today session (upcoming later today)
 *   3. all_done_future — no active today sessions remain; next future session exists
 *   4. next_future — no sessions today at all; a future session exists
 *   5. none — no sessions at all
 *
 * Billing info is joined from the already-fetched `clients` array.
 * When a client is not found (or billingMode is undefined), the billing fields
 * are safely returned as null so the caller can omit the chip.
 */
export function resolveNextUp(input: {
  inProgress:  FDSession | null
  nextToday:   FDSession | null
  remainingToday: FDSession[]
  recentlyFinished: FDSession[]
  nextFuture:  FDSession | null
  clients:     Client[]
  todayTotal:  number
}): NextUpData {
  const { inProgress, nextToday, remainingToday, recentlyFinished, nextFuture, clients } = input

  function billingFor(session: FDSession): Pick<NextUpData, 'billingMode' | 'remainingSessions'> {
    const client = clients.find(c => c.id === session.clientId)
    return {
      billingMode:       client?.billingMode       ?? null,
      remainingSessions: client?.remainingSessions ?? null,
    }
  }

  if (inProgress) {
    return { mode: 'in_progress', session: inProgress, ...billingFor(inProgress) }
  }

  if (nextToday) {
    return { mode: 'next_today', session: nextToday, ...billingFor(nextToday) }
  }

  // Today had sessions but they're all done / being resolved
  const hadTodaySessions = recentlyFinished.length > 0 || remainingToday.length > 0
  if (hadTodaySessions && nextFuture) {
    return { mode: 'all_done_future', session: nextFuture, ...billingFor(nextFuture) }
  }

  if (nextFuture) {
    return { mode: 'next_future', session: nextFuture, ...billingFor(nextFuture) }
  }

  return { mode: 'none', session: null, billingMode: null, remainingSessions: null }
}
