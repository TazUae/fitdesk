'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  AsYouType,
  getCountryCallingCode,
  parsePhoneNumber,
} from 'libphonenumber-js'
import type { CountryCode } from 'libphonenumber-js'
import { Check, ChevronDown, MessageCircle, Search } from 'lucide-react'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface PhoneValue {
  phone_country:      string   // ISO-2, e.g. "LB"
  phone_country_code: string   // with "+", e.g. "+961"
  phone_number:       string   // national digits only, e.g. "71234567"
  phone_full:         string   // E.164, e.g. "+96171234567"
  has_whatsapp:       boolean
}

interface PhoneInputProps {
  defaultCountry?: string           // ISO-2, falls back to "LB"
  value?:          PhoneValue
  onChange:        (value: PhoneValue) => void
  label?:          string
  hint?:           string
  required?:       boolean
  disabled?:       boolean
  showWhatsApp?:   boolean          // defaults to true; pass false to hide the toggle
}

// ─── Country catalogue ────────────────────────────────────────────────────────

const SUPPORTED_COUNTRIES: CountryCode[] = [
  'LB', 'AE', 'SA', 'KW', 'QA', 'BH', 'OM', 'JO', 'EG', 'IQ',
  'SY', 'YE', 'TR', 'IL', 'GB', 'US', 'CA', 'AU', 'DE', 'FR',
  'ES', 'IT', 'NL', 'CH', 'SE', 'NO', 'DK', 'PL', 'IN', 'PK',
  'SG', 'MY', 'ID', 'PH', 'TH', 'VN', 'JP', 'KR', 'CN', 'NG',
  'ZA', 'GH', 'KE', 'BR', 'MX', 'AR', 'CO', 'NZ', 'RU', 'UA',
]

const COUNTRY_NAMES: Record<string, string> = {
  LB: 'Lebanon',             AE: 'United Arab Emirates', SA: 'Saudi Arabia',
  KW: 'Kuwait',              QA: 'Qatar',                 BH: 'Bahrain',
  OM: 'Oman',                JO: 'Jordan',                EG: 'Egypt',
  IQ: 'Iraq',                SY: 'Syria',                 YE: 'Yemen',
  TR: 'Turkey',              IL: 'Israel',                GB: 'United Kingdom',
  US: 'United States',       CA: 'Canada',                AU: 'Australia',
  DE: 'Germany',             FR: 'France',                ES: 'Spain',
  IT: 'Italy',               NL: 'Netherlands',           CH: 'Switzerland',
  SE: 'Sweden',              NO: 'Norway',                DK: 'Denmark',
  PL: 'Poland',              IN: 'India',                 PK: 'Pakistan',
  SG: 'Singapore',           MY: 'Malaysia',              ID: 'Indonesia',
  PH: 'Philippines',         TH: 'Thailand',              VN: 'Vietnam',
  JP: 'Japan',               KR: 'South Korea',           CN: 'China',
  NG: 'Nigeria',             ZA: 'South Africa',          GH: 'Ghana',
  KE: 'Kenya',               BR: 'Brazil',                MX: 'Mexico',
  AR: 'Argentina',           CO: 'Colombia',              NZ: 'New Zealand',
  RU: 'Russia',              UA: 'Ukraine',
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/** ISO-2 country code → flag emoji (via regional indicator symbol letters). */
function countryToFlag(code: string): string {
  return code
    .toUpperCase()
    .replace(/./g, ch => String.fromCodePoint(0x1f1e6 - 65 + ch.charCodeAt(0)))
}

/** Returns "+NNN" for a CountryCode, empty string on failure. */
function callingCode(country: CountryCode): string {
  try {
    return '+' + getCountryCallingCode(country)
  } catch {
    return ''
  }
}

/** Build the normalized PhoneValue output. */
function buildPhoneValue(
  country: CountryCode,
  nationalDigits: string,
  hasWhatsApp: boolean,
): PhoneValue {
  const cc = callingCode(country)
  return {
    phone_country:      country,
    phone_country_code: cc,
    phone_number:       nationalDigits,
    phone_full:         nationalDigits ? `${cc}${nationalDigits}` : '',
    has_whatsapp:       hasWhatsApp,
  }
}

/**
 * Try to parse a complete international number.
 * Attempts with "+" prefix first, then with it already present.
 * Returns null if parsing fails or the result country isn't in our list.
 */
function tryParseInternational(
  input: string,
): { country: CountryCode; nationalDigits: string } | null {
  const clean = input.replace(/[\s\-().]/g, '')
  const candidates = clean.startsWith('+') ? [clean] : ['+' + clean, clean]

  for (const candidate of candidates) {
    try {
      const parsed = parsePhoneNumber(candidate)
      if (parsed?.country && parsed.nationalNumber) {
        return {
          country:        parsed.country as CountryCode,
          nationalDigits: String(parsed.nationalNumber),
        }
      }
    } catch {
      /* ignore — try next */
    }
  }
  return null
}

/** Format national digits using AsYouType for the selected country. */
function formatNational(country: CountryCode, digits: string): string {
  const stripped = digits.replace(/\D/g, '').replace(/^0+/, '') // strip leading zeros
  if (!stripped) return ''
  return new AsYouType(country).input(stripped)
}

/** Extract raw digits from a (possibly formatted) national string. */
function nationalDigits(formatted: string): string {
  return formatted.replace(/\D/g, '')
}

// ─── Country selector dropdown ────────────────────────────────────────────────

interface CountryDropdownProps {
  selected:  CountryCode
  onSelect:  (code: CountryCode) => void
  disabled?: boolean
}

function CountryDropdown({ selected, onSelect, disabled }: CountryDropdownProps) {
  const [open,   setOpen]   = useState(false)
  const [query,  setQuery]  = useState('')
  const wrapRef   = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef   = useRef<HTMLDivElement>(null)

  // Filter countries by name, calling code, or ISO code
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return SUPPORTED_COUNTRIES
    return SUPPORTED_COUNTRIES.filter(code => {
      const name = COUNTRY_NAMES[code]?.toLowerCase() ?? ''
      const cc   = String(getCountryCallingCode(code))
      return (
        name.includes(q) ||
        cc.includes(q.replace('+', '')) ||
        code.toLowerCase().startsWith(q)
      )
    })
  }, [query])

  // Scroll selected item into view when dropdown opens
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector('[data-selected="true"]')
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setQuery('') }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  // Focus search on open
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 40)
  }, [open])

  const selectedCC = callingCode(selected)

  return (
    <div ref={wrapRef} className="relative shrink-0">
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(v => !v)}
        className="flex h-full items-center gap-1 px-3 py-3 text-sm transition-opacity active:opacity-70"
        style={{
          borderRight:    '1px solid var(--fd-border)',
          backgroundColor: open ? 'rgba(255,255,255,0.04)' : 'transparent',
          color:           'var(--fd-text)',
          minWidth:        '5.5rem',
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select country code"
      >
        <span className="text-base leading-none">{countryToFlag(selected)}</span>
        <span className="tabular-nums" style={{ color: 'var(--fd-muted)', fontSize: '0.8rem' }}>
          {selectedCC}
        </span>
        <ChevronDown
          className="h-3 w-3 shrink-0 transition-transform duration-200"
          style={{
            color:     'var(--fd-muted)',
            transform: open ? 'rotate(180deg)' : 'none',
          }}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-72 rounded-xl border shadow-2xl overflow-hidden"
          style={{
            backgroundColor: 'var(--fd-surface)',
            borderColor:     'var(--fd-border)',
          }}
          role="listbox"
        >
          {/* Search bar */}
          <div
            className="flex items-center gap-2 px-3 py-2.5 border-b"
            style={{ borderColor: 'var(--fd-border)' }}
          >
            <Search className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--fd-muted)' }} />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search country or code…"
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: 'var(--fd-text)' }}
              aria-label="Search countries"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-xs leading-none transition-opacity hover:opacity-70"
                style={{ color: 'var(--fd-muted)' }}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Country list */}
          <div ref={listRef} className="max-h-60 overflow-y-auto overscroll-contain">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm" style={{ color: 'var(--fd-muted)' }}>
                No countries found
              </p>
            ) : (
              filtered.map(code => {
                const isSelected = code === selected
                return (
                  <button
                    key={code}
                    type="button"
                    data-selected={isSelected}
                    onClick={() => { onSelect(code); setOpen(false); setQuery('') }}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm transition-colors"
                    style={{
                      backgroundColor: isSelected ? 'rgba(232,197,71,0.07)' : 'transparent',
                      color: 'var(--fd-text)',
                    }}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <span className="w-6 shrink-0 text-base leading-none">{countryToFlag(code)}</span>
                    <span className="flex-1 truncate text-left">{COUNTRY_NAMES[code]}</span>
                    <span
                      className="shrink-0 tabular-nums text-xs"
                      style={{ color: 'var(--fd-muted)' }}
                    >
                      +{getCountryCallingCode(code)}
                    </span>
                    {isSelected && (
                      <Check className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--fd-accent)' }} />
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── WhatsApp toggle (pill switch) ───────────────────────────────────────────

interface WhatsAppToggleProps {
  checked:   boolean
  onChange:  (checked: boolean) => void
  disabled?: boolean
}

function WhatsAppToggle({ checked, onChange, disabled }: WhatsAppToggleProps) {
  return (
    <label
      className="flex cursor-pointer select-none items-center gap-2.5"
      style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      {/* Track */}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className="relative h-5 w-9 rounded-full transition-colors duration-200 outline-none focus-visible:ring-2"
        style={{
          backgroundColor: checked ? 'var(--fd-green)' : 'var(--fd-border)',
        }}
      >
        {/* Thumb */}
        <span
          className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200"
          style={{
            transform: checked ? 'translateX(1.125rem)' : 'translateX(0.125rem)',
          }}
        />
      </button>

      <MessageCircle
        className="h-3.5 w-3.5 shrink-0 transition-colors"
        style={{ color: checked ? 'var(--fd-green)' : 'var(--fd-muted)' }}
      />
      <span
        className="text-xs transition-colors"
        style={{ color: checked ? 'var(--fd-text)' : 'var(--fd-muted)' }}
      >
        Available on WhatsApp
      </span>
    </label>
  )
}

// ─── PhoneInput ───────────────────────────────────────────────────────────────

export function PhoneInput({
  defaultCountry = 'LB',
  value,
  onChange,
  label,
  hint = 'Used for WhatsApp communication',
  required,
  disabled,
  showWhatsApp = true,
}: PhoneInputProps) {
  // Resolve initial country — must be in our list
  const resolvedDefault = useMemo((): CountryCode => {
    const up = defaultCountry.toUpperCase() as CountryCode
    return COUNTRY_NAMES[up] ? up : 'LB'
  }, [defaultCountry])

  const [country,      setCountry]      = useState<CountryCode>(resolvedDefault)
  const [displayValue, setDisplayValue] = useState('')        // formatted string shown in input
  const [hasWhatsApp,  setHasWhatsApp]  = useState(true)

  // Debounce timer ref — avoids flooding parent on every keystroke
  const debounceRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Prevent controlled-value useEffect from overwriting in-flight edits
  const suppressSync    = useRef(false)

  // ── Debounced emit ─────────────────────────────────────────────────────────
  const emit = useCallback(
    (c: CountryCode, digits: string, wa: boolean) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        suppressSync.current = true
        onChange(buildPhoneValue(c, digits, wa))
        // Allow sync after next render cycle
        requestAnimationFrame(() => { suppressSync.current = false })
      }, 150)
    },
    [onChange],
  )

  // ── Sync from controlled `value` prop ─────────────────────────────────────
  useEffect(() => {
    if (!value || suppressSync.current) return
    const c = (value.phone_country?.toUpperCase() as CountryCode) ?? resolvedDefault
    if (COUNTRY_NAMES[c]) setCountry(c)
    setDisplayValue(formatNational(c, value.phone_number ?? ''))
    setHasWhatsApp(value.has_whatsapp ?? true)
  }, [value, resolvedDefault])

  // ── Country change handler ─────────────────────────────────────────────────
  const handleCountryChange = useCallback(
    (newCountry: CountryCode) => {
      // Re-format existing digits under the new country dialling plan
      const digits    = nationalDigits(displayValue)
      const formatted = digits ? formatNational(newCountry, digits) : ''
      setCountry(newCountry)
      setDisplayValue(formatted)
      emit(newCountry, digits, hasWhatsApp)
    },
    [displayValue, hasWhatsApp, emit],
  )

  // ── Phone input change handler ─────────────────────────────────────────────
  const handlePhoneChange = useCallback(
    (raw: string) => {
      const trimmed = raw.trimStart()

      // ── Case A: international number (starts with "+") ──────────────────
      if (trimmed.startsWith('+')) {
        const parsed = tryParseInternational(trimmed)
        if (parsed && COUNTRY_NAMES[parsed.country]) {
          setCountry(parsed.country)
          const formatted = formatNational(parsed.country, parsed.nationalDigits)
          setDisplayValue(formatted)
          emit(parsed.country, parsed.nationalDigits, hasWhatsApp)
          return
        }
        // Still typing the +XXXXXX — show raw until parseable
        setDisplayValue(trimmed)
        return
      }

      // ── Case B: national number typing ────────────────────────────────
      const digits = trimmed.replace(/\D/g, '').replace(/^0+/, '') // strip leading zeros
      const formatted = digits ? formatNational(country, digits) : ''
      setDisplayValue(formatted)
      emit(country, digits, hasWhatsApp)
    },
    [country, hasWhatsApp, emit],
  )

  // ── Paste handler (intercepts before onChange fires) ───────────────────────
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pasted = e.clipboardData.getData('text').trim()
      if (!pasted) return

      const parsed = tryParseInternational(pasted)
      if (parsed && COUNTRY_NAMES[parsed.country]) {
        e.preventDefault()
        setCountry(parsed.country)
        const formatted = formatNational(parsed.country, parsed.nationalDigits)
        setDisplayValue(formatted)
        emit(parsed.country, parsed.nationalDigits, hasWhatsApp)
      }
      // If parse fails, let the browser insert the text normally and
      // handlePhoneChange will process it via onChange.
    },
    [hasWhatsApp, emit],
  )

  // ── WhatsApp toggle ────────────────────────────────────────────────────────
  const handleWhatsAppChange = useCallback(
    (checked: boolean) => {
      setHasWhatsApp(checked)
      const digits = nationalDigits(displayValue)
      emit(country, digits, checked)
    },
    [country, displayValue, emit],
  )

  // ── Cleanup debounce on unmount ────────────────────────────────────────────
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  // ── Placeholder: shows expected national format ────────────────────────────
  const placeholder = useMemo(() => PHONE_PLACEHOLDERS[country] ?? '71 234 567', [country])

  return (
    <div className="space-y-2.5">
      {/* Label */}
      {label && (
        <label className="block text-sm font-medium" style={{ color: 'var(--fd-text)' }}>
          {label}
          {required && (
            <span className="ml-0.5" style={{ color: 'var(--fd-red)' }}>*</span>
          )}
        </label>
      )}

      {/* Input row: [country picker] [phone input] */}
      <div
        className="flex items-stretch overflow-hidden rounded-xl border transition-colors"
        style={{
          borderColor:     'var(--fd-border)',
          backgroundColor: 'var(--fd-card)',
        }}
      >
        <CountryDropdown
          selected={country}
          onSelect={handleCountryChange}
          disabled={disabled}
        />

        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={displayValue}
          onChange={e => handlePhoneChange(e.target.value)}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={disabled}
          className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm outline-none"
          style={{ color: 'var(--fd-text)' }}
          aria-label="Phone number"
        />
      </div>

      {/* WhatsApp toggle */}
      {showWhatsApp && <WhatsAppToggle
        checked={hasWhatsApp}
        onChange={handleWhatsAppChange}
        disabled={disabled}
      />}

      {/* Hint */}
      {hint && (
        <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>{hint}</p>
      )}
    </div>
  )
}

// ─── Placeholder map (national format sample per country) ─────────────────────

const PHONE_PLACEHOLDERS: Partial<Record<CountryCode, string>> = {
  LB: '71 234 567',
  AE: '50 123 4567',
  SA: '50 123 4567',
  KW: '5000 0000',
  QA: '3300 0000',
  BH: '3600 0000',
  OM: '9200 0000',
  JO: '7 9000 0000',
  EG: '100 123 4567',
  IQ: '770 123 4567',
  SY: '944 123 456',
  YE: '711 234 567',
  TR: '530 123 4567',
  GB: '7400 123456',
  US: '201 555 0123',
  CA: '506 234 5678',
  AU: '412 345 678',
  DE: '1512 3456789',
  FR: '6 12 34 56 78',
  ES: '612 345 678',
  IT: '312 345 6789',
  IN: '81234 56789',
  PK: '301 234 5678',
  SG: '8123 4567',
  MY: '12-345 6789',
  NG: '802 123 4567',
  ZA: '71 234 5678',
  BR: '(11) 91234-5678',
}
