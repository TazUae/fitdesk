// MENA timezone → locale mapping.
// countryCode is the ISO 3166-1 alpha-2 code sent to the Control Plane.
// countryName is the human-readable label shown in the UI.
// currency is display-only — not transmitted or persisted.

export type LocaleInfo = {
  timezone: string
  countryName: string
  countryCode: string
  currency: string
}

type LocaleEntry = {
  countryName: string
  countryCode: string
  currency: string
}

const MENA_TZ_MAP: Record<string, LocaleEntry> = {
  'Asia/Dubai':  { countryName: 'United Arab Emirates', countryCode: 'AE', currency: 'AED' },
  'Asia/Riyadh': { countryName: 'Saudi Arabia',          countryCode: 'SA', currency: 'SAR' },
  'Asia/Beirut': { countryName: 'Lebanon',               countryCode: 'LB', currency: 'USD' },
  'Asia/Kuwait': { countryName: 'Kuwait',                countryCode: 'KW', currency: 'KWD' },
  'Asia/Qatar':  { countryName: 'Qatar',                 countryCode: 'QA', currency: 'QAR' },
}

export const DEFAULT_LOCALE: LocaleEntry = {
  countryName: 'United Arab Emirates',
  countryCode: 'AE',
  currency: 'AED',
}

export function detectLocale(): LocaleInfo {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const entry = MENA_TZ_MAP[timezone] ?? DEFAULT_LOCALE
  return { timezone, ...entry }
}
