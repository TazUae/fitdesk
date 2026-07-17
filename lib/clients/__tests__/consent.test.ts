/**
 * Unit tests for lib/clients/consent.ts (US-059).
 *
 * Pure functions — no I/O, no mocks needed.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { canSendAutomatedWhatsApp, isOptedOut } from '@/lib/clients/consent'
import type { WhatsAppConsentState } from '@/types/clients'

const CONSENT_SRC = readFileSync(join(__dirname, '../consent.ts'), 'utf-8')

describe('canSendAutomatedWhatsApp', () => {
  it('returns true only for opted_in', () => {
    expect(canSendAutomatedWhatsApp('opted_in')).toBe(true)
  })

  it('returns false for unknown — never treated as implicit permission', () => {
    expect(canSendAutomatedWhatsApp('unknown')).toBe(false)
  })

  it('returns false for opted_out — no override', () => {
    expect(canSendAutomatedWhatsApp('opted_out')).toBe(false)
  })

  it('covers every WhatsAppConsentState value exhaustively', () => {
    const allStates: WhatsAppConsentState[] = ['unknown', 'opted_in', 'opted_out']
    const eligible = allStates.filter(canSendAutomatedWhatsApp)
    expect(eligible).toEqual(['opted_in'])
  })
})

describe('isOptedOut', () => {
  it('returns true only for opted_out', () => {
    expect(isOptedOut('opted_out')).toBe(true)
  })

  it('returns false for unknown', () => {
    expect(isOptedOut('unknown')).toBe(false)
  })

  it('returns false for opted_in', () => {
    expect(isOptedOut('opted_in')).toBe(false)
  })
})

// ─── Source invariants — no send capability in this module (US-059) ──────────

describe('consent.ts source — no I/O, no WhatsApp send capability', () => {
  it('does not import or call any WhatsApp/Evolution send function', () => {
    expect(CONSENT_SRC).not.toContain('sendWhatsAppMessage')
    expect(CONSENT_SRC).not.toContain('evolution')
    expect(CONSENT_SRC).not.toContain('Evolution')
  })

  it('does not import from lib/erpnext or any database module', () => {
    expect(CONSENT_SRC).not.toContain('lib/erpnext')
    expect(CONSENT_SRC).not.toContain('lib/db')
    expect(CONSENT_SRC).not.toContain('drizzle')
  })
})
