'use client'

import { useState } from 'react'
import { X, ChevronDown, ChevronUp, Star } from 'lucide-react'
import { GOALS, GOAL_SECTIONS, getSubGoals, type IntakeGoalId, type GoalSection } from '@/lib/goals/taxonomy'
import { detectConflicts, hasUnresolvedHardConflict } from '@/lib/goals/conflicts'
import { computeSafetyFlags } from '@/lib/goals/safety'
import {
  addGoal,
  removeGoal,
  setPrimaryGoal,
  togglePrimarySubGoal,
  toggleTrainerSubGoal,
  setGoalUrgency,
  type GoalAccordionProps,
} from './types'

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTION_LABELS: Record<GoalSection, string> = {
  core:       'Core',
  specialist: 'Specialist',
  emerging:   'Emerging',
}

const URGENCY_OPTIONS = [
  { value: 'urgent'       as const, label: 'Urgent'       },
  { value: 'active_focus' as const, label: 'Active Focus' },
  { value: 'background'   as const, label: 'Background'   },
]

// ─── Styles ───────────────────────────────────────────────────────────────────

const activeChip = {
  backgroundColor: 'rgba(78,203,160,0.12)',
  borderColor:     'var(--fd-green)',
  color:           'var(--fd-green)',
} as const

const inactiveChip = {
  backgroundColor: 'var(--fd-surface)',
  borderColor:     'var(--fd-border)',
  color:           'var(--fd-muted)',
} as const

// ─── Component ────────────────────────────────────────────────────────────────

export function GoalAccordion({ value, onChange }: GoalAccordionProps) {
  const [expandedTrainer, setExpandedTrainer] = useState<Set<IntakeGoalId>>(new Set())

  const selectedIds    = new Set(value.selected.map(s => s.goalId))
  const allSelectedIds = [...selectedIds]
  const conflicts      = detectConflicts(allSelectedIds)
  const hardBlocked    = hasUnresolvedHardConflict(allSelectedIds)
  const safetyFlags    = computeSafetyFlags(allSelectedIds)

  function toggleTrainerSection(goalId: IntakeGoalId) {
    setExpandedTrainer(prev => {
      const next = new Set(prev)
      if (next.has(goalId)) next.delete(goalId)
      else next.add(goalId)
      return next
    })
  }

  return (
    <div className="space-y-5">
      <label className="block text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
        Goals
        <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--fd-muted)' }}>
          (select all that apply)
        </span>
      </label>

      {/* ── Goal chip grid — grouped by section ── */}
      <div className="space-y-4">
        {GOAL_SECTIONS.map(section => {
          const sectionGoals = GOALS.filter(g => g.section === section)
          return (
            <section key={section} aria-label={`${SECTION_LABELS[section]} goals`}>
              <p
                className="mb-2 text-xs font-semibold uppercase tracking-wide"
                style={{ color: 'var(--fd-muted)' }}
              >
                {SECTION_LABELS[section]}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {sectionGoals.map(goal => {
                  const selected = selectedIds.has(goal.id)
                  return (
                    <button
                      key={goal.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        onChange(selected ? removeGoal(value, goal.id) : addGoal(value, goal.id))
                      }
                      className="flex min-h-[44px] items-start rounded-xl border px-3 py-3 text-left text-xs font-medium transition-all active:scale-[0.97]"
                      style={selected ? activeChip : inactiveChip}
                    >
                      <span className="leading-snug">{goal.label}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      {/* ── Selected goal cards ── */}
      {value.selected.length > 0 && (
        <div className="space-y-3" aria-label="Selected goals">
          <p
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: 'var(--fd-muted)' }}
          >
            Selected goals
          </p>

          {value.selected.map(config => {
            const goal = GOALS.find(g => g.id === config.goalId)
            if (!goal) return null

            const isPrimary         = value.primaryGoalId === config.goalId
            const primarySubGoals   = getSubGoals(goal.id, 'primary')
            const trainerSubGoals   = getSubGoals(goal.id, 'secondary')
            const trainerExpanded   = expandedTrainer.has(goal.id)

            return (
              <div
                key={goal.id}
                className="rounded-2xl border"
                style={{
                  borderColor:     isPrimary ? 'var(--fd-green)' : 'var(--fd-border)',
                  backgroundColor: 'var(--fd-card)',
                }}
                aria-label={`${goal.label} goal card`}
              >
                {/* Card header */}
                <div className="flex items-start justify-between gap-2 p-3.5 pb-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
                      {goal.label}
                    </span>
                    <span
                      className="inline-block w-fit rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: 'var(--fd-surface)', color: 'var(--fd-muted)' }}
                    >
                      {SECTION_LABELS[goal.section]}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onChange(removeGoal(value, goal.id))}
                    aria-label={`Remove ${goal.label}`}
                    className="shrink-0 rounded-lg p-1 transition-colors"
                    style={{ color: 'var(--fd-muted)' }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-3 px-3.5 pb-3.5">

                  {/* Client-stated focus pills (primary layer only) */}
                  {primarySubGoals.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold" style={{ color: 'var(--fd-muted)' }}>
                        Client focus
                      </p>
                      <div
                        className="flex flex-wrap gap-1.5"
                        aria-label={`${goal.label} client focus`}
                      >
                        {primarySubGoals.map(sg => {
                          const active = config.primarySubGoalIds.includes(sg.id)
                          return (
                            <button
                              key={sg.id}
                              type="button"
                              aria-pressed={active}
                              onClick={() => onChange(togglePrimarySubGoal(value, goal.id, sg.id))}
                              className="rounded-full border px-2.5 py-1 text-xs font-medium transition-all active:scale-[0.96]"
                              style={active ? activeChip : inactiveChip}
                            >
                              {sg.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Trainer assessment (secondary layer, collapsed by default) */}
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleTrainerSection(goal.id)}
                      aria-expanded={trainerExpanded}
                      aria-controls={`trainer-section-${goal.id}`}
                      className="flex w-full items-center justify-between py-0.5 text-xs font-semibold"
                      style={{ color: 'var(--fd-muted)' }}
                    >
                      <span>Trainer assessment</span>
                      {trainerExpanded
                        ? <ChevronUp className="h-3.5 w-3.5" />
                        : <ChevronDown className="h-3.5 w-3.5" />
                      }
                    </button>
                    <div id={`trainer-section-${goal.id}`}>
                      {trainerExpanded && trainerSubGoals.length > 0 && (
                        <div
                          className="mt-2 flex flex-wrap gap-1.5"
                          aria-label={`${goal.label} trainer assessment`}
                        >
                          {trainerSubGoals.map(sg => {
                            const active = config.trainerSubGoalIds.includes(sg.id)
                            return (
                              <button
                                key={sg.id}
                                type="button"
                                aria-pressed={active}
                                onClick={() => onChange(toggleTrainerSubGoal(value, goal.id, sg.id))}
                                className="rounded-full border px-2.5 py-1 text-xs font-medium transition-all active:scale-[0.96]"
                                style={active ? activeChip : inactiveChip}
                              >
                                {sg.label}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Primary program driver toggle (exactly one across all cards) */}
                  <button
                    type="button"
                    onClick={() => onChange(setPrimaryGoal(value, goal.id))}
                    aria-pressed={isPrimary}
                    className="flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all"
                    style={isPrimary ? activeChip : inactiveChip}
                  >
                    <Star className={`h-3.5 w-3.5 shrink-0${isPrimary ? ' fill-current' : ''}`} />
                    <span>{isPrimary ? 'Primary program driver' : 'Set as primary driver'}</span>
                  </button>

                  {/* Urgency segmented control */}
                  <div role="group" aria-label={`${goal.label} urgency`}>
                    <p className="mb-1.5 text-xs font-semibold" style={{ color: 'var(--fd-muted)' }}>
                      Urgency
                    </p>
                    <div className="flex gap-1.5">
                      {URGENCY_OPTIONS.map(opt => {
                        const active = config.urgency === opt.value
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            aria-pressed={active}
                            onClick={() => onChange(setGoalUrgency(value, goal.id, opt.value))}
                            className="flex-1 rounded-lg border py-1.5 text-center text-xs font-medium transition-all"
                            style={active ? activeChip : inactiveChip}
                          >
                            {opt.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Conflict messages ── */}
      {conflicts.length > 0 && (
        <div className="space-y-2" role="alert" aria-label="Goal conflicts">
          {conflicts.map((conflict, i) => (
            <div
              key={i}
              className="rounded-xl border p-3"
              style={conflict.type === 'hard' ? {
                backgroundColor: 'rgba(239,68,68,0.08)',
                borderColor:     'rgba(239,68,68,0.3)',
              } : {
                backgroundColor: 'rgba(251,191,36,0.08)',
                borderColor:     'rgba(251,191,36,0.3)',
              }}
              aria-label={`${conflict.type === 'hard' ? 'Blocked' : 'Soft'} conflict`}
            >
              <p
                className="mb-0.5 text-xs font-semibold"
                style={{ color: conflict.type === 'hard' ? 'rgb(239,68,68)' : 'rgb(217,158,0)' }}
              >
                {conflict.type === 'hard' ? 'Blocked combination' : 'Heads up'}
              </p>
              <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
                {conflict.message}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Safety advisories ── */}
      {safetyFlags.length > 0 && (
        <div className="space-y-2">
          {safetyFlags.map(flag => (
            <div
              key={flag.id}
              className="rounded-xl border p-3"
              style={{
                backgroundColor: 'rgba(59,130,246,0.08)',
                borderColor:     'rgba(59,130,246,0.3)',
              }}
              role="note"
              aria-label={`Safety advisory: ${flag.id}`}
            >
              <p className="mb-0.5 text-xs font-semibold" style={{ color: 'rgb(59,130,246)' }}>
                Safety advisory
              </p>
              <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
                {flag.meaning}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Screen-reader announcement for hard conflict blocking state */}
      {hardBlocked && (
        <p className="sr-only" role="alert" aria-live="assertive">
          These goals cannot be combined. Please remove one before continuing.
        </p>
      )}
    </div>
  )
}
