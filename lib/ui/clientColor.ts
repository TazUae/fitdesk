/**
 * Deterministic client → pastel palette mapping.
 *
 * Pure, no React, no I/O. Used by SessionCard and avatars to keep a stable
 * color per client across renders without storing it on the FD Session row.
 *
 * The pastel palette intentionally excludes 'gray' for non-completed sessions
 * — gray is reserved by SessionCard for `completed` / `cancelled` overrides.
 */

import { scheduleTokens, type PastelKey } from '@/lib/ui/scheduleDesignTokens'

/** Pastel keys eligible for "live" sessions. Gray is reserved for terminal statuses. */
const LIVE_PASTELS: ReadonlyArray<PastelKey> = ['blue', 'green', 'yellow', 'purple', 'pink', 'teal']

/**
 * Simple, deterministic 32-bit hash (djb2-xor variant). Stable across runs.
 * Not cryptographic. Used only to pick a palette index.
 */
function djb2(seed: string): number {
  let h = 5381
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h) ^ seed.charCodeAt(i)
  }
  // Force unsigned 32-bit
  return h >>> 0
}

/**
 * Map a client identifier (Customer docname or display name) to one of the
 * 6 live pastel keys. Stable across renders for the same input.
 */
export function clientPastelKey(seed: string): PastelKey {
  if (!seed) return 'blue'
  return LIVE_PASTELS[djb2(seed) % LIVE_PASTELS.length]
}

/**
 * Resolve a client seed to its pastel `{ fill, text }` pair from the design
 * tokens.
 */
export function clientPastel(seed: string): { fill: string; text: string } {
  return scheduleTokens.pastels[clientPastelKey(seed)]
}
