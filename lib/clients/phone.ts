/**
 * Server-side phone normalization helper.
 * Normalizes user-supplied phone strings to E.164 format.
 * Uses libphonenumber-js — no new dependency.
 *
 * Default region 'LB' (Lebanon) covers most current FitDesk trainers.
 * Numbers with a full country prefix (e.g. +971, +961) parse correctly
 * regardless of the default region.
 */

import { isValidPhoneNumber, parsePhoneNumber } from 'libphonenumber-js'

export type PhoneNormalizeResult =
  | { ok: true;  e164: string }
  | { ok: false; reason: string }

/**
 * Attempt to normalize `raw` to an E.164 string.
 *
 * @param raw           User-supplied phone string (may include spaces, dashes, etc.)
 * @param defaultRegion ISO 3166-1 alpha-2 region code used when the number has
 *                      no country prefix. Defaults to 'LB' (Lebanon).
 */
export function normalizePhoneToE164(
  raw: string,
  defaultRegion = 'LB',
): PhoneNormalizeResult {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { ok: false, reason: 'Phone number is empty' }
  }

  try {
    if (!isValidPhoneNumber(trimmed, defaultRegion as Parameters<typeof isValidPhoneNumber>[1])) {
      return { ok: false, reason: 'Not a valid phone number' }
    }
    const parsed = parsePhoneNumber(trimmed, defaultRegion as Parameters<typeof parsePhoneNumber>[1])
    return { ok: true, e164: parsed.format('E.164') }
  } catch {
    return { ok: false, reason: 'Could not parse phone number' }
  }
}
