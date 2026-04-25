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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function parseUnknownJsonArray(raw: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseUnknownJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw)
    return asRecord(parsed) ?? {}
  } catch {
    return {}
  }
}

function stringFromUnknown(v: unknown): string | undefined {
  if (typeof v === 'string') return v
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return undefined
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

  // Evolution API v2 returns either flat { base64, pairingCode } or nested { qrcode: { base64, pairingCode } }
  const data = JSON.parse(text) as {
    base64?: string
    pairingCode?: string
    code?: string
    qrcode?: { base64?: string; pairingCode?: string; code?: string }
  }

  return upsertConnection({
    trainerId,
    instanceName: current.instanceName,
    instanceId: current.instanceId,
    status: 'pairing',
    phoneNumber: current.phoneNumber,
    displayName: current.displayName,
    qrCode: data.qrcode?.base64 ?? data.base64 ?? current.qrCode,
    pairingCode: data.qrcode?.pairingCode ?? data.pairingCode,
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

  const instances = parseUnknownJsonArray(instancesText)
  const matched = instances.find((row): row is Record<string, unknown> => {
    const rec = asRecord(row)
    return rec !== undefined && stringFromUnknown(rec['name']) === current.instanceName
  })
  if (matched) {
    const setting = asRecord(matched['Setting'])
    const instanceId =
      stringFromUnknown(matched['id']) ??
      stringFromUnknown(setting?.['instanceId']) ??
      current.instanceId
    const status = toStatus(stringFromUnknown(matched['connectionStatus']))
    return upsertConnection({
      trainerId,
      instanceName: current.instanceName,
      instanceId,
      status,
      phoneNumber: stringFromUnknown(matched['number']) ?? current.phoneNumber,
      displayName: stringFromUnknown(matched['profileName']) ?? current.displayName,
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

  const payload = parseUnknownJsonObject(text)
  const instanceObj = asRecord(payload['instance'])
  const stateRaw =
    instanceObj?.['state'] ?? payload['state'] ?? payload['status']
  const status = toStatus(stringFromUnknown(stateRaw))

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

/**
 * Request an 8-digit pairing code for the trainer's WhatsApp instance.
 * Creates the instance first if it doesn't exist yet.
 * The user enters this code in WhatsApp → Settings → Linked Devices → Link with phone number.
 */
export async function requestWhatsAppPairingCode(trainerId: string, phoneNumber: string): Promise<WhatsAppConnection> {
  const configError = requireEvolutionConfig()
  if (configError) throw new Error(configError)

  const phone = normalizePhone(phoneNumber)
  if (!phone || phone.length < 7) throw new Error('Invalid phone number')

  // Ensure instance exists
  let current = await getTrainerWhatsAppConnection(trainerId)
  if (!current) {
    const instanceName = instanceNameForTrainer(trainerId)
    const createRes = await fetch(`${EVOLUTION_URL}/instance/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_KEY! },
      body: JSON.stringify({ instanceName, integration: 'WHATSAPP-BAILEYS' }),
      cache: 'no-store',
    })
    const createText = await createRes.text()
    if (!createRes.ok) throw new Error(`Failed to create instance: ${createRes.status} ${createText.slice(0, 200)}`)
    const createData = JSON.parse(createText) as {
      instance?: { instanceName?: string; instanceId?: string; status?: string }
    }
    current = await upsertConnection({
      trainerId,
      instanceName: createData.instance?.instanceName ?? instanceName,
      instanceId: createData.instance?.instanceId,
      status: 'pairing',
    })
  }

  // Request pairing code by passing the phone number to the connect endpoint
  const res = await fetch(
    `${EVOLUTION_URL}/instance/connect/${encodeURIComponent(current.instanceName)}?number=${encodeURIComponent(phone)}`,
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
      lastError: `Failed to get pairing code: ${res.status} ${text.slice(0, 200)}`,
    })
  }

  const data = JSON.parse(text) as {
    pairingCode?: string
    code?: string
    base64?: string
    qrcode?: { base64?: string; pairingCode?: string }
  }

  // Pairing code is at top level; QR base64 is absent or null when a phone number was supplied
  const pairingCode = data.pairingCode ?? data.qrcode?.pairingCode

  return upsertConnection({
    trainerId,
    instanceName: current.instanceName,
    instanceId: current.instanceId,
    status: 'pairing',
    pairingCode,
    lastError: undefined,
  })
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
