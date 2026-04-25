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
  CalendarPlus,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  ChevronRight,
  FileText,
  UserPlus,
} from 'lucide-react'
import { StatCard } from './StatCard'
import { Avatar }   from './Avatar'
import { Badge }    from './Badge'
import type { Invoice } from '@/types'
import type { FDSession } from '@/types/scheduling'

// ─── Props ────────────────────────────────────────────────────────────────────

interface DashboardViewProps {
  trainerName: string
  greeting:    string
  today:       string

  stats: {
    activeClients:      number | null
    totalClients:       number | null
    outstandingBalance: number | null
    currency:           string
    monthlyRevenue:     number | null
    sessionsThisMonth:  number | null
  }

  todaySessions:    FDSession[]
  upcomingSessions: FDSession[]
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
  const right = href ? (
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

// ─── Quick actions ────────────────────────────────────────────────────────────

function QuickActions({ progressText }: { progressText: string }) {
  const actions = [
    { href: '/dashboard/schedule', Icon: CalendarPlus, label: 'Schedule' },
    { href: '/dashboard/clients/new',  Icon: UserPlus,     label: 'Add Client' },
    { href: '/dashboard/invoices',     Icon: FileText,     label: 'Send Reminder', subtext: 'Pending follow-up' },
  ]

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {actions.map(({ href, Icon, label, subtext }) => (
          <Link
            key={href}
            href={href}
            className="flex min-h-[92px] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2.5 text-center transition-opacity hover:opacity-90 active:opacity-70"
            style={{
              backgroundColor: 'var(--fd-surface)',
              borderColor: 'color-mix(in srgb, var(--fd-border) 60%, transparent)',
            }}
          >
            <Icon className="h-5 w-5" style={{ color: 'var(--fd-accent)' }} />
            <span className="text-sm font-semibold leading-snug" style={{ color: 'var(--fd-text)' }}>
              {label}
            </span>
            {subtext && (
              <span className="text-xs leading-snug" style={{ color: 'var(--fd-muted)' }}>
                {subtext}
              </span>
            )}
          </Link>
        ))}
      </div>

      <p className="text-center text-xs" style={{ color: 'var(--fd-muted)' }}>
        {progressText}
      </p>
    </div>
  )
}

// ─── Session card (today + upcoming) ─────────────────────────────────────────

function SessionCard({
  session,
  today,
  compact = false,
}: {
  session:  FDSession
  today:    string
  compact?: boolean
}) {
  const dateLabel = fmtSessionDate(session.startAt.toISOString().slice(0, 10), today)

  return (
    <Link
      href="/dashboard/schedule"
      className="flex items-center gap-3 rounded-2xl border p-4 transition-opacity active:opacity-70"
      style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
    >
      <Avatar name={session.clientName} size={compact ? 'sm' : 'md'} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
          {session.clientName}
        </p>
        <p className="flex items-center gap-1 text-xs" style={{ color: 'var(--fd-muted)' }}>
          {dateLabel}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge variant="upcoming" label="Scheduled" />
        {session.rate > 0 && (
          <p className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
            {session.rate}
          </p>
        )}
      </div>
    </Link>
  )
}

// ─── Overdue invoice card ─────────────────────────────────────────────────────

function OverdueInvoiceCard({ invoice, today }: { invoice: Invoice; today: string }) {
  const days = daysOverdue(invoice.dueDate, today)
  const overdueLine = days > 0 ? `${days}d overdue` : `Due ${fmtDueDate(invoice.dueDate)}`

  return (
    <div
      className="rounded-2xl border p-4 space-y-3"
      style={{ backgroundColor: 'rgba(232,92,106,0.06)', borderColor: 'rgba(232,92,106,0.2)' }}
    >
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

      <div className="flex gap-2">
        <Link
          href={`/dashboard/messages/${invoice.clientId}?type=reminder&invoiceId=${invoice.id}`}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-opacity active:opacity-60"
          style={{ backgroundColor: 'rgba(232,92,106,0.15)', color: 'var(--fd-red)' }}
        >
          Send Reminder
        </Link>
        <Link
          href="/dashboard/invoices"
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
  const { activeClients, outstandingBalance, currency, monthlyRevenue, sessionsThisMonth } = stats
  const firstName = trainerName.split(' ')[0] ?? trainerName

  const hasUpcoming = upcomingSessions.length > 0
  const nextSession = todaySessions[0] ?? upcomingSessions[0] ?? null
  const outstandingCount = overdueInvoices.length
  const outstandingLabel = outstandingBalance !== null && outstandingBalance > 0
    ? `${fmtMoney(outstandingBalance, currency)} pending`
    : 'All caught up'
  const followUpCount = todaySessions.length
  const followUpLabel = followUpCount > 0
    ? `${followUpCount} session${followUpCount === 1 ? '' : 's'} to review`
    : 'All caught up'
  const weeklyGoal = 5
  const completedThisWeek = sessionsThisMonth === null ? 0 : Math.min(sessionsThisMonth, weeklyGoal)
  const quickActionsProgress = `${completedThisWeek} of ${weeklyGoal} sessions completed this week`
  const nextSessionYmd = nextSession ? nextSession.startAt.toISOString().slice(0, 10) : ''
  const nextSessionDateLabel = nextSession ? fmtSessionDate(nextSessionYmd, today) : ''
  const nextSessionTimeLabel = nextSession ? nextSession.startAt.toISOString().slice(11, 16) : 'Time TBD'
  const nextSessionRelative = nextSession
    ? (nextSessionYmd === today
      ? 'Today'
      : nextSessionDateLabel === 'Tomorrow'
        ? `Tomorrow at ${nextSessionTimeLabel}`
        : `${nextSessionDateLabel} at ${nextSessionTimeLabel}`)
    : ''

  return (
    <div className="space-y-5 p-4 pb-24">

      {/* ── Greeting ─────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--fd-text)' }}>
          {greeting}, {firstName}
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--fd-muted)' }}>
          {formatTodayLabel(today)}
        </p>
      </div>

      {/* ── Revenue hero ───────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl p-6"
        style={{
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--fd-accent) 58%, var(--fd-text) 42%) 0%, color-mix(in srgb, var(--fd-accent) 52%, var(--fd-surface) 48%) 100%), linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.06))',
          backgroundBlendMode: 'overlay',
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'rgba(240,237,230,0.78)' }}>
          This Month
        </p>
        <p className="mt-1 text-3xl font-bold leading-none tracking-tight" style={{ color: 'var(--fd-text)' }}>
          {fmtMoney(monthlyRevenue, currency)}
        </p>
        <p className="mt-2 text-sm leading-snug" style={{ color: 'rgba(240,237,230,0.88)' }}>
          You&apos;re on track this month.
        </p>
        <Link
          href="/dashboard/invoices"
          className="mt-5 flex w-full items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold tracking-wide transition-opacity hover:opacity-90 active:opacity-70"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--fd-text) 95%, white)',
            color: 'var(--fd-accent)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          View Payments
        </Link>
      </div>

      {/* ── Needs attention ─────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
          Needs Attention
        </p>

        <div
          className="divide-y divide-border rounded-xl border p-3"
          style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
        >
          <div
            className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5"
            style={{ backgroundColor: 'color-mix(in srgb, var(--fd-card) 24%, transparent)' }}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium" style={{ color: 'var(--fd-text)' }}>
                Outstanding payments
              </p>
              <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
                {outstandingCount > 0 ? `${outstandingCount} invoice${outstandingCount === 1 ? '' : 's'} · ${outstandingLabel}` : outstandingLabel}
              </p>
            </div>
            <Link
              href="/dashboard/invoices"
              className="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 active:opacity-70"
              style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-text)', backgroundColor: 'var(--fd-card)' }}
            >
              Send Reminders
            </Link>
          </div>

          <div
            className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5"
            style={{ backgroundColor: 'color-mix(in srgb, var(--fd-card) 24%, transparent)' }}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium" style={{ color: 'var(--fd-text)' }}>
                Follow-ups needed
              </p>
              <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
                {followUpLabel}
              </p>
            </div>
            <Link
              href="/dashboard/messages"
              className="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 active:opacity-70"
              style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-text)', backgroundColor: 'var(--fd-card)' }}
            >
              Follow Up
            </Link>
          </div>
        </div>
      </div>

      {/* ── Quick actions ─────────────────────────────────────────────────── */}
      <QuickActions progressText={quickActionsProgress} />

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-[6px]">
        <Link href="/dashboard/invoices" className="transition-opacity hover:opacity-90 active:opacity-70">
          <StatCard
            compact
            className="rounded-xl [&_p]:leading-tight"
            label="This Month"
            value={fmtMoney(monthlyRevenue, currency)}
          />
        </Link>

        <Link href="/dashboard/invoices" className="transition-opacity hover:opacity-90 active:opacity-70">
          <StatCard
            compact
            className="rounded-xl [&_p]:leading-tight"
            label="Outstanding"
            value={fmtMoney(outstandingBalance, currency)}
          />
        </Link>

        <Link href="/dashboard/clients" className="transition-opacity hover:opacity-90 active:opacity-70">
          <StatCard
            compact
            className="rounded-xl [&_p]:leading-tight"
            label="Clients"
            value={fmtNum(activeClients)}
          />
        </Link>
      </div>

      {/* ── Next session ──────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
          Next Session
        </p>

        <div
          className="rounded-2xl border p-4"
          style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
        >
          {nextSession ? (
            <>
              <div className="flex items-start gap-3">
                <Avatar name={nextSession.clientName} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
                    {nextSession.clientName}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
                    {nextSessionDateLabel} · {nextSessionTimeLabel}
                  </p>
                  <p className="mt-1 text-xs font-medium" style={{ color: 'color-mix(in srgb, var(--fd-muted) 88%, transparent)' }}>
                    {nextSessionRelative}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <Link
                  href="/dashboard/schedule"
                  className="flex-1 rounded-xl border px-3 py-2 text-center text-xs font-semibold transition-opacity hover:opacity-90 active:opacity-70"
                  style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)', color: 'var(--fd-text)' }}
                >
                  View
                </Link>
                <Link
                  href="/dashboard/messages"
                  className="flex-1 rounded-xl border px-3 py-2 text-center text-xs font-semibold transition-opacity hover:opacity-90 active:opacity-70"
                  style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)', color: 'var(--fd-text)' }}
                >
                  Remind
                </Link>
              </div>
            </>
          ) : (
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--fd-text)' }}>
                No upcoming sessions
              </p>
              <p className="mt-1 text-xs" style={{ color: 'var(--fd-muted)' }}>
                Create a new session
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Coming up ─────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
          Coming Up
        </p>

        <div
          className="rounded-xl border p-3"
          style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
        >
          {hasUpcoming ? (
            <div className="space-y-2">
              {upcomingSessions.slice(0, 3).map(session => (
                <Link
                  key={session.id}
                  href="/dashboard/schedule"
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors transition-opacity hover:opacity-90 active:opacity-70"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--fd-card) 22%, transparent)' }}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" style={{ color: 'var(--fd-text)' }}>
                      {session.clientName}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
                      {fmtSessionDate(session.startAt.toISOString().slice(0, 10), today)} · {session.startAt.toISOString().slice(11, 16)}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs" style={{ color: 'color-mix(in srgb, var(--fd-muted) 80%, transparent)' }}>
                    ›
                  </span>
                </Link>
              ))}

              <div className="flex justify-end pt-1">
                <Link
                  href="/dashboard/schedule"
                  className="text-xs font-semibold transition-opacity hover:opacity-90 active:opacity-70"
                  style={{ color: 'var(--fd-muted)' }}
                >
                  See All ›
                </Link>
              </div>
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
              No upcoming sessions
            </p>
          )}
        </div>
      </div>

    </div>
  )
}
