import Link from 'next/link'
import { CalendarPlus, UserPlus, ArrowUpRight } from 'lucide-react'
import { Avatar } from '@/components/modules/Avatar'
import { ymdInTz, hhmInTz } from '@/lib/date'
import type { NextUpData } from '@/lib/dashboard/derive'

interface Props {
  nextUp:   NextUpData
  today:    string
  timezone: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtRelativeDay(sessionYmd: string, todayYmd: string): string {
  const [ty, tm, td] = todayYmd.split('-').map(Number)
  const tomorrow = new Date(Date.UTC(ty, tm - 1, td))
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  const tomorrowYmd = tomorrow.toISOString().slice(0, 10)
  if (sessionYmd === tomorrowYmd) return 'Tomorrow'
  const [y, m, d] = sessionYmd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday:  'short',
    month:    'short',
    day:      'numeric',
  })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CardShell({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div
      className="rounded-2xl border p-4 space-y-3"
      style={{
        backgroundColor: 'var(--fd-surface)',
        borderColor:     accent ? 'rgba(26,115,232,0.25)' : 'var(--fd-border)',
        boxShadow:       '0 1px 3px rgba(60,64,67,0.07)',
      }}
    >
      {children}
    </div>
  )
}

function Eyebrow({ label, active }: { label: string; active?: boolean }) {
  return (
    <p
      className="text-[10px] font-bold uppercase tracking-[0.09em]"
      style={{ color: active ? 'var(--fd-blue)' : 'var(--fd-muted)' }}
    >
      {label}
    </p>
  )
}

function BillingChip({ billingMode, remaining }: { billingMode: string | null; remaining: number | null }) {
  if (!billingMode) return null
  const label =
    billingMode === 'Package' && remaining != null
      ? `Package · ${remaining} left`
      : billingMode === 'Pay Per Session'
      ? 'Pay per session'
      : billingMode === 'Trial'
      ? 'Trial'
      : null
  if (!label) return null
  return (
    <span
      className="inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
      style={{ backgroundColor: 'rgba(60,64,67,0.07)', color: 'var(--fd-muted)' }}
    >
      {label}
    </span>
  )
}

function PrimaryBtn({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90 active:opacity-70"
      style={{ backgroundColor: 'var(--fd-blue)', color: '#fff' }}
    >
      {children}
    </Link>
  )
}

function SecondaryBtn({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90 active:opacity-70"
      style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-text)' }}
    >
      {children}
    </Link>
  )
}

// ─── State renderers ──────────────────────────────────────────────────────────

function InProgressCard({ nextUp, today, timezone }: Props) {
  const { session, billingMode, remainingSessions } = nextUp
  if (!session) return null
  const timeLabel  = hhmInTz(session.startAt, timezone)
  const endLabel   = hhmInTz(session.endAt,   timezone)
  const msgHref    = session.clientId ? `/dashboard/messages/${encodeURIComponent(session.clientId)}` : null

  return (
    <CardShell accent>
      <Eyebrow label="In session now" active />
      <div className="flex items-center gap-3">
        <div className="relative">
          <Avatar name={session.clientName} size="md" />
          <span
            className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white animate-pulse"
            style={{ backgroundColor: 'var(--fd-blue)' }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold" style={{ color: 'var(--fd-text)' }}>
            {session.clientName}
          </p>
          <p className="text-xs" style={{ color: 'var(--fd-blue)' }}>
            Started {timeLabel} · ends {endLabel}
          </p>
          <div className="mt-1">
            <BillingChip billingMode={billingMode} remaining={remainingSessions} />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <PrimaryBtn href="/dashboard/schedule">
          Open in schedule <ArrowUpRight className="h-3.5 w-3.5" />
        </PrimaryBtn>
        {msgHref && (
          <SecondaryBtn href={msgHref}>Message client</SecondaryBtn>
        )}
      </div>
    </CardShell>
  )
}

function NextTodayCard({ nextUp, today, timezone }: Props) {
  const { session, billingMode, remainingSessions } = nextUp
  if (!session) return null
  const timeLabel = hhmInTz(session.startAt, timezone)
  const msgHref   = session.clientId ? `/dashboard/messages/${encodeURIComponent(session.clientId)}` : null

  return (
    <CardShell accent>
      <Eyebrow label="Next session today" active />
      <div className="flex items-center gap-3">
        <Avatar name={session.clientName} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold" style={{ color: 'var(--fd-text)' }}>
            {session.clientName}
          </p>
          <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
            Today · {timeLabel}
          </p>
          <div className="mt-1">
            <BillingChip billingMode={billingMode} remaining={remainingSessions} />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <PrimaryBtn href="/dashboard/schedule">
          Open in schedule <ArrowUpRight className="h-3.5 w-3.5" />
        </PrimaryBtn>
        {msgHref && (
          <SecondaryBtn href={msgHref}>Message client</SecondaryBtn>
        )}
      </div>
    </CardShell>
  )
}

function AllDoneFutureCard({ nextUp, today, timezone }: Props) {
  const { session } = nextUp
  if (!session) return null
  const sessionYmd  = ymdInTz(session.startAt, timezone)
  const dayLabel    = fmtRelativeDay(sessionYmd, today)
  const timeLabel   = hhmInTz(session.startAt, timezone)

  return (
    <CardShell>
      <Eyebrow label="Next up" />
      <div className="flex items-center gap-3">
        <Avatar name={session.clientName} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold" style={{ color: 'var(--fd-text)' }}>
            {session.clientName}
          </p>
          <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
            {dayLabel} · {timeLabel}
          </p>
        </div>
      </div>
      <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
        Today&rsquo;s sessions are done. Next is {dayLabel.toLowerCase()} at {timeLabel}.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <PrimaryBtn href="/dashboard/schedule">View schedule</PrimaryBtn>
      </div>
    </CardShell>
  )
}

function NextFutureCard({ nextUp, today, timezone }: Props) {
  const { session } = nextUp
  if (!session) return null
  const sessionYmd = ymdInTz(session.startAt, timezone)
  const dayLabel   = fmtRelativeDay(sessionYmd, today)
  const timeLabel  = hhmInTz(session.startAt, timezone)

  return (
    <CardShell>
      <Eyebrow label="Next up" />
      <div className="flex items-center gap-3">
        <Avatar name={session.clientName} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold" style={{ color: 'var(--fd-text)' }}>
            {session.clientName}
          </p>
          <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
            {dayLabel} · {timeLabel}
          </p>
        </div>
      </div>
      <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
        No sessions today. Your next booked session is {dayLabel.toLowerCase()}.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <PrimaryBtn href="/dashboard/schedule">
          <CalendarPlus className="h-3.5 w-3.5" />
          Book session
        </PrimaryBtn>
        <SecondaryBtn href="/dashboard/schedule">View schedule</SecondaryBtn>
      </div>
    </CardShell>
  )
}

function NoneCard() {
  return (
    <CardShell>
      <Eyebrow label="Next up" />
      <p className="text-base font-bold" style={{ color: 'var(--fd-text)' }}>
        No upcoming sessions
      </p>
      <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
        Nothing on the calendar yet. Book a session to get started.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <PrimaryBtn href="/dashboard/schedule">
          <CalendarPlus className="h-3.5 w-3.5" />
          Book session
        </PrimaryBtn>
        <SecondaryBtn href="/dashboard/clients/new">
          <UserPlus className="h-3.5 w-3.5" />
          Add client
        </SecondaryBtn>
      </div>
    </CardShell>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function NextUpCard({ nextUp, today, timezone }: Props) {
  switch (nextUp.mode) {
    case 'in_progress':     return <InProgressCard   nextUp={nextUp} today={today} timezone={timezone} />
    case 'next_today':      return <NextTodayCard     nextUp={nextUp} today={today} timezone={timezone} />
    case 'all_done_future': return <AllDoneFutureCard nextUp={nextUp} today={today} timezone={timezone} />
    case 'next_future':     return <NextFutureCard    nextUp={nextUp} today={today} timezone={timezone} />
    case 'none':            return <NoneCard />
  }
}
