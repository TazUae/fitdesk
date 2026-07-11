/**
 * Dashboard derive — pure functions over main Session / Invoice model.
 *
 * No FDSession. No server actions. No ERP calls.
 * All functions are side-effect free and safe to test with plain objects.
 */

import { fmtShortDate, fmtTime } from '@/lib/date'
import { isOutstandingInvoiceStatus } from '@/lib/invoices/status'
import type { Session, Invoice, Client } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

/** The immediately upcoming session (today-first, then soonest future). */
export interface NextUpData {
  session: Session
  /** True when the session is today. */
  isToday: boolean
  /** Human-readable label: "Today · 9:00 AM · 60 min" */
  label: string
}

/** Today's sessions split into two views. */
export interface TodaySection {
  /** Sessions today with status === 'scheduled', sorted by time asc. */
  upcoming: Session[]
  /**
   * Sessions today with status === 'completed', sorted by time desc.
   * Capped at 3 for the timeline display.
   */
  completed: Session[]
}

/** Invoice-derived money summary. */
export interface MoneySnapshot {
  /** Total outstanding across sent / partially_paid / overdue. */
  outstandingAmount: number
  currency: string
  /** Count of invoices with status === 'overdue'. */
  overdueCount: number
  /** Paid invoices in the current calendar month. */
  monthlyRevenue: number
}

/** A single lightweight attention item — link only, no mutation. */
export interface AttentionItem {
  /**
   * overdue_invoice      — past due, strongest urgency (red).
   * pending_invoice      — sent / partially_paid, collection prompt (amber).
   * invoice_overflow     — "+N more" cap item linking to the invoices list.
   * unresolved_session   — past session with no recorded outcome (US-057/US-003).
   * missing_next_session — active client with no future session booked (US-003).
   *
   * IMPORTANT: every type added here needs its own explicit render branch in
   * features/dashboard/components/ActionCenter.tsx — that component's render
   * loop falls through to overdue_invoice styling/fields for any type it
   * doesn't explicitly recognize, which would silently render a broken card
   * (wrong color, missing fields) for a type that isn't handled there yet.
   */
  type: 'overdue_invoice' | 'pending_invoice' | 'invoice_overflow' | 'unresolved_session' | 'missing_next_session'
  label: string
  href: string
  /** Present on 'overdue_invoice' and 'pending_invoice' items. */
  clientName?: string
  outstandingAmount?: number
  currency?: string
  dueDate?: string
  /** Days since the due date (0+ means past due). Only on overdue_invoice. */
  ageDays?: number
  /** 'high' for invoices ≥ 14 days overdue; 'normal' otherwise. Only on overdue_invoice. */
  severity?: 'high' | 'normal'
}

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Returns the next scheduled session (today-first, then chronologically nearest).
 * Returns null when there are no upcoming scheduled sessions.
 *
 * `nowTime` (HH:mm, trainer-local, same timezone basis as `today`/`session.time`)
 * is optional. When omitted, behavior is unchanged (date-only comparison) for
 * backward compatibility. When provided, a session dated today whose `time` is
 * before `nowTime` is treated as past and excluded — a session with no `time`
 * is never excluded this way, since its start cannot be determined.
 */
export function getNextUp(sessions: Session[], today: string, nowTime?: string): NextUpData | null {
  const scheduled = sessions
    .filter(s => {
      if (s.status !== 'scheduled') return false
      if (s.date > today) return true
      if (s.date < today) return false
      // s.date === today
      if (!nowTime || !s.time) return true
      return s.time >= nowTime
    })
    .sort((a, b) =>
      a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''),
    )

  const s = scheduled[0]
  if (!s) return null

  const isToday  = s.date === today
  const datePart = fmtShortDate(s.date, today)
  const timePart = fmtTime(s.time)
  const durPart  = s.durationMinutes ? `${s.durationMinutes} min` : null

  const parts = [datePart, timePart, durPart].filter(Boolean)
  return { session: s, isToday, label: parts.join(' · ') }
}

/**
 * Splits today's sessions into upcoming (scheduled) and recently completed.
 * Completed list is capped at 3 items for the timeline display.
 */
export function getTodaySections(sessions: Session[], today: string): TodaySection {
  const todayAll = sessions.filter(s => s.date === today)

  const upcoming = todayAll
    .filter(s => s.status === 'scheduled')
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))

  const completed = todayAll
    .filter(s => s.status === 'completed')
    .sort((a, b) => (b.time ?? '').localeCompare(a.time ?? ''))
    .slice(0, 3)

  return { upcoming, completed }
}

/**
 * Summarises invoice financials for the MoneySnapshot card.
 * Uses `isOutstandingInvoiceStatus` so partially_paid is counted as outstanding.
 */
export function getMoneySnapshot(invoices: Invoice[], monthStart: string): MoneySnapshot {
  const outstanding     = invoices.filter(i => isOutstandingInvoiceStatus(i.status))
  const outstandingAmount = outstanding.reduce((sum, i) => sum + i.outstandingAmount, 0)
  const overdueCount    = invoices.filter(i => i.status === 'overdue').length
  const monthlyRevenue  = invoices
    .filter(i => i.status === 'paid' && i.issuedAt >= monthStart)
    .reduce((sum, i) => sum + i.amount, 0)
  const currency = invoices.find(i => i.currency)?.currency ?? 'USD'

  return { outstandingAmount, currency, overdueCount, monthlyRevenue }
}

/**
 * Returns upcoming scheduled sessions strictly after today, sorted
 * chronologically, capped at `limit` (default 3).
 */
export function getUpcoming(sessions: Session[], today: string, limit = 3): Session[] {
  return sessions
    .filter(s => s.date > today && s.status === 'scheduled')
    .sort((a, b) =>
      a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''),
    )
    .slice(0, limit)
}

const ATTENTION_CAP = 4
const HIGH_SEVERITY_DAYS = 14

/** Days elapsed since dueDate relative to today (both YYYY-MM-DD). Always ≥ 0 for past-due. */
function daysSinceDue(today: string, dueDate: string): number {
  const [ty, tm, td] = today.split('-').map(Number)
  const [dy, dm, dd] = dueDate.split('-').map(Number)
  const todayMs = Date.UTC(ty, tm - 1, td)
  const dueMs   = Date.UTC(dy, dm - 1, dd)
  return Math.max(0, Math.floor((todayMs - dueMs) / 86_400_000))
}

/** Sort invoices: oldest dueDate first, then larger outstandingAmount first. */
function sortByAge(a: Invoice, b: Invoice): number {
  const dateCmp = a.dueDate.localeCompare(b.dueDate)
  if (dateCmp !== 0) return dateCmp
  return b.outstandingAmount - a.outstandingAmount
}

/**
 * Derives lightweight attention items for the Action Center.
 *
 * Overdue invoices appear first (highest urgency), followed by sent /
 * partially_paid invoices (collection prompt). Combined list is capped at
 * ATTENTION_CAP with a single overflow item when there are more.
 *
 * `today` is optional (YYYY-MM-DD) — defaults to the real UTC date.
 * Pass a fixed value in tests for deterministic ageDays.
 */
export function getAttentionItems(invoices: Invoice[], today?: string): AttentionItem[] {
  const refDate = today ?? new Date().toISOString().slice(0, 10)

  const overdue = invoices.filter(i => i.status === 'overdue').sort(sortByAge)
  const pending = invoices.filter(i => i.status === 'sent' || i.status === 'partially_paid').sort(sortByAge)

  if (overdue.length === 0 && pending.length === 0) return []

  const overdueItems: AttentionItem[] = overdue.map(inv => {
    const ageDays  = daysSinceDue(refDate, inv.dueDate)
    const severity: 'high' | 'normal' = ageDays >= HIGH_SEVERITY_DAYS ? 'high' : 'normal'
    return {
      type:              'overdue_invoice' as const,
      label:             `${inv.clientName} — ${inv.outstandingAmount} ${inv.currency} overdue ${ageDays} day${ageDays !== 1 ? 's' : ''}`,
      href:              `/dashboard/invoices/${inv.id}`,
      clientName:        inv.clientName,
      outstandingAmount: inv.outstandingAmount,
      currency:          inv.currency,
      dueDate:           inv.dueDate,
      ageDays,
      severity,
    }
  })

  const pendingItems: AttentionItem[] = pending.map(inv => ({
    type:              'pending_invoice' as const,
    label:             `${inv.clientName} — ${inv.outstandingAmount} ${inv.currency} to collect`,
    href:              `/dashboard/invoices/${inv.id}`,
    clientName:        inv.clientName,
    outstandingAmount: inv.outstandingAmount,
    currency:          inv.currency,
    dueDate:           inv.dueDate,
  }))

  const combined      = [...overdueItems, ...pendingItems]
  const visible       = combined.slice(0, ATTENTION_CAP)
  const overflowCount = combined.length - ATTENTION_CAP

  const items: AttentionItem[] = [...visible]

  if (overflowCount > 0) {
    items.push({
      type:  'invoice_overflow' as const,
      label: `+${overflowCount} more invoice${overflowCount !== 1 ? 's' : ''}`,
      href:  '/dashboard/invoices',
    })
  }

  return items
}

// ─── Unresolved sessions (US-057) ──────────────────────────────────────────────

/**
 * A past session whose outcome was never recorded — still `'scheduled'`
 * (covers both FD Session `'scheduled'` and `'confirmed'`, which
 * lib/dashboard/fdSessionAdapter.ts's mapFDStatus both map to `'scheduled'`;
 * either way the trainer never marked what actually happened) with a start
 * time strictly before `now`.
 */
export interface UnresolvedSessionItem {
  session:     Session
  /** Days elapsed since the session's date (0 = today, still in the past by time). */
  daysOverdue: number
}

/**
 * Returns past sessions with no recorded outcome, oldest first (most overdue
 * surfaces first — mirrors sortByAge's oldest-first convention for overdue
 * invoices).
 *
 * `nowTime` (HH:mm) is optional, same contract as getNextUp: when provided, a
 * session dated today whose `time` is before `nowTime` counts as unresolved;
 * a session with no `time` is never excluded by the time check (its start
 * can't be determined, so date-only comparison applies).
 */
export function getUnresolvedSessions(
  sessions: Session[],
  today: string,
  nowTime?: string,
): UnresolvedSessionItem[] {
  const unresolved = sessions.filter(s => {
    if (s.status !== 'scheduled') return false
    if (s.date > today) return false
    if (s.date < today) return true
    // s.date === today
    if (!nowTime || !s.time) return false
    return s.time < nowTime
  })

  return unresolved
    .map(session => ({ session, daysOverdue: daysSinceDue(today, session.date) }))
    .sort((a, b) =>
      a.session.date.localeCompare(b.session.date) || (a.session.time ?? '').localeCompare(b.session.time ?? ''),
    )
}

const UNRESOLVED_CAP = 4

/**
 * Converts US-057's unresolved-session detection into the dashboard's
 * AttentionItem card shape. Oldest-first (already sorted by
 * getUnresolvedSessions), capped with an overflow item — same convention as
 * getAttentionItems' invoice cap.
 *
 * href points at the schedule view, not a mutation — batch resolution itself
 * is a separate confirmed action, not something this card triggers directly.
 */
export function getUnresolvedSessionAttentionItems(
  items: UnresolvedSessionItem[],
): AttentionItem[] {
  if (items.length === 0) return []

  const visible = items.slice(0, UNRESOLVED_CAP)
  const overflowCount = items.length - UNRESOLVED_CAP

  const result: AttentionItem[] = visible.map(({ session, daysOverdue }) => ({
    type:       'unresolved_session' as const,
    label:      `${session.clientName} — session needs an outcome${daysOverdue > 0 ? ` (${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} ago)` : ''}`,
    href:       '/dashboard/schedule',
    clientName: session.clientName,
  }))

  if (overflowCount > 0) {
    result.push({
      type:  'unresolved_session' as const,
      label: `+${overflowCount} more unresolved session${overflowCount !== 1 ? 's' : ''}`,
      href:  '/dashboard/schedule',
    })
  }

  return result
}

const MISSING_NEXT_SESSION_CAP = 4

/**
 * Active clients with no future scheduled session in the already-fetched
 * dashboard session window (US-003 "missing next sessions where data
 * exists" — "where data exists" scopes this to the session window the
 * dashboard already has on hand, not an exhaustive all-time lookup).
 *
 * A client with zero sessions ever (never booked) is intentionally excluded
 * — that is the Add Client / first-booking loop's job (FE-002), not a
 * Needs Attention signal; this card is about a client who was active and
 * then fell off the schedule, not a brand-new client mid-onboarding.
 */
export function getMissingNextSessionAttentionItems(
  clients: Client[],
  sessions: Session[],
  today: string,
): AttentionItem[] {
  const clientIdsWithHistory = new Set(sessions.map(s => s.clientId))
  const clientIdsWithFutureSession = new Set(
    sessions.filter(s => s.status === 'scheduled' && s.date >= today).map(s => s.clientId),
  )

  const candidates = clients.filter(c =>
    c.status === 'active'
    && clientIdsWithHistory.has(c.id)
    && !clientIdsWithFutureSession.has(c.id),
  )

  if (candidates.length === 0) return []

  const visible = candidates.slice(0, MISSING_NEXT_SESSION_CAP)
  const overflowCount = candidates.length - MISSING_NEXT_SESSION_CAP

  const result: AttentionItem[] = visible.map(client => ({
    type:       'missing_next_session' as const,
    label:      `${client.name} has no upcoming session booked`,
    href:       `/dashboard/clients/${client.id}`,
    clientName: client.name,
  }))

  if (overflowCount > 0) {
    result.push({
      type:  'missing_next_session' as const,
      label: `+${overflowCount} more client${overflowCount !== 1 ? 's' : ''} with no upcoming session`,
      href:  '/dashboard/clients',
    })
  }

  return result
}
