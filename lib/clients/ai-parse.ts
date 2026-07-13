/**
 * Optional AI-assisted client info extraction — server-side only.
 *
 * Design goals:
 *   - AI is assistive only. Never creates a client record.
 *   - Mirrors the lib/claude.ts server-fetch pattern.
 *   - 3-second AbortController timeout; no partial hangs.
 *   - Zod validates model output; any failure returns a safe terminal state.
 *   - No PII stored or logged; only error types are recorded.
 *
 * ─── NEVER import this file in a client component. ───────────────────────────
 */

import 'server-only'
import { z } from 'zod'
import { normalizePhoneToE164 } from '@/lib/clients/phone'
import { GOALS } from '@/lib/goals/taxonomy'
import type { AiParseState, ClientParseFields, ClientParseResult } from '@/types/clients'

// ─── Canonical goal IDs ───────────────────────────────────────────────────────
// Derived directly from the single source of truth (lib/goals/taxonomy.ts GOALS)
// so it can never drift. Drift-guard test: lib/clients/__tests__/ai-parse.test.ts.

export const AI_PARSE_ALLOWED_GOALS: readonly string[] = GOALS.map(g => g.id)

const MAX_INPUT_LENGTH = 2000
const API_TIMEOUT_MS   = 3000

// ─── Zod schema for model output ─────────────────────────────────────────────

const confidenceEnum = z.enum(['high', 'medium', 'low', 'unknown'])

const aiOutputSchema = z.object({
  fullName:        z.object({ value: z.string().nullable(), confidence: confidenceEnum }),
  phone:           z.object({ value: z.string().nullable(), confidence: confidenceEnum }),
  whatsappEnabled: z.object({ value: z.boolean().nullable(), confidence: confidenceEnum }),
  goals:           z.object({ value: z.array(z.string()).nullable(), confidence: confidenceEnum }),
  notes:           z.object({ value: z.string().nullable(), confidence: confidenceEnum }),
})

type AiOutput = z.infer<typeof aiOutputSchema>

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function failedParseResult(
  state: Exclude<AiParseState, 'idle' | 'parsing'> = 'failed',
): ClientParseResult {
  return {
    state,
    fields: {
      fullName:        { value: null, confidence: 'unknown', source: 'ai_parse' },
      phone:           { value: null, confidence: 'unknown', source: 'ai_parse' },
      whatsappEnabled: { value: null, confidence: 'unknown', source: 'ai_parse' },
      goals:           { value: [],   confidence: 'unknown', source: 'ai_parse' },
      notes:           { value: null, confidence: 'unknown', source: 'ai_parse' },
    },
  }
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

function buildParsePrompt(rawText: string): string {
  const goalList = AI_PARSE_ALLOWED_GOALS.join(', ')
  return [
    'You are a data extraction assistant for a personal trainer app.',
    "Extract client information from the trainer's text and return ONLY a JSON object — no prose, no markdown fences.",
    '',
    'RULES:',
    '- Only extract information EXPLICITLY present in the text. Never infer or fabricate.',
    '- Do not produce medical conditions, injuries, safety flags, or billing information.',
    `- For goals, use ONLY these exact values: ${goalList}. Omit any goal not in this list.`,
    '- confidence: "high" if clearly stated, "medium" if likely, "low" if uncertain, "unknown" if absent.',
    '- value: null for any field not determinable from the text.',
    '',
    'Return this exact JSON structure:',
    '{',
    '  "fullName": { "value": string|null, "confidence": "high"|"medium"|"low"|"unknown" },',
    '  "phone": { "value": string|null, "confidence": "high"|"medium"|"low"|"unknown" },',
    '  "whatsappEnabled": { "value": boolean|null, "confidence": "high"|"medium"|"low"|"unknown" },',
    '  "goals": { "value": string[]|null, "confidence": "high"|"medium"|"low"|"unknown" },',
    '  "notes": { "value": string|null, "confidence": "high"|"medium"|"low"|"unknown" }',
    '}',
    '',
    "Trainer's text:",
    rawText,
  ].join('\n')
}

// ─── Anthropic API call ───────────────────────────────────────────────────────

async function callAnthropicApi(prompt: string, apiKey: string): Promise<AiOutput> {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS)

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages:   [{ role: 'user', content: prompt }],
      }),
      signal: ctrl.signal,
      cache:  'no-store',
    })

    if (!res.ok) throw new Error(`Anthropic API ${res.status}`)

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>
    }
    const text = data.content?.find(b => b.type === 'text')?.text
    if (!text) throw new Error('Empty response from Anthropic API')

    // Model may wrap JSON in markdown fences; extract the object if needed.
    let raw: unknown
    try {
      raw = JSON.parse(text.trim())
    } catch {
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('No JSON in response')
      raw = JSON.parse(match[0])
    }

    return aiOutputSchema.parse(raw)
  } finally {
    clearTimeout(timer)
  }
}

// ─── Goal filtering ───────────────────────────────────────────────────────────

function filterGoals(raw: string[] | null): string[] {
  if (!raw) return []
  const allowed = new Set<string>(AI_PARSE_ALLOWED_GOALS)
  return raw.filter(g => allowed.has(g))
}

// ─── State derivation ─────────────────────────────────────────────────────────

function deriveState(
  fields: ClientParseFields,
): Exclude<AiParseState, 'idle' | 'parsing' | 'failed' | 'timeout'> {
  const hasHighOrMedium = (
    (fields.fullName.confidence === 'high' || fields.fullName.confidence === 'medium') && fields.fullName.value !== null
    || (fields.phone.confidence === 'high' || fields.phone.confidence === 'medium') && fields.phone.value !== null
    || (fields.goals.confidence === 'high' || fields.goals.confidence === 'medium') && (fields.goals.value?.length ?? 0) > 0
    || (fields.notes.confidence === 'high' || fields.notes.confidence === 'medium') && fields.notes.value !== null
  )
  return hasHighOrMedium ? 'partial_success' : 'low_confidence'
}

// ─── Map model output → ClientParseFields ─────────────────────────────────────

function mapToFields(output: AiOutput): ClientParseFields {
  // Phone: normalize to E.164 server-side
  let phoneValue: string | null = null
  if (output.phone.value) {
    const norm = normalizePhoneToE164(output.phone.value)
    phoneValue = norm.ok ? norm.e164 : null
  }

  const mappedGoals = filterGoals(output.goals.value)

  return {
    fullName: {
      value:      output.fullName.value,
      confidence: output.fullName.confidence,
      source:     'ai_parse',
    },
    phone: {
      value:      phoneValue,
      confidence: phoneValue ? output.phone.confidence : 'unknown',
      source:     'ai_parse',
    },
    whatsappEnabled: {
      value:      output.whatsappEnabled.value,
      confidence: output.whatsappEnabled.confidence,
      source:     'ai_parse',
    },
    goals: {
      value:      mappedGoals,
      confidence: mappedGoals.length > 0 ? output.goals.confidence : 'unknown',
      source:     'ai_parse',
    },
    notes: {
      value:      output.notes.value,
      confidence: output.notes.confidence,
      source:     'ai_parse',
    },
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse free-form trainer text into structured Add Client form fields.
 *
 * - Never throws: all failures return a safe terminal state.
 * - 3-second AbortController timeout (abort → state:'timeout').
 * - Absent ANTHROPIC_API_KEY → state:'failed', no network call.
 * - No client records created, no ERP calls, no PII stored or logged.
 */
export async function parseClientText(rawText: string): Promise<ClientParseResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return failedParseResult('failed')

  const capped = rawText.slice(0, MAX_INPUT_LENGTH)

  try {
    const prompt = buildParsePrompt(capped)
    const output = await callAnthropicApi(prompt, apiKey)
    const fields = mapToFields(output)
    const state  = deriveState(fields)
    return { state, fields }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return failedParseResult('timeout')
    }
    // Log only error type — no raw text, no PII.
    console.warn('[ai-parse] parse error:', err instanceof Error ? err.message : 'unknown')
    return failedParseResult('failed')
  }
}
