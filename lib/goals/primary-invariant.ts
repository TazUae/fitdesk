/**
 * Canonical primary-goal cardinality invariant (Decision D7), shared by the
 * create path (actions/clients.ts) and the update path
 * (ClientRepository.replaceClientGoals) so both enforce identical rules:
 *
 *   - zero goals            → zero primaries is valid (configuration deferred)
 *   - one or more goals     → exactly one primary is required
 *
 * Pure, no I/O. The repository additionally asserts this against the committed
 * rows as defense-in-depth, and the database enforces at-most-one active primary
 * via a partial unique index.
 */

export function countPrimaries(goals: readonly { isPrimary: boolean }[]): number {
  return goals.reduce((n, g) => (g.isPrimary ? n + 1 : n), 0)
}

/**
 * Returns null when the primary invariant holds, otherwise a stable reason code.
 * `'primary_invariant_violated'` covers both "≥1 goal but not exactly one primary"
 * and "0 goals but a primary is set".
 */
export function checkPrimaryInvariant(
  goals: readonly { isPrimary: boolean }[],
): 'primary_invariant_violated' | null {
  const primaries = countPrimaries(goals)
  if (goals.length === 0) return primaries === 0 ? null : 'primary_invariant_violated'
  return primaries === 1 ? null : 'primary_invariant_violated'
}

/** True when the primary invariant holds for the given goal set. */
export function isPrimaryInvariantValid(goals: readonly { isPrimary: boolean }[]): boolean {
  return checkPrimaryInvariant(goals) === null
}
