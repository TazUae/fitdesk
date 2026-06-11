/**
 * `custom_fitness_goals` in ERPNext is free-text but may contain a JSON object,
 * array, or plain string depending on import source. This normalises all cases
 * to a human-readable string without mutating the stored value.
 */
export function formatGoal(goal: string | undefined | null): string {
  if (!goal) return ''
  const trimmed = goal.trim()
  if (!trimmed) return ''

  try {
    const parsed: unknown = JSON.parse(trimmed)

    if (Array.isArray(parsed)) {
      return parsed
        .map(item => {
          if (typeof item === 'string') return item.trim()
          if (item !== null && typeof item === 'object') {
            const obj = item as Record<string, unknown>
            const label = obj.label ?? obj.name ?? obj.description ?? obj.goal_type ?? obj.type ?? obj.value
            if (typeof label === 'string' && label.trim()) {
              return label.trim().replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
            }
            const first = Object.values(obj).find((v): v is string => typeof v === 'string' && v.trim().length > 0)
            if (first) return first.trim().replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
          }
          return ''
        })
        .filter(Boolean)
        .join(', ')
    }

    if (parsed !== null && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>
      const display = obj.label ?? obj.name ?? obj.description ?? obj.type ?? obj.value
      if (typeof display === 'string' && display.trim()) {
        return display.trim().replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
      }
      const parts = Object.values(obj)
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .map(v => v.trim())
      return parts.join(', ') || trimmed
    }

    if (typeof parsed === 'string') return parsed.trim()

    return trimmed
  } catch {
    return trimmed
  }
}
