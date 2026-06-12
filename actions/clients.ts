'use server'

import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { createClient, getClientById, getClients, updateClient } from '@/lib/business-data/erp-adapter'
import { ensureTrainerIdForUser } from '@/lib/trainer'
import { getTenantContext } from '@/lib/tenant/context'
import { ClientRepository } from '@/lib/clients/repository'
import { buildClientCreateDraft } from '@/lib/clients/create-draft'
import { db } from '@/lib/db'
import type { ActionResult, Client } from '@/types'
import type { CreateClientPayload, UpdateClientPayload } from '@/lib/erpnext/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveTrainerId(): Promise<{ trainerId: string } | { error: string }> {
  const session = await auth.api.getSession({ headers: headers() })
  if (!session?.user) return { error: 'Not authenticated.' }
  const sessionPhone =
    typeof (session.user as { phone?: string | null }).phone === 'string'
      ? (session.user as { phone?: string | null }).phone
      : undefined
  try {
    const trainerId = await ensureTrainerIdForUser({
      userId: session.user.id,
      name: session.user.name,
      email: session.user.email,
      phone: sessionPhone,
    })
    return { trainerId }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Trainer account not configured.' }
  }
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function fetchClients(): Promise<ActionResult<Client[]>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    const data = await getClients(resolved.trainerId)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch clients' }
  }
}

export async function fetchClientById(id: string): Promise<ActionResult<Client>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    const data = await getClientById(id, resolved.trainerId)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch client' }
  }
}

/**
 * Add a new client.
 * The trainer field is injected server-side from the auth session —
 * callers must NOT include it in the payload.
 *
 * Flow (ADR-001, ERP-authoritative hybrid):
 *   1. Create the ERP Customer through the approved proxy path (canonical identity).
 *   2. Synchronously write local FitDesk enrichment rows (client_index + goal +
 *      inert action intents + client.created event) via the Phase 1 transaction.
 *
 * Success is returned only after BOTH complete. If ERP creation fails, no local
 * rows are written. If ERP succeeds but the local write fails, the ERP Customer
 * is left intact (never deleted/modified) and a recoverable error is returned so
 * the trainer does not re-create (which would duplicate the ERP Customer); Phase 2
 * backfill repairs the missing local rows.
 */
export async function addClient(
  payload: Omit<CreateClientPayload, 'trainer'>,
): Promise<ActionResult<Client>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  // Step 1 — create the ERP Customer (canonical identity).
  let data: Client
  try {
    data = await createClient({ ...payload, trainer: resolved.trainerId })
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create client' }
  }

  // Step 2 — write local enrichment rows. ERP Customer is now canonical; on any
  // failure here we DO NOT touch the ERP Customer and return a recoverable error.
  let tenantIdForLog: string | null = null
  try {
    const ctx = await getTenantContext()
    if (!ctx?.tenantId) {
      throw new Error('No tenant context available after ERP create')
    }
    tenantIdForLog = ctx.tenantId

    const { draft, phoneNormalized } = buildClientCreateDraft({
      tenantId:           ctx.tenantId,
      userId:             ctx.userId ?? null,
      createdClient:      data,
      customFitnessGoals: payload.custom_fitness_goals ?? null,
    })

    const repo = new ClientRepository(db)
    await repo.createClientRow({ tenantId: ctx.tenantId }, draft)

    // Audit-only: phone could not be normalized to E.164 and the raw value was
    // stored. Recorded so backfill/repair can fix it later. No PII beyond the flag.
    if (!phoneNormalized) {
      await repo.insertClientEvent({
        tenantId:        ctx.tenantId,
        clientIndexId:   null,
        erpCustomerId:   data.id,
        type:            'client.phone_unnormalized',
        payloadJson:     { phoneNormalized: false },
        createdByUserId: ctx.userId ?? null,
      })
    }

    return { success: true, data }
  } catch (err) {
    // Log with tenantId only — no secrets / PII.
    console.error(
      `[addClient] ERP Customer created but local row creation failed for tenant ${tenantIdForLog ?? 'unknown'}:`,
      err instanceof Error ? err.message : String(err),
    )
    return {
      success: false,
      error:
        'The client was created in ERP, but the local FitDesk profile needs repair. ' +
        'Do not create this client again; run backfill/repair.',
    }
  }
}

export async function editClient(
  id: string,
  payload: UpdateClientPayload,
): Promise<ActionResult<Client>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    const data = await updateClient(id, payload, resolved.trainerId)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update client' }
  }
}

/**
 * Soft-delete: marks the client Inactive in ERPNext.
 * ERPNext data is never deleted — this preserves the audit trail for sessions
 * and invoices while hiding the client from active lists.
 */
export async function deleteClient(id: string): Promise<ActionResult<Client>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    const data = await updateClient(id, { status: 'Inactive' }, resolved.trainerId)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to deactivate client' }
  }
}
