import Link from 'next/link'
import { CheckCircle2, CalendarPlus, Coffee, ArrowRight } from 'lucide-react'
import { Avatar } from '@/components/modules/Avatar'
import { ymdInTz, hhmInTz } from '@/lib/date'
import type { TodayTimelineSections } from '@/lib/dashboard/derive'
import type { FDSession } from '@/types/scheduling'

interface Props {
  timeline: TodayTimelineSections
  timezone: string
  /** First upcoming session (tomorrow onwards), or null. */
  nextSession?:        FDSession | null
  /** Count of sessions completed on the trainer's previous local day. */
  completedYesterday?: number
  /** Today's 'YYYY-MM-DD' in the trainer timezone — for the next-session label. */
  today?:              string
}

/** Standalone day label for the rest-day preview row (capitalised). */
function fmtPreviewDate(dateStr: string, today: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const tomorrow = new Date(
    Date.UTC(...today.split('-').map(Number) as [number, number, number]),
  )
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  if (dateStr === tomorrow.toISOString().slice(0, 10)) return 'Tomorrow'
  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday:  'short',
    month:    'short',
    day:      'numeric',
  })
}

// ─── Single rail row ──────────────────────────────────────────────────────────

function RailRow({
  session,
  timezone,
  label,
  variant,
  isLast,
}: {
  session:  FDSession
  timezone: string
  label:    string
  variant:  'inprogress' | 'next' | 'remaining' | 'finished'
  isLast:   boolean
}) {
  const timeStr   = hhmInTz(session.startAt, timezone)
  const isActive  = variant === 'inprogress'
  const isFinished = variant === 'finished'

  const dotColor  = isActive ? 'var(--fd-blue)' : isFinished ? 'var(--fd-green)' : 'var(--fd-border-strong)'
  const lineColor = isFinished ? 'rgba(24,128,56,0.25)' : 'var(--fd-border)'

  return (
    <Link
      href="/dashboard/schedule"
      className="group relative flex items-start gap-0 transition-opacity hover:opacity-90 active:opacity-70"
    >
      {/* Gutter: time + rail line + dot */}
      <div className="relative flex w-[52px] shrink-0 flex-col items-center pt-2.5">
        {/* Rail line above dot (except very first) */}
        {!isLast && (
          <div
            className="absolute top-[26px] bottom-0 left-1/2 w-[2px] -translate-x-1/2"
            style={{ backgroundColor: lineColor }}
          />
        )}
        {/* Dot */}
        <div className="relative z-10 flex h-5 w-5 items-center justify-center">
          {isActive ? (
            <>
              <span
                className="absolute h-full w-full animate-ping rounded-full opacity-25"
                style={{ backgroundColor: 'var(--fd-blue)' }}
              />
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: 'var(--fd-blue)' }}
              />
            </>
          ) : (
            <span
              className="h-3 w-3 rounded-full border-2"
              style={{
                backgroundColor: isFinished ? 'var(--fd-green)' : 'var(--fd-surface)',
                borderColor:     dotColor,
              }}
            />
          )}
        </div>
        {/* Time below dot */}
        <span
          className="mt-0.5 text-[10px] font-semibold tabular-nums leading-none"
          style={{ color: isActive ? 'var(--fd-blue)' : 'var(--fd-muted)' }}
        >
          {timeStr}
        </span>
      </div>

      {/* Session card */}
      <div
        className="mb-3 ml-2 flex flex-1 items-center gap-2.5 rounded-xl px-3 py-2.5"
        style={{
          backgroundColor:
            isActive
              ? 'rgba(26,115,232,0.07)'
              : isFinished
              ? 'rgba(24,128,56,0.04)'
              : 'transparent',
          border:
            isActive
              ? '1px solid rgba(26,115,232,0.22)'
              : isFinished
              ? '1px solid rgba(24,128,56,0.12)'
              : '1px solid transparent',
        }}
      >
        <Avatar name={session.clientName} size="sm" />
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-semibold"
            style={{ color: isFinished ? 'var(--fd-muted)' : 'var(--fd-text)' }}
          >
            {session.clientName}
          </p>
          <p
            className="text-[11px]"
            style={{
              color: isActive ? 'var(--fd-blue)' : isFinished ? 'var(--fd-green)' : 'var(--fd-muted)',
            }}
          >
            {label}
          </p>
        </div>
        {isActive && (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{ backgroundColor: 'rgba(26,115,232,0.14)', color: 'var(--fd-blue)' }}
          >
            Live
          </span>
        )}
        {variant === 'next' && (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ backgroundColor: 'rgba(26,115,232,0.08)', color: 'var(--fd-blue)' }}
          >
            Next
          </span>
        )}
        {isFinished && (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--fd-green)' }} />
        )}
      </div>
    </Link>
  )
}

// ─── "Now" divider ────────────────────────────────────────────────────────────

function NowDivider() {
  return (
    <div className="relative flex items-center gap-2 py-1 pl-[52px]">
      <span
        className="shrink-0 text-[10px] font-bold uppercase tracking-wide"
        style={{ color: 'var(--fd-red)' }}
      >
        Now
      </span>
      <div className="h-[2px] flex-1 rounded-full" style={{ backgroundColor: 'var(--fd-red)', opacity: 0.4 }} />
    </div>
  )
}

// ─── Rail group ───────────────────────────────────────────────────────────────

function RailGroup({
  sessions,
  timezone,
  getLabel,
  getVariant,
}: {
  sessions:   FDSession[]
  timezone:   string
  getLabel:   (i: number) => string
  getVariant: (i: number) => 'inprogress' | 'next' | 'remaining' | 'finished'
}) {
  return (
    <>
      {sessions.map((s, i) => (
        <RailRow
          key={s.id}
          session={s}
          timezone={timezone}
          label={getLabel(i)}
          variant={getVariant(i)}
          isLast={i === sessions.length - 1}
        />
      ))}
    </>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function TodayTimeline({
  timeline,
  timezone,
  nextSession = null,
  completedYesterday = 0,
  today,
}: Props) {
  const { inProgress, next, remainingToday, recentlyFinished } = timeline

  const hasActive   = !!(inProgress || next || remainingToday.length > 0)
  const hasFinished = recentlyFinished.length > 0
  const hasAnything = hasActive || hasFinished

  // Build an ordered flat list so we can handle the rail correctly
  const activeItems: { session: FDSession; label: string; variant: 'inprogress' | 'next' | 'remaining' }[] = []
  if (inProgress)       activeItems.push({ session: inProgress, label: 'In progress', variant: 'inprogress' })
  if (next)             activeItems.push({ session: next, label: 'Next up', variant: 'next' })
  for (const s of remainingToday) activeItems.push({ session: s, label: 'Later today', variant: 'remaining' })

  return (
    <section className="space-y-2">
      <p className="px-0.5 text-sm font-bold" style={{ color: 'var(--fd-text)' }}>
        Today
      </p>

      <div
        className="rounded-2xl border overflow-hidden"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        {!hasAnything ? (
          /* ── Rest-day state ──────────────────────────────────────────────── */
          <div className="px-4 py-5">
            {/* Heading */}
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: 'var(--fd-card-hover)' }}
              >
                <Coffee className="h-5 w-5" style={{ color: 'var(--fd-muted)' }} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
                  Rest day — no sessions scheduled
                </p>
                {completedYesterday > 0 && (
                  <p className="mt-0.5 text-xs font-medium" style={{ color: 'var(--fd-green)' }}>
                    ✓ {completedYesterday} completed yesterday — nice work
                  </p>
                )}
              </div>
            </div>

            {/* Next-session preview row — looks like a real timeline row */}
            {nextSession && today && (
              <Link
                href="/dashboard/schedule"
                className="mt-4 flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-opacity hover:opacity-90 active:opacity-70"
                style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card-hover)' }}
              >
                <Avatar name={nextSession.clientName} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
                    {nextSession.clientName}
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--fd-muted)' }}>
                    Next up · {fmtPreviewDate(ymdInTz(nextSession.startAt, timezone), today)} · {hhmInTz(nextSession.startAt, timezone)}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0" style={{ color: 'var(--fd-muted)' }} />
              </Link>
            )}

            {/* CTAs */}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/dashboard/schedule"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-90 active:opacity-70"
                style={{ backgroundColor: 'var(--fd-blue)', color: '#fff' }}
              >
                View schedule →
              </Link>
              <Link
                href="/dashboard/schedule"
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-90 active:opacity-70"
                style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-text)' }}
              >
                <CalendarPlus className="h-3.5 w-3.5" />
                Book a session
              </Link>
            </div>
          </div>
        ) : (
          <div className="px-3 pt-4 pb-3">
            {/* Completed sessions (past) */}
            {hasFinished && (
              recentlyFinished.map((s, i) => (
                <RailRow
                  key={s.id}
                  session={s}
                  timezone={timezone}
                  label="Finished"
                  variant="finished"
                  isLast={i === recentlyFinished.length - 1 && !hasActive}
                />
              ))
            )}

            {/* Now divider between past and upcoming */}
            {hasFinished && hasActive && <NowDivider />}

            {/* Active + upcoming sessions */}
            {activeItems.map((entry, i) => (
              <RailRow
                key={entry.session.id}
                session={entry.session}
                timezone={timezone}
                label={entry.label}
                variant={entry.variant}
                isLast={i === activeItems.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
