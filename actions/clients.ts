'use server'

import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { createClient, getClientById, getClients, updateClient } from '@/lib/business-data/erp-adapter'
import { ensureTrainerIdForUser } from '@/lib/trainer'
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

export async function addClient(
  payload: CreateClientPayload,
): Promise<ActionResult<Client>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    const data = await createClient(payload)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create client' }
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
 * Soft-delete: disables the customer in ERPNext.
 * ERPNext data is never deleted — this preserves the audit trail for sessions
 * and invoices while hiding the client from active lists.
 */
export async function deleteClient(id: string): Promise<ActionResult<Client>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    const data = await updateClient(id, { disabled: 1 }, resolved.trainerId)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to deactivate client' }
  }
}
