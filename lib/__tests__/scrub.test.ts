/**
 * Unit tests for lib/scrub.ts.
 *
 * scrubSensitive is the single regex used by lib/log.ts and lib/errors.ts to
 * strip secret-like substrings before they reach an operator log line or a
 * user-facing error message (CLAUDE.md §8: "Never expose secrets", "Mask
 * secrets as HIDDEN"). No production code is changed by this file.
 */
import { describe, expect, it } from 'vitest'
import { scrubSensitive } from '@/lib/scrub'

describe('scrubSensitive', () => {
  it('returns the input unchanged when no sensitive marker is present', () => {
    expect(scrubSensitive('Client created successfully for tenant-a')).toBe(
      'Client created successfully for tenant-a',
    )
  })

  it('returns an empty string unchanged', () => {
    expect(scrubSensitive('')).toBe('')
  })

  // Note: the function only redacts the marker keyword itself (e.g. "api_key"),
  // not any value that follows it — a caller must not assume the whole line is
  // safe just because scrubSensitive touched it. This documents current
  // behavior only; changing that scope would be a production-code change.
  it.each([
    ['api_key', 'ERP_API_KEY=abc123'],
    ['api-key', 'x-api-key: abc123'],
    ['apikey (no separator)', 'apikey=abc123'],
    ['api_secret', 'ERP_API_SECRET=abc123'],
    ['token', 'session token expired'],
    ['password', 'invalid password supplied'],
    ['jwt', 'jwt verification failed'],
    ['webhook', 'webhook secret mismatch'],
    ['authorization', 'Authorization header missing'],
    ['bearer', 'Bearer xyz.abc.123'],
  ])('redacts a "%s" marker', (_label, input) => {
    expect(scrubSensitive(input)).toContain('HIDDEN')
  })

  it('is case-insensitive', () => {
    expect(scrubSensitive('API_KEY=secret')).toBe('HIDDEN=secret')
    expect(scrubSensitive('Token=secret')).toBe('HIDDEN=secret')
  })

  it('redacts multiple markers in the same string', () => {
    const input = 'token=abc password=xyz'
    const result = scrubSensitive(input)
    expect(result).toBe('HIDDEN=abc HIDDEN=xyz')
  })

  it('redacts a marker embedded inside a larger word boundary-free string', () => {
    // Regex has no word boundaries — this documents current (intentionally
    // conservative) behavior: a marker substring inside a longer token is
    // still replaced, favoring over-redaction over leaks.
    expect(scrubSensitive('mytokenvalue')).toBe('myHIDDENvalue')
  })

  it('preserves surrounding text and only replaces the marker word', () => {
    expect(scrubSensitive('Failed to reach Control Plane, retrying')).toBe(
      'Failed to reach Control Plane, retrying',
    )
  })

  it('redacts FITDESK_JWT_SECRET because it contains the "jwt" marker substring', () => {
    // Documents the conservative substring-match behavior: JWT_SECRET contains
    // "jwt" (case-insensitive), so it is redacted even though "secret" alone
    // (without an "api" prefix) is not itself a marker in SECRET_PATTERN.
    expect(scrubSensitive('Failed to read FITDESK_JWT_SECRET from env')).toBe(
      'Failed to read FITDESK_HIDDEN_SECRET from env',
    )
  })

  it('substring-matches a marker inside an unrelated longer word (no word boundaries)', () => {
    // 'token' is a substring of 'tokenized' — documents the same
    // conservative-substring-match behavior as the embedded-word case above.
    expect(scrubSensitive('Client tokenized identity was not requested')).toBe(
      'Client HIDDENized identity was not requested',
    )
  })
})
