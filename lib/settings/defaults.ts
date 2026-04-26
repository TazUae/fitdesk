/**
 * Trainer account settings — Phase 1 defaults and merge helpers.
 *
 * Pure data and pure functions. No imports from server actions, no Frappe
 * calls, no React. This module exists so future phases (read path,
 * UI skeleton, save flow) can import a single source of truth for
 * "what does FitDesk look like before the trainer customises anything".
 *
 * Phase 1 constraint: nothing here is wired into runtime behaviour.
 *
 * Import path: @/lib/settings/defaults
 */

import type {
  AutoFillSource,
  BillingSettings,
  BusinessProfileSettings,
  CalendarSettings,
  PartialTrainerAccountSettings,
  PaymentsSettings,
  ReminderRule,
  SafetySettings,
  ScheduleSettings,
  SessionTypeSetting,
  SettingsMeta,
  TrainerAccountSettings,
  Weekday,
  WhatsAppSettings,
  WorkingDay,
} from '@/types/settings'

// ─── Schema version ──────────────────────────────────────────────────────────

/**
 * Bump when adding required fields, removing fields, or changing the
 * meaning of an existing field. Additive optional fields don't bump.
 *
 * Phase 1 ships at version 1.
 */
export const SETTINGS_SCHEMA_VERSION = 1

// ─── Section defaults ────────────────────────────────────────────────────────

const DEFAULT_BUSINESS_PROFILE: BusinessProfileSettings = {
  trainerDisplayName: '',
  businessName:       '',
  // `Asia/Beirut` is the working assumption for the local stack today; the
  // auto-fill pipeline will overwrite this from `tenant-onboarding` when it
  // runs. Keeping a real value here avoids `''` reaching Schedule-X.
  timezone:           'Asia/Beirut',
  country:            'LB',
  currency:           'USD',
  language:           'en',
  phoneNumber:        '',
  whatsappNumber:     '',
  logoUrl:            null,
}

const DEFAULT_WORKING_DAYS: WorkingDay[] = [
  { weekday: 'sun', enabled: false, startTime: '09:00', endTime: '20:00' },
  { weekday: 'mon', enabled: true,  startTime: '09:00', endTime: '20:00' },
  { weekday: 'tue', enabled: true,  startTime: '09:00', endTime: '20:00' },
  { weekday: 'wed', enabled: true,  startTime: '09:00', endTime: '20:00' },
  { weekday: 'thu', enabled: true,  startTime: '09:00', endTime: '20:00' },
  { weekday: 'fri', enabled: true,  startTime: '09:00', endTime: '20:00' },
  { weekday: 'sat', enabled: false, startTime: '09:00', endTime: '20:00' },
]

const DEFAULT_SCHEDULE: ScheduleSettings = {
  defaultSessionDuration:  60,
  slotInterval:            30,
  bufferMinutes:           15,
  maxRecurringWeeks:       12,
  minimumNoticeHours:      0,
  cancellationCutoffHours: 0,
  workingDays:             DEFAULT_WORKING_DAYS,
  weekendPreset:           'sat-sun',
  respectPublicHolidays:   false,
  holidayCountry:          null,
}

/**
 * Seed catalogue. In Phase 2 these will live in the standalone
 * `FitDesk Session Type` DocType; the IDs here are stable strings the
 * provisioning fixtures will reuse so existing settings keep matching.
 */
const DEFAULT_SESSION_TYPES: SessionTypeSetting[] = [
  {
    id:                     'st-personal-training' as SessionTypeSetting['id'],
    name:                   'Personal Training',
    defaultDurationMinutes: 60,
    defaultRate:            null,
    standardBillingItem:    'TRAINING-SESSION',
    color:                  '#5B9CF6',
    enabled:                true,
  },
  {
    id:                     'st-strength-training' as SessionTypeSetting['id'],
    name:                   'Strength Training',
    defaultDurationMinutes: 60,
    defaultRate:            null,
    standardBillingItem:    'TRAINING-SESSION',
    color:                  '#4ECBA0',
    enabled:                true,
  },
  {
    id:                     'st-cardio' as SessionTypeSetting['id'],
    name:                   'Cardio Session',
    defaultDurationMinutes: 45,
    defaultRate:            null,
    standardBillingItem:    'TRAINING-SESSION',
    color:                  '#F5A623',
    enabled:                true,
  },
  {
    id:                     'st-consultation' as SessionTypeSetting['id'],
    name:                   'Consultation',
    defaultDurationMinutes: 30,
    defaultRate:            null,
    standardBillingItem:    'TRAINING-SESSION',
    color:                  '#A8C8FF',
    enabled:                true,
  },
]

const DEFAULT_BILLING: BillingSettings = {
  standardBillingItem:      'TRAINING-SESSION',
  revenueLedger:            null,
  businessUnit:             null,
  masterPriceBook:          null,
  taxSetup:                 null,
  invoiceOnSessionComplete: true,
  invoiceDueDays:           0,
  newInvoiceStage:          'draft',
}

const DEFAULT_PAYMENTS: PaymentsSettings = {
  paymentProvider:             'whish',
  autoGeneratePaymentLink:     false,
  sendPaymentLinkAfterInvoice: false,
  paymentLinkExpiryHours:      72,
  paymentInstructions:         '',
}

const DEFAULT_REMINDER_RULES: ReminderRule[] = [
  {
    id:          'rr-24h-before',
    type:        'before-session',
    channel:     'whatsapp',
    offsetHours: -24,
    enabled:     false,
    template:
      'Hi {client_name}, this is a reminder for your {session_type} session ' +
      'tomorrow at {session_time}. — {trainer_name}',
  },
]

const DEFAULT_WHATSAPP: WhatsAppSettings = {
  enabled:                          false,
  instanceName:                     '',
  instanceId:                       null,
  apiKey:                           '',
  messageLanguage:                  'en',
  messageTone:                      'friendly_professional',
  defaultSignature:                 'Sent via FitDesk Assistant',
  defaultClientGreeting:
    "Hi {client_name}, I've booked our {session_type} session for " +
    '{session_date} at {session_time}. See you then!',
  requireTrainerApprovalBeforeSend: true,
  reminderRules:                    DEFAULT_REMINDER_RULES,
}

const DEFAULT_CALENDAR: CalendarSettings = {
  defaultView:              'week',
  weekStartsOn:             'monday',
  showWeekends:             false,
  showCurrentTimeIndicator: true,
  enableDragToCreate:       true,
  enableDragToReschedule:   true,
  enableResizeDuration:     false,
  calendarTheme:            'fitdesk-dark',
}

const DEFAULT_SAFETY: SafetySettings = {
  confirmBeforeCreatingInvoices: true,
  askBeforeSendingWhatsApp:      true,
  askBeforeCreatingPaymentLinks: true,
  enableAIMessageDrafts:         true,
  enableAuditLogs:               true,
}

const DEFAULT_META: SettingsMeta = {
  initialized:      false,
  lastAutoFilledAt: null,
  autoFillSource:   null,
  schemaVersion:    SETTINGS_SCHEMA_VERSION,
}

// ─── Aggregate default ───────────────────────────────────────────────────────

/**
 * Safe defaults for a brand-new tenant. Every field is filled with a value
 * that won't break Schedule-X, Luxon, or the booking engine if read as-is.
 *
 * The auto-fill pipeline (Phase 2+) layers these in last:
 *
 *   existing-saved-settings
 *     → fitdesk-core-defaults
 *       → trainer-profile / auth-user
 *         → tenant-onboarding
 *           → country/language defaults
 *             → DEFAULT_TRAINER_SETTINGS  ← this object
 */
export const DEFAULT_TRAINER_SETTINGS: TrainerAccountSettings = {
  businessProfile: DEFAULT_BUSINESS_PROFILE,
  schedule:        DEFAULT_SCHEDULE,
  sessionTypes:    DEFAULT_SESSION_TYPES,
  billing:         DEFAULT_BILLING,
  payments:        DEFAULT_PAYMENTS,
  whatsapp:        DEFAULT_WHATSAPP,
  calendar:        DEFAULT_CALENDAR,
  safety:          DEFAULT_SAFETY,
  meta:            DEFAULT_META,
}

// ─── Country / language derivations ──────────────────────────────────────────

/** Week starts day → expected calendar `weekStartsOn` value. */
export function deriveWeekStart(country: string): CalendarSettings['weekStartsOn'] {
  const c = country.toUpperCase()
  // Middle East / Levant defaults to Saturday for some, Sunday for most.
  if (c === 'SA' || c === 'AE' || c === 'KW' || c === 'QA' || c === 'BH' || c === 'OM') return 'sunday'
  if (c === 'US' || c === 'CA' || c === 'MX' || c === 'JP' || c === 'BR') return 'sunday'
  return 'monday'
}

/**
 * RTL languages render currency on the right. Returned as `'left' | 'right'`
 * so a future UI helper can use it without re-deriving — the field itself
 * is intentionally not exposed in the trainer-facing form.
 */
export function deriveCurrencySymbolPosition(language: string): 'left' | 'right' {
  return language.toLowerCase().startsWith('ar') ? 'right' : 'left'
}

// ─── Merge / normalize helpers ───────────────────────────────────────────────

type Section = Exclude<keyof TrainerAccountSettings, 'meta'>

/**
 * Shallow per-section merge. Patches override defaults at the leaf level
 * for object sections; array sections are taken whole from the patch
 * (or kept whole from defaults) — there is no entry-by-entry merge of
 * `workingDays`, `sessionTypes`, or `reminderRules` because the array
 * order and identity is meaningful.
 *
 * Pure function, no I/O. Safe to call from server or client.
 */
export function applyDefaults(
  patch: PartialTrainerAccountSettings | undefined,
): TrainerAccountSettings {
  if (!patch) return DEFAULT_TRAINER_SETTINGS

  const merged: TrainerAccountSettings = {
    ...DEFAULT_TRAINER_SETTINGS,
    meta: { ...DEFAULT_META, ...(patch.meta ?? {}) },
  }

  for (const key of Object.keys(DEFAULT_TRAINER_SETTINGS) as Array<keyof TrainerAccountSettings>) {
    if (key === 'meta') continue

    const defaultValue = DEFAULT_TRAINER_SETTINGS[key]
    const patchValue   = (patch as Record<string, unknown>)[key]

    if (patchValue === undefined) continue

    const target = merged as unknown as Record<string, unknown>

    if (Array.isArray(defaultValue)) {
      // Array section — take the patch whole.
      target[key] = patchValue
      continue
    }

    // Object section — shallow merge defaults ← patch.
    target[key] = {
      ...(defaultValue as object),
      ...(patchValue as object),
    }
  }

  return merged
}

/** Convenience: list of sections, in display order, used by the UI skeleton later. */
export const SECTION_ORDER: Section[] = [
  'businessProfile',
  'schedule',
  'sessionTypes',
  'billing',
  'payments',
  'whatsapp',
  'calendar',
  'safety',
]

// ─── Auto-fill source priority ───────────────────────────────────────────────

/**
 * Order from highest to lowest authority. The auto-fill orchestrator
 * (Phase 2+) walks this list and the first source that produces a defined
 * value wins. Documented here so the order is reviewable in one place.
 */
export const AUTO_FILL_PRIORITY: AutoFillSource[] = [
  'fitdesk-core-defaults',
  'business-profile',
  'trainer-profile',
  'auth-user',
  'tenant-onboarding',
  'country-language-defaults',
  'fitdesk-safe-defaults',
]

/** Type guard used by save endpoint validation later. */
export function isWeekday(value: unknown): value is Weekday {
  return value === 'sun' || value === 'mon' || value === 'tue' || value === 'wed'
      || value === 'thu' || value === 'fri' || value === 'sat'
}
