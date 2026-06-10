/**
 * Trainer account settings — Phase 1 type definitions.
 *
 * This file describes the shape of the FitDesk Trainer Settings control
 * centre. It is *only* types and trainer-facing labels — no business logic,
 * no Frappe DocTypes, no runtime behaviour.
 *
 * Storage decisions (Phase 2+, for context only):
 *   - `TrainerAccountSettings`     → Single DocType `FitDesk Trainer Settings`
 *   - `WorkingDay`                 → child table `FitDesk Working Day`
 *   - `ReminderRule`               → child table `FitDesk Reminder Rule`
 *   - `SessionTypeSetting`         → STANDALONE parent DocType
 *                                    `FitDesk Session Type` (so booked
 *                                    sessions can reference stable IDs)
 *
 * Branding rule: every trainer-facing label must use FitDesk language —
 * "Standard Billing Item" not "Item Code", "FitDesk Core" not "ERPNext".
 * Internal field names stay technical; trainer-facing strings are derived
 * from the label maps below.
 *
 * Import path: @/types/settings
 */

// ─── Domain primitives ───────────────────────────────────────────────────────

/** Nominal-type helper. Use for opaque IDs that should not be cross-assigned. */
type Branded<T, B extends string> = T & { readonly __brand: B }


/** IANA timezone, e.g. `'Asia/Beirut'`. */
export type IanaTimezone = string

/** ISO 3166-1 alpha-2, e.g. `'LB'`. */
export type CountryCode = string

/** ISO 4217 currency, e.g. `'USD'`. */
export type CurrencyCode = string

/** Two-letter language code per i18n table, e.g. `'en'`, `'ar'`. */
export type LanguageCode = string

/** `'HH:mm'` 24-hour local time. */
export type LocalTime = string

/** ISO 8601 timestamp string (UTC). */
export type IsoTimestamp = string

export type Weekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'

export type WeekendPreset = 'sat-sun' | 'fri-sat' | 'custom'

// ─── Section 1 — Business Profile ────────────────────────────────────────────

export interface BusinessProfileSettings {
  trainerDisplayName: string
  /** Trainer-facing label: "Business Name in FitDesk". */
  businessName:       string
  timezone:           IanaTimezone
  country:            CountryCode
  currency:           CurrencyCode
  language:           LanguageCode
  /** E.164 if possible, e.g. `'+96170123456'`. */
  phoneNumber:        string
  whatsappNumber:     string
  /** Public-readable URL or null if not uploaded yet. */
  logoUrl:            string | null
}

// ─── Section 2 — Schedule & Working Hours ────────────────────────────────────

export interface WorkingDay {
  weekday:   Weekday
  enabled:   boolean
  startTime: LocalTime
  endTime:   LocalTime
}

export interface ScheduleSettings {
  /** Default booking duration in minutes (e.g. 60). */
  defaultSessionDuration:  number
  /** Slot grid increment in minutes (e.g. 30). */
  slotInterval:            number
  /** Minimum gap between any two sessions in minutes. */
  bufferMinutes:           number
  /** Maximum series length for recurring bookings. */
  maxRecurringWeeks:       number
  /** Hours of advance notice required to book a new session. */
  minimumNoticeHours:      number
  /** Hours before session start that cancellation is still allowed. */
  cancellationCutoffHours: number
  /** One row per weekday. UI may reorder; engine reads by `weekday`. */
  workingDays:             WorkingDay[]
  weekendPreset:           WeekendPreset
  /** When `true`, public holidays surface as warnings (never block). */
  respectPublicHolidays:   boolean
  /** ISO country code for holiday lookups; `null` falls back to profile country. */
  holidayCountry:          CountryCode | null
}

// ─── Section 3 — Session Types ───────────────────────────────────────────────
//
// Standalone DocType in Phase 2 (`FitDesk Session Type`). Listed in
// settings only as a reference shape — settings storage will hold IDs
// pointing at session-type rows, not the rows themselves.

export type SessionTypeId = Branded<string, 'SessionTypeId'>

export interface SessionTypeSetting {
  id:                     SessionTypeId
  /** Trainer-visible name, e.g. `"Personal Training"`. */
  name:                   string
  defaultDurationMinutes: number
  /** Default per-session rate; `null` means "use billing-item price". */
  defaultRate:            number | null
  /** Trainer-facing label for this field is "Standard Billing Item". */
  standardBillingItem:    string
  /** Hex from the curated 12-color palette in `lib/settings/palette.ts` (Phase 7). */
  color:                  string
  enabled:                boolean
}

// ─── Section 4 — Billing ─────────────────────────────────────────────────────

/** Trainer-facing label: "New Invoice Stage". */
export type InvoiceStage = 'draft' | 'submitted'

export interface BillingSettings {
  /** Trainer-facing: "Standard Billing Item". */
  standardBillingItem:       string
  /** Trainer-facing: "Revenue Ledger". `null` = inherit from FitDesk Core. */
  revenueLedger:             string | null
  /** Trainer-facing: "Business Unit". */
  businessUnit:              string | null
  /** Trainer-facing: "Master Price Book". */
  masterPriceBook:           string | null
  /** Trainer-facing: "Tax Setup". */
  taxSetup:                  string | null
  /** When `true`, FitDesk creates a draft invoice on session completion. */
  invoiceOnSessionComplete:  boolean
  /** Days from invoice creation until due date (0 = same day). */
  invoiceDueDays:            number
  /** Trainer-facing: "New Invoice Stage". MVP keeps this on `'draft'`. */
  newInvoiceStage:           InvoiceStage
}

// ─── Section 5 — Payments ────────────────────────────────────────────────────

export type PaymentProvider = 'whish' | 'cash' | 'bank_transfer'

export interface PaymentsSettings {
  paymentProvider:             PaymentProvider
  /** MVP rule: stays `false`. Payment links are user-triggered. */
  autoGeneratePaymentLink:     boolean
  /** MVP rule: stays `false`. Trainer manually attaches the link. */
  sendPaymentLinkAfterInvoice: boolean
  paymentLinkExpiryHours:      number
  /** Free-text shown to clients on payment screen / WhatsApp. */
  paymentInstructions:         string
}

// ─── Section 6 — WhatsApp Assistant ──────────────────────────────────────────

export type MessageTone     = 'friendly_professional' | 'professional' | 'casual'
export type ReminderChannel = 'whatsapp'
export type ReminderType    = 'before-session' | 'after-session' | 'invoice-overdue'

export interface ReminderRule {
  id:        string
  type:      ReminderType
  channel:   ReminderChannel
  /** Hours offset from the trigger event (negative = before). */
  offsetHours: number
  enabled:   boolean
  /** Pre-fill template; supports `{client_name}` etc. variables. */
  template:  string
}

export interface WhatsAppSettings {
  enabled:                          boolean
  /** Evolution API instance handle. */
  instanceName:                     string
  /** Evolution instance UUID once provisioned; `null` until linked. */
  instanceId:                       string | null
  /** Sensitive: render as a password input, never log in plaintext. */
  apiKey:                           string
  messageLanguage:                  LanguageCode
  messageTone:                      MessageTone
  /** Appended to outgoing messages, e.g. `"Sent via FitDesk Assistant"`. */
  defaultSignature:                 string
  /** Pre-fill sent on first booking confirmation. Variables documented below. */
  defaultClientGreeting:            string
  /** MVP rule: stays `true`. Messages are pre-filled, never auto-sent. */
  requireTrainerApprovalBeforeSend: boolean
  reminderRules:                    ReminderRule[]
}

/**
 * Variables supported by `defaultClientGreeting` and reminder templates.
 * Listed here so Phase 7's preview component can validate and substitute
 * them without ambiguity.
 */
export const WHATSAPP_TEMPLATE_VARIABLES = [
  'client_name',
  'session_type',
  'session_date',
  'session_time',
  'trainer_name',
  'business_name',
] as const

export type WhatsAppTemplateVariable = typeof WHATSAPP_TEMPLATE_VARIABLES[number]

// ─── Section 7 — Calendar Preferences ────────────────────────────────────────
//
// Note (intentional omission): `scheduler_ui_engine` is NOT a field. The
// Schedule-X migration (Phases 1–13) deleted the SCHEDULER_UI flag. This
// settings page must not reintroduce dead configuration.

export type CalendarView   = 'week' | 'day' | 'month-grid'
export type WeekStart      = 'sunday' | 'monday' | 'saturday'
/** Theme key resolved by the Schedule-X overrides stylesheet. */
export type CalendarTheme  = 'fitdesk-dark' | 'fitdesk-light'

export interface CalendarSettings {
  defaultView:              CalendarView
  weekStartsOn:             WeekStart
  showWeekends:             boolean
  showCurrentTimeIndicator: boolean
  enableDragToCreate:       boolean
  enableDragToReschedule:   boolean
  /** MVP rule: stays `false`. Resize is wired but not exercised yet. */
  enableResizeDuration:     boolean
  calendarTheme:            CalendarTheme
}

// ─── Section 8 — Safety & Automation ─────────────────────────────────────────

export interface SafetySettings {
  confirmBeforeCreatingInvoices: boolean
  /** MVP rule: stays `true`. */
  askBeforeSendingWhatsApp:      boolean
  /** MVP rule: stays `true`. */
  askBeforeCreatingPaymentLinks: boolean
  enableAIMessageDrafts:         boolean
  /** MVP rule: stays `true`. Audit log lives in FitDesk's auth.db, not ERP. */
  enableAuditLogs:               boolean
}

// ─── Settings meta — auto-fill and inheritance bookkeeping ───────────────────

/**
 * Source key used in `SettingsMeta.autoFillSource` and (Phase 7) shown to the
 * trainer as `Inherited from <source>`.
 */
export type AutoFillSource =
  | 'fitdesk-core-defaults'
  | 'business-profile'
  | 'trainer-profile'
  | 'auth-user'
  | 'tenant-onboarding'
  | 'country-language-defaults'
  | 'fitdesk-safe-defaults'

export interface SettingsMeta {
  /**
   * `false` → settings have never been saved by the trainer; auto-fill is
   * authoritative and may run again. `true` → trainer overrides are sticky;
   * external profile changes must not silently overwrite.
   */
  initialized:       boolean
  /** ISO timestamp of the last successful auto-fill, or `null`. */
  lastAutoFilledAt:  IsoTimestamp | null
  /** Highest-priority source that contributed to the last auto-fill. */
  autoFillSource:    AutoFillSource | null
  /** Schema version, bumped when the shape changes in a non-additive way. */
  schemaVersion:     number
}

/**
 * Per-field inheritance state shown in the UI as
 * `Inherited from <source>` vs `Customized`.
 *
 * Keys are dotted paths into `TrainerAccountSettings`, e.g.
 * `'businessProfile.timezone'`. The map is sparse — entries are only
 * present for fields that have been explicitly customized OR that we
 * tracked an inheritance source for at auto-fill time.
 */
export type FieldInheritanceMap = Partial<
  Record<string, { state: 'inherited' | 'customized'; source: AutoFillSource | null }>
>

// ─── Aggregate root ──────────────────────────────────────────────────────────

/**
 * Single source of truth for the trainer settings control centre.
 *
 * Phase 1 stays a flat object. In Phase 2 this maps onto:
 *   - `FitDesk Trainer Settings`  (Single DocType, holds the eight section
 *     groups and the meta block; child tables host the working-day rows
 *     and reminder rules)
 *   - `FitDesk Session Type`     (parent DocType; not embedded here)
 *
 * `sessionTypes` here is the read projection — at storage time it's a list
 * of session-type IDs the trainer has enabled; the UI hydrates it into the
 * full row via the parent DocType lookup.
 */
export interface TrainerAccountSettings {
  businessProfile: BusinessProfileSettings
  schedule:        ScheduleSettings
  sessionTypes:    SessionTypeSetting[]
  billing:         BillingSettings
  payments:        PaymentsSettings
  whatsapp:        WhatsAppSettings
  calendar:        CalendarSettings
  safety:          SafetySettings
  meta:            SettingsMeta
}

/**
 * Same shape but every section is optional. Used by:
 *   - auto-fill (we may have only a handful of derived fields)
 *   - the save endpoint (clients can PATCH a single section)
 *   - tests that need to construct a partial fixture
 */
export type PartialTrainerAccountSettings = {
  [K in keyof TrainerAccountSettings]?:
    TrainerAccountSettings[K] extends Array<infer U>
      ? Array<U>
      : Partial<TrainerAccountSettings[K]>
}

// ─── Trainer-facing label maps ───────────────────────────────────────────────
//
// Keep technical field names in code; render through these maps in the UI.
// This is the branding firewall in concrete form.

export const SECTION_LABELS = {
  businessProfile: 'Business Profile',
  schedule:        'Schedule & Working Hours',
  sessionTypes:    'Session Types',
  billing:         'Billing',
  payments:        'Payments',
  whatsapp:        'WhatsApp Assistant',
  calendar:        'Calendar Preferences',
  safety:          'Safety & Automation',
} as const satisfies Record<keyof Omit<TrainerAccountSettings, 'meta'>, string>

/**
 * Translation table from ERP/Frappe terminology to FitDesk-facing strings.
 * Trainer-facing UI text must come from this map (or be entirely FitDesk
 * native). Engineering-facing copy can stay technical.
 */
export const FITDESK_TERMINOLOGY = {
  erpnext:                  'FitDesk Core',
  itemCode:                 'Standard Billing Item',
  incomeAccount:            'Revenue Ledger',
  costCenter:               'Business Unit',
  priceList:                'Master Price Book',
  taxTemplate:              'Tax Setup',
  salesInvoice:             'Invoice',
  invoiceStatusOnCreate:    'New Invoice Stage',
  inSyncWithErpnext:        'Operational: Connected to FitDesk Core',
} as const

export type FitdeskTerm = keyof typeof FITDESK_TERMINOLOGY

// ─── Read/write boundaries (markers for Phase 2+ wiring) ─────────────────────
//
// These types document the contract at the edges of the settings system.
// They have no runtime behaviour — they exist so future code can `import`
// the right shape and the compiler will complain if the contract drifts.

/** Result of a settings-read at the FitDesk Core boundary. */
export interface SettingsReadResult {
  settings:    TrainerAccountSettings
  inheritance: FieldInheritanceMap
}

/** Patch shape accepted by the settings save endpoint. */
export interface SettingsWritePatch {
  /** Trainer ID supplied by the server from the auth session. */
  patch: PartialTrainerAccountSettings
  /** Optimistic-lock value the client read with. */
  expectedSchemaVersion: number
}
