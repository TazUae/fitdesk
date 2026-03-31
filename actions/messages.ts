'use server'

import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { getClientById, getInvoiceById } from '@/lib/business-data/erp-adapter'
import { ensureTrainerIdForUser } from '@/lib/trainer'
import { sendWhatsAppMessage } from '@/lib/evolution'
import { generateMessage } from '@/lib/claude'
import type { DraftType, MessageLog, ActionResult } from '@/types'
import type { MessageContext } from '@/lib/claude'

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Fetch message history for a client.
 *
 * TODO: query a `message_log` table in auth.db once DB persistence is wired up.
 * For now returns an empty array — messages are logged to the server console only
 * (see logMessageEvent in lib/evolution.ts).
 */
export async function getMessages(
  _clientId: string,
): Promise<ActionResult<MessageLog[]>> {
  return { success: true, data: [] }
}

/**
 * Generate an AI-assisted message draft.
 *
 * Fetches client (and optionally invoice) data server-side — the caller only
 * needs to pass IDs. Returns the rendered draft body for trainer review.
 *
 * This does NOT send anything. The trainer must call sendMessage() separately
 * after reviewing and approving the draft.
 */
export async function generateDraftMessage(
  type:         DraftType,
  clientId:     string,
  invoiceId?:   string,
  extraContext?: Partial<MessageContext>,
): Promise<ActionResult<string>> {
  const session = await auth.api.getSession({ headers: headers() })
  if (!session?.user) return { success: false, error: 'Not authenticated.' }

  let draftTrainerId: string
  try {
    draftTrainerId = await ensureTrainerIdForUser({
      userId: session.user.id,
      name: session.user.name,
      email: session.user.email,
      phone: session.user.phone,
    })
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Trainer account not configured.' }
  }

  try {
    const client = await getClientById(clientId, draftTrainerId)

    const context: MessageContext = {
      clientName:   client.name,
      sessionCount: client.sessionCount,
      ...extraContext,
    }

    if (invoiceId) {
      try {
        const invoice = await getInvoiceById(invoiceId)
        context.invoiceId = invoice.id
        context.amount    = invoice.amount
        context.currency  = invoice.currency
        context.dueDate   = invoice.dueDate
      } catch {
        // Non-fatal — proceed without invoice context
      }
    }

    const result = await generateMessage(type, context)
    if (!result.success || !result.body) {
      return { success: false, error: result.error ?? 'Failed to generate message.' }
    }

    return { success: true, data: result.body }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to generate message.',
    }
  }
}

/**
 * Send an approved WhatsApp message via Evolution API.
 *
 * IMPORTANT: The trainer must have reviewed and explicitly approved the message
 * body before calling this action. Never call this automatically.
 *
 * Always logs the send attempt (success or failure) as an audit event.
 */
export async function sendMessage(opts: {
  clientId:    string
  phone:       string
  body:        string
  messageType: string
  invoiceId?:  string
}): Promise<ActionResult<MessageLog>> {
  const session = await auth.api.getSession({ headers: headers() })
  if (!session?.user) return { success: false, error: 'Not authenticated.' }

  let trainerId: string
  try {
    trainerId = await ensureTrainerIdForUser({
      userId: session.user.id,
      name: session.user.name,
      email: session.user.email,
      phone: session.user.phone,
    })
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Trainer account not configured.' }
  }

  const sentAt = new Date().toISOString()

  const result = await sendWhatsAppMessage({
    phone:       opts.phone,
    body:        opts.body,
    messageType: opts.messageType,
    trainerId,
    clientId:    opts.clientId,
    invoiceId:   opts.invoiceId,
  })

  const log: MessageLog = {
    trainerId,
    clientId:           opts.clientId,
    messageType:        opts.messageType,
    body:               opts.body,
    status:             result.success ? 'sent' : 'failed',
    errorDetail:        result.success ? undefined : result.error,
    sentAt,
    evolutionMessageId: result.success ? result.messageId : undefined,
  }

  console.log('[messages] audit', JSON.stringify(log))

  if (!result.success) {
    return { success: false, error: result.error ?? 'Failed to send message.' }
  }

  return { success: true, data: log }
}
