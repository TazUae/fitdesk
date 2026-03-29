/**
 * Core domain types shared across server actions, ERP adapters, and UI.
 *
 * Rules:
 *  - These are the app-level shapes. Never pass raw ERPNext fields to UI.
 *  - ERPNext normalizers in lib/erpnext/client.ts are the only code that
 *    converts from ERP shapes to these types.
 *  - Status types use lowercase strings; ERP status strings (PascalCase) are
 *    mapped in the adapter layer.
 */

// ─── Status string unions ─────────────────────────────────────────────────────

export type ClientStatus = 'active' | 'inactive' | 'paused'

export type SessionStatus = 'scheduled' | 'completed' | 'missed' | 'cancelled'

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'

export type PaymentProvider = 'whish' | 'cash' | 'bank_transfer'

/**
 * WhatsApp message categories.
 * All types require explicit trainer approval before sending.
 * invoice_send / payment_reminder are always approval-gated in MVP.
 */
export type MessageType =
  | 'invoice_send'
  | 'payment_reminder'
  | 'session_reminder'
  | 'missed_session'

// ─── Core entity interfaces ───────────────────────────────────────────────────

/**
 * A personal trainer using FitDesk.
 * id   = Better Auth user ID (primary identity)
 * erpId = ERPNext Trainer DocType name — used to scope all ERP queries
 */
export interface Trainer {
  id: string
  erpId: string
  name: string
  email: string
  phone?: string
}

/**
 * A client managed by a trainer.
 * id = ERPNext Client/Customer docname (e.g. "C-0001").
 */
export interface Client {
  id: string
  firstName: string
  lastName?: string
  /** Computed full name — use this for display. */
  name: string
  email?: string
  phone: string
  status: ClientStatus
  /** ERPNext Trainer docname this client belongs to. */
  trainerId: string
  /** Total sessions completed to date (updated by ERP). */
  sessionCount: number
  /** Client's stated fitness goal — custom ERP field, optional. */
  goal?: string
  notes?: string
  createdAt: string
}

/**
 * A PT training session.
 * id = ERPNext custom Session DocType name.
 */
export interface Session {
  id: string
  clientId: string
  /** Denormalized — avoids extra fetch when rendering lists. */
  clientName: string
  trainerId: string
  /** ISO date string — YYYY-MM-DD. */
  date: string
  /** 24-hour time string — HH:mm. Optional. */
  time?: string
  durationMinutes?: number
  /** Per-session fee — custom ERP field; undefined when not configured. */
  sessionFee?: number
  status: SessionStatus
  notes?: string
  createdAt: string
}

/**
 * A sales invoice issued to a client.
 * id = ERPNext Sales Invoice docname (e.g. "SINV-00001").
 * amount is grand_total; outstandingAmount tracks unpaid balance.
 * ERPNext is the source of truth — never store financial totals elsewhere.
 */
export interface Invoice {
  id: string
  clientId: string
  /** Denormalized — avoids extra fetch when rendering lists. */
  clientName: string
  trainerId: string
  amount: number
  outstandingAmount: number
  currency: string
  status: InvoiceStatus
  /** ISO date string — YYYY-MM-DD. */
  dueDate: string
  issuedAt: string
  paidAt?: string
}

/**
 * A payment record linked to an invoice.
 * id = ERPNext Payment Entry docname.
 */
export interface Payment {
  id: string
  invoiceId: string
  clientId: string
  trainerId: string
  amount: number
  currency: string
  provider: PaymentProvider
  /** External reference (e.g. Whish transaction ID). */
  reference?: string
  note?: string
  paidAt: string
}

/**
 * A drafted WhatsApp message pending trainer approval.
 * The body field is rendered from a template and ready to send.
 * approved must be true before sendMessage() is called.
 */
export interface MessageDraft {
  clientId: string
  clientName: string
  phone: string
  type: MessageType
  /** Fully rendered message body — shown to trainer before approval. */
  body: string
  approved: boolean
}

/**
 * Message draft categories for AI-assisted generation.
 * These are the types the trainer chooses from in the draft editor.
 */
export type DraftType = 'invoice' | 'reminder' | 'follow_up' | 'reengagement'

/**
 * A logged outgoing WhatsApp message.
 * Currently persisted to server console only.
 * TODO: write to a messages table in auth.db via Drizzle.
 */
export interface MessageLog {
  /** Set once DB persistence is wired up. */
  id?: string
  trainerId: string
  clientId: string
  /** The draft type or workflow type that generated this message. */
  messageType: string
  body: string
  status: 'sent' | 'failed'
  errorDetail?: string
  sentAt: string   // ISO-8601
  /** Evolution API message ID — for future delivery tracking. */
  evolutionMessageId?: string
}

// ─── WhatsApp connection ──────────────────────────────────────────────────────

export type WhatsAppConnectionStatus =
  | 'connected'
  | 'pairing'
  | 'disconnected'
  | 'error'
  | 'not_connected'

/**
 * Per-trainer Evolution API instance state.
 * Persisted in auth.db — not in ERPNext.
 */
export interface WhatsAppConnection {
  id: string
  trainerId: string
  instanceName: string
  instanceId?: string
  status: WhatsAppConnectionStatus
  phoneNumber?: string
  displayName?: string
  /** Base64-encoded QR image — only present while pairing. */
  qrCode?: string
  pairingCode?: string
  lastError?: string
  lastConnectedAt?: string    // ISO-8601
  lastDisconnectedAt?: string // ISO-8601
  createdAt: string
  updatedAt: string
}

// ─── Utility types ────────────────────────────────────────────────────────────

/**
 * Standard result envelope for all server actions.
 * Every action must return one of these — never throw to the UI layer.
 */
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }
