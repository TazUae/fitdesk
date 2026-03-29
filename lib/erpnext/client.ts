/**
 * ERPNext integration layer — server-side only.
 *
 * This module is the ONLY place that communicates with ERPNext.
 * It owns the full request / response cycle:
 *   1. Build authenticated HTTP request
 *   2. Parse raw ERPNext response
 *   3. Normalize to app-level domain types
 *   4. Return typed app objects to callers (actions, server components)
 *
 * Nothing outside this file should import ERPNext raw types or handle
 * ERPNext field names. All normalization happens here.
 */

import type {
  Client,
  ClientStatus,
  Invoice,
  InvoiceStatus,
  Payment,
  PaymentProvider,
  Session,
  SessionStatus,
} from '@/types'

import type {
  CreateClientPayload,
  CreateInvoicePayload,
  CreatePaymentEntryPayload,
  CreateSessionPayload,
  CreateTrainerPayload,
  ERPClient,
  ERPDocResponse,
  ERPInvoice,
  ERPListResponse,
  ERPPaymentEntry,
  ERPSession,
  ERPTrainer,
  UpdateClientPayload,
} from './types'

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * ERPNext DocType names used in REST API paths.
 *
 * Standard Frappe doctypes (Sales Invoice, Payment Entry) are fixed.
 * Custom FitDesk doctypes — confirm these against your ERPNext instance
 * before going live and update if you've named them differently.
 */
const DOCTYPE = {
  /** Custom DocType — e.g. "Client", "Customer", or "Contact". */
  CLIENT: 'Client',
  /**
   * Custom DocType for training sessions.
   * TODO: confirm name in your ERPNext instance (e.g. "PT Session").
   */
  SESSION: 'PT Session',
  /** Standard Frappe — do not change. */
  INVOICE: 'Sales Invoice',
  /** Standard Frappe — do not change. */
  PAYMENT: 'Payment Entry',
  /**
   * Custom DocType for trainer records.
   * TODO: confirm name in your ERPNext instance (e.g. "Trainer").
   */
  TRAINER: 'Trainer',
} as const

// ─── Environment ──────────────────────────────────────────────────────────────

const BASE_URL   = process.env.ERPNEXT_BASE_URL
const API_KEY    = process.env.ERPNEXT_API_KEY
const API_SECRET = process.env.ERPNEXT_API_SECRET

// ─── Error class ─────────────────────────────────────────────────────────────

export class ERPNextError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly path: string,
    public readonly detail: string = '',
  ) {
    super(`ERPNext ${status} ${statusText} → ${path}${detail ? ': ' + detail : ''}`)
    this.name = 'ERPNextError'
  }
}

// ─── Base HTTP wrapper ────────────────────────────────────────────────────────

type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

interface FetchOptions {
  method?: HTTPMethod
  /** Request body — serialised as JSON. */
  body?: unknown
  /** Extra query-string parameters appended to path. */
  params?: Record<string, string>
}

/**
 * Authenticated HTTP wrapper for all ERPNext REST calls.
 *
 * - Always server-side (no NEXT_PUBLIC_ env vars are used)
 * - Throws ERPNextError on non-2xx responses
 * - Never caches financial data (cache: 'no-store')
 */
async function erpFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  if (!BASE_URL || !API_KEY || !API_SECRET) {
    throw new ERPNextError(
      503, 'Not Configured', path,
      'Set ERPNEXT_BASE_URL, ERPNEXT_API_KEY, and ERPNEXT_API_SECRET in your environment.',
    )
  }

  const { method = 'GET', body, params } = opts

  let url = `${BASE_URL}${path}`
  if (params && Object.keys(params).length > 0) {
    const qs = new URLSearchParams(params).toString()
    url = `${url}${url.includes('?') ? '&' : '?'}${qs}`
  }

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `token ${API_KEY}:${API_SECRET}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new ERPNextError(res.status, res.statusText, path, detail)
  }

  return res.json() as Promise<T>
}

// ─── Status mappers ───────────────────────────────────────────────────────────
// ERPNext uses PascalCase status values; app types use lowercase.

function mapClientStatus(s: string): ClientStatus {
  const map: Record<string, ClientStatus> = {
    Active:   'active',
    Inactive: 'inactive',
    Paused:   'paused',
  }
  return map[s] ?? 'active'
}

function mapSessionStatus(s: string): SessionStatus {
  const map: Record<string, SessionStatus> = {
    Scheduled: 'scheduled',
    Completed: 'completed',
    Missed:    'missed',
    Cancelled: 'cancelled',
  }
  return map[s] ?? 'scheduled'
}

function mapInvoiceStatus(s: string): InvoiceStatus {
  const map: Record<string, InvoiceStatus> = {
    Draft:     'draft',
    Submitted: 'sent',
    Paid:      'paid',
    Overdue:   'overdue',
    Cancelled: 'cancelled',
  }
  return map[s] ?? 'draft'
}

function mapPaymentProvider(modeOfPayment: string): PaymentProvider {
  const lower = modeOfPayment.toLowerCase()
  if (lower.includes('whish'))                       return 'whish'
  if (lower.includes('bank') || lower.includes('wire')) return 'bank_transfer'
  return 'cash'
}

// ─── Normalizers ─────────────────────────────────────────────────────────────
// Convert raw ERP shapes → typed app domain objects.
// Private to this module — callers receive app types only.

function normalizeClient(raw: ERPClient): Client {
  const name = raw.full_name
    ?? [raw.first_name, raw.last_name].filter(Boolean).join(' ')
  return {
    id: raw.name,
    firstName: raw.first_name,
    lastName: raw.last_name,
    name,
    email: raw.email_id ?? undefined,
    phone: raw.mobile_no ?? '',
    status: mapClientStatus(raw.status),
    trainerId: raw.trainer,
    sessionCount: raw.total_sessions ?? 0,
    goal: raw.goal,
    notes: raw.notes,
    createdAt: raw.creation,
  }
}

function normalizeSession(raw: ERPSession): Session {
  const [datePart, timePart] = raw.session_date.includes('T')
    ? [raw.session_date.split('T')[0], raw.session_date.split('T')[1]?.slice(0, 5)]
    : [raw.session_date, raw.session_time?.slice(0, 5)]

  return {
    id: raw.name,
    clientId: raw.client,
    clientName: raw.client_name ?? raw.client,
    trainerId: raw.trainer,
    date: datePart,
    time: timePart,
    durationMinutes: raw.duration,
    sessionFee: raw.session_fee,
    status: mapSessionStatus(raw.status),
    notes: raw.notes,
    createdAt: raw.creation,
  }
}

function normalizeInvoice(raw: ERPInvoice): Invoice {
  return {
    id: raw.name,
    clientId: raw.customer,
    clientName: raw.customer_name ?? raw.customer,
    trainerId: '',          // resolved from session context by callers
    amount: raw.grand_total,
    outstandingAmount: raw.outstanding_amount,
    currency: raw.currency ?? 'USD',
    status: mapInvoiceStatus(raw.status),
    dueDate: raw.due_date,
    issuedAt: raw.posting_date,
  }
}

function normalizePayment(raw: ERPPaymentEntry, invoiceId: string): Payment {
  return {
    id: raw.name,
    invoiceId,
    clientId: raw.party,
    trainerId: '',          // resolved from session context by callers
    amount: raw.paid_amount,
    currency: raw.currency ?? 'USD',
    provider: mapPaymentProvider(raw.mode_of_payment),
    reference: raw.reference_no,
    note: raw.remarks,
    paidAt: raw.payment_date,
  }
}

// ─── Shared field list helpers ────────────────────────────────────────────────

function clientFields(): string {
  return JSON.stringify([
    'name', 'first_name', 'last_name', 'full_name', 'email_id',
    'mobile_no', 'status', 'trainer', 'total_sessions', 'goal', 'notes', 'creation',
  ])
}

function sessionFields(): string {
  return JSON.stringify([
    'name', 'client', 'client_name', 'trainer', 'session_date',
    'session_time', 'duration', 'session_fee', 'status', 'notes', 'creation',
  ])
}

function invoiceFields(): string {
  return JSON.stringify([
    'name', 'customer', 'customer_name', 'posting_date', 'due_date',
    'grand_total', 'outstanding_amount', 'paid_amount', 'currency',
    'status', 'remarks', 'creation',
  ])
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// All methods below are the only surface area exposed outside this module.
// ─────────────────────────────────────────────────────────────────────────────

// ── Clients ───────────────────────────────────────────────────────────────────

// ── Trainers ──────────────────────────────────────────────────────────────────

/**
 * Create a Trainer record in ERPNext and return the assigned docname.
 * Called once per user during registration to establish the auth ↔ ERP link.
 */
export async function createTrainer(payload: CreateTrainerPayload): Promise<string> {
  const res = await erpFetch<ERPDocResponse<ERPTrainer>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.TRAINER)}`,
    { method: 'POST', body: payload },
  )
  return res.data.name
}

// ── Clients ───────────────────────────────────────────────────────────────────

/**
 * Fetch all clients for a trainer.
 * trainerId is required — never fetch clients without scoping to a trainer.
 */
export async function getClients(trainerId: string): Promise<Client[]> {
  const params: Record<string, string> = {
    fields:  clientFields(),
    filters: JSON.stringify([['trainer', '=', trainerId]]),
  }

  const res = await erpFetch<ERPListResponse<ERPClient>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.CLIENT)}`,
    { params },
  )
  return res.data.map(normalizeClient)
}

/**
 * Fetch a single client by ERPNext docname.
 * Throws ERPNextError(403) if the client's trainer field does not match trainerId.
 */
export async function getClientById(id: string, trainerId: string): Promise<Client> {
  const res = await erpFetch<ERPDocResponse<ERPClient>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.CLIENT)}/${encodeURIComponent(id)}`,
  )
  const client = normalizeClient(res.data)
  if (client.trainerId !== trainerId) {
    throw new ERPNextError(403, 'Forbidden', `/api/resource/${DOCTYPE.CLIENT}/${id}`, 'Client does not belong to this trainer.')
  }
  return client
}

/** Create a new client in ERPNext. Returns the saved client. */
export async function createClient(payload: CreateClientPayload): Promise<Client> {
  const res = await erpFetch<ERPDocResponse<ERPClient>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.CLIENT)}`,
    { method: 'POST', body: payload },
  )
  return normalizeClient(res.data)
}

/**
 * Partially update a client. Only supplied fields are changed.
 * Verifies trainer ownership before mutating — throws ERPNextError(403) if not owned.
 */
export async function updateClient(id: string, payload: UpdateClientPayload, trainerId: string): Promise<Client> {
  await getClientById(id, trainerId)
  const res = await erpFetch<ERPDocResponse<ERPClient>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.CLIENT)}/${encodeURIComponent(id)}`,
    { method: 'PUT', body: payload },
  )
  return normalizeClient(res.data)
}

// ── Sessions ──────────────────────────────────────────────────────────────────

/**
 * Fetch sessions.
 * trainerId is required — always scope to the authenticated trainer.
 * Optionally narrow further by clientId or status.
 */
export async function getSessions(opts: {
  trainerId: string
  clientId?: string
  status?: string
}): Promise<Session[]> {
  const filters: [string, string, string][] = [['trainer', '=', opts.trainerId]]
  if (opts.clientId) filters.push(['client', '=', opts.clientId])
  if (opts.status)   filters.push(['status', '=', opts.status])

  const params: Record<string, string> = {
    fields:  sessionFields(),
    orderby: 'session_date desc',
  }
  if (filters.length > 0) {
    params.filters = JSON.stringify(filters)
  }

  const res = await erpFetch<ERPListResponse<ERPSession>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.SESSION)}`,
    { params },
  )
  return res.data.map(normalizeSession)
}

/** Create a new scheduled session. */
export async function createSession(payload: CreateSessionPayload): Promise<Session> {
  const res = await erpFetch<ERPDocResponse<ERPSession>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.SESSION)}`,
    { method: 'POST', body: { ...payload, status: 'Scheduled' } },
  )
  return normalizeSession(res.data)
}

/**
 * Mark a session as completed.
 * This is the trigger point for session count increment hooks in ERPNext.
 */
export async function markSessionComplete(
  sessionId: string,
  notes?: string,
): Promise<Session> {
  const body: Record<string, unknown> = { status: 'Completed' }
  if (notes) body.notes = notes

  const res = await erpFetch<ERPDocResponse<ERPSession>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.SESSION)}/${encodeURIComponent(sessionId)}`,
    { method: 'PUT', body },
  )
  return normalizeSession(res.data)
}

/** Cancel a scheduled or missed session. */
export async function cancelSession(sessionId: string): Promise<Session> {
  const res = await erpFetch<ERPDocResponse<ERPSession>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.SESSION)}/${encodeURIComponent(sessionId)}`,
    { method: 'PUT', body: { status: 'Cancelled' } },
  )
  return normalizeSession(res.data)
}

// ── Invoices ──────────────────────────────────────────────────────────────────

/**
 * Fetch invoices.
 * Pass clientId to scope to one client; pass trainerId when available to
 * restrict to the authenticated trainer's data.
 */
export async function getInvoices(opts: {
  clientId?: string
  trainerId?: string
  status?: string
} = {}): Promise<Invoice[]> {
  // We scope invoice reads to a trainer's customers to avoid leaking other
  // trainers' financial data.
  //
  // If ERPNext supports the `in` operator for REST filters we can fetch all
  // invoices in one request. Otherwise we fall back to N+1 (per-customer)
  // reads.
  const filters: [string, string, unknown][] = []
  if (opts.clientId) filters.push(['customer', '=', opts.clientId])
  if (opts.status) filters.push(['status', '=', opts.status])

  let attemptedCustomerIn = false
  let customerIdsForFallback: string[] | null = null

  if (!opts.clientId && opts.trainerId) {
    const clients = await getClients(opts.trainerId)
    const customerIds = clients.map(c => c.id)
    if (customerIds.length === 0) return []

    // Frappe supports filter format: [field, operator, value]
    // Here `value` is an array so operator must be `in`.
    filters.unshift(['customer', 'in', customerIds] as [string, string, unknown])
    attemptedCustomerIn = true
    customerIdsForFallback = customerIds
  }

  const params: Record<string, string> = {
    fields:  invoiceFields(),
    orderby: 'due_date asc',
  }
  if (filters.length > 0) params.filters = JSON.stringify(filters)

  const fetchInvoicesForCustomer = async (customerId: string): Promise<Invoice[]> => {
    const perCustomerFilters: [string, string, unknown][] = [['customer', '=', customerId]]
    if (opts.status) perCustomerFilters.push(['status', '=', opts.status])

    const perCustomerParams: Record<string, string> = {
      fields: invoiceFields(),
      orderby: 'due_date asc',
      filters: JSON.stringify(perCustomerFilters),
    }

    const res = await erpFetch<ERPListResponse<ERPInvoice>>(
      `/api/resource/${encodeURIComponent(DOCTYPE.INVOICE)}`,
      { params: perCustomerParams },
    )
    return res.data.map(normalizeInvoice)
  }

  try {
    const res = await erpFetch<ERPListResponse<ERPInvoice>>(
      `/api/resource/${encodeURIComponent(DOCTYPE.INVOICE)}`,
      { params },
    )
    return res.data.map(normalizeInvoice)
  } catch (err) {
    if (attemptedCustomerIn && customerIdsForFallback && err instanceof ERPNextError) {
      // If the `in` operator isn't supported by this ERPNext/Frappe version,
      // fall back to N+1 reads per customer.
      const msg = `${err.statusText} ${err.detail}`.toLowerCase()
      const looksLikeInUnsupported = err.status === 400 && msg.includes('in')
      if (looksLikeInUnsupported) {
        const lists = await Promise.all(
          customerIdsForFallback.map(customerId => fetchInvoicesForCustomer(customerId)),
        )
        const merged = lists.flat()
        // Ensure consistent ordering.
        merged.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        // Dedup just in case.
        return Array.from(new Map(merged.map(i => [i.id, i])).values())
      }
    }
    throw err
  }
}

/** Fetch a single invoice by ERPNext docname. */
export async function getInvoiceById(id: string): Promise<Invoice> {
  const res = await erpFetch<ERPDocResponse<ERPInvoice>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.INVOICE)}/${encodeURIComponent(id)}`,
  )
  return normalizeInvoice(res.data)
}

/** Create a new Sales Invoice in ERPNext. Returns the saved draft invoice. */
export async function createInvoice(payload: CreateInvoicePayload): Promise<Invoice> {
  const res = await erpFetch<ERPDocResponse<ERPInvoice>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.INVOICE)}`,
    { method: 'POST', body: payload },
  )
  return normalizeInvoice(res.data)
}

/**
 * Record a payment for an invoice by creating a Payment Entry in ERPNext.
 *
 * ERPNext will automatically reconcile the invoice outstanding_amount
 * and update the invoice status to "Paid" when fully allocated.
 *
 * @param invoiceId   - Sales Invoice docname (e.g. "SINV-00001")
 * @param clientId    - Customer/Client docname
 * @param amount      - Amount being paid (may be partial)
 * @param modeOfPayment - ERPNext Mode of Payment name (e.g. "Cash")
 * @param date        - Payment date as YYYY-MM-DD
 * @param reference   - External transaction ID (Whish ref, bank ref, etc.)
 */
export async function markInvoicePaid(opts: {
  invoiceId: string
  clientId: string
  amount: number
  modeOfPayment: string
  date: string
  reference?: string
  note?: string
}): Promise<Payment> {
  const payload: CreatePaymentEntryPayload = {
    payment_type: 'Receive',
    party_type:   'Customer',
    party:         opts.clientId,
    paid_amount:   opts.amount,
    payment_date:  opts.date,
    mode_of_payment: opts.modeOfPayment,
    reference_no:  opts.reference,
    remarks:       opts.note,
    references: [
      {
        reference_doctype: 'Sales Invoice',
        reference_name:    opts.invoiceId,
        allocated_amount:  opts.amount,
      },
    ],
  }

  const res = await erpFetch<ERPDocResponse<ERPPaymentEntry>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.PAYMENT)}`,
    { method: 'POST', body: payload },
  )
  return normalizePayment(res.data, opts.invoiceId)
}
