'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getClientById, getClients, updateClient } from '@/lib/business-data/erp-adapter'
import { getCustomerBillingMode } from '@/lib/erpnext/client'
import { resolveTrainerId } from '@/lib/auth/resolve-trainer'
import { getTenantContext } from '@/lib/tenant/context'
import { ClientRepository } from '@/lib/clients/repository'
import { buildClientCreateDraft } from '@/lib/clients/create-draft'
import { findDuplicatesByPhone } from '@/lib/clients/duplicates'
import { normalizePhoneToE164 } from '@/lib/clients/phone'
import { parseClientText, failedParseResult } from '@/lib/clients/ai-parse'
import { db } from '@/lib/db'
import { sanitizeSelectedGoalDrafts } from '@/lib/clients/create-draft'
import { detectConflicts } from '@/lib/goals/conflicts'
import { computeSafetyFlags, deriveSafetyState } from '@/lib/goals/safety'
import { isIntakeGoalId, type IntakeGoalId } from '@/lib/goals/taxonomy'
import type { ActionResult, Client } from '@/types'
import type { AddClientPrimaryGoal, BillingMode, ClientStatedSubGoals, DuplicateClientMatch, ClientParseResult, SelectedGoalDraft, WhatsAppConsentState } from '@/types/clients'
import type { CreateClientPayload, UpdateClientPayload } from '@/lib/erpnext/types'

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function fetchClients(): Promise<ActionResult<Client[]>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    const data = await getClients(resolved.trainerId)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch clients' }
  }
}

export async function fetchClientById(id: string): Promise<ActionResult<Client>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    const data = await getClientById(id, resolved.trainerId)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch client' }
  }
}

/**
 * Tenant-scoped exact-phone duplicate check used by Add Client BEFORE ERP
 * Customer creation (Phase 6). Advisory only — never blocks creation here.
 *
 * Matches against the local client_index read model within the current tenant;
 * cross-tenant matches are never returned. Fails open: when the tenant or phone
 * cannot be resolved, returns an empty list so creation can proceed.
 */
export async function findClientDuplicates(
  rawPhone: string,
): Promise<ActionResult<DuplicateClientMatch[]>> {
  try {
    const ctx = await getTenantContext()
    if (!ctx?.tenantId) return { success: true, data: [] }

    const phone = normalizePhoneToE164(rawPhone)
    if (!phone.ok) return { success: true, data: [] }

    const repo = new ClientRepository(db)
    const matches = await findDuplicatesByPhone(repo, { tenantId: ctx.tenantId }, phone.e164)
    return { success: true, data: matches }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to check duplicates' }
  }
}

/**
 * Optional AI-assisted client info extraction (Phase 5).
 *
 * Parses free-form trainer text into suggested Add Client form fields.
 * Auth-gated so ANTHROPIC_API_KEY is never exposed to unauthenticated callers.
 * Never creates a client, never calls ERP, never stores the raw text.
 *
 * Fail contract: any internal error → success:true, state:'failed' so the manual
 * form always remains usable. success:false is reserved for auth failures only.
 */
export async function parseClientDetails(
  rawText: string,
): Promise<ActionResult<ClientParseResult>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    const text = String(rawText ?? '').trim().slice(0, 2000)
    if (!text) return { success: true, data: failedParseResult() }
    const result = await parseClientText(text)
    return { success: true, data: result }
  } catch {
    return { success: true, data: failedParseResult() }
  }
}

/**
 * Add a new client.
 * The trainer field is injected server-side from the auth session —
 * callers must NOT include it in the payload.
 *
 * Flow (ADR-001, ERP-authoritative hybrid):
 *   1. Create the ERP Customer through the approved proxy path (canonical identity).
 *   2. Synchronously write local FitDesk enrichment rows (client_index + goal +
 *      inert action intents + client.created event) via the Phase 1 transaction.
 *
 * Success is returned only after BOTH complete. If ERP creation fails, no local
 * rows are written. If ERP succeeds but the local write fails, the ERP Customer
 * is left intact (never deleted/modified) and a recoverable error is returned so
 * the trainer does not re-create (which would duplicate the ERP Customer); Phase 2
 * backfill repairs the missing local rows.
 */
export async function addClient(
  payload: Omit<CreateClientPayload, 'trainer'>,
  options?: {
    /** Set by the UI when the trainer continued past a possible-duplicate warning. */
    overrideDuplicate?: boolean
    /** Required when overrideDuplicate is true — captured in the duplicate.override audit. */
    duplicateOverrideReason?: string
    /** The matched client_index.id (local UUID) the trainer chose to override. */
    possibleDuplicateClientId?: string
    /** Whether WhatsApp is enabled for this client — from the PhoneInput has_whatsapp toggle. */
    whatsappEnabled?: boolean
    /** Billing mode set at add-time. Mapped to ERP custom_billing_mode on creation. */
    billingMode?: BillingMode
    /** Client-stated sub-goals from the Add Client intake UI — forwarded to the local draft. */
    clientStatedSubGoals?: ClientStatedSubGoals
    /**
     * Structured primary-goal payload from the Smart Accordion (Phase 4C-B).
     * Supersedes clientStatedSubGoals for the primary goal; carries client-stated
     * sub-goals, trainer-assessed sub-goals, and urgency for the local goal row.
     *
     * @deprecated Pass selectedGoals for the multi-goal workspace (Phase 4D+).
     * When only primaryGoal is present the server action bridges it automatically
     * into a 1-item selectedGoals array so existing UI callers require no changes.
     */
    primaryGoal?: AddClientPrimaryGoal
    /**
     * Multi-goal workspace payload (Phase 4D+).
     *
     * Array of all goals the trainer selected in the goal workspace. Exactly one
     * entry must have isPrimary === true. Sub-goals are sanitized server-side
     * (cross-layer IDs are silently dropped). When absent, the legacy primaryGoal
     * option is used as a 1-item bridge. When both are absent, no client_goal rows
     * are written unless custom_fitness_goals contains a parseable goal ID.
     */
    selectedGoals?: SelectedGoalDraft[]
  },
): Promise<ActionResult<Client>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  // Phase 6 — when overriding a possible-duplicate warning, a reason is REQUIRED.
  // Enforced server-side (the UI also disables Continue until a reason is entered).
  const overrideReason = options?.overrideDuplicate
    ? (options.duplicateOverrideReason?.trim() ?? '')
    : null
  if (options?.overrideDuplicate && !overrideReason) {
    return { success: false, error: 'A reason is required to add a possible duplicate client.' }
  }

  // Legacy UI bridge: when only primaryGoal is provided (Smart Accordion / Phase 4C-B),
  // wrap it in a 1-item SelectedGoalDraft[] so the repository always uses the same
  // multi-goal insert path. GoalAccordion, AddClientForm, and AddClientSheet are
  // completely unchanged — they still send primaryGoal, never selectedGoals.
  let resolvedGoals: SelectedGoalDraft[] | undefined = options?.selectedGoals
  if (!resolvedGoals && options?.primaryGoal) {
    resolvedGoals = [{
      goalId:           options.primaryGoal.goalId,
      isPrimary:        true,
      urgency:          options.primaryGoal.urgency,
      clientSubGoalIds: options.primaryGoal.subGoalIds,
      trainerSubGoalIds: options.primaryGoal.trainerSubGoalIds,
      trainerNotes:     null,
    }]
  }

  // Invariant: when goals are provided, exactly one must be primary.
  // Checked before the ERP call so no Customer is created for an invalid payload.
  let goalIds: IntakeGoalId[] = []
  if (resolvedGoals && resolvedGoals.length > 0) {
    const primaryCount = resolvedGoals.filter(g => g.isPrimary).length
    if (primaryCount !== 1) {
      return {
        success: false,
        error: `Exactly one goal must be marked as primary (got ${primaryCount}).`,
      }
    }
    // Sanitize: drop unknown goalIds; strip cross-layer sub-goal IDs.
    resolvedGoals = sanitizeSelectedGoalDrafts(resolvedGoals)

    // Phase 3 — server-side hard-conflict rejection. Reuses the same
    // GOAL_CONFLICT_RULES / detectConflicts the UI uses (lib/goals/conflicts.ts),
    // so a crafted payload that bypasses the UI's own hard-conflict intercept
    // still cannot reach ERP Customer creation with an unsafe goal combination.
    goalIds = resolvedGoals.map(g => g.goalId).filter(isIntakeGoalId)
    const hardConflicts = detectConflicts(goalIds).filter(c => c.type === 'hard')
    if (hardConflicts.length > 0) {
      return { success: false, error: hardConflicts[0].message }
    }
  }

  // Map app BillingMode to ERP Select option string (custom_default_session_rate flows via payload).
  const erpBillingMode =
    options?.billingMode === 'package'         ? 'Package' :
    options?.billingMode === 'pay_per_session' ? 'Pay Per Session' :
    undefined

  // Step 1 — create the ERP Customer (canonical identity).
  let data: Client
  try {
    data = await createClient({
      ...payload,
      trainer: resolved.trainerId,
      ...(erpBillingMode ? { custom_billing_mode: erpBillingMode } : {}),
    })
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create client' }
  }

  // Step 2 — write local enrichment rows. ERP Customer is now canonical; on any
  // failure here we DO NOT touch the ERP Customer and return a recoverable error.
  let tenantIdForLog: string | null = null
  try {
    const ctx = await getTenantContext()
    if (!ctx?.tenantId) {
      throw new Error('No tenant context available after ERP create')
    }
    tenantIdForLog = ctx.tenantId

    const { draft, phoneNormalized } = buildClientCreateDraft({
      tenantId:           ctx.tenantId,
      userId:             ctx.userId ?? null,
      createdClient:      data,
      customFitnessGoals:    payload.custom_fitness_goals ?? null,
      whatsappEnabled:       options?.whatsappEnabled ?? false,
      billingMode:           options?.billingMode ?? null,
      clientStatedSubGoals:  options?.clientStatedSubGoals ?? null,
      primaryGoal:           options?.primaryGoal ?? null,
      possibleDuplicateClientId: options?.overrideDuplicate ? (options.possibleDuplicateClientId ?? null) : null,
      duplicateOverrideReason:   options?.overrideDuplicate ? overrideReason : null,
    })

    // Phase 3 — when a multi-goal / bridged-primary payload was provided, the
    // client_index-level safetyState must reflect the FULL selected-goal set
    // (buildClientCreateDraft only sees the single custom_fitness_goals-parsed
    // goalId). Reuses the same computeSafetyFlags/deriveSafetyState the UI uses.
    if (goalIds.length > 0) {
      draft.safetyState = deriveSafetyState(computeSafetyFlags(goalIds))
    }

    const repo = new ClientRepository(db)
    await repo.createClientRow(
      { tenantId: ctx.tenantId },
      draft,
      resolvedGoals && resolvedGoals.length > 0 ? resolvedGoals : undefined,
    )

    // Audit-only: phone could not be normalized to E.164 and the raw value was
    // stored. Recorded so backfill/repair can fix it later. No PII beyond the flag.
    if (!phoneNormalized) {
      await repo.insertClientEvent({
        tenantId:        ctx.tenantId,
        clientIndexId:   null,
        erpCustomerId:   data.id,
        type:            'client.phone_unnormalized',
        payloadJson:     { phoneNormalized: false },
        createdByUserId: ctx.userId ?? null,
      })
    }

    return { success: true, data }
  } catch (err) {
    // Log with tenantId only — no secrets / PII.
    console.error(
      `[addClient] ERP Customer created but local row creation failed for tenant ${tenantIdForLog ?? 'unknown'}:`,
      err instanceof Error ? err.message : String(err),
    )
    return {
      success: false,
      error:
        'The client was created in ERP, but the local FitDesk profile needs repair. ' +
        'Do not create this client again; run backfill/repair.',
    }
  }
}

export async function editClient(
  id: string,
  payload: UpdateClientPayload,
): Promise<ActionResult<Client>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    const data = await updateClient(id, payload, resolved.trainerId)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update client' }
  }
}

export async function syncClientBillingMode(
  erpCustomerId: string,
): Promise<ActionResult<{ applied: boolean; mode?: Exclude<BillingMode, 'unset'>; reason?: 'already_set' | 'erp_unset' }>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    const ctx = await getTenantContext()
    if (!ctx?.tenantId) return { success: false, error: 'Tenant context not available.' }

    const repo = new ClientRepository(db)
    const existing = await repo.findClientByErpId({ tenantId: ctx.tenantId }, erpCustomerId)
    if (!existing) return { success: false, error: 'Client profile not found.' }

    if (existing.billingMode !== 'unset') {
      return {
        success: true,
        data: {
          applied: false,
          mode: existing.billingMode as Exclude<BillingMode, 'unset'>,
          reason: 'already_set',
        },
      }
    }

    const erpMode = await getCustomerBillingMode(erpCustomerId)
    if (!erpMode) {
      return { success: true, data: { applied: false, reason: 'erp_unset' } }
    }

    const updated = await repo.setBillingModeIfUnset({ tenantId: ctx.tenantId }, erpCustomerId, erpMode)
    if (!updated) {
      const latest = await repo.findClientByErpId({ tenantId: ctx.tenantId }, erpCustomerId)
      if (latest && latest.billingMode !== 'unset') {
        return {
          success: true,
          data: {
            applied: false,
            mode: latest.billingMode as Exclude<BillingMode, 'unset'>,
            reason: 'already_set',
          },
        }
      }
      return { success: false, error: 'Billing setup could not be synced.' }
    }

    revalidatePath(`/dashboard/clients/${encodeURIComponent(erpCustomerId)}`)
    revalidatePath('/dashboard/clients')

    return { success: true, data: { applied: true, mode: erpMode } }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to sync billing setup.',
    }
  }
}

/**
 * Set a client's WhatsApp consent state (US-059).
 *
 * Trainer-initiated only — there is no automated consent-flip path anywhere
 * in this codebase. Every actual change is tenant-scoped and auditable via
 * ClientRepository.setWhatsAppConsent's client_event write. This action does
 * not send any WhatsApp message and does not call the Evolution API.
 */
export async function setWhatsAppConsentAction(
  erpCustomerId: string,
  newState: WhatsAppConsentState,
): Promise<ActionResult<{ whatsappConsentState: WhatsAppConsentState }>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    const ctx = await getTenantContext()
    if (!ctx?.tenantId) return { success: false, error: 'Tenant context not available.' }

    const repo = new ClientRepository(db)
    const updated = await repo.setWhatsAppConsent({ tenantId: ctx.tenantId }, erpCustomerId, newState)
    if (!updated) return { success: false, error: 'Client profile not found.' }

    revalidatePath(`/dashboard/clients/${encodeURIComponent(erpCustomerId)}`)

    return { success: true, data: { whatsappConsentState: updated.whatsappConsentState } }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update WhatsApp consent.',
    }
  }
}

/**
 * Soft-delete: marks the client Inactive in ERPNext.
 * ERPNext data is never deleted — this preserves the audit trail for sessions
 * and invoices while hiding the client from active lists.
 */
export async function deleteClient(id: string): Promise<ActionResult<Client>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    const data = await updateClient(id, { status: 'Inactive' }, resolved.trainerId)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to deactivate client' }
  }
}

/**
 * Complete a pending action intent (Phase 7).
 *
 * Pure local status transition — writes status='completed', completedAtUtc, and an
 * action_intent.completed audit event. Never triggers WhatsApp, invoices, payments,
 * sessions, or programs. The intent is advisory only.
 *
 * Returns success:false (not found) when the intent does not exist in this tenant
 * or is already in a terminal status.
 */
export async function completeClientAction(
  intentId: string,
): Promise<ActionResult<{ intentId: string }>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    const ctx = await getTenantContext()
    if (!ctx?.tenantId) return { success: false, error: 'Tenant context not available.' }

    const repo = new ClientRepository(db)
    const result = await repo.completeActionIntent({ tenantId: ctx.tenantId }, intentId)
    if (!result) return { success: false, error: 'Action not found or already completed.' }

    revalidatePath(`/dashboard/clients/${encodeURIComponent(result.erpCustomerId)}`)
    return { success: true, data: { intentId } }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to complete action.',
    }
  }
}

/**
 * Dismiss a pending action intent (Phase 7).
 *
 * Pure local status transition — writes status='dismissed', dismissedAtUtc, and an
 * action_intent.dismissed audit event. Same no-side-effect contract as completeClientAction.
 */
export async function dismissClientAction(
  intentId: string,
): Promise<ActionResult<{ intentId: string }>> {
  const resolved = await resolveTrainerId()
  if ('error' in resolved) return { success: false, error: resolved.error }

  try {
    const ctx = await getTenantContext()
    if (!ctx?.tenantId) return { success: false, error: 'Tenant context not available.' }

    const repo = new ClientRepository(db)
    const result = await repo.dismissActionIntent({ tenantId: ctx.tenantId }, intentId)
    if (!result) return { success: false, error: 'Action not found or already dismissed.' }

    revalidatePath(`/dashboard/clients/${encodeURIComponent(result.erpCustomerId)}`)
    return { success: true, data: { intentId } }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to dismiss action.',
    }
  }
}
