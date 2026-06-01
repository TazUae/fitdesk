/**
 * Formats a client's fitnessGoals string for display.
 *
 * The `custom_fitness_goals` ERPNext field is free-text. In practice it may hold:
 *   - A plain string  ("Lose weight")
 *   - A JSON object   {"type":"weight_loss","label":"Lose weight"}
 *   - A JSON array    ["weight_loss","strength"]
 *   - Malformed content from third-party imports
 *
 * This helper normalises all cases to a human-readable string.
 * It never mutates the stored value — display only.
 */
export function formatGoal(goal: string | undefined | null): string {
  if (!goal) return ''
  const trimmed = goal.trim()
  if (!trimmed) return ''

  try {
    const parsed: unknown = JSON.parse(trimmed)

    if (Array.isArray(parsed)) {
      return parsed
        .map(item => (typeof item === 'string' ? item.trim() : String(item)))
        .filter(Boolean)
        .join(', ')
    }

    if (parsed !== null && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>
      // Common keys from structured goal objects
      const display = obj.label ?? obj.name ?? obj.description ?? obj.type ?? obj.value
      if (typeof display === 'string' && display.trim()) return display.trim()
      // Fall back: join all string values
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
