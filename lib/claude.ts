/**
 * AI message generation — server-side only.
 *
 * Design goals:
 *   - AI is assistive only. This module generates drafts for trainer review.
 *     Nothing is ever sent without explicit trainer action.
 *   - Works immediately with professional templates when ANTHROPIC_API_KEY is
 *     not set. Upgrades automatically to Claude-generated text when the key is
 *     provided.
 *   - Falls back to templates on API errors — the trainer always gets a draft.
 *   - Provider-agnostic: swap callGenerativeAPI() to use a different LLM.
 *
 * ─── NEVER import this file in a client component. ───────────────────────────
 */

import type { DraftType } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MessageContext {
  clientName:      string
  trainerName?:    string
  invoiceId?:      string
  amount?:         number
  currency?:       string
  dueDate?:        string
  sessionCount?:   number
  lastSessionDate?: string
  customNote?:     string
}

export interface GenerateResult {
  success:       boolean
  body?:         string
  /** True when the API key is absent and a template was used instead. */
  fromTemplate?: boolean
  error?:        string
}

// ─── UI metadata ─────────────────────────────────────────────────────────────

/** All draft types with labels and descriptions — use to build the type pills. */
export const DRAFT_TYPES: ReadonlyArray<{
  type:        DraftType
  label:       string
  description: string
}> = [
  {
    type:        'invoice',
    label:       'Invoice',
    description: 'Send invoice details and payment request',
  },
  {
    type:        'reminder',
    label:       'Reminder',
    description: 'Remind about outstanding payment',
  },
  {
    type:        'follow_up',
    label:       'Follow Up',
    description: 'Check in on training progress',
  },
  {
    type:        'reengagement',
    label:       'Re-engage',
    description: 'Reconnect with an inactive client',
  },
]

// ─── Professional templates (fallback) ───────────────────────────────────────
// Used when ANTHROPIC_API_KEY is not set, or when the API call fails.
// These are kept short (2–3 sentences) per WhatsApp best practice.

function templateFor(type: DraftType, ctx: MessageContext): string {
  const { clientName, invoiceId, amount, currency = 'USD', dueDate } = ctx

  const amountStr = amount !== undefined
    ? `${currency} ${amount.toLocaleString()}`
    : 'the outstanding amount'

  const dueDateStr = dueDate
    ? ` (due ${dueDate})`
    : ''

  const invoiceRef = invoiceId ? ` #${invoiceId}` : ''

  switch (type) {
    case 'invoice':
      return (
        `Hi ${clientName}! 👋 Your invoice${invoiceRef} for ${amountStr} is ready${dueDateStr}. ` +
        `Please let me know once you've had a chance to review it. ` +
        `Feel free to reach out if you have any questions!`
      )

    case 'reminder':
      return (
        `Hi ${clientName}! Quick reminder about invoice${invoiceRef} for ${amountStr}${dueDateStr}. ` +
        `Please settle when you can — let me know if you need any help with payment. Thanks! 🙏`
      )

    case 'follow_up':
      return (
        `Hi ${clientName}! Just checking in on your training progress. ` +
        `How are you feeling? Let's make sure we stay on track with your goals. ` +
        `Looking forward to our next session! 💪`
      )

    case 'reengagement':
      return (
        `Hi ${clientName}! It's been a while and I'd love to get you back on track. ` +
        `How about we schedule a session this week? ` +
        `Your fitness goals are still within reach — let's get going! 💪`
      )
  }
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(type: DraftType, ctx: MessageContext): string {
  const {
    clientName,
    trainerName,
    invoiceId,
    amount,
    currency = 'USD',
    dueDate,
    sessionCount,
    lastSessionDate,
    customNote,
  } = ctx

  const trainerLine = trainerName ? ` The trainer's name is ${trainerName}.` : ''
  const noteLine    = customNote  ? ` Additional context: ${customNote}.`    : ''

  const baseInstruction = [
    `Write a short, friendly, professional WhatsApp message from a personal trainer to their client.`,
    `Client name: ${clientName}.${trainerLine}`,
    `Keep it under 3 sentences. Use natural language. Do not use markdown. Emoji is welcome but optional.${noteLine}`,
  ].join(' ')

  switch (type) {
    case 'invoice': {
      const amountLine = amount !== undefined ? ` Amount: ${currency} ${amount}.` : ''
      const dueLine    = dueDate             ? ` Due date: ${dueDate}.`           : ''
      const refLine    = invoiceId           ? ` Invoice ID: ${invoiceId}.`       : ''
      return `${baseInstruction} Purpose: notify the client their invoice is ready and request payment.${refLine}${amountLine}${dueLine}`
    }

    case 'reminder': {
      const amountLine = amount !== undefined ? ` Outstanding amount: ${currency} ${amount}.` : ''
      const dueLine    = dueDate             ? ` Due date was ${dueDate}.`                    : ''
      const refLine    = invoiceId           ? ` Invoice: ${invoiceId}.`                      : ''
      return `${baseInstruction} Purpose: politely remind the client about an outstanding payment.${refLine}${amountLine}${dueLine}`
    }

    case 'follow_up': {
      const countLine = sessionCount !== undefined ? ` They have completed ${sessionCount} sessions.` : ''
      return `${baseInstruction} Purpose: check in on the client's training progress and keep them motivated.${countLine}`
    }

    case 'reengagement': {
      const lastLine = lastSessionDate ? ` Their last session was on ${lastSessionDate}.` : ''
      return `${baseInstruction} Purpose: re-engage a client who hasn't trained recently and encourage them to book a session.${lastLine}`
    }
  }
}

// ─── Claude API call ──────────────────────────────────────────────────────────

/**
 * Call the Claude API directly via fetch (no SDK dependency).
 * Uses claude-haiku-4-5 — fast, cost-effective, and well-suited for short
 * WhatsApp message generation.
 */
async function callGenerativeAPI(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [
        {
          role:    'user',
          content: prompt,
        },
      ],
    }),
    cache: 'no-store',
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Claude API ${res.status}${detail ? ': ' + detail.slice(0, 200) : ''}`)
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>
  }

  const text = data.content?.find(b => b.type === 'text')?.text
  if (!text) throw new Error('Claude API returned an empty response')
  return text.trim()
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a WhatsApp message draft.
 *
 * - When ANTHROPIC_API_KEY is set: calls Claude API for a personalised draft.
 * - When the key is absent or the API fails: returns a professional template.
 * - Never fails the caller — always returns a usable body.
 */
export async function generateMessage(
  type:    DraftType,
  context: MessageContext,
): Promise<GenerateResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    return {
      success:      true,
      body:         templateFor(type, context),
      fromTemplate: true,
    }
  }

  try {
    const prompt = buildPrompt(type, context)
    const body   = await callGenerativeAPI(prompt, apiKey)
    return { success: true, body }
  } catch (err) {
    // On API failure, fall back to template so the trainer always gets a draft
    console.warn(
      '[claude] API error — falling back to template:',
      err instanceof Error ? err.message : err,
    )
    return {
      success:      true,
      body:         templateFor(type, context),
      fromTemplate: true,
    }
  }
}
