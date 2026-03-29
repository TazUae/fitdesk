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
 * Custom Trainer DocType.
 * Confirm the doctype name ("Trainer") matches your ERPNext instance.
 * The `user` field links to the ERPNext User who owns this trainer record.
 */
export interface ERPTrainer {
  name: string           // docname — e.g. "TRAIN-0001"
  trainer_name: string
  email: string
  phone?: string
  user: string           // linked ERPNext User docname
  creation: string
  modified: string
}

/**
 * Custom Client DocType (or Customer, depending on your ERPNext setup).
 * Fields marked (custom) are specific to FitDesk and must be created
 * in your ERPNext instance.
 */
export interface ERPClient {
  name: string           // docname — e.g. "C-0001"
  first_name: string
  last_name?: string
  full_name?: string     // computed/stored full name field (custom)
  email_id?: string
  mobile_no?: string
  status: 'Active' | 'Inactive' | 'Paused'  // (custom) field
  trainer: string        // linked Trainer docname (custom)
  total_sessions?: number // (custom) maintained by session hooks in ERP
  goal?: string          // (custom) client's fitness goal
  notes?: string
  creation: string
  modified: string
}

/**
 * Custom PT Session DocType.
 * DocType name defaults to "PT Session" — confirm in client.ts DOCTYPE map.
 */
export interface ERPSession {
  name: string           // docname — e.g. "SES-0001"
  client: string         // linked Client docname
  client_name?: string   // fetched link label (read-only from ERP)
  trainer: string        // linked Trainer docname
  session_date: string   // YYYY-MM-DD
  session_time?: string  // HH:mm:ss (optional)
  duration?: number      // in minutes (custom)
  session_fee?: number   // (custom) per-session fee for display — optional field
  status: 'Scheduled' | 'Completed' | 'Missed' | 'Cancelled'
  notes?: string
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
  first_name: string
  last_name?: string
  email_id?: string
  mobile_no?: string
  status?: 'Active'
  trainer?: string        // linked Trainer docname
  goal?: string
  notes?: string
}

export interface UpdateClientPayload {
  first_name?: string
  last_name?: string
  email_id?: string
  mobile_no?: string
  status?: 'Active' | 'Inactive' | 'Paused'
  goal?: string
  notes?: string
}

export interface CreateSessionPayload {
  client: string          // Client docname
  trainer: string         // Trainer docname
  session_date: string    // YYYY-MM-DD
  session_time?: string   // HH:mm:ss
  duration?: number
  status?: 'Scheduled'
  notes?: string
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

export interface CreateTrainerPayload {
  trainer_name: string
  email: string
  phone?: string
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
