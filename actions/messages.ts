'use server'

import { randomUUID } from 'crypto'
import { and, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { messageLog } from '@/lib/db/schema'
import { getClientById, getInvoiceById } from '@/lib/business-data/erp-adapter'
import { ensureTrainerIdForUser } from '@/lib/trainer'
import { sendWhatsAppMessage, normalizePhone } from '@/lib/evolution'
import { generateMessage } from '@/lib/claude'
import { isPilotMode, matchAllowlist } from '@/lib/pilot'
import { log } from '@/lib/log'
import type { DraftType, MessageLog, ActionResult } from '@/types'
import type { MessageContext } from '@/lib/claude'

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Fetch message history for a client.
 * Reads from the local message_log table (run scripts/migrate-app.mjs first).
 * Returns the most-recent 50 entries for this trainer + client. Degrades to
 * an empty list if the table is missing — callers don't surface DB errors.
 */
export async function getMessages(
  clientId: string,
): Promise<ActionResult<MessageLog[]>> {
  const session = await auth.api.getSession({ headers: headers() })
  if (!session?.user) return { success: false, error: 'Not authenticated.' }
  const sessionPhone =
    typeof (session.user as { phone?: string | null }).phone === 'string'
      ? (session.user as { phone?: string | null }).phone
      : undefined

  let trainerId: string
  try {
    trainerId = await ensureTrainerIdForUser({
      userId: session.user.id,
      name: session.user.name,
      email: session.user.email,
      phone: sessionPhone,
    })
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Trainer account not configured.' }
  }

  try {
    const rows = await db
      .select()
      .from(messageLog)
      .where(and(eq(messageLog.trainerId, trainerId), eq(messageLog.clientId, clientId)))
      .orderBy(desc(messageLog.sentAt))
      .limit(50)

    const data: MessageLog[] = rows.map(r => ({
      id:                 r.id,
      trainerId:          r.trainerId,
      clientId:           r.clientId,
      messageType:        r.messageType,
      body:               r.body,
      status:             r.status === 'sent' ? 'sent' : 'failed',
      errorDetail:        r.errorDetail ?? undefined,
      sentAt:             r.sentAt,
      evolutionMessageId: r.evolutionMessageId ?? undefined,
    }))
    return { success: true, data }
  } catch {
    // Table missing or DB error — UI should still render. Audit-log absence
    // is not a fatal condition for the trainer's draft flow.
    return { success: true, data: [] }
  }
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
  const sessionPhone =
    typeof (session.user as { phone?: string | null }).phone === 'string'
      ? (session.user as { phone?: string | null }).phone
      : undefined

  let draftTrainerId: string
  try {
    draftTrainerId = await ensureTrainerIdForUser({
      userId: session.user.id,
      name: session.user.name,
      email: session.user.email,
      phone: sessionPhone,
    })
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Trainer account not configured.' }
  }

  try {
    const client = await getClientById(clientId, draftTrainerId)

    const context: MessageContext = {
      clientName: client.name,
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
  const sessionPhone =
    typeof (session.user as { phone?: string | null }).phone === 'string'
      ? (session.user as { phone?: string | null }).phone
      : undefined

  let trainerId: string
  try {
    trainerId = await ensureTrainerIdForUser({
      userId: session.user.id,
      name: session.user.name,
      email: session.user.email,
      phone: sessionPhone,
    })
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Trainer account not configured.' }
  }

  const sentAt = new Date().toISOString()

  // Pilot mode allowlist: block sends to non-allowlisted destinations
  // BEFORE hitting Evolution. Block events are still recorded in
  // message_log so they're visible in the in-app history.
  let result: { success: boolean; messageId?: string; error?: string }
  if (isPilotMode()) {
    const dest = normalizePhone(opts.phone)
    const match = matchAllowlist(
      dest,
      process.env.FITDESK_ALLOWED_TEST_PHONE,
      process.env.FITDESK_ALLOWED_TEST_PHONE_PREFIXES,
    )
    if (!match.allowed) {
      result = { success: false, error: match.reason }
    } else {
      result = await sendWhatsAppMessage({
        phone:       opts.phone,
        body:        opts.body,
        messageType: opts.messageType,
        trainerId,
        clientId:    opts.clientId,
        invoiceId:   opts.invoiceId,
      })
    }
  } else {
    result = await sendWhatsAppMessage({
      phone:       opts.phone,
      body:        opts.body,
      messageType: opts.messageType,
      trainerId,
      clientId:    opts.clientId,
      invoiceId:   opts.invoiceId,
    })
  }

  const id = randomUUID()
  const entry: MessageLog = {
    id,
    trainerId,
    clientId:           opts.clientId,
    messageType:        opts.messageType,
    body:               opts.body,
    status:             result.success ? 'sent' : 'failed',
    errorDetail:        result.success ? undefined : result.error,
    sentAt,
    evolutionMessageId: result.success ? result.messageId : undefined,
  }

  // Persist audit row. Swallow DB errors — the trainer's flow shouldn't
  // fail because the audit table is missing or temporarily unwritable.
  try {
    await db.insert(messageLog).values({
      id,
      trainerId,
      clientId:           opts.clientId,
      messageType:        opts.messageType,
      body:               opts.body,
      status:             entry.status,
      errorDetail:        entry.errorDetail ?? null,
      sentAt,
      evolutionMessageId: entry.evolutionMessageId ?? null,
    })
  } catch (err) {
    log.error('messages.audit.insert.failed', { err: String(err) })
  }

  if (!result.success) {
    return { success: false, error: result.error ?? 'Failed to send message.' }
  }

  return { success: true, data: entry }
}
