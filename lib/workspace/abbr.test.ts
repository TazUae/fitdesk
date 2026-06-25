import { describe, expect, it } from 'vitest'
import { abbreviateWorkspaceName } from '@/lib/workspace/abbr'

describe('abbreviateWorkspaceName', () => {
  it('takes initials from each word', () => {
    expect(abbreviateWorkspaceName('QA Performance Studio')).toBe('QPS')
  })

  it('handles multi-word trainer names', () => {
    // 'PT' is a single word → contributes 'P' only
    expect(abbreviateWorkspaceName('Alex Johnson PT')).toBe('AJP')
  })

  it('handles two-word names', () => {
    expect(abbreviateWorkspaceName('Zaidan Fitness')).toBe('ZF')
  })

  it('uppercases the result', () => {
    expect(abbreviateWorkspaceName('alex johnson')).toBe('AJ')
  })

  it('strips non-alphanumeric characters from each word before taking the initial', () => {
    expect(abbreviateWorkspaceName('@ Elite Training')).toBe('ET')
  })

  it('collapses extra whitespace between words', () => {
    expect(abbreviateWorkspaceName('Alex  Johnson')).toBe('AJ')
  })

  it('falls back to "FD" for an empty string', () => {
    expect(abbreviateWorkspaceName('')).toBe('FD')
  })

  it('falls back to "FD" for a whitespace-only string', () => {
    expect(abbreviateWorkspaceName('   ')).toBe('FD')
  })

  it('falls back to "FD" when all words are non-alphanumeric', () => {
    expect(abbreviateWorkspaceName('--- !!!')).toBe('FD')
  })

  it('caps the result at 8 characters', () => {
    const result = abbreviateWorkspaceName('A B C D E F G H I J')
    expect(result).toBe('ABCDEFGH')
    expect(result.length).toBeLessThanOrEqual(8)
  })

  it('handles a single word', () => {
    expect(abbreviateWorkspaceName('FitDesk')).toBe('F')
  })

  it('handles leading/trailing whitespace', () => {
    expect(abbreviateWorkspaceName('  Elite PT  ')).toBe('EP')
  })

  it('handles numeric words', () => {
    expect(abbreviateWorkspaceName('Studio 42')).toBe('S4')
  })
})
