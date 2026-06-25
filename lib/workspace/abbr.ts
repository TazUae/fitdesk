// Pure company abbreviation helper — no framework dependencies.
// Used by the Start Workspace server action when building the Control Plane payload.

const MAX_ABBR_LENGTH = 8

/**
 * Derives a company abbreviation from a workspace name.
 *
 * Takes the first alphanumeric character of each whitespace-separated word,
 * uppercases the result, and caps it at 8 characters.
 *
 * Examples:
 *   'QA Performance Studio' → 'QPS'
 *   'Alex Johnson PT'       → 'AJP'  ('PT' is one word → one initial)
 *   'Zaidan Fitness'        → 'ZF'
 *   '' / invalid            → 'FD'
 */
export function abbreviateWorkspaceName(value: string): string {
  const abbr = value
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^a-zA-Z0-9]/g, '').charAt(0))
    .filter(Boolean)
    .join('')
    .toUpperCase()
    .slice(0, MAX_ABBR_LENGTH)

  return abbr || 'FD'
}
