/**
 * Pure mapper: Add Client inputs → ClientCreateDraft for the Phase 1 local
 * create transaction (ClientRepository.createClientRow).
 *
 * Called from actions/clients.ts AFTER the ERP Customer is created (ADR-001:
 * ERPNext Customer is canonical). The resulting draft.erpCustomerId MUST be the
 * ERP Customer docname (createdClient.id) so local rows link to the canonical
 * identity and the directory detail link / invoices / payments keep working.
 *
 * Goal handling (v1.2.1 §5): a structured client_goal row is created ONLY when
 * the goal field cleanly parses to a trainer-selected array (→ high /
 * trainer_manual). Messy / legacy / empty goal data produces a display label
 * only and NO fabricated structured goal — structured backfill of unknown goals
 * is a backfill-only concern.
 */

import { normalizePhoneToE164 } from '@/lib/clients/phone'
import { formatGoal } from '@/lib/format/goal'
import type { Client } from '@/types'
import type { BillingMode, ClientCreateDraft } from '@/types/clients'

export type BuildClientCreateDraftInput = {
  /** Canonical tenant isolation key from getTenantContext(). */
  tenantId: string
  /** Better Auth user id (createdByUserId on the audit event), or null. */
  userId: string | null
  /** The ERP-backed Client returned by the approved createClient() path. */
  createdClient: Client
  /** Raw payload.custom_fitness_goals (free-text / JSON), if any. */
  customFitnessGoals?: string | null
  /**
   * Whether the trainer has enabled WhatsApp for this client — from the PhoneInput
   * has_whatsapp toggle (manual or AI-prefilled). Defaults to false when absent.
   */
  whatsappEnabled?: boolean | null
  /**
   * Duplicate-override audit (Phase 6). Set only when the trainer continued past
   * a possible-duplicate warning. possibleDuplicateClientId = matched client_index.id.
   */
  possibleDuplicateClientId?: string | null
  duplicateOverrideReason?: string | null
  /** Billing mode set by the trainer at add-time. Omit or null = 'unset'. */
  billingMode?: BillingMode | null
}

export type BuildClientCreateDraftResult = {
  draft: ClientCreateDraft
  /** False when the phone could not be normalized to E.164 and the raw value was kept. */
  phoneNormalized: boolean
}

/**
 * Extract a single trainer-selected goalId from the Add Client goal field.
 * The Add Client UI serializes selected goals as [{ label, value }] where value
 * is the goal id. We take the first entry that has a non-empty string `value`.
 * Anything else (plain string, object without `value`, unparseable) is treated
 * as messy → no structured goal (returns null).
 */
function parseTrainerGoalId(raw: string | null | undefined): string | null {
  if (!raw || raw.trim() === '') return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item !== null && typeof item === 'object') {
          const value = (item as Record<string, unknown>).value
          if (typeof value === 'string' && value.trim() !== '') {
            return value.trim()
          }
        }
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Build the local ClientCreateDraft from the created ERP Customer and the
 * original Add Client payload. Pure and synchronous — no I/O.
 */
export function buildClientCreateDraft(
  input: BuildClientCreateDraftInput,
): BuildClientCreateDraftResult {
  const { tenantId, userId, createdClient, customFitnessGoals } = input
  const possibleDuplicateClientId = input.possibleDuplicateClientId ?? null
  const duplicateOverrideReason = input.duplicateOverrideReason ?? null
  const billingMode: BillingMode = input.billingMode ?? 'unset'

  // Phone: prefer normalized E.164; fall back to the raw value so the row still
  // exists (never fail Add Client only because of phone formatting).
  const phoneResult = normalizePhoneToE164(createdClient.phone ?? '')
  const phoneNormalized = phoneResult.ok
  const phoneE164 = phoneResult.ok ? phoneResult.e164 : (createdClient.phone ?? '')

  // Goal: structured only when cleanly trainer-selected.
  const goalId = parseTrainerGoalId(customFitnessGoals)
  const primaryGoalLabel = formatGoal(customFitnessGoals) || null

  const draft: ClientCreateDraft = {
    tenantId,
    erpCustomerId:    createdClient.id, // canonical ERP Customer docname — invariant
    fullName:         createdClient.name,
    phoneE164,
    whatsappEnabled:  input.whatsappEnabled ?? false,
    primaryGoalLabel,
    primaryGoalId:    goalId,
    goalId,
    subGoalIds:       [],
    goalUrgency:      null,
    goalConfidence:   goalId ? 'high' : 'unknown',
    goalSource:       goalId ? 'trainer_manual' : 'system_inferred',
    safetyFlags:      [],
    goalNotes:        null,
    createdByUserId:  userId,
    possibleDuplicateClientId,
    duplicateOverrideReason,
    billingMode,
  }

  return { draft, phoneNormalized }
}
