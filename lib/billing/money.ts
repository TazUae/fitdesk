/**
 * Money conversion helpers — minor units (FitDesk) ↔ major units (ERP).
 *
 * FitDesk stores price_amount as integer minor currency units (e.g. USD cents).
 * ERPNext invoice item `rate` expects major decimal units (e.g. USD dollars).
 *
 * Rules:
 *  - Fail closed: unsupported currency throws before any ERP write.
 *  - Currency is normalised to uppercase ISO 4217.
 *  - minorUnits must be a non-negative integer; throws otherwise.
 *  - Zero is a valid input; callers (invoice builder) reject zero-value invoices.
 *  - No external dependencies.
 */

// ─── Currency exponent table ──────────────────────────────────────────────────
// Factor = number of minor units per major unit.
// e.g. USD: 100 (100 cents = 1 dollar), LBP: 1 (no subunit).

const CURRENCY_MINOR_UNIT_FACTORS: Record<string, number> = {
  USD: 100,
  EUR: 100,
  GBP: 100,
  SAR: 100,
  AED: 100,
  LBP: 1,
  JOD: 1000,
  KWD: 1000,
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the number of minor units per major unit for the given ISO 4217
 * currency code. Throws for unsupported currencies — fail closed by design.
 */
export function getCurrencyMinorUnitFactor(currency: string): number {
  if (!currency || currency.trim() === '') {
    throw new Error('[money] currency must not be blank')
  }
  const upper = currency.toUpperCase()
  const factor = CURRENCY_MINOR_UNIT_FACTORS[upper]
  if (factor === undefined) {
    throw new Error(
      `[money] unsupported currency: "${upper}". ` +
      'Add it to CURRENCY_MINOR_UNIT_FACTORS in lib/billing/money.ts before use.',
    )
  }
  return factor
}

/**
 * Converts an integer minor-unit amount to a major-unit decimal suitable for
 * ERPNext invoice `rate` fields.
 *
 * Examples:
 *   toMajorUnits(50000, 'USD') → 500       (50000 cents = $500.00)
 *   toMajorUnits(150000, 'LBP') → 150000   (LBP has no subunit)
 *   toMajorUnits(3000, 'JOD') → 3          (3000 fils = JOD 3.000)
 */
export function toMajorUnits(minorUnits: number, currency: string): number {
  if (!Number.isInteger(minorUnits)) {
    throw new Error(
      `[money] minorUnits must be an integer, got: ${minorUnits}`,
    )
  }
  if (minorUnits < 0) {
    throw new Error(
      `[money] minorUnits must be non-negative, got: ${minorUnits}`,
    )
  }
  const factor = getCurrencyMinorUnitFactor(currency)
  if (factor === 1) return minorUnits
  // Round to the number of decimal places implied by the factor to avoid
  // floating-point artifacts (e.g. 10001 / 100 = 100.01000000000001).
  const decimals = Math.log10(factor)
  return parseFloat((minorUnits / factor).toFixed(decimals))
}
