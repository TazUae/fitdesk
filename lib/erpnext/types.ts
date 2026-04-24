/**
 * Raw ERPNext REST API shapes.
 *
 * Rules:
 *  - These types mirror exact ERPNext field names (snake_case).
 *  - They are NEVER used in UI components or server actions.
 *  - All code outside lib/erpnext/ must use types from types/index.ts.
 *  - When adding or renaming a custom field in ERPNext, update the matching
 *    interface here and the normalizer in client.ts — nowhere else.
 */

// ─── Response envelope types ──────────────────────────────────────────────────

export interface ERPListResponse<T> {
  data: T[]
}

export interface ERPDocResponse<T> {
  data: T
}

// ─── Raw document types (read / GET) ─────────────────────────────────────────

/**
 * Standard ERPNext Customer DocType with FitDesk custom fields.
 * Custom fields are provisioned by provisioning_api/api/fitdesk_setup.py.
 */
export interface ERPClient {
  name: string           // docname — e.g. "CUST-00001"
  customer_name: string
  mobile_no?: string
  custom_fitness_goals?: string           // (custom) Long Text
  custom_trainer_notes?: string           // (custom) Long Text
  custom_package_type?: 'Per Session' | 'Monthly' | 'Package'  // (custom) Select
  custom_blood_type?: string              // (custom) Data — e.g. "A+"
  custom_emergency_contact_name?: string  // (custom) Data
  custom_emergency_contact_phone?: string // (custom) Data
  custom_remaining_sessions?: number      // (custom) Int — sessions left in package
  creation: string
  modified: string
}

/**
 * Standard ERPNext Sales Invoice.
 * customer_name is populated by the Link field fetch in ERPNext.
 */
export interface ERPInvoice {
  name: string               // docname — e.g. "SINV-00001"
  customer: string           // linked Customer/Client docname
  customer_name?: string     // fetched link label (read-only)
  posting_date: string       // YYYY-MM-DD
  due_date: string           // YYYY-MM-DD
  grand_total: number
  outstanding_amount: number
  paid_amount?: number
  currency: string
  status: 'Draft' | 'Submitted' | 'Paid' | 'Overdue' | 'Cancelled'
  remarks?: string
  creation: string
  modified: string
}

/**
 * Standard ERPNext Payment Entry.
 * Used when recording payment for an invoice (cash, bank, or Whish).
 */
export interface ERPPaymentEntry {
  name: string              // docname — e.g. "PE-00001"
  payment_type: 'Receive' | 'Pay' | 'Internal Transfer'
  party_type: 'Customer'
  party: string             // linked Client/Customer docname
  party_name?: string       // fetched link label
  paid_amount: number
  currency?: string
  payment_date: string      // YYYY-MM-DD
  mode_of_payment: string   // 'Cash' | 'Bank Transfer' | custom
  reference_no?: string     // external transaction ID (e.g. Whish ref)
  remarks?: string
  creation: string
}

// ─── Payload types (write / POST / PUT) ──────────────────────────────────────
// These define what we send TO ERPNext when creating or updating records.

export interface CreateClientPayload {
  customer_name: string
  customer_type: 'Individual' | 'Company'
  customer_group: string          // e.g. 'Individual' (provisioned by setup)
  territory: string               // e.g. 'All Territories' (provisioned by setup)
  mobile_no?: string
  custom_fitness_goals?: string
  custom_trainer_notes?: string
  custom_package_type?: 'Per Session' | 'Monthly' | 'Package'
  custom_blood_type?: string
  custom_emergency_contact_name?: string
  custom_emergency_contact_phone?: string
}

export interface UpdateClientPayload {
  customer_name?: string
  mobile_no?: string
  custom_fitness_goals?: string
  custom_trainer_notes?: string
  custom_package_type?: 'Per Session' | 'Monthly' | 'Package'
  custom_blood_type?: string
  custom_emergency_contact_name?: string
  custom_emergency_contact_phone?: string
  /** 1 = deactivate/hide from active lists; 0 = re-enable. */
  disabled?: 0 | 1
}

export interface CreateInvoicePayload {
  customer: string        // Client/Customer docname
  posting_date: string    // YYYY-MM-DD
  due_date: string        // YYYY-MM-DD
  currency?: string
  /** At minimum one line item is required by ERPNext. */
  items: CreateInvoiceItem[]
  remarks?: string
}

export interface CreateInvoiceItem {
  item_code: string       // ERPNext Item docname (e.g. "PT-SESSION")
  qty: number
  rate: number
  description?: string
}

export interface CreatePaymentEntryPayload {
  payment_type: 'Receive'
  party_type: 'Customer'
  party: string           // Client/Customer docname
  paid_amount: number
  currency?: string
  payment_date: string    // YYYY-MM-DD
  mode_of_payment: string // 'Cash' | 'Bank Transfer' | custom
  reference_no?: string
  remarks?: string
  /** Links this payment to one or more invoices. */
  references: PaymentReference[]
}

export interface PaymentReference {
  reference_doctype: 'Sales Invoice'
  reference_name: string  // Sales Invoice docname
  allocated_amount: number
}

// ─── FD Session (new scheduling model) ───────────────────────────────────────
// Raw shapes returned by GET /api/resource/FD Session and
// POST /api/erp/method/provisioning_api.api.scheduling.bulk_create_sessions.
// All Datetime values are stored and returned by Frappe as UTC
// in 'YYYY-MM-DD HH:MM:SS' format (no timezone suffix).

export interface ERPFDSession {
  name: string                        // docname (hash)
  trainer_id: string
  client_id: string                   // Customer docname
  client_name?: string                // fetched from client_id.customer_name
  series_id?: string | null
  start_at: string                    // 'YYYY-MM-DD HH:MM:SS' UTC
  end_at: string                      // 'YYYY-MM-DD HH:MM:SS' UTC
  duration_minutes: number
  timezone: string                    // IANA identifier
  status: string                      // 'scheduled'|'confirmed'|'completed'|'cancelled'|'no_show'|'skipped'
  occurrence_key?: string | null
  occurrence_index?: number | null
  is_override: 0 | 1
  rate: number
  session_type?: string | null
  notes?: string | null
  invoice_id?: string | null
  version: number
  creation: string
  modified: string
}

export interface ERPFDSessionSeries {
  name: string                        // docname (hash)
  trainer_id: string
  client_id: string                   // Customer docname
  pattern: string                     // JSON-encoded SeriesPattern
  start_date: string                  // 'YYYY-MM-DD'
  end_date?: string | null            // 'YYYY-MM-DD'
  duration_minutes: number
  timezone: string
  default_rate: number
  status: string                      // 'active'|'ended'|'cancelled'
  version: number
  creation: string
  modified: string
}
