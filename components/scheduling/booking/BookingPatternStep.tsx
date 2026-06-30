'use client'

import { PerDayTimeEditor } from '@/components/scheduling/booking/PerDayTimeEditor'
import type { BookingPlan, PatternSlot, RepeatMode } from '@/types/scheduling'

const REPEAT_WEEKS = [1, 2, 3, 4, 8] as const
const SESSIONS_PER_WEEK = [1, 2, 3, 4, 5] as const

interface BookingPatternStepProps {
  repeatMode:      RepeatMode
  recurrenceWeeks: number
  patternSlots:    PatternSlot[]
  sessionsPerWeek: 1 | 2 | 3 | 4 | 5 | null
  durationMinutes: number
  plan:            BookingPlan | null     // for the human summary + "will create" line
  onChange: (next: {
    repeatMode?:      RepeatMode
    recurrenceWeeks?: number
    patternSlots?:    PatternSlot[]
    sessionsPerWeek?: 1 | 2 | 3 | 4 | 5 | null
  }) => void
}

function summaryLine(plan: BookingPlan | null): string {
  if (!plan || plan.occurrences.length === 0) return 'No sessions yet — pick a time.'
  const total = plan.occurrences.length
  const first = plan.occurrences[0]
  const last  = plan.occurrences[plan.occurrences.length - 1]
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (total === 1) return `1 session · ${fmt(first.startAt)}`
  return `${total} sessions · ${fmt(first.startAt)} – ${fmt(last.startAt)}`
}

/**
 * Step 3 — Configure Recurrence.
 *
 * Combines:
 *   - One-time / Weekly toggle
 *   - Sessions-per-week chip (1–5) for single-anchor flows
 *   - REPEAT FOR (week count) chips
 *   - Per-day time editor — the weekday/time pattern is fully editable
 *     without leaving the sheet
 *   - "This will create N sessions" footer
 */
export function BookingPatternStep({
  repeatMode,
  recurrenceWeeks,
  patternSlots,
  sessionsPerWeek,
  durationMinutes,
  plan,
  onChange,
}: BookingPatternStepProps) {
  const isWeekly = repeatMode === 'weekly'

  return (
    <section className="space-y-4">
      <header>
        <h3 className="text-base font-semibold" style={{ color: 'var(--fd-text)' }}>
          Repeat?
        </h3>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--fd-muted)' }}>
          One-time, or set a weekly pattern.
        </p>
      </header>

      {/* One-time vs Weekly */}
      <div className="flex gap-2">
        <ChipToggle
          active={!isWeekly}
          onClick={() => onChange({ repeatMode: 'one_off' })}
        >
          One-time
        </ChipToggle>
        <ChipToggle
          active={isWeekly}
          onClick={() => onChange({ repeatMode: 'weekly' })}
        >
          Weekly
        </ChipToggle>
      </div>

      {isWeekly && (
        <>
          {/* Sessions per week — only shown when we have ≤ 1 slot in the pattern
              (a single-anchor flow); multi-tap selections derive the count
              automatically and edit per-day directly. */}
          {patternSlots.length <= 1 && (
            <div>
              <p className="mb-2 text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                Sessions per week
              </p>
              <div className="flex flex-wrap gap-2">
                {SESSIONS_PER_WEEK.map(n => (
                  <ChipToggle
                    key={n}
                    active={sessionsPerWeek === n}
                    onClick={() => onChange({ sessionsPerWeek: n })}
                  >
                    {n}
                  </ChipToggle>
                ))}
              </div>
            </div>
          )}

          {/* Repeat for N weeks */}
          <div>
            <p className="mb-2 text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
              Repeat for
            </p>
            <div className="flex flex-wrap gap-2">
              {REPEAT_WEEKS.map(w => (
                <ChipToggle
                  key={w}
                  active={recurrenceWeeks === w}
                  onClick={() => onChange({ recurrenceWeeks: w })}
                >
                  {w === 1 ? '1 Week' : `${w} Weeks`}
                </ChipToggle>
              ))}
            </div>
          </div>

          {/* Per-day editor */}
          {patternSlots.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                  Selected schedule
                </p>
              </div>
              <PerDayTimeEditor
                patternSlots={patternSlots}
                durationMinutes={durationMinutes}
                onChange={next => onChange({ patternSlots: next })}
              />
            </div>
          )}
        </>
      )}

      <div
        className="rounded-lg border p-3 text-sm"
        style={{
          borderColor: 'var(--fd-border)',
          backgroundColor: 'var(--fd-bg)',
          color: 'var(--fd-text)',
        }}
      >
        {summaryLine(plan)}
      </div>
    </section>
  )
}

// ─── Local helpers ────────────────────────────────────────────────────────────

function ChipToggle({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 items-center justify-center rounded-full border px-4 text-sm font-medium transition-colors"
      style={{
        backgroundColor: active ? 'var(--fd-blue-subtle)' : 'var(--fd-surface)',
        borderColor:     active ? 'var(--fd-blue)' : 'var(--fd-border)',
        color:           active ? 'var(--fd-blue)' : 'var(--fd-text)',
      }}
      aria-pressed={active}
    >
      {children}
    </button>
  )
}
