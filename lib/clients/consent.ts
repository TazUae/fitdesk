/**
 * Pure WhatsApp consent predicates (US-059).
 *
 * No I/O — safe to import from server actions, repositories, or future
 * reminder-candidate logic (US-050) without pulling in the database.
 *
 * Consent model (approved design):
 *   - 'unknown'   — default. Never treated as permission to send automated
 *                   messages. Blocks automated/reminder eligibility, same as opted_out.
 *   - 'opted_in'  — the only state eligible for automated/reminder-candidate workflows.
 *   - 'opted_out' — blocks all future WhatsApp delivery/reminder eligibility. No override.
 */

import type { WhatsAppConsentState } from '@/types/clients'

/**
 * True only for 'opted_in'. Both 'unknown' and 'opted_out' return false —
 * unknown must never be treated as implicit permission, and opted_out has
 * no override path.
 */
export function canSendAutomatedWhatsApp(state: WhatsAppConsentState): boolean {
  return state === 'opted_in'
}

/** True for 'opted_out' — used to explicitly exclude/hide a client from any reminder/candidate surface. */
export function isOptedOut(state: WhatsAppConsentState): boolean {
  return state === 'opted_out'
}
