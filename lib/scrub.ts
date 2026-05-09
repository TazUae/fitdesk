/**
 * Sensitive-value scrubber.
 *
 * Single regex used by lib/log.ts and lib/errors.ts to strip secret-like
 * substrings before they reach an operator log line or a user-facing
 * error message. Intentionally conservative — false positives are
 * preferred over leaks.
 */

const SECRET_PATTERN =
  /(api[_-]?key|api[_-]?secret|token|password|jwt|webhook|authorization|bearer)/gi

export function scrubSensitive(input: string): string {
  return input.replace(SECRET_PATTERN, 'HIDDEN')
}
