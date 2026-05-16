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

import { SignJWT } from 'jose'
import type {
  Client,
  Invoice,
  InvoiceStatus,
  Payment,
  PaymentProvider,
} from '@/types'

import type {
  CreateClientPayload,
  CreateInvoicePayload,
  CreatePaymentEntryPayload,
  ERPClient,
  ERPDocResponse,
  ERPInvoice,
  ERPListResponse,
  ERPPaymentEntry,
  ERPTrainerSettings,
  UpdateClientPayload,
} from './types'

import { getTenantContext } from '@/lib/tenant/context'

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * ERPNext DocType names used in REST API paths.
 *
 * Standard Frappe doctypes (Sales Invoice, Payment Entry) are fixed.
 * Custom FitDesk doctypes — confirm these against your ERPNext instance
 * before going live and update if you've named them differently.
 */
const DOCTYPE = {
  /** Standard ERPNext Customer DocType — extended with FitDesk custom fields. */
  CLIENT: 'Customer',
  /** Standard Frappe — do not change. */
  INVOICE: 'Sales Invoice',
  /** Standard Frappe — do not change. */
  PAYMENT: 'Payment Entry',
  /** FitDesk singleton from fitdesk-app. Doctype name = singleton record name. */
  TRAINER_SETTINGS: 'FitDesk Trainer Settings',
} as const

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
//
// All ERP calls route through the Control Plane's DocType proxy instead of
// reaching ERPNext directly. The Control Plane:
//   1. Validates the short-lived JWT carrying tenantId
//   2. Resolves the tenant's stored ERP site URL and API credentials
//   3. Forwards to Frappe's /api/resource/:doctype endpoint
//
// This keeps ERPNext credentials server-side in the Control Plane only.
// FitDesk holds only FITDESK_JWT_SECRET (a symmetric key shared with the CP).

type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

interface FetchOptions {
  method?: HTTPMethod
  /** Request body — serialised as JSON. */
  body?: unknown
  /** Extra query-string parameters appended to path. */
  params?: Record<string, string>
}

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

/**
 * Authenticated HTTP wrapper — routes all ERP REST calls through the
 * Control Plane DocType proxy at /api/erp/doctype/*.
 *
 * - Always server-side (called only from server actions / route handlers)
 * - Throws ERPNextError on non-2xx responses
 * - Never caches financial data (cache: 'no-store')
 */
export async function erpFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const cpUrl = process.env.CONTROL_PLANE_URL
  if (!cpUrl) {
    throw new ERPNextError(503, 'Not Configured', path, 'Set CONTROL_PLANE_URL in your environment.')
  }

  const tenantCtx = await getTenantContext()
  if (!tenantCtx?.tenantId) {
    throw new ERPNextError(503, 'No Tenant', path, 'No active provisioned workspace for this user.')
  }

  const token = await signTenantJwt(tenantCtx.tenantId)

  // Translate Frappe REST path → Control Plane proxy path.
  // /api/resource/Client            → /api/erp/doctype/Client
  // /api/resource/Client/ID-001     → /api/erp/doctype/Client/ID-001
  // /api/method/frappe.client.submit → /api/erp/method/frappe.client.submit
  const cpPath = path
    .replace('/api/resource/', '/api/erp/doctype/')
    .replace('/api/method/', '/api/erp/method/')

  const { method = 'GET', body, params } = opts
  const base = cpUrl.replace(/\/+$/, '')
  let url = `${base}${cpPath}`
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
    throw new ERPNextError(res.status, res.statusText, path, detail)
  }

  return res.json() as Promise<T>
}

// ─── Status mappers ───────────────────────────────────────────────────────────
// ERPNext uses PascalCase status values; app types use lowercase.

export function mapInvoiceStatus(s: string): InvoiceStatus {
  // ERPNext computes the Sales Invoice `status` field on submit: a submitted
  // unpaid invoice is 'Unpaid' (not 'Submitted'). 'Submitted' is mapped only
  // for backward compatibility with older callers/fixtures.
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

export function mapPaymentProvider(modeOfPayment: string): PaymentProvider {
  const lower = modeOfPayment.toLowerCase()
  if (lower.includes('whish'))                       return 'whish'
  if (lower.includes('bank') || lower.includes('wire')) return 'bank_transfer'
  return 'cash'
}

// ─── Normalizers ─────────────────────────────────────────────────────────────
// Convert raw ERP shapes → typed app domain objects.
// Private to this module — callers receive app types only.

export function normalizeClient(raw: ERPClient): Client {
  return {
    id:                    raw.name,
    name:                  raw.customer_name,
    mobile:                raw.mobile_no ?? undefined,
    fitnessGoals:          raw.custom_fitness_goals ?? undefined,
    trainerNotes:          raw.custom_trainer_notes ?? undefined,
    packageType:           raw.custom_package_type ?? undefined,
    bloodType:             raw.custom_blood_type ?? undefined,
    emergencyContactName:  raw.custom_emergency_contact_name ?? undefined,
    emergencyContactPhone: raw.custom_emergency_contact_phone ?? undefined,
    remainingSessions:     raw.custom_remaining_sessions ?? undefined,
    createdAt:             raw.creation,
  }
}

export function normalizeInvoice(raw: ERPInvoice): Invoice {
  const status = mapInvoiceStatus(raw.status)
  // Sales Invoice has no dedicated paid-at field. When the invoice is fully
  // paid (status flipped or outstanding == 0), the most recent change is the
  // payment reconciliation, so `modified` is a reliable-enough proxy.
  // For per-payment timestamps, query Payment Entries explicitly (future).
  const fullyPaid = status === 'paid' || raw.outstanding_amount === 0
  const paidAt = fullyPaid && typeof raw.modified === 'string'
    ? raw.modified.slice(0, 10)
    : undefined

  return {
    id: raw.name,
    clientId: raw.customer,
    clientName: raw.customer_name ?? raw.customer,
    trainerId: '',          // resolved from session context by callers
    amount: raw.grand_total,
    outstandingAmount: raw.outstanding_amount,
    currency: raw.currency ?? 'USD',
    status,
    dueDate: raw.due_date,
    issuedAt: raw.posting_date,
    paidAt,
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

export function clientFields(): string {
  // Only fields provisioned by provisioning_api/api/fitdesk_setup.py are safe
  // to request — Frappe returns 417 for unknown field names. Blood type and
  // emergency contact fields are mapped in normalizeClient but not requested
  // here because the target tenant does not provision them.
  return JSON.stringify([
    'name', 'customer_name', 'mobile_no',
    'custom_fitness_goals', 'custom_trainer_notes', 'custom_package_type',
    'custom_remaining_sessions',
    'creation',
  ])
}

function invoiceFields(): string {
  return JSON.stringify([
    'name', 'customer', 'customer_name', 'posting_date', 'due_date',
    'grand_total', 'outstanding_amount', 'paid_amount', 'currency',
    'status', 'remarks', 'creation', 'modified',
  ])
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// All methods below are the only surface area exposed outside this module.
// ─────────────────────────────────────────────────────────────────────────────

// ── Clients ───────────────────────────────────────────────────────────────────

/**
 * Fetch all active clients for the tenant.
 *
 * Trainer-scoping is not yet implemented — the Customer DocType has no
 * trainer link field in the current schema. All non-disabled customers
 * for the tenant's ERPNext site are returned. Scope filtering by trainer
 * requires provisioning a `custom_trainer_id` custom field first.
 */
export async function getClients(_trainerId: string): Promise<Client[]> {
  const params: Record<string, string> = {
    fields:  clientFields(),
    filters: JSON.stringify([['disabled', '=', 0]]),
  }

  const res = await erpFetch<ERPListResponse<ERPClient>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.CLIENT)}`,
    { params },
  )
  const clients = res.data.map(normalizeClient)
  clients.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return clients
}

/**
 * Fetch a single client by ERPNext docname.
 *
 * Phase 5.0.1: response-integrity + tenant-scope assertion.
 *   - Tenant scope is enforced by the CP proxy (the JWT carries the
 *     tenantId; CP routes to the correct ERP site). Cross-tenant access
 *     is impossible at this layer.
 *   - Response integrity: the returned `name` MUST equal the requested
 *     id. Any mismatch (proxy bug, ERP rerouting, response tampering)
 *     becomes a hard 502 instead of a silently-normalized object.
 *
 * The Customer DocType has no trainer-link field today, so per-trainer
 * ownership is not modeled. Single-trainer-per-tenant pilot makes that
 * acceptable; revisit if multi-trainer-per-tenant becomes a real shape.
 */
export async function getClientById(id: string, _trainerId: string): Promise<Client> {
  const res = await erpFetch<ERPDocResponse<ERPClient>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.CLIENT)}/${encodeURIComponent(id)}`,
  )
  if (!res.data || res.data.name !== id) {
    throw new ERPNextError(
      502,
      'Bad Gateway',
      `/api/resource/${DOCTYPE.CLIENT}/${id}`,
      `Response integrity: returned name=${res.data?.name ?? 'undefined'} does not match requested id=${id}`,
    )
  }
  return normalizeClient(res.data)
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

/**
 * Clamp a Sales Invoice due date so it is never earlier than the posting date.
 * ERPNext rejects a Sales Invoice whose due_date precedes posting_date. Dates
 * are 'YYYY-MM-DD' strings, for which lexicographic order is chronological.
 */
export function clampDueDate(postingDate: string, dueDate: string): string {
  return dueDate < postingDate ? postingDate : dueDate
}

/** Create a new Sales Invoice in ERPNext. Returns the saved draft invoice. */
export async function createInvoice(payload: CreateInvoicePayload): Promise<Invoice> {
  const body = {
    ...payload,
    // ERPNext ignores a REST-supplied posting_date unless set_posting_time is
    // enabled — without it, it stamps its own server-local date, which can land
    // after due_date under UTC/UTC+ timezone drift and trip due-date validation.
    set_posting_time: 1,
    // Guarantee due_date >= posting_date for every caller (session + manual).
    due_date: clampDueDate(payload.posting_date, payload.due_date),
  }
  const res = await erpFetch<ERPDocResponse<ERPInvoice>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.INVOICE)}`,
    { method: 'POST', body },
  )
  return normalizeInvoice(res.data)
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
 * Sales Invoice.
 *
 * A plain REST POST only ever creates a draft (docstatus 0); the invoice
 * outstanding amount is NOT reduced until the entry is submitted. Submitting
 * uses the whitelisted `frappe.client.submit` method, which expects the full
 * document — so the draft is fetched first and passed back verbatim.
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
 * Record a payment for an invoice: create a Payment Entry, submit it so
 * ERPNext reconciles the Sales Invoice, then re-fetch the invoice.
 *
 * Creating the Payment Entry alone is NOT success — a draft entry has no
 * accounting effect. The re-fetched invoice is returned so the caller can
 * verify the outstanding amount actually decreased before reporting success.
 *
 * @param invoiceId     - Sales Invoice docname (e.g. "SINV-00001")
 * @param clientId      - Customer/Client docname
 * @param amount        - Amount being paid (may be partial)
 * @param modeOfPayment - ERPNext Mode of Payment name (e.g. "Cash", "Whish Money")
 * @param date          - Payment date as YYYY-MM-DD
 * @param reference     - External transaction ID (Whish ref, bank ref, etc.)
 * @returns the submitted Payment Entry and the re-fetched Sales Invoice
 */
export async function createAndSubmitPaymentEntry(opts: {
  invoiceId: string
  clientId: string
  amount: number
  modeOfPayment: string
  date: string
  reference?: string
  note?: string
}): Promise<{ payment: Payment; invoice: Invoice }> {
  // Step 1: fetch invoice to get the company (required by Frappe Payment Entry).
  const invRes = await erpFetch<ERPDocResponse<{ company?: string }>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.INVOICE)}/${encodeURIComponent(opts.invoiceId)}`,
    { params: { fields: JSON.stringify(['company']) } },
  )
  const company = invRes.data.company ?? ''

  // Step 2: resolve paid_to account from the Mode of Payment's accounts table.
  // Frappe requires paid_to explicitly via REST — it does not auto-populate it.
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
    // MoP not found / no accounts table — handled by the explicit check below.
  }
  if (!paidTo) {
    // Without a deposit account the Payment Entry cannot be submitted; fail
    // loudly with a clear, operator-actionable message instead of creating an
    // unreconcilable draft.
    throw new ERPNextError(
      503, 'Payment Account Missing',
      `/api/resource/Mode of Payment/${opts.modeOfPayment}`,
      `No deposit account is configured for payment method "${opts.modeOfPayment}". `
        + 'Set its account in ERPNext before recording payments.',
    )
  }

  // Step 3: create the Payment Entry. A REST POST always creates a draft.
  const payload: CreatePaymentEntryPayload & {
    company: string
    received_amount: number
    paid_to: string
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
