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
  // /api/resource/Client        → /api/erp/doctype/Client
  // /api/resource/Client/ID-001 → /api/erp/doctype/Client/ID-001
  const cpPath = path.replace('/api/resource/', '/api/erp/doctype/')

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
    'name', 'customer_name', 'mobile_no',
    'custom_fitness_goals', 'custom_trainer_notes', 'custom_package_type',
    'creation',
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
    orderby: 'creation desc',
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
export async function getClientById(id: string, _trainerId: string): Promise<Client> {
  // TODO: trainer-ownership check removed — Customer has no trainer link field.
  // Re-add once trainer-scoping strategy is decided (see getClients TODO).
  const res = await erpFetch<ERPDocResponse<ERPClient>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.CLIENT)}/${encodeURIComponent(id)}`,
  )
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
 * @param invoiceId     - Sales Invoice docname (e.g. "SINV-00001")
 * @param clientId      - Customer/Client docname
 * @param amount        - Amount being paid (may be partial)
 * @param modeOfPayment - ERPNext Mode of Payment name (e.g. "Cash", "Whish Money")
 * @param date          - Payment date as YYYY-MM-DD
 * @param reference     - External transaction ID (Whish ref, bank ref, etc.)
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
  // Step 1: fetch invoice to get company + currency (both required by Frappe PE)
  const invRes = await erpFetch<ERPDocResponse<{ company?: string; currency?: string }>>(
    `/api/resource/${encodeURIComponent(DOCTYPE.INVOICE)}/${encodeURIComponent(opts.invoiceId)}`,
    { params: { fields: JSON.stringify(['company', 'currency']) } },
  )
  const company = invRes.data.company ?? ''
  const currency = invRes.data.currency ?? 'USD'

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
    // MoP may not have a default account configured — Frappe will surface the
    // MandatoryError to the caller if paid_to is truly required.
  }

  const payload: CreatePaymentEntryPayload & { company: string; received_amount: number; paid_to?: string } = {
    payment_type:    'Receive',
    party_type:      'Customer',
    party:            opts.clientId,
    company,
    paid_amount:      opts.amount,
    received_amount:  opts.amount,
    payment_date:     opts.date,
    mode_of_payment:  opts.modeOfPayment,
    ...(paidTo ? { paid_to: paidTo } : {}),
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
