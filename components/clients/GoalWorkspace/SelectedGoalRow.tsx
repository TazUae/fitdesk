'use client'

import { memo } from 'react'
import { X } from 'lucide-react'
import { GOALS } from '@/lib/goals/taxonomy'
import type { IntakeGoalId } from '@/lib/goals/taxonomy'
import type { GoalUrgency } from '@/types/clients'

interface SelectedGoalRowProps {
  goalId:    IntakeGoalId
  isPrimary: boolean
  urgency:   GoalUrgency
  isActive:  boolean
  onActivate: () => void
  onRemove:   () => void
}

export const SelectedGoalRow = memo(function SelectedGoalRow({
  goalId,
  isPrimary,
  urgency,
  isActive,
  onActivate,
  onRemove,
}: SelectedGoalRowProps) {
  const goal = GOALS.find(g => g.id === goalId)
  if (!goal) return null

  const urgencyColors: Record<GoalUrgency, string> = {
    urgent:       'var(--fd-red)',
    active_focus: 'var(--fd-accent)',
    background:   'var(--fd-muted)',
  }

  return (
    <div
      role="option"
      aria-selected={isActive}
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate() } }}
      className="flex items-center gap-2 rounded-xl border px-3 py-2.5 cursor-pointer transition-all"
      style={{
        borderColor:     isActive ? 'var(--fd-accent)' : 'var(--fd-border)',
        backgroundColor: isActive ? 'rgba(232,197,71,0.06)' : 'var(--fd-card)',
      }}
    >
      {/* Primary indicator dot */}
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: isPrimary ? 'var(--fd-green)' : 'transparent', border: isPrimary ? 'none' : '1px solid var(--fd-border)' }}
        aria-label={isPrimary ? 'Primary goal' : undefined}
      />

      {/* Goal label */}
      <span className="flex-1 min-w-0 text-sm font-medium truncate" style={{ color: 'var(--fd-text)' }}>
        {goal.label}
      </span>

      {/* Urgency dot */}
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: urgencyColors[urgency] }}
        aria-label={urgency.replace('_', ' ')}
      />

      {/* Remove */}
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onRemove() }}
        aria-label={`Remove ${goal.label}`}
        className="shrink-0 rounded-md p-0.5 transition-opacity hover:opacity-70"
        style={{ color: 'var(--fd-muted)' }}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
})
