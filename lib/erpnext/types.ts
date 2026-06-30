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
  /**
   * When 0/absent, ERPNext re-stamps posting_date to the server date on
   * submit. Set to 1 to make ERPNext honor the stored posting_date.
   */
  set_posting_time?: 0 | 1
  company?: string
  /** FD Session docname — back-reference for idempotency lookup (custom field). */
  custom_fd_session?: string | null
  /** Invoice origin discriminator: 'Package' | 'Session' (custom field). */
  custom_invoice_kind?: string | null
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

/** Child table row of FitDesk Trainer Settings.working_days. */
export interface ERPFitDeskWorkingDay {
  weekday?: 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'
  enabled?: 0 | 1
  start_time?: string  // 'HH:MM:SS'
  end_time?: string    // 'HH:MM:SS'
}

/** FitDesk Trainer Settings singleton document. */
export interface ERPTrainerSettings {
  timezone?: string
  buffer_minutes?: number
  default_session_duration?: number
  working_days?: ERPFitDeskWorkingDay[]
  initialized?: 0 | 1
}

/** Raw FD Session document from ERPNext. */
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
  is_trial_session?: 0 | 1
  session_consumed_package?: 0 | 1
  creation: string
  modified: string
}

/** Raw FD Session Series document from ERPNext. */
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

// ─── Payload types (write / POST / PUT) ──────────────────────────────────────
// These define what we send TO ERPNext when creating or updating records.

export interface CreateClientPayload {
  customer_name: string
  customer_type?: string
  customer_group?: string
  territory?: string
  email_id?: string
  mobile_no?: string
  status?: 'Active'
  trainer?: string        // linked Trainer docname
  custom_fitness_goals?: string
  custom_trainer_notes?: string
  /** ERP Select options: 'Package' | 'Pay Per Session' | 'Trial' */
  custom_billing_mode?: string
  /** Currency field — per-session rate in the trainer's default currency */
  custom_default_session_rate?: number
}

export interface UpdateClientPayload {
  customer_name?: string
  email_id?: string
  mobile_no?: string
  status?: 'Active' | 'Inactive' | 'Paused'
  custom_fitness_goals?: string
  custom_trainer_notes?: string
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
  /** FD Session docname — durable idempotency anchor for pay-per-session invoices. */
  custom_fd_session?: string
  /** Invoice origin discriminator: 'Package' | 'Session'. */
  custom_invoice_kind?: string
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
