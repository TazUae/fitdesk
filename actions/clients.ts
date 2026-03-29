'use server'

import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { createClient, getClientById, getClients, updateClient } from '@/lib/erpnext/client'
import { ensureTrainerIdForUser } from '@/lib/trainer'
import type { ActionResult, Client } from '@/types'
import type { CreateClientPayload, UpdateClientPayload } from '@/lib/erpnext/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveTrainerId(): Promise<{ trainerId: string } | { error: string }> {
  const session = await auth.api.getSession({ headers: headers() })
  if (!session?.user) return { error: 'Not authenticated.' }
  try {
    const trainerId = await ensureTrainerIdForUser({
      userId: session.user.id,
      name: session.user.name,
      email: session.user.email,
      phone: session.user.phone,
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
 */
export async function addClient(
  payload: Omit<CreateClientPayload, 'trainer'>,
): Promise<ActionResult<Client>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    const data = await createClient({ ...payload, trainer: resolved.trainerId })
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
