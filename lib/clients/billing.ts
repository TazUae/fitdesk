/**
 * Client billing setup — pure helpers for the new-client billing section.
 *
 * Phase C: collects a billing mode at client creation. No invoice automation,
 * no balance decrement, no payment logic — this module only validates the
 * trainer's input and maps it to the Phase B Customer fields.
 */
import type { CreateClientPayload } from '@/lib/erpnext/types'

// ─── Billing mode ─────────────────────────────────────────────────────────────

export type BillingMode = 'Package' | 'Pay Per Session' | 'Trial'

export const BILLING_MODES: BillingMode[] = ['Package', 'Pay Per Session', 'Trial']

// ─── Draft (raw form state) ───────────────────────────────────────────────────

/**
 * In-memory billing state held by the new-client form. Numeric fields are kept
 * as raw input strings; parsing/validation happens in the functions below.
 */
export interface BillingDraft {
  mode:            BillingMode | null
  /** Pay Per Session — agreed per-session rate. */
  sessionRate:     string
  /** Package — label for the purchased package. */
  packageName:     string
  /** Package — initial number of sessions in the package. */
  packageSessions: string
}

export const emptyBillingDraft: BillingDraft = {
  mode:            null,
  sessionRate:     '',
  packageName:     '',
  packageSessions: '',
}

// ─── Validation ───────────────────────────────────────────────────────────────

export type BillingValidation = { ok: true } | { ok: false; error: string }

/**
 * Validate a billing draft. Only fields relevant to the selected mode are
 * inspected, so stale values in unrelated fields cannot cause a false failure.
 */
export function validateBillingDraft(draft: BillingDraft): BillingValidation {
  if (draft.mode === null) {
    return { ok: false, error: 'Choose how this client will be billed.' }
  }

  if (draft.mode === 'Pay Per Session') {
    if (draft.sessionRate.trim() === '') {
      return { ok: false, error: 'Enter a session rate.' }
    }
    const rate = Number(draft.sessionRate)
    if (!Number.isFinite(rate) || rate <= 0) {
      return { ok: false, error: 'Session rate must be greater than 0.' }
    }
  }

  if (draft.mode === 'Package') {
    if (draft.packageName.trim() === '') {
      return { ok: false, error: 'Enter a package name.' }
    }
    if (draft.packageSessions.trim() === '') {
      return { ok: false, error: 'Enter the number of sessions in this package.' }
    }
    const count = Number(draft.packageSessions)
    if (!Number.isInteger(count) || count < 1) {
      return { ok: false, error: 'Sessions must be a whole number greater than 0.' }
    }
  }

  return { ok: true }
}

// ─── Payload mapping ──────────────────────────────────────────────────────────

type BillingPayloadFields = Partial<Pick<CreateClientPayload,
  | 'custom_billing_mode'
  | 'custom_default_session_rate'
  | 'custom_package_name'
  | 'custom_remaining_sessions'
>>

/**
 * Map a billing draft to the Phase B Customer fields. Emits only the keys
 * relevant to the selected mode — never stale data from another mode.
 * Call after `validateBillingDraft` returns ok.
 */
export function billingPayloadFields(draft: BillingDraft): BillingPayloadFields {
  switch (draft.mode) {
    case 'Trial':
      return { custom_billing_mode: 'Trial' }
    case 'Pay Per Session':
      return {
        custom_billing_mode:         'Pay Per Session',
        custom_default_session_rate: Number(draft.sessionRate),
      }
    case 'Package':
      return {
        custom_billing_mode:       'Package',
        custom_package_name:       draft.packageName.trim(),
        custom_remaining_sessions: Number(draft.packageSessions),
      }
    default:
      return {}
  }
}

// ─── Display ──────────────────────────────────────────────────────────────────

/**
 * One-line human summary of a client's billing setup, for the post-create
 * success screen. Returns '' when no billing mode is set.
 */
export function describeBilling(billing: {
  billingMode?:        BillingMode | null
  defaultSessionRate?: number
  packageName?:        string
  remainingSessions?:  number
}): string {
  switch (billing.billingMode) {
    case 'Trial':
      return 'Trial — no charge'
    case 'Pay Per Session':
      return billing.defaultSessionRate != null
        ? `Pay per session · ${billing.defaultSessionRate}/session`
        : 'Pay per session'
    case 'Package': {
      const parts: string[] = []
      if (billing.packageName) parts.push(`Package: ${billing.packageName}`)
      else                     parts.push('Package')
      if (billing.remainingSessions != null) {
        const n = billing.remainingSessions
        parts.push(`${n} ${n === 1 ? 'session' : 'sessions'}`)
      }
      return parts.join(' · ')
    }
    default:
      return ''
  }
}
