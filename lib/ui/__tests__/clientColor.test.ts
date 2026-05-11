/**
 * Unit tests for lib/ui/clientColor.ts
 */
import { describe, it, expect } from 'vitest'
import { clientPastel, clientPastelKey } from '@/lib/ui/clientColor'
import { scheduleTokens } from '@/lib/ui/scheduleDesignTokens'

describe('clientPastelKey', () => {
  it('returns one of the 6 live pastel keys', () => {
    const allowed = ['blue', 'green', 'yellow', 'purple', 'pink', 'teal'] as const
    const samples = ['CUST-0001', 'Sara Mukasa', 'Ahmed Khalil', 'yasser-h', 'A', 'AB']
    for (const s of samples) {
      expect(allowed).toContain(clientPastelKey(s))
    }
  })

  it('is deterministic across calls', () => {
    expect(clientPastelKey('Sara Mukasa')).toBe(clientPastelKey('Sara Mukasa'))
    expect(clientPastelKey('CUST-0042')).toBe(clientPastelKey('CUST-0042'))
  })

  it('returns "blue" for empty seed (safe default)', () => {
    expect(clientPastelKey('')).toBe('blue')
  })

  it('never returns "gray" (reserved for completed/cancelled sessions)', () => {
    const names = Array.from({ length: 200 }, (_, i) => `client-${i}`)
    for (const n of names) {
      expect(clientPastelKey(n)).not.toBe('gray')
    }
  })
})

describe('clientPastel', () => {
  it('returns a fill+text pair from the design tokens palette', () => {
    const result = clientPastel('Sara Mukasa')
    expect(result).toHaveProperty('fill')
    expect(result).toHaveProperty('text')
    const fills = Object.values(scheduleTokens.pastels).map(p => p.fill)
    expect(fills).toContain(result.fill)
  })

  it('matches the result of clientPastelKey lookup', () => {
    const seed = 'Yasser H'
    const key = clientPastelKey(seed)
    expect(clientPastel(seed)).toEqual(scheduleTokens.pastels[key])
  })
})
