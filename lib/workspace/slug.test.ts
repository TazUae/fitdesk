import { describe, expect, it } from 'vitest'
import { slugifyWorkspaceName } from '@/lib/workspace/slug'

describe('slugifyWorkspaceName', () => {
  it('lowercases the input', () => {
    expect(slugifyWorkspaceName('AlexJohnson')).toBe('alexjohnson')
  })

  it('trims leading and trailing whitespace', () => {
    expect(slugifyWorkspaceName('  my workspace  ')).toBe('my-workspace')
  })

  it('replaces non-alphanumeric characters with hyphens', () => {
    expect(slugifyWorkspaceName('Alex Johnson PT')).toBe('alex-johnson-pt')
  })

  it('collapses runs of non-alphanumeric characters into a single hyphen', () => {
    expect(slugifyWorkspaceName('Alex  --  Johnson')).toBe('alex-johnson')
  })

  it('strips leading hyphens', () => {
    expect(slugifyWorkspaceName('---alex')).toBe('alex')
  })

  it('strips trailing hyphens', () => {
    expect(slugifyWorkspaceName('alex---')).toBe('alex')
  })

  it('handles special characters', () => {
    expect(slugifyWorkspaceName('Alex & Co.')).toBe('alex-co')
  })

  it('handles arabic/unicode by collapsing to hyphens', () => {
    const result = slugifyWorkspaceName('مرحبا')
    // All non-ascii characters → hyphens → collapsed → stripped
    expect(result).toBe('workspace')
  })

  it('falls back to "workspace" when result is empty', () => {
    expect(slugifyWorkspaceName('')).toBe('workspace')
    expect(slugifyWorkspaceName('---')).toBe('workspace')
    expect(slugifyWorkspaceName('   ')).toBe('workspace')
  })

  it('caps slug length at 48 characters', () => {
    const long = 'a'.repeat(100)
    const result = slugifyWorkspaceName(long)
    expect(result.length).toBeLessThanOrEqual(48)
  })

  it('does not leave a trailing hyphen after the length cap', () => {
    // Construct a string where the cap would land mid-hyphen
    const tricky = 'a'.repeat(47) + '-' + 'b'.repeat(10)
    const result = slugifyWorkspaceName(tricky)
    expect(result).not.toMatch(/-$/)
    expect(result.length).toBeLessThanOrEqual(48)
  })

  it('handles numbers correctly', () => {
    expect(slugifyWorkspaceName('PT Studio 42')).toBe('pt-studio-42')
  })

  it('is idempotent on a clean slug', () => {
    const slug = 'alex-johnson-pt'
    expect(slugifyWorkspaceName(slug)).toBe(slug)
  })
})
