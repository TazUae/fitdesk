/**
 * Unit tests for parseClientText.
 *
 * Strategy: mock fetch via vi.stubGlobal (matching lib/erpnext/client.test.ts pattern).
 * No real API calls, no ERP access, no client creation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.ANTHROPIC_API_KEY = 'test-api-key-for-phase-5'
})

import { parseClientText, AI_PARSE_ALLOWED_GOALS } from '@/lib/clients/ai-parse'

// ─── Fixtures ────────────────────────────────────────────────────────────────

function mockApiResponse(output: object) {
  return {
    ok:   true,
    json: async () => ({
      content: [{ type: 'text', text: JSON.stringify(output) }],
    }),
  }
}

const HIGH_CONFIDENCE_OUTPUT = {
  fullName:        { value: 'Sara Ahmad',              confidence: 'high' },
  phone:           { value: '+96170555000',             confidence: 'high' },
  whatsappEnabled: { value: true,                       confidence: 'high' },
  goals:           { value: ['fat-loss'],               confidence: 'high' },
  notes:           { value: 'Prefers morning sessions', confidence: 'medium' },
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── No API key ───────────────────────────────────────────────────────────────

describe('no API key', () => {
  it('returns failed state when ANTHROPIC_API_KEY is absent, makes no fetch call', async () => {
    const saved = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY

    const result = await parseClientText('Sara Ahmad 70 555 000')

    expect(result.state).toBe('failed')
    expect(fetchMock).not.toHaveBeenCalled()

    process.env.ANTHROPIC_API_KEY = saved
  })
})

// ─── Timeout ──────────────────────────────────────────────────────────────────

describe('timeout', () => {
  it('returns timeout state when fetch is aborted', async () => {
    fetchMock.mockImplementation(() => {
      const err = Object.assign(new Error('AbortError'), { name: 'AbortError' })
      return Promise.reject(err)
    })

    const result = await parseClientText('Sara Ahmad')
    expect(result.state).toBe('timeout')
    expect(result.fields.fullName.value).toBeNull()
    expect(result.fields.phone.value).toBeNull()
  })
})

// ─── Failures (no throw) ──────────────────────────────────────────────────────

describe('failure cases — never throw', () => {
  it('returns failed on network error (resolves, does not reject)', async () => {
    fetchMock.mockRejectedValue(new Error('Network error'))
    await expect(parseClientText('test')).resolves.toMatchObject({ state: 'failed' })
  })

  it('returns failed on non-OK HTTP response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 })
    const result = await parseClientText('test')
    expect(result.state).toBe('failed')
  })

  it('returns failed on completely non-JSON response body', async () => {
    fetchMock.mockResolvedValue({
      ok:   true,
      json: async () => ({ content: [{ type: 'text', text: 'not json at all %%%' }] }),
    })
    const result = await parseClientText('test')
    expect(result.state).toBe('failed')
  })

  it('returns failed on schema mismatch (fullName is a plain string, not an object)', async () => {
    fetchMock.mockResolvedValue(
      mockApiResponse({ fullName: 'Sara Ahmad', phone: null, goals: null, notes: null, whatsappEnabled: null }),
    )
    const result = await parseClientText('test')
    expect(result.state).toBe('failed')
  })

  it('returns failed on empty content array', async () => {
    fetchMock.mockResolvedValue({
      ok:   true,
      json: async () => ({ content: [] }),
    })
    const result = await parseClientText('test')
    expect(result.state).toBe('failed')
  })
})

// ─── Partial success ──────────────────────────────────────────────────────────

describe('partial_success', () => {
  it('maps high-confidence fields and returns partial_success', async () => {
    fetchMock.mockResolvedValue(mockApiResponse(HIGH_CONFIDENCE_OUTPUT))

    const result = await parseClientText('Sara Ahmad +96170555000 fat loss morning sessions')

    expect(result.state).toBe('partial_success')
    expect(result.fields.fullName.value).toBe('Sara Ahmad')
    expect(result.fields.fullName.confidence).toBe('high')
    expect(result.fields.fullName.source).toBe('ai_parse')
    expect(result.fields.goals.value).toEqual(['fat-loss'])
    expect(result.fields.notes.value).toBe('Prefers morning sessions')
    expect(result.fields.whatsappEnabled.value).toBe(true)
  })
})

// ─── Low confidence ───────────────────────────────────────────────────────────

describe('low_confidence', () => {
  it('returns low_confidence when all fields are low or unknown', async () => {
    fetchMock.mockResolvedValue(
      mockApiResponse({
        fullName:        { value: 'Maybe Sara', confidence: 'low' },
        phone:           { value: null,          confidence: 'unknown' },
        whatsappEnabled: { value: null,          confidence: 'unknown' },
        goals:           { value: null,          confidence: 'unknown' },
        notes:           { value: null,          confidence: 'unknown' },
      }),
    )

    const result = await parseClientText('some ambiguous text')
    expect(result.state).toBe('low_confidence')
  })
})

// ─── Goal filtering ───────────────────────────────────────────────────────────

describe('goal filtering', () => {
  it('drops goal IDs not in the canonical enum', async () => {
    fetchMock.mockResolvedValue(
      mockApiResponse({
        ...HIGH_CONFIDENCE_OUTPUT,
        goals: { value: ['fat-loss', 'yoga', 'weight loss', 'muscle'], confidence: 'high' },
      }),
    )

    const result = await parseClientText('test')
    expect(result.fields.goals.value).toEqual(['fat-loss', 'muscle'])
  })

  it('drops legacy underscore IDs — they are no longer in the allowlist', async () => {
    fetchMock.mockResolvedValue(
      mockApiResponse({
        ...HIGH_CONFIDENCE_OUTPUT,
        goals: { value: ['fat_loss', 'muscle_gain', 'general_fitness', 'rehabilitation'], confidence: 'high' },
      }),
    )

    const result = await parseClientText('test')
    expect(result.fields.goals.value).toEqual([])
    expect(result.fields.goals.confidence).toBe('unknown')
  })

  it('returns empty goals array when all are unknown', async () => {
    fetchMock.mockResolvedValue(
      mockApiResponse({
        ...HIGH_CONFIDENCE_OUTPUT,
        goals: { value: ['yoga', 'pilates'], confidence: 'high' },
      }),
    )

    const result = await parseClientText('test')
    expect(result.fields.goals.value).toEqual([])
    expect(result.fields.goals.confidence).toBe('unknown')
  })
})

// ─── Phone normalization ──────────────────────────────────────────────────────

describe('phone normalization', () => {
  it('normalizes a valid Lebanese phone to E.164', async () => {
    fetchMock.mockResolvedValue(
      mockApiResponse({ ...HIGH_CONFIDENCE_OUTPUT, phone: { value: '70 555 000', confidence: 'high' } }),
    )

    const result = await parseClientText('test')
    expect(result.fields.phone.value).toMatch(/^\+/)
    expect(result.fields.phone.confidence).toBe('high')
  })

  it('returns null phone for unparseable input', async () => {
    fetchMock.mockResolvedValue(
      mockApiResponse({ ...HIGH_CONFIDENCE_OUTPUT, phone: { value: 'call me tomorrow', confidence: 'low' } }),
    )

    const result = await parseClientText('test')
    expect(result.fields.phone.value).toBeNull()
    expect(result.fields.phone.confidence).toBe('unknown')
  })
})

// ─── Safety / billing / medical exclusion ─────────────────────────────────────

describe('no safety, medical, or billing fields', () => {
  it('ClientParseFields does NOT include safety, medical, or billing fields', async () => {
    fetchMock.mockResolvedValue(mockApiResponse(HIGH_CONFIDENCE_OUTPUT))

    const result = await parseClientText('Sara has diabetes and a knee injury, prefers package billing')
    const keys = Object.keys(result.fields)

    expect(keys).not.toContain('safetyFlags')
    expect(keys).not.toContain('safetyState')
    expect(keys).not.toContain('billingMode')
    expect(keys).not.toContain('medicalConditions')
    // Verify only the approved set of keys is present
    expect(keys.sort()).toEqual(['fullName', 'goals', 'notes', 'phone', 'whatsappEnabled'].sort())
  })
})

// ─── GOALS drift guard ────────────────────────────────────────────────────────

describe('GOALS drift guard', () => {
  it('AI_PARSE_ALLOWED_GOALS contains all 19 canonical hyphenated goal IDs from taxonomy.ts', () => {
    // Source of truth: lib/goals/taxonomy.ts GOALS array.
    // If you add or remove a goal there, also update AI_PARSE_ALLOWED_GOALS in ai-parse.ts.
    const expectedCanonicalIds = [
      // Core (8)
      'fat-loss', 'muscle', 'strength', 'general', 'rehab', 'sports', 'mobility', 'mental',
      // Specialist (8)
      'cardio', 'aesthetics', 'aging', 'functional', 'weight-mgmt', 'postnatal', 'youth', 'underweight',
      // Emerging (3)
      'glp1', 'longevity', 'neuro',
    ]
    expect([...AI_PARSE_ALLOWED_GOALS].sort()).toEqual(expectedCanonicalIds.sort())
    expect(AI_PARSE_ALLOWED_GOALS).toHaveLength(19)
  })

  it('legacy underscore IDs are NOT in AI_PARSE_ALLOWED_GOALS', () => {
    const legacyIds = ['fat_loss', 'muscle_gain', 'general_fitness', 'rehabilitation', 'sports_performance']
    const allowed = new Set<string>(AI_PARSE_ALLOWED_GOALS)
    for (const legacy of legacyIds) {
      expect(allowed.has(legacy)).toBe(false)
    }
  })
})
