import type { ConflictResult } from '@/lib/goals/conflicts'
import type { SafetyFlag } from '@/lib/goals/safety'

interface GoalSystemAlertsProps {
  conflicts: ConflictResult[]
  safetyFlags: SafetyFlag[]
}

export function GoalSystemAlerts({ conflicts, safetyFlags }: GoalSystemAlertsProps) {
  if (conflicts.length === 0 && safetyFlags.length === 0) return null

  return (
    <div className="space-y-2" role="status" aria-label="Goal warnings">
      {conflicts.map((conflict, i) => (
        <div
          key={i}
          className="rounded-xl border p-3"
          role="alert"
          style={
            conflict.type === 'hard'
              ? { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.3)' }
              : { backgroundColor: 'rgba(251,191,36,0.08)', borderColor: 'rgba(251,191,36,0.3)' }
          }
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

      {safetyFlags.map(flag => (
        <div
          key={flag.id}
          className="rounded-xl border p-3"
          role="note"
          style={{ backgroundColor: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.3)' }}
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
  )
}
