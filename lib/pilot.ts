/**
 * Pilot mode helpers (Phase 5.0.6).
 *
 * Centralizes the PILOT_MODE flag and the WhatsApp allowlist matcher.
 * Server-side only.
 */

import 'server-only'

export function isPilotMode(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.PILOT_MODE
  return v === 'true' || v === '1'
}

export function isExternalPaymentsAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.PILOT_ALLOW_EXTERNAL_PAYMENTS
  return v === 'true' || v === '1'
}

export interface AllowlistMatchResult {
  allowed: boolean
  /** When false, why — user-safe string. */
  reason?: string
}

/**
 * Pure allowlist matcher. Caller passes:
 *   - destination: E.164 digits-only (e.g. "971501234567"). The phone
 *     normalizer in lib/evolution.ts is the recommended source.
 *   - exact: comma-separated single match (typically just one number)
 *     from FITDESK_ALLOWED_TEST_PHONE
 *   - prefixes: comma-separated prefix list from
 *     FITDESK_ALLOWED_TEST_PHONE_PREFIXES
 *
 * Allowed if EITHER an exact match OR any prefix match. If neither
 * env var is configured, returns allowed=false with the
 * "no allowlist configured" reason (fail-closed for pilot safety).
 */
export function matchAllowlist(
  destination: string,
  exact: string | undefined,
  prefixes: string | undefined,
): AllowlistMatchResult {
  if (!destination) {
    return { allowed: false, reason: 'Destination phone is missing or invalid.' }
  }

  const exactList    = parseList(exact)
  const prefixList   = parseList(prefixes)
  const totalConfigured = exactList.length + prefixList.length

  if (totalConfigured === 0) {
    return { allowed: false, reason: 'Pilot mode: no allowlisted test phone configured.' }
  }

  if (exactList.includes(destination)) {
    return { allowed: true }
  }
  if (prefixList.some(p => destination.startsWith(p))) {
    return { allowed: true }
  }

  return { allowed: false, reason: 'Pilot mode: target phone is not on the test allowlist.' }
}

function parseList(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map(s => s.trim().replace(/^\+/, ''))   // tolerate "+961" written by mistake
    .filter(s => s.length > 0)
}
