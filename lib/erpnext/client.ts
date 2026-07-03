/**
 * ERPNext integration layer — server-side only.
 *
 * All ERP calls are proxied through the Control Plane (cp-api).
 * FitDesk never holds direct ERP credentials — it signs a short-lived
 * tenant JWT and forwards requests via the CP proxy.
 *
 * Data flow:
 *   FitDesk server → CP /api/erp/doctype/:type → Frappe REST
 *                  ← normalised app types        ←
 */

import { SignJWT } from 'jose'

import type {
  Client,
  ClientStatus,
  Invoice,
  InvoiceStatus,
  Payment,
  Session,
  SessionStatus,
} from '@/types'
import type { PaymentProvider } from '@/lib/whish'
import type { BillingMode } from '@/types/clients'

import { getTenantContext } from '@/lib/tenant/context'

import type {
  CreateClientPayload,
  CreateInvoicePayload,
  CreatePaymentEntryPayload,
  CreateSessionPayload,
  CreateTrainerPayload,
  ERPDocResponse,
  ERPInvoice,
  ERPListResponse,
  ERPPaymentEntry,
  ERPSession,
  ERPTrainerSettings,
  UpdateClientPayload,
} from './types'

// ─── DocType constants ─────────────────────────────────────────────────────────
// Only DocTypes that actually exist in the ERP instance.

const DOCTYPE = {
  CLIENT:  'Customer',       // standard Frappe DocType
  INVOICE: 'Sales Invoice',  // standard Frappe — do not change
  PAYMENT: 'Payment Entry',  // standard Frappe — do not change
  /** FitDesk singleton from fitdesk-app. Doctype name = singleton record name. */
  TRAINER_SETTINGS: 'FitDesk Trainer Settings',
} as const

// ─── Local Customer shape ──────────────────────────────────────────────────────
// Frappe Customer has different fields from the old custom Client DocType.

interface ERPCustomer {
  name:                         string
  customer_name:                string
  mobile_no?:                   string
  disabled?:                    0 | 1
  email_id?:                    string
  custom_fitness_goals?:        string
  custom_trainer_notes?:        string
  custom_billing_mode?:         string
  custom_default_session_rate?: number
  creation:                     string
}

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

// ─── JWT helper ───────────────────────────────────────────────────────────────

async function signTenantJwt(tenantId: string): Promise<string> {
  const rawSecret = process.env.FITDESK_JWT_SECRET
  if (!rawSecret) {
    throw new ERPNextError(
      503, 'Not Configured', '',
      'Set FITDESK_JWT_SECRET in your environment to enable ERP proxy calls.',
    )
  }
  const secret = new TextEncoder().encode(rawSecret)
  return new SignJWT({ tenantId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret)
}

// ─── Base HTTP wrapper ────────────────────────────────────────────────────────

type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

interface FetchOptions {
  method?: HTTPMethod
  body?: unknown
  params?: Record<string, string>
}

/**
 * Authenticated HTTP wrapper — proxies all ERP calls through the Control Plane.
 *
 * Path translation:
 *   /api/resource/* → /api/erp/doctype/*
 *   /api/method/*   → /api/erp/method/*
 */
export async function erpFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const cpUrl = process.env.CONTROL_PLANE_URL
  if (!cpUrl) {
    throw new ERPNextError(
      503, 'Not Configured', path,
      'Set CONTROL_PLANE_URL in your environment.',
    )
  }

  const tenantCtx = await getTenantContext()
  if (!tenantCtx?.tenantId) {
    throw new ERPNextError(
      503, 'No Tenant', path,
      'No active provisioned workspace for this user.',
    )
  }

  const token = await signTenantJwt(tenantCtx.tenantId)

  const cpPath = path
    .replace('/api/resource/', '/api/erp/doctype/')
    .replace('/api/method/', '/api/erp/method/')

  const { method = 'GET', body, params } = opts

  let url = `${cpUrl}${cpPath}`
  if (params && Object.keys(params).length > 0) {
    const qs = new URLSearchParams(params).toString()
    url = `${url}${url.includes('?') ? '&' : '?'}${qs}`
  }

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new ERPNextError(res.status, res.statusText, cpPath, detail)
  }

  return res.json() as Promise<T>
}

// ─── Status mappers ───────────────────────────────────────────────────────────

function mapBillingMode(raw: string | undefined): 'package' | 'pay_per_session' | 'unset' {
  if (raw === 'Package') return 'package'
  if (raw === 'Pay Per Session') return 'pay_per_session'
  return 'unset'
}

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
    Draft:                'draft',
    Unpaid:               'sent',
    Submitted:            'sent',
    Overdue:              'overdue',
    'Partly Paid':        'partially_paid',
    Paid:                 'paid',
    Cancelled:            'cancelled',
    Return:               'cancelled',
    'Credit Note Issued': 'cancelled',
  }
  return map[s] ?? 'draft'
}

function mapPaymentProvider(modeOfPayment: string): PaymentProvider {
  const lower = modeOfPayment.toLowerCase()
  if (lower.includes('whish'))                          return 'whish'
  if (lower.includes('bank') || lower.includes('wire')) return 'bank_transfer'
  return 'cash'
}

// ─── Normalizers ─────────────────────────────────────────────────────────────

export function normalizeClient(raw: ERPCustomer): Client {
  const full = raw.customer_name ?? ''
  const lastSpace = full.lastIndexOf(' ')
  const firstName = lastSpace > 0 ? full.slice(0, lastSpace) : full
  const lastName  = lastSpace > 0 ? full.slice(lastSpace + 1) : undefined
  const defaultSessionRate =
    typeof raw.custom_default_session_rate === 'number' && raw.custom_default_session_rate > 0
      ? raw.custom_default_session_rate
      : undefined
  return {
    id:                 raw.name,
    firstName,
    lastName,
    name:               full,
    email:              raw.email_id ?? undefined,
    phone:              raw.mobile_no ?? '',
    status:             raw.disabled === 1 ? 'inactive' : 'active',
    trainerId:          '',
    sessionCount:       0,
    goal:               raw.custom_fitness_goals,
    notes:              raw.custom_trainer_notes,
    createdAt:          raw.creation,
    billingMode:        mapBillingMode(raw.custom_billing_mode),
    defaultSessionRate,
  }
}

function normalizeSession(raw: ERPSession): Session {
  const [datePart, timePart] = raw.session_date.includes('T')
    ? [raw.session_date.split('T')[0], raw.session_date.split('T')[1]?.slice(0, 5)]
    : [raw.session_date, raw.session_time?.slice(0, 5)]

  return {
    id:              raw.name,
    clientId:        raw.client,
    clientName:      raw.client_name ?? raw.client,
    trainerId:       raw.trainer,
    date:            datePart,
    time:            timePart,
    durationMinutes: raw.duration,
    sessionFee:      raw.session_fee,
    status:          mapSessionStatus(raw.status),
    notes:           raw.notes,
    createdAt:       raw.creation,
  }
}

function normalizeInvoice(raw: ERPInvoice): Invoice {
  return {
    id:                raw.name,
    clientId:          raw.customer,
    clientName:        raw.customer_name ?? raw.customer,
    trainerId:         '',
    amount:            raw.grand_total,
    outstandingAmount: raw.outstanding_amount,
    currency:          raw.currency ?? 'USD',
    status:            mapInvoiceStatus(raw.status),
    dueDate:           raw.due_date,
    issuedAt:          raw.posting_date,
  }
}

function normalizePayment(raw: ERPPaymentEntry, invoiceId: string): Payment {
  return {
    id:        raw.name,
    invoiceId,
    clientId:  raw.party,
    trainerId: '',
    amount:    raw.paid_amount,
    currency:  raw.currency ?? 'USD',
    provider:  mapPaymentProvider(raw.mode_of_payment),
    reference: raw.reference_no,
    note:      raw.remarks,
    paidAt:    raw.payment_date,
  }
}

// ─── Field list helpers ───────────────────────────────────────────────────────

function clientFields(): string {
  return JSON.stringify([
    'name', 'customer_name', 'mobile_no', 'disabled',
    'custom_fitness_goals', 'custom_trainer_notes', 'creation',
    'custom_billing_mode', 'custom_default_session_rate',
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
    'status', 'remarks', 'custom_fd_session', 'creation',
  ])
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

// ── Trainers ──────────────────────────────────────────────────────────────────

/** Trainer management is handled by workspace provisioning — not supported here. */
export async function createTrainer(_payload: CreateTrainerPayload): Promise<string> {
  throw new ERPNextError(
    503, 'Not Implemented', '/api/erp/doctype/Trainer',
    'Trainer management is handled by workspace provisioning.',
  )
}

// ── Clients (Customers) ───────────────────────────────────────────────────────

/**
 * Fetch all active customers for this workspace.
 * trainerId is accepted for API compatibility but ignored — this ERP tenant
 * belongs to a single trainer, so all non-disabled Customers are theirs.
 */
export async function getClients(_trainerId: string): Promise<Client[]> {
  const params: Record<string, string> = {
    fields:   clientFields(),
    filters:  JSON.stringify([['disabled', '=', 0]]),
    order_by: 'creation desc',
  }

  const res = await erpFetch<ERPListResponse<ERPCustomer>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.CLIENT)}`,
    { params },
  )
  return res.data.map(normalizeClient)
}

/**
 * Read the ERP Customer billing mode without changing the shared Client shape.
 *
 * ERP Customer is canonical; this helper is used only to repair the local
 * client_index billingMode projection when local state is still unset.
 */
export async function getCustomerBillingMode(
  erpCustomerId: string,
): Promise<Exclude<BillingMode, 'unset'> | null> {
  const res = await erpFetch<ERPDocResponse<Pick<ERPCustomer, 'custom_billing_mode'>>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.CLIENT)}/${encodeURIComponent(erpCustomerId)}`,
    { params: { fields: JSON.stringify(['custom_billing_mode']) } },
  )

  switch (res.data.custom_billing_mode) {
    case 'Package':
      return 'package'
    case 'Pay Per Session':
      return 'pay_per_session'
    default:
      return null
  }
}

/**
 * Fetch a single customer by ERPNext docname.
 * trainerId is accepted for API compatibility — ownership is implicit in the
 * single-tenant ERP model (all Customers belong to this workspace's trainer).
 */
export async function getClientById(id: string, _trainerId: string): Promise<Client> {
  const res = await erpFetch<ERPDocResponse<ERPCustomer>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.CLIENT)}/${encodeURIComponent(id)}`,
  )
  return normalizeClient(res.data)
}

/** Create a new Customer in ERPNext. */
export async function createClient(payload: CreateClientPayload): Promise<Client> {
  const res = await erpFetch<ERPDocResponse<ERPCustomer>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.CLIENT)}`,
    { method: 'POST', body: payload },
  )
  return normalizeClient(res.data)
}

/** Partially update a Customer. */
export async function updateClient(id: string, payload: UpdateClientPayload, _trainerId: string): Promise<Client> {
  const res = await erpFetch<ERPDocResponse<ERPCustomer>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.CLIENT)}/${encodeURIComponent(id)}`,
    { method: 'PUT', body: payload },
  )
  return normalizeClient(res.data)
}

// ── Sessions ──────────────────────────────────────────────────────────────────
// The PT Session DocType does not exist in this ERP instance.
// Session scheduling uses the custom scheduling service.

/** Returns an empty list — PT Session DocType is not available in this ERP. */
export async function getSessions(_opts: {
  trainerId: string
  clientId?:  string
  status?:    string
}): Promise<Session[]> {
  return []
}

/** Throws not-found — PT Session DocType is not available in this ERP. */
export async function getSessionById(_id: string, _trainerId: string): Promise<Session> {
  throw new ERPNextError(
    404, 'Not Found', `/api/resource/PT Session/${_id}`,
    'Session DocType is not available in this workspace.',
  )
}

/** Throws not-implemented — PT Session DocType is not available in this ERP. */
export async function createSession(_payload: CreateSessionPayload): Promise<Session> {
  throw new ERPNextError(
    503, 'Not Implemented', '/api/resource/PT Session',
    'Session management is not available in this workspace.',
  )
}

export async function markSessionComplete(_sessionId: string, _notes?: string): Promise<Session> {
  throw new ERPNextError(
    503, 'Not Implemented', `/api/resource/PT Session/${_sessionId}`,
    'Session management is not available in this workspace.',
  )
}

export async function cancelSession(_sessionId: string): Promise<Session> {
  throw new ERPNextError(
    503, 'Not Implemented', `/api/resource/PT Session/${_sessionId}`,
    'Session management is not available in this workspace.',
  )
}

export async function markSessionMissed(_sessionId: string): Promise<Session> {
  throw new ERPNextError(
    503, 'Not Implemented', `/api/resource/PT Session/${_sessionId}`,
    'Session management is not available in this workspace.',
  )
}

// ── Invoices ──────────────────────────────────────────────────────────────────

/**
 * Fetch invoices, optionally scoped by client or status.
 * When trainerId is provided without clientId, fetches all customers first
 * and queries invoices for them (with fallback if `in` operator unsupported).
 */
export async function getInvoices(opts: {
  clientId?:  string
  trainerId?: string
  status?:    string
} = {}): Promise<Invoice[]> {
  const filters: [string, string, unknown][] = []
  if (opts.clientId) filters.push(['customer', '=', opts.clientId])
  if (opts.status)   filters.push(['status', '=', opts.status])

  let attemptedCustomerIn = false
  let customerIdsForFallback: string[] | null = null

  if (!opts.clientId && opts.trainerId) {
    const clients = await getClients(opts.trainerId)
    const customerIds = clients.map(c => c.id)
    if (customerIds.length === 0) return []

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
      fields:  invoiceFields(),
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
      const msg = `${err.statusText} ${err.detail}`.toLowerCase()
      const looksLikeInUnsupported = err.status === 400 && msg.includes('in')
      if (looksLikeInUnsupported) {
        const lists = await Promise.all(
          customerIdsForFallback.map(customerId => fetchInvoicesForCustomer(customerId)),
        )
        const merged = lists.flat()
        merged.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
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

/**
 * Fetch a single invoice, verifying it is accessible for the given trainer.
 * In the single-tenant proxy model every invoice in this ERP tenant belongs to
 * this workspace's trainer, so the lookup itself is the access gate.
 */
export async function getInvoiceByIdForTrainer(id: string, _trainerId: string): Promise<Invoice> {
  return getInvoiceById(id)
}

/**
 * Find the Sales Invoice whose custom_fd_session equals the given FD Session docname.
 * Returns the first match or null when no invoice has been issued for this session yet.
 * Used as the pre-create idempotency check in the pay-per-session completion flow.
 */
export async function findInvoiceBySession(fdSessionDocname: string): Promise<Invoice | null> {
  const params: Record<string, string> = {
    fields:  invoiceFields(),
    filters: JSON.stringify([['custom_fd_session', '=', fdSessionDocname]]),
    limit:   '1',
  }
  const res = await erpFetch<ERPListResponse<ERPInvoice>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.INVOICE)}`,
    { params },
  )
  const first = res.data[0]
  return first ? normalizeInvoice(first) : null
}

/** Create a new Sales Invoice in ERPNext (saved as draft). */
export async function createInvoice(payload: CreateInvoicePayload): Promise<Invoice> {
  const res = await erpFetch<ERPDocResponse<ERPInvoice>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.INVOICE)}`,
    { method: 'POST', body: payload },
  )
  return normalizeInvoice(res.data)
}

/** Record a payment for an invoice by creating a Payment Entry. */
export async function markInvoicePaid(opts: {
  invoiceId:    string
  clientId:     string
  amount:       number
  modeOfPayment: string
  date:         string
  reference?:   string
  note?:        string
}): Promise<Payment> {
  const payload: CreatePaymentEntryPayload = {
    payment_type:    'Receive',
    party_type:      'Customer',
    party:            opts.clientId,
    paid_amount:      opts.amount,
    payment_date:     opts.date,
    mode_of_payment:  opts.modeOfPayment,
    reference_no:     opts.reference,
    remarks:          opts.note,
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

// ── ERP write primitives ──────────────────────────────────────────────────────

/**
 * Clamp due_date to be >= posting_date.
 * Prevents ERPNext validation errors from UTC/timezone drift between draft
 * creation and submit time.
 */
export function clampDueDate(postingDate: string, dueDate: string): string {
  return dueDate < postingDate ? postingDate : dueDate
}

/**
 * Submit a draft Sales Invoice so it becomes payable.
 * Uses frappe.client.submit (whitelisted method) which expects the full doc.
 * Returns the invoice re-fetched in its post-submit state.
 */
export async function submitSalesInvoice(invoiceId: string): Promise<Invoice> {
  const docRes = await erpFetch<ERPDocResponse<ERPInvoice>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.INVOICE)}/${encodeURIComponent(invoiceId)}`,
  )

  const doc = docRes.data
  doc.set_posting_time = 1
  doc.due_date = clampDueDate(doc.posting_date, doc.due_date)

  const res = await erpFetch<{ message?: ERPInvoice }>(
    '/api/method/frappe.client.submit',
    { method: 'POST', body: { doc } },
  )
  if (!res.message) {
    throw new ERPNextError(
      502, 'Bad Gateway', '/api/method/frappe.client.submit',
      `Submit returned no document for Sales Invoice ${invoiceId}.`,
    )
  }

  return getInvoiceById(invoiceId)
}

/** Fetch the full raw Payment Entry document by docname. */
export async function getPaymentEntry(paymentEntryId: string): Promise<ERPPaymentEntry> {
  const res = await erpFetch<ERPDocResponse<ERPPaymentEntry>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.PAYMENT)}/${encodeURIComponent(paymentEntryId)}`,
  )
  return res.data
}

/**
 * Submit a draft Payment Entry so ERPNext reconciles it against its linked
 * Sales Invoice. Uses frappe.client.submit (whitelisted method).
 */
export async function submitPaymentEntry(paymentEntryId: string): Promise<ERPPaymentEntry> {
  const doc = await getPaymentEntry(paymentEntryId)
  const res = await erpFetch<{ message?: ERPPaymentEntry }>(
    '/api/method/frappe.client.submit',
    { method: 'POST', body: { doc } },
  )
  if (!res.message) {
    throw new ERPNextError(
      502, 'Bad Gateway', '/api/method/frappe.client.submit',
      `Submit returned no document for Payment Entry ${paymentEntryId}.`,
    )
  }
  return res.message
}

/**
 * Record a payment for an invoice: create Payment Entry, submit it, re-fetch
 * the invoice. A draft entry has no accounting effect — submission is required.
 * The re-fetched invoice is returned so the caller can verify the outstanding
 * amount actually decreased.
 */
export async function createAndSubmitPaymentEntry(opts: {
  invoiceId:     string
  clientId:      string
  amount:        number
  modeOfPayment: string
  date:          string
  reference?:    string
  note?:         string
}): Promise<{ payment: Payment; invoice: Invoice }> {
  // Step 1: fetch invoice to get company (required by Frappe Payment Entry).
  const invRes = await erpFetch<ERPDocResponse<{ company?: string }>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.INVOICE)}/${encodeURIComponent(opts.invoiceId)}`,
    { params: { fields: JSON.stringify(['company']) } },
  )
  const company = invRes.data.company ?? ''

  // Step 2: resolve paid_to account from Mode of Payment — Frappe requires it.
  let paidTo: string | undefined
  try {
    const mopRes = await erpFetch<ERPDocResponse<{
      accounts?: Array<{ company?: string; default_account?: string }>
    }>>(
      `/api/resource/Mode%20of%20Payment/${encodeURIComponent(opts.modeOfPayment)}`,
    )
    const accounts = mopRes.data.accounts ?? []
    const match = accounts.find(a => a.company === company) ?? accounts[0]
    paidTo = match?.default_account
  } catch {
    // MoP not found / no accounts — handled by the explicit check below.
  }
  if (!paidTo) {
    throw new ERPNextError(
      503, 'Payment Account Missing',
      `/api/resource/Mode of Payment/${opts.modeOfPayment}`,
      `No deposit account is configured for payment method "${opts.modeOfPayment}". `
        + 'Set its account in ERPNext before recording payments.',
    )
  }

  // Step 3: create the Payment Entry draft.
  const payload: CreatePaymentEntryPayload & {
    company:         string
    received_amount: number
    paid_to:         string
  } = {
    payment_type:    'Receive',
    party_type:      'Customer',
    party:            opts.clientId,
    company,
    paid_amount:      opts.amount,
    received_amount:  opts.amount,
    payment_date:     opts.date,
    mode_of_payment:  opts.modeOfPayment,
    paid_to:          paidTo,
    reference_no:     opts.reference,
    remarks:          opts.note,
    references: [
      {
        reference_doctype: 'Sales Invoice',
        reference_name:    opts.invoiceId,
        allocated_amount:  opts.amount,
      },
    ],
  }
  const createRes = await erpFetch<ERPDocResponse<ERPPaymentEntry>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.PAYMENT)}`,
    { method: 'POST', body: payload },
  )

  // Step 4: submit the Payment Entry so ERPNext reconciles the invoice.
  const submitted = await submitPaymentEntry(createRes.data.name)

  // Step 5: re-fetch the Sales Invoice — its post-submit state is the only
  // trustworthy signal that the payment was applied.
  const invoice = await getInvoiceById(opts.invoiceId)

  return { payment: normalizePayment(submitted, opts.invoiceId), invoice }
}

// ── Trainer Settings (singleton) ──────────────────────────────────────────────

/**
 * Fetch the FitDesk Trainer Settings singleton document.
 *
 * The doctype name and the singleton record name are identical for
 * Frappe singletons. Returns the raw shape — callers normalize.
 */
export async function getTrainerSettingsDoc(): Promise<ERPTrainerSettings> {
  const res = await erpFetch<ERPDocResponse<ERPTrainerSettings>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.TRAINER_SETTINGS)}/${encodeURIComponent(DOCTYPE.TRAINER_SETTINGS)}`,
  )
  return res.data
}

/**
 * Update the FitDesk Trainer Settings singleton with a partial payload.
 * Only fields supplied will be changed. Returns the saved doc.
 */
export async function updateTrainerSettingsDoc(
  payload: Partial<ERPTrainerSettings>,
): Promise<ERPTrainerSettings> {
  const res = await erpFetch<ERPDocResponse<ERPTrainerSettings>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.TRAINER_SETTINGS)}/${encodeURIComponent(DOCTYPE.TRAINER_SETTINGS)}`,
    { method: 'PUT', body: payload },
  )
  return res.data
}

// Keep these in scope so their imports are used.
void normalizeSession
void sessionFields
void mapClientStatus
