'use server'

import { resolveTrainerId } from '@/lib/auth/resolve-trainer'
import {
  getTrainerWhatsAppConnection,
  createTrainerWhatsAppInstance,
  fetchWhatsAppQr,
  fetchWhatsAppConnectionStatus,
  disconnectWhatsAppInstance,
  replaceWhatsAppInstance,
} from '@/lib/evolution'
import type { ActionResult, WhatsAppConnection } from '@/types'

// ─── Actions ──────────────────────────────────────────────────────────────────

/** Return the current persisted connection row (null if never connected). */
export async function getWhatsAppStatus(): Promise<ActionResult<WhatsAppConnection | null>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    const data = await getTrainerWhatsAppConnection(resolved.trainerId)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to get WhatsApp status.' }
  }
}

/** Create a new Evolution instance for this trainer and return the QR code. */
export async function connectWhatsApp(): Promise<ActionResult<WhatsAppConnection>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    const data = await createTrainerWhatsAppInstance(resolved.trainerId)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create WhatsApp instance.' }
  }
}

/** Refresh the QR code while waiting for the trainer to scan. */
export async function refreshWhatsAppQr(): Promise<ActionResult<WhatsAppConnection>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    const data = await fetchWhatsAppQr(resolved.trainerId)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to refresh QR code.' }
  }
}

/** Poll Evolution API for the current connection state. Called every few seconds while pairing. */
export async function pollWhatsAppStatus(): Promise<ActionResult<WhatsAppConnection>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    const data = await fetchWhatsAppConnectionStatus(resolved.trainerId)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to poll WhatsApp status.' }
  }
}

/** Log out and delete the Evolution instance. */
export async function disconnectWhatsApp(): Promise<ActionResult<WhatsAppConnection>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    const data = await disconnectWhatsAppInstance(resolved.trainerId)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to disconnect WhatsApp.' }
  }
}

/** Delete the existing instance and create a fresh one with a new QR. */
export async function reconnectWhatsApp(): Promise<ActionResult<WhatsAppConnection>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    const data = await replaceWhatsAppInstance(resolved.trainerId)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to reconnect WhatsApp.' }
  }
}
