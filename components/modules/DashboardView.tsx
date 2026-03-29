/**
 * DashboardView — pure presenter, no client hooks.
 *
 * All data is pre-computed by the server component (app/dashboard/page.tsx)
 * and passed as props. This component only formats, lays out, and links.
 *
 * Do NOT add 'use client'. It renders in the server component tree.
 */

import Link from 'next/link'
import {
  Users,
  Calendar,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  Clock,
  ChevronRight,
} from 'lucide-react'
import { StatCard } from './StatCard'
import { Avatar }   from './Avatar'
import { Badge }    from './Badge'
import type { Session, Invoice } from '@/types'

// ─── Props ────────────────────────────────────────────────────────────────────

interface DashboardViewProps {
  /** Trainer display name from the auth session. */
  trainerName: string
  /** Time-of-day greeting — computed server-side. */
  greeting:    string
  /** ISO date string for today — YYYY-MM-DD. */
  today:       string

  /** Key metrics. null = that data source failed to load. */
  stats: {
    activeClients:      number | null
    totalClients:       number | null
    outstandingBalance: number | null
    currency:           string
    monthlyRevenue:     number | null
    sessionsThisMonth:  number | null
  }

  /** Scheduled sessions with date === today. */
  todaySessions:    Session[]
  /** Next upcoming sessions after today (already capped to 3). */
  upcomingSessions: Session[]
  /** All invoices with status === 'overdue'. */
  overdueInvoices:  Invoice[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(n: number | null, currency = 'USD'): string {
  if (n === null) return '—'
  if (n === 0)    return '$0'
  return new Intl.NumberFormat('en-US', {
    style:                'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(n)
}

function fmtNum(n: number | null): string {
  return n === null ? '—' : String(n)
}

/** Parses YYYY-MM-DD without timezone drift. */
function parseUTCDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function fmtSessionDate(dateStr: string, today: string): string {
  if (dateStr === today) return 'Today'
  const tomorrow = new Date(parseUTCDate(today).getTime() + 86_400_000)
    .toISOString()
    .slice(0, 10)
  if (dateStr === tomorrow) return 'Tomorrow'
  return parseUTCDate(dateStr).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday:  'short',
    month:    'short',
    day:      'numeric',
  })
}

function fmtDueDate(dateStr: string): string {
  return parseUTCDate(dateStr).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month:    'short',
    day:      'numeric',
  })
}

function daysOverdue(dueDate: string, today: string): number {
  return Math.max(
    0,
    Math.floor(
      (parseUTCDate(today).getTime() - parseUTCDate(dueDate).getTime()) / 86_400_000,
    ),
  )
}

function formatTodayLabel(todayStr: string): string {
  return parseUTCDate(todayStr).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday:  'long',
    month:    'long',
    day:      'numeric',
  })
}

function fmtTime(time?: string): string {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12  = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  title,
  count,
  href,
}: {
  title: string
  count?: number
  href?:  string
}) {
  const right =
    href ? (
      <Link
        href={href}
        className="flex items-center gap-0.5 text-xs font-semibold transition-opacity active:opacity-60"
        style={{ color: 'var(--fd-accent)' }}
      >
        See all <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    ) : null

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
          {title}
        </p>
        {count !== undefined && count > 0 && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none"
            style={{ backgroundColor: 'rgba(232,197,71,0.15)', color: 'var(--fd-accent)' }}
          >
            {count}
          </span>
        )}
      </div>
      {right}
    </div>
  )
}

// ─── Session card (today + upcoming) ─────────────────────────────────────────

function SessionCard({
  session,
  today,
  compact = false,
}: {
  session: Session
  today:   string
  compact?: boolean
}) {
  const dateLabel = fmtSessionDate(session.date, today)
  const timeLabel = session.time
    ? `${fmtTime(session.time)}${session.durationMinutes ? ` · ${session.durationMinutes} min` : ''}`
    : session.durationMinutes
      ? `${session.durationMinutes} min`
      : null

  return (
    <Link
      href="/dashboard/schedule"
      className="flex items-center gap-3 rounded-2xl border p-4 transition-opacity active:opacity-70"
      style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
    >
      <Avatar name={session.clientName} size={compact ? 'sm' : 'md'} />

      <div className="min-w-0 flex-1">
        <p
          className="truncate text-sm font-semibold"
          style={{ color: 'var(--fd-text)' }}
        >
          {session.clientName}
        </p>
        <p className="flex items-center gap-1 text-xs" style={{ color: 'var(--fd-muted)' }}>
          {!compact && (
            <>
              <span>{dateLabel}</span>
              {timeLabel && <span>·</span>}
            </>
          )}
          {timeLabel && <span>{timeLabel}</span>}
          {compact && !timeLabel && <span>{dateLabel}</span>}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge variant="upcoming" label="Scheduled" />
        {session.sessionFee !== undefined && (
          <p className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            ${session.sessionFee}
          </p>
        )}
      </div>
    </Link>
  )
}

// ─── Overdue invoice card ─────────────────────────────────────────────────────

function OverdueInvoiceCard({
  invoice,
  today,
}: {
  invoice: Invoice
  today:   string
}) {
  const days = daysOverdue(invoice.dueDate, today)
  const overdueLine = days > 0 ? `${days}d overdue` : `Due ${fmtDueDate(invoice.dueDate)}`

  return (
    <div
      className="rounded-2xl border p-4 space-y-3"
      style={{
        backgroundColor: 'rgba(232,92,106,0.06)',
        borderColor:     'rgba(232,92,106,0.2)',
      }}
    >
      {/* Client + amount row */}
      <div className="flex items-center gap-3">
        <Avatar name={invoice.clientName} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
            {invoice.clientName}
          </p>
          <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
            {invoice.id} · {overdueLine}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-base font-bold" style={{ color: 'var(--fd-red)' }}>
            {invoice.currency} {invoice.outstandingAmount.toLocaleString()}
          </p>
          <Badge variant="overdue" />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Link
          href={`/dashboard/messages/${invoice.clientId}?type=reminder&invoiceId=${invoice.id}`}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-opacity active:opacity-60"
          style={{ backgroundColor: 'rgba(232,92,106,0.15)', color: 'var(--fd-red)' }}
        >
          Send Reminder
        </Link>
        <Link
          href={`/dashboard/invoices`}
          className="flex items-center justify-center rounded-xl px-4 py-2 text-xs font-bold transition-opacity active:opacity-60"
          style={{ backgroundColor: 'rgba(138,143,168,0.10)', color: 'var(--fd-muted)' }}
        >
          View
        </Link>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DashboardView({
  trainerName,
  greeting,
  today,
  stats,
  todaySessions,
  upcomingSessions,
  overdueInvoices,
}: DashboardViewProps) {
  const { activeClients, totalClients, outstandingBalance, currency, monthlyRevenue, sessionsThisMonth } = stats
  const firstName = trainerName.split(' ')[0] ?? trainerName

  const hasOverdue     = overdueInvoices.length > 0
  const hasToday       = todaySessions.length > 0
  const hasUpcoming    = upcomingSessions.length > 0
  const totalOutstanding = overdueInvoices.reduce((s, i) => s + i.outstandingAmount, 0)

  return (
    <div className="space-y-6 p-4 pb-24">

      {/* ── Greeting ─────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--fd-text)' }}>
          {greeting}, {firstName} 👋
        </h2>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--fd-muted)' }}>
          {formatTodayLabel(today)}
        </p>
      </div>

      {/* ── Stats grid ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">

        <Link href="/dashboard/clients" className="transition-opacity active:opacity-70">
          <StatCard
            label="Active clients"
            value={fmtNum(activeClients)}
            subtext={
              totalClients !== null
                ? `${totalClients} total`
                : undefined
            }
            Icon={Users}
            accent="var(--fd-green)"
          />
        </Link>

        <Link href="/dashboard/invoices" className="transition-opacity active:opacity-70">
          <StatCard
            label="Outstanding"
            value={fmtMoney(outstandingBalance, currency)}
            subtext={
              outstandingBalance === null ? undefined :
              outstandingBalance === 0    ? 'All clear' :
              `${overdueInvoices.length} overdue`
            }
            Icon={DollarSign}
            accent={
              outstandingBalance !== null && outstandingBalance > 0
                ? 'var(--fd-red)'
                : 'var(--fd-green)'
            }
          />
        </Link>

        <Link href="/dashboard/schedule" className="transition-opacity active:opacity-70">
          <StatCard
            label="Sessions (month)"
            value={fmtNum(sessionsThisMonth)}
            Icon={Calendar}
            accent="var(--fd-blue)"
          />
        </Link>

        <StatCard
          label="Revenue (month)"
          value={fmtMoney(monthlyRevenue, currency)}
          Icon={TrendingUp}
          accent="var(--fd-green)"
        />

      </div>

      {/* ── Today's sessions ─────────────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader
          title="Today"
          count={todaySessions.length}
          href="/dashboard/schedule"
        />

        {hasToday ? (
          todaySessions.map(s => (
            <SessionCard key={s.id} session={s} today={today} />
          ))
        ) : (
          <div
            className="rounded-2xl border p-4"
            style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
          >
            <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
              No sessions scheduled for today.
            </p>
            <Link
              href="/dashboard/schedule"
              className="mt-1 inline-block text-xs font-semibold"
              style={{ color: 'var(--fd-accent)' }}
            >
              Book a session →
            </Link>
          </div>
        )}
      </div>

      {/* ── Overdue invoices (only shown when relevant) ───────────────────── */}
      {hasOverdue && (
        <div className="space-y-3">

          {/* Alert header */}
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2"
            style={{
              backgroundColor: 'rgba(232,92,106,0.10)',
              border:          '1px solid rgba(232,92,106,0.2)',
            }}
          >
            <AlertTriangle
              className="h-4 w-4 shrink-0"
              style={{ color: 'var(--fd-red)' }}
            />
            <p className="text-xs font-semibold" style={{ color: 'var(--fd-red)' }}>
              {overdueInvoices.length} overdue invoice{overdueInvoices.length !== 1 ? 's' : ''}
              {' · '}
              {fmtMoney(totalOutstanding, currency)} outstanding
            </p>
          </div>

          {overdueInvoices.map(inv => (
            <OverdueInvoiceCard key={inv.id} invoice={inv} today={today} />
          ))}

        </div>
      )}

      {/* ── Upcoming sessions ────────────────────────────────────────────── */}
      {hasUpcoming && (
        <div className="space-y-3">
          <SectionHeader
            title="Coming up"
            count={upcomingSessions.length}
            href="/dashboard/schedule"
          />

          {upcomingSessions.map(s => (
            <SessionCard key={s.id} session={s} today={today} compact />
          ))}
        </div>
      )}

      {/* Empty state — nothing today and nothing upcoming */}
      {!hasToday && !hasUpcoming && (
        <div
          className="flex flex-col items-center gap-2 rounded-2xl border py-10"
          style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
        >
          <Calendar
            className="h-8 w-8 opacity-25"
            style={{ color: 'var(--fd-muted)' }}
          />
          <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
            No upcoming sessions.
          </p>
          <Link
            href="/dashboard/schedule"
            className="text-xs font-semibold"
            style={{ color: 'var(--fd-accent)' }}
          >
            Open schedule →
          </Link>
        </div>
      )}

    </div>
  )
}
