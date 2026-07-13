import { describe, it, expect } from 'vitest'
import {
  countPrimaries,
  checkPrimaryInvariant,
  isPrimaryInvariantValid,
} from '@/lib/goals/primary-invariant'

describe('primary-invariant (D7) — shared by create + update paths', () => {
  it('zero goals is valid (configuration deferred)', () => {
    expect(checkPrimaryInvariant([])).toBeNull()
    expect(isPrimaryInvariantValid([])).toBe(true)
  })

  it('exactly one primary in a nonempty set is valid', () => {
    const goals = [{ isPrimary: true }, { isPrimary: false }, { isPrimary: false }]
    expect(checkPrimaryInvariant(goals)).toBeNull()
    expect(isPrimaryInvariantValid(goals)).toBe(true)
  })

  it('nonempty set with zero primaries is invalid', () => {
    const goals = [{ isPrimary: false }, { isPrimary: false }]
    expect(checkPrimaryInvariant(goals)).toBe('primary_invariant_violated')
    expect(isPrimaryInvariantValid(goals)).toBe(false)
  })

  it('nonempty set with two primaries is invalid', () => {
    const goals = [{ isPrimary: true }, { isPrimary: true }]
    expect(checkPrimaryInvariant(goals)).toBe('primary_invariant_violated')
  })

  it('countPrimaries counts only isPrimary=true', () => {
    expect(countPrimaries([{ isPrimary: true }, { isPrimary: false }, { isPrimary: true }])).toBe(2)
    expect(countPrimaries([])).toBe(0)
  })
})
