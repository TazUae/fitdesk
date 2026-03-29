/**
 * Evolution API — WhatsApp integration layer. Server-side only.
 */

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { trainerWhatsAppConnection } from '@/lib/db/schema'
import type { WhatsAppConnection, WhatsAppConnectionStatus } from '@/types'

export interface SendMessageParams {
  phone: string
  body: string
  messageType: string
  trainerId: string
  clientId: string
  invoiceId?: string
}

export interface SendMessageResult {
  success: boolean
  messageId?: string
  error?: string
}

const EVOLUTION_URL = process.env.EVOLUTION_API_URL
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY

function cuidLike(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = `961${digits.slice(1)}`
  if (digits.length < 10) digits = `961${digits}`
  return digits.replace(/\D/g, '')
}

function toStatus(raw?: string): WhatsAppConnectionStatus {
  const normalized = (raw ?? '').toLowerCase()
  if (normalized.includes('open') || normalized.includes('connected')) return 'connected'
  if (normalized.includes('qr') || normalized.includes('connecting')) return 'pairing'
  if (normalized.includes('close') || normalized.includes('disconnect')) return 'disconnected'
  if (normalized.includes('error')) return 'error'
  return 'not_connected'
}

function rowToConnection(row: typeof trainerWhatsAppConnection.$inferSelect): WhatsAppConnection {
  return {
    id: row.id,
    trainerId: row.trainerId,
    instanceName: row.instanceName,
    instanceId: row.instanceId ?? undefined,
    status: row.status as WhatsAppConnectionStatus,
    phoneNumber: row.phoneNumber ?? undefined,
    displayName: row.displayName ?? undefined,
    qrCode: row.qrCode ?? undefined,
    pairingCode: row.pairingCode ?? undefined,
    lastError: row.lastError ?? undefined,
    lastConnectedAt: row.lastConnectedAt ? new Date(row.lastConnectedAt).toISOString() : undefined,
    lastDisconnectedAt: row.lastDisconnectedAt ? new Date(row.lastDisconnectedAt).toISOString() : undefined,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  }
}

function requireEvolutionConfig(): string | null {
  if (!EVOLUTION_URL || !EVOLUTION_KEY) return 'WhatsApp not configured'
  return null
}

function instanceNameForTrainer(trainerId: string): string {
  return `fitdesk_${trainerId.replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

async function upsertConnection(input: {
  trainerId: string
  instanceName: string
  instanceId?: string
  status: WhatsAppConnectionStatus
  phoneNumber?: string
  displayName?: string
  qrCode?: string
  pairingCode?: string
  lastError?: string
  lastConnectedAt?: Date
  lastDisconnectedAt?: Date
}): Promise<WhatsAppConnection> {
  const existing = await db.query.trainerWhatsAppConnection.findFirst({
    where: eq(trainerWhatsAppConnection.trainerId, input.trainerId),
  })

  const values = {
    trainerId: input.trainerId,
    instanceName: input.instanceName,
    instanceId: input.instanceId ?? null,
    status: input.status,
    phoneNumber: input.phoneNumber ?? null,
    displayName: input.displayName ?? null,
    qrCode: input.qrCode ?? null,
    pairingCode: input.pairingCode ?? null,
    lastError: input.lastError ?? null,
    lastConnectedAt: input.lastConnectedAt ?? null,
    lastDisconnectedAt: input.lastDisconnectedAt ?? null,
    updatedAt: new Date(),
  }

  if (!existing) {
    await db.insert(trainerWhatsAppConnection).values({
      id: cuidLike('waconn'),
      createdAt: new Date(),
      ...values,
    })
  } else {
    await db
      .update(trainerWhatsAppConnection)
      .set(values)
      .where(eq(trainerWhatsAppConnection.trainerId, input.trainerId))
  }

  const row = await db.query.trainerWhatsAppConnection.findFirst({
    where: eq(trainerWhatsAppConnection.trainerId, input.trainerId),
  })

  if (!row) throw new Error('Failed to persist WhatsApp connection state.')
  return rowToConnection(row)
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getTrainerWhatsAppConnection(trainerId: string): Promise<WhatsAppConnection | null> {
  const row = await db.query.trainerWhatsAppConnection.findFirst({
    where: eq(trainerWhatsAppConnection.trainerId, trainerId),
  })
  return row ? rowToConnection(row) : null
}

export async function createTrainerWhatsAppInstance(trainerId: string): Promise<WhatsAppConnection> {
  const configError = requireEvolutionConfig()
  if (configError) throw new Error(configError)

  const instanceName = instanceNameForTrainer(trainerId)

  const res = await fetch(`${EVOLUTION_URL}/instance/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: EVOLUTION_KEY!,
    },
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
    }),
    cache: 'no-store',
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Failed to create WhatsApp instance: ${res.status} ${text.slice(0, 200)}`)
  }

  const data = JSON.parse(text) as {
    instance?: { instanceName?: string; instanceId?: string; status?: string }
    qrcode?: { base64?: string; pairingCode?: string }
  }

  return upsertConnection({
    trainerId,
    instanceName: data.instance?.instanceName ?? instanceName,
    instanceId: data.instance?.instanceId,
    status: toStatus(data.instance?.status ?? 'connecting'),
    qrCode: data.qrcode?.base64,
    pairingCode: data.qrcode?.pairingCode,
  })
}

export async function fetchWhatsAppQr(trainerId: string): Promise<WhatsAppConnection> {
  const configError = requireEvolutionConfig()
  if (configError) throw new Error(configError)

  const current = await getTrainerWhatsAppConnection(trainerId)
  if (!current) return createTrainerWhatsAppInstance(trainerId)

  const res = await fetch(
    `${EVOLUTION_URL}/instance/connect/${encodeURIComponent(current.instanceName)}`,
    {
      method: 'GET',
      headers: { apikey: EVOLUTION_KEY! },
      cache: 'no-store',
    },
  )

  const text = await res.text()
  if (!res.ok) {
    return upsertConnection({
      trainerId,
      instanceName: current.instanceName,
      instanceId: current.instanceId,
      status: 'error',
      phoneNumber: current.phoneNumber,
      displayName: current.displayName,
      lastError: `Failed to fetch QR: ${res.status} ${text.slice(0, 200)}`,
    })
  }

  const data = JSON.parse(text) as {
    base64?: string
    code?: string
    pairingCode?: string
  }

  return upsertConnection({
    trainerId,
    instanceName: current.instanceName,
    instanceId: current.instanceId,
    status: 'pairing',
    phoneNumber: current.phoneNumber,
    displayName: current.displayName,
    qrCode: data.base64 ?? current.qrCode,
    pairingCode: data.pairingCode,
    lastError: undefined,
  })
}

export async function fetchWhatsAppConnectionStatus(trainerId: string): Promise<WhatsAppConnection> {
  const configError = requireEvolutionConfig()
  if (configError) throw new Error(configError)

  const current = await getTrainerWhatsAppConnection(trainerId)
  if (!current) {
    return upsertConnection({
      trainerId,
      instanceName: instanceNameForTrainer(trainerId),
      status: 'not_connected',
    })
  }

  const instancesRes = await fetch(`${EVOLUTION_URL}/instance/fetchInstances`, {
    method: 'GET',
    headers: { apikey: EVOLUTION_KEY! },
    cache: 'no-store',
  })

  const instancesText = await instancesRes.text()
  if (!instancesRes.ok) {
    return upsertConnection({
      trainerId,
      instanceName: current.instanceName,
      instanceId: current.instanceId,
      status: 'error',
      phoneNumber: current.phoneNumber,
      displayName: current.displayName,
      qrCode: current.qrCode,
      pairingCode: current.pairingCode,
      lastError: `Failed to fetch instances: ${instancesRes.status} ${instancesText.slice(0, 200)}`,
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let instances: any[] = []
  try {
    instances = JSON.parse(instancesText)
  } catch {
    instances = []
  }

  const matched = instances.find(instance => instance?.name === current.instanceName)
  if (matched) {
    const status = toStatus(matched?.connectionStatus)
    return upsertConnection({
      trainerId,
      instanceName: current.instanceName,
      instanceId: matched?.id ?? matched?.Setting?.instanceId ?? current.instanceId,
      status,
      phoneNumber: matched?.number ?? current.phoneNumber,
      displayName: matched?.profileName ?? current.displayName,
      qrCode: status === 'connected' ? undefined : current.qrCode,
      pairingCode: status === 'connected' ? undefined : current.pairingCode,
      lastError: undefined,
      lastConnectedAt: status === 'connected' ? new Date() : undefined,
      lastDisconnectedAt: status === 'disconnected' ? new Date() : undefined,
    })
  }

  const res = await fetch(
    `${EVOLUTION_URL}/instance/connectionState/${encodeURIComponent(current.instanceName)}`,
    {
      method: 'GET',
      headers: { apikey: EVOLUTION_KEY! },
      cache: 'no-store',
    },
  )

  const text = await res.text()
  if (!res.ok) {
    return upsertConnection({
      trainerId,
      instanceName: current.instanceName,
      instanceId: current.instanceId,
      status: 'error',
      phoneNumber: current.phoneNumber,
      displayName: current.displayName,
      qrCode: current.qrCode,
      pairingCode: current.pairingCode,
      lastError: `Failed to fetch status: ${res.status} ${text.slice(0, 200)}`,
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payload: any = {}
  try {
    payload = JSON.parse(text)
  } catch {
    payload = {}
  }

  const state = payload?.instance?.state ?? payload?.state ?? payload?.status
  const status = toStatus(state)

  return upsertConnection({
    trainerId,
    instanceName: current.instanceName,
    instanceId: current.instanceId,
    status,
    phoneNumber: current.phoneNumber,
    displayName: current.displayName,
    qrCode: status === 'connected' ? undefined : current.qrCode,
    pairingCode: status === 'connected' ? undefined : current.pairingCode,
    lastError: undefined,
    lastConnectedAt: status === 'connected' ? new Date() : undefined,
    lastDisconnectedAt: status === 'disconnected' ? new Date() : undefined,
  })
}

export async function disconnectWhatsAppInstance(trainerId: string): Promise<WhatsAppConnection> {
  const configError = requireEvolutionConfig()
  if (configError) throw new Error(configError)

  const current = await getTrainerWhatsAppConnection(trainerId)
  if (!current) {
    return upsertConnection({
      trainerId,
      instanceName: instanceNameForTrainer(trainerId),
      status: 'not_connected',
    })
  }

  const endpoints = [
    `${EVOLUTION_URL}/instance/logout/${encodeURIComponent(current.instanceName)}`,
    `${EVOLUTION_URL}/instance/delete/${encodeURIComponent(current.instanceName)}`,
  ]

  for (const endpoint of endpoints) {
    try {
      await fetch(endpoint, {
        method: 'DELETE',
        headers: { apikey: EVOLUTION_KEY! },
        cache: 'no-store',
      })
    } catch {
      // best effort
    }
  }

  return upsertConnection({
    trainerId,
    instanceName: current.instanceName,
    instanceId: current.instanceId,
    status: 'disconnected',
    phoneNumber: undefined,
    displayName: undefined,
    qrCode: undefined,
    pairingCode: undefined,
    lastDisconnectedAt: new Date(),
  })
}

export async function replaceWhatsAppInstance(trainerId: string): Promise<WhatsAppConnection> {
  await disconnectWhatsAppInstance(trainerId)
  return createTrainerWhatsAppInstance(trainerId)
}

async function attemptSend(
  params: SendMessageParams,
  instanceName: string,
  attempt: number,
): Promise<SendMessageResult> {
  if (!EVOLUTION_URL || !EVOLUTION_KEY) return { success: false, error: 'WhatsApp not configured' }

  const phone = normalizePhone(params.phone)
  if (!phone) return { success: false, error: 'Client phone number is missing or invalid.' }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    console.log('[evolution] send attempt', { attempt, phone, instanceName, clientId: params.clientId })

    const res = await fetch(
      `${EVOLUTION_URL}/message/sendText/${encodeURIComponent(instanceName)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: EVOLUTION_KEY,
        },
        body: JSON.stringify({ number: phone, text: params.body }),
        cache: 'no-store',
        signal: controller.signal,
      },
    )

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error('[evolution] http error', { attempt, status: res.status, detail })
      return { success: false, error: `WhatsApp send failed: ${res.status}` }
    }

    let data: { key?: { id?: string } }
    try {
      data = (await res.json()) as { key?: { id?: string } }
    } catch {
      return { success: false, error: 'Invalid response from WhatsApp API' }
    }

    return { success: true, messageId: data.key?.id }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { success: false, error: 'WhatsApp send timed out' }
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error contacting WhatsApp API',
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function sendWhatsAppMessage(params: SendMessageParams): Promise<SendMessageResult> {
  const connection = await getTrainerWhatsAppConnection(params.trainerId)
  if (!connection || connection.status !== 'connected') {
    return { success: false, error: 'WhatsApp not connected for this trainer' }
  }

  const first = await attemptSend(params, connection.instanceName, 1)
  if (first.success) return first

  await new Promise(resolve => setTimeout(resolve, 2000))
  return attemptSend(params, connection.instanceName, 2)
}
