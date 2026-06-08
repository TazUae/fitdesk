/**
 * Dashboard derive — pure functions over main Session / Invoice model.
 *
 * No FDSession. No server actions. No ERP calls.
 * All functions are side-effect free and safe to test with plain objects.
 */

import { fmtShortDate, fmtTime } from '@/lib/date'
import { isOutstandingInvoiceStatus } from '@/lib/invoices/status'
import type { Session, Invoice } from '@/types'

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
  type: 'overdue_invoice'
  label: string
  href: string
}

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Returns the next scheduled session (today-first, then chronologically nearest).
 * Returns null when there are no upcoming scheduled sessions.
 */
export function getNextUp(sessions: Session[], today: string): NextUpData | null {
  const scheduled = sessions
    .filter(s => s.status === 'scheduled' && s.date >= today)
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

/**
 * Derives lightweight attention items for the Action Center.
 * Returns an empty array when there are no overdue invoices — the Action Center
 * must NOT render if this is empty.
 */
export function getAttentionItems(invoices: Invoice[]): AttentionItem[] {
  const overdueCount = invoices.filter(i => i.status === 'overdue').length
  if (overdueCount === 0) return []

  return [
    {
      type: 'overdue_invoice' as const,
      label: `${overdueCount} overdue invoice${overdueCount !== 1 ? 's' : ''} need attention`,
      href:  '/dashboard/invoices',
    },
  ]
}
