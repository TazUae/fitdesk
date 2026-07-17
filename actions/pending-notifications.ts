'use server'

import { z } from 'zod'
import { getTenantContext } from '@/lib/tenant/context'
import { listPendingPaymentNotifications as cpListPending } from '@/lib/controlplane/client'
import type { ActionResult } from '@/types'

// Validate the Control Plane payload before use (never trust external responses).
const PendingNotificationSchema = z.object({
  invoiceName:  z.string(),
  customer:     z.string(),
  customerName: z.string().nullable(),
  grandTotal:   z.string().nullable(),
  currency:     z.string().nullable(),
  sessionDate:  z.string().nullable(),
  status:       z.string(),
  createdAt:    z.string(),
  sentAt:       z.string().nullable(),
})
const PendingResponseSchema = z.object({ notifications: z.array(PendingNotificationSchema) })

export type PendingPaymentNotification = z.infer<typeof PendingNotificationSchema>

/**
 * List the current trainer's pending payment notifications (workflow state recorded
 * by the Control Plane from the ERP invoice-submitted webhook). Read-only — this does
 * NOT generate a payment link or send anything.
 *
 * Tenant-scoped: uses the caller's own provisioning slug from the session context.
 */
export async function listPendingPaymentNotifications(): Promise<ActionResult<PendingPaymentNotification[]>> {
  const ctx = await getTenantContext()
  if (!ctx) return { success: false, error: 'Not authenticated.' }
  if (!ctx.slug) return { success: true, data: [] } // workspace not provisioned yet

  try {
    const raw = await cpListPending(ctx.slug)
    const parsed = PendingResponseSchema.safeParse(raw)
    if (!parsed.success) {
      return { success: false, error: 'Invalid pending-notification response from Control Plane.' }
    }
    return { success: true, data: parsed.data.notifications }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to load pending payment notifications.',
    }
  }
}
