/**
 * Client Management v1.2.1 — local enrichment layer type contracts.
 *
 * These types describe the FitDesk local read model and enrichment tables.
 * ERPNext Customer remains the canonical business identity (ADR-001).
 *
 * ClientIndex.erpCustomerId = ERPNext Customer docname (required for MVP
 * active/billable clients). client_index.id is a local UUID, NOT the business
 * client identity for ERP-backed flows.
 *
 * NOTE: ClientIndexStatus ('active' | 'inactive' | 'archived') is the local
 * client_index row status. The ERP-backed ClientStatus in types/index.ts has
 * different values ('active' | 'inactive' | 'paused') — keep them distinct.
 */

// ─── Status literals ──────────────────────────────────────────────────────────

/** Local client_index row status. See types/index.ts:ClientStatus for the ERP-backed variant. */
export type ClientIndexStatus = 'active' | 'inactive' | 'archived'

export type SafetyState = 'clear' | 'needs_review' | 'blocked_downstream'

export type OnboardingState = 'not_started' | 'sent' | 'in_progress' | 'completed'

export type BillingMode = 'package' | 'pay_per_session' | 'unset'

export type PaymentSummary = 'paid' | 'to_collect' | 'overdue' | 'unset'

/**
 * WhatsApp consent state (US-059). Default is 'unknown' — never treated as
 * permission to send automated messages. 'opted_out' blocks all future
 * WhatsApp delivery/reminder eligibility with no override. Only 'opted_in'
 * is eligible for automated/reminder-candidate workflows (see
 * lib/clients/consent.ts's canSendAutomatedWhatsApp).
 */
export type WhatsAppConsentState = 'unknown' | 'opted_in' | 'opted_out'

// ─── Goal literals ────────────────────────────────────────────────────────────

/** Confidence level for a field value — from AI parse, trainer input, or unknown. */
export type FieldConfidence = 'high' | 'medium' | 'low' | 'unknown'

/** Alias used on goal-specific confidence fields. */
export type GoalConfidence = FieldConfidence

/** Origin of a parsed or entered field value. */
export type FieldSource = 'ai_parse' | 'trainer_manual' | 'system_inferred'

/** Alias used on goal-specific source fields. */
export type GoalSource = FieldSource

export type GoalUrgency = 'urgent' | 'active_focus' | 'background'

export type GoalStatus = 'active' | 'archived'

/** Map of legacy goal ID → canonical primary sub-goal ID, from the Add Client intake UI. */
export type ClientStatedSubGoals = Record<string, string>

/**
 * Structured primary-goal payload from the Add Client Smart Accordion (Phase 4C-B).
 *
 * goalId is a canonical IntakeGoalId. subGoalIds are client-stated (primary-layer)
 * canonical sub-goal IDs; trainerSubGoalIds are trainer-assessed (secondary-layer)
 * canonical sub-goal IDs. Persisted to the single client_goal row (is_primary = true);
 * sub-goal arrays are validated by layer in buildClientCreateDraft before storage.
 *
 * @deprecated Legacy single-goal contract. Use SelectedGoalDraft[] + selectedGoals
 * option for new multi-goal workspace submissions (Phase 4D+). The server action
 * bridges this automatically when only primaryGoal is present.
 */
export type AddClientPrimaryGoal = {
  goalId: string
  subGoalIds: string[]
  trainerSubGoalIds: string[]
  urgency: GoalUrgency
}

/**
 * Structured goal payload for the multi-goal Add Client workspace (Phase 4D+).
 *
 * goalId             — canonical IntakeGoalId string; validated server-side
 * isPrimary          — exactly one entry per submission must be true
 * clientSubGoalIds   — client-stated sub-goals (taxonomy layer 'primary')
 * trainerSubGoalIds  — trainer-assessed sub-goals (taxonomy layer 'secondary')
 * trainerNotes       — per-goal trainer note entered in the goal inspector
 */
export type SelectedGoalDraft = {
  goalId: string
  isPrimary: boolean
  urgency: GoalUrgency
  clientSubGoalIds: string[]
  trainerSubGoalIds: string[]
  trainerNotes: string | null
}

// ─── Action intent literals ───────────────────────────────────────────────────

export type ActionIntentType =
  | 'send_whatsapp_welcome'
  | 'send_intake_form'
  | 'book_first_session'
  | 'setup_billing'
  | 'create_program'
  | 'review_safety_note'
  /**
   * US-050 — a trainer-approved suggestion to send a WhatsApp reminder.
   * Suggestion only, never auto-sent: completing this intent means the
   * trainer reviewed and sent it manually (elsewhere); dismissing means
   * they declined. Only ever created for opted_in clients — see
   * lib/clients/repository.ts's createWhatsAppReminderCandidate.
   */
  | 'whatsapp_reminder_candidate'
  /**
   * A suggestion to book the client's next session — never an auto-booking.
   * Only created for an active client with prior session history and no
   * currently-scheduled future session (see
   * lib/scheduling/attendance.ts's hasSessionHistory/hasUpcomingSession).
   * Completing this intent means the trainer booked a session elsewhere;
   * dismissing means they reviewed and declined for now.
   */
  | 'missing_next_session'

export type ClientActionIntentStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'dismissed'
  | 'expired'

/** @deprecated Use ClientActionIntentStatus */
export type ActionIntentStatus = ClientActionIntentStatus

export type ActionIntentPriority = 'low' | 'normal' | 'high'

export type ActionIntentSource = 'system' | 'ai_parse' | 'trainer_manual'

// ─── Core entity types ────────────────────────────────────────────────────────

/**
 * Local read model and enrichment row linked to an ERPNext Customer.
 *
 * id          = local FitDesk UUID — NOT the business client ID for ERP flows.
 * erpCustomerId = ERPNext Customer docname — required for MVP active/billable clients.
 */
export type ClientIndex = {
  id: string
  tenantId: string
  erpCustomerId: string

  fullName: string
  phoneE164: string
  whatsappEnabled: boolean
  whatsappConsentState: WhatsAppConsentState
  status: ClientIndexStatus

  primaryGoalLabel: string | null
  primaryGoalId: string | null
  safetyState: SafetyState

  onboardingState: OnboardingState
  billingMode: BillingMode
  paymentSummary: PaymentSummary

  /** Placeholder for MVP — null until a real session store exists. */
  nextSessionAtUtc: string | null
  lastActivityAtUtc: string | null

  possibleDuplicateClientId: string | null
  duplicateOverrideReason: string | null

  createdAtUtc: string
  updatedAtUtc: string
}

/** Structured training goal stored locally — linked to a ClientIndex row. */
export type ClientGoal = {
  id: string
  tenantId: string
  clientIndexId: string
  erpCustomerId: string

  goalId: string
  isPrimary: boolean
  subGoalIds: string[]
  trainerSubGoalIds: string[]
  urgency: GoalUrgency
  confidence: GoalConfidence
  source: GoalSource
  safetyFlags: string[]
  notes: string | null
  status: GoalStatus

  createdAtUtc: string
  updatedAtUtc: string
}

/**
 * Suggested next action for a client — never auto-executed.
 * Trainer reviews and acts on each intent manually.
 */
export type ClientActionIntent = {
  id: string
  tenantId: string
  clientIndexId: string
  erpCustomerId: string

  type: ActionIntentType
  status: ClientActionIntentStatus
  priority: ActionIntentPriority
  source: ActionIntentSource
  reason: string | null

  dueAtUtc: string | null
  completedAtUtc: string | null
  dismissedAtUtc: string | null
  expiresAtUtc: string | null

  createdAtUtc: string
  updatedAtUtc: string
}

/** Local audit trail event for client workflows. */
export type ClientEvent = {
  id: string
  tenantId: string
  clientIndexId: string | null
  erpCustomerId: string | null
  type: string
  payloadJson: Record<string, unknown>
  createdByUserId: string | null
  createdAtUtc: string
}

// ─── Helper and draft types ───────────────────────────────────────────────────

/**
 * A field value with its parse confidence and source — used for AI-assisted
 * form pre-fill where the trainer must review before confirming.
 */
export type ParsedField<T> = {
  value: T | null
  confidence: FieldConfidence
  source: 'ai_parse' | 'trainer_manual'
}

/** A potential duplicate client found by the tenant-scoped duplicate check. */
export type DuplicateClientMatch = {
  clientIndexId: string
  erpCustomerId: string
  fullName: string
  phoneE164: string
  status: ClientIndexStatus
  matchType: 'exact_phone' | 'possible_name'
  confidence: FieldConfidence
}

/**
 * Input to the local row creation transaction (after ERP Customer is already
 * created). All required fields must be resolved before calling the repository.
 */
export type ClientCreateDraft = {
  tenantId: string
  erpCustomerId: string
  fullName: string
  phoneE164: string
  whatsappEnabled: boolean
  primaryGoalLabel: string | null
  primaryGoalId: string | null
  goalId: string | null
  isPrimary?: boolean
  subGoalIds: string[]
  trainerSubGoalIds?: string[]
  goalUrgency: GoalUrgency | null
  goalConfidence: GoalConfidence
  goalSource: GoalSource
  safetyFlags: string[]
  /**
   * Phase 3 — client_index-level safety state derived from the full selected-goal
   * set via computeSafetyFlags/deriveSafetyState (lib/goals/safety.ts). Optional so
   * existing draft literals (tests, backfill) default to 'clear' in the repository.
   */
  safetyState?: SafetyState
  goalNotes: string | null
  createdByUserId: string | null
  /**
   * Duplicate-override audit (Phase 6). Set only when the trainer chose
   * "Continue anyway" past a possible-duplicate warning.
   * possibleDuplicateClientId references the matched client_index.id (local UUID).
   */
  possibleDuplicateClientId?: string | null
  duplicateOverrideReason?: string | null
  /** Billing mode to store in the local client_index row. Defaults to 'unset'. */
  billingMode?: BillingMode
}

/** Result of the local row creation transaction. */
export type ClientCreateResult = {
  clientIndex: ClientIndex
  goal: ClientGoal | null
  actions: ClientActionIntent[]
  event: ClientEvent
}

/**
 * Result of attempting to create a WhatsApp reminder candidate (US-050).
 * Consent-gated — see ClientRepository.createWhatsAppReminderCandidate.
 * Distinguishes the two block reasons because the UI should say something
 * different for each ("this client opted out" vs "ask for consent first").
 */
export type ReminderCandidateResult =
  | { outcome: 'created'; intent: ClientActionIntent }
  | { outcome: 'blocked'; reason: 'opted_out' | 'consent_unknown' }
  | { outcome: 'client_not_found' }

/**
 * Result of attempting to create a missing-next-session action intent.
 * `already_pending` (not a duplicate create) is returned when one is already
 * outstanding for this client — see
 * ClientRepository.createMissingNextSessionCandidate.
 */
export type MissingNextSessionCandidateResult =
  | { outcome: 'created'; intent: ClientActionIntent }
  | { outcome: 'already_pending'; intent: ClientActionIntent }
  | { outcome: 'client_not_found' }

// ─── Summary types (for Client Hub and Directory) ─────────────────────────────

export type ClientGoalSummary = {
  id: string
  goalId: string
  urgency: GoalUrgency
  confidence: GoalConfidence
  primaryGoalLabel: string | null
  status: GoalStatus
}

export type ClientActionIntentSummary = {
  id: string
  type: ActionIntentType
  status: ClientActionIntentStatus
  priority: ActionIntentPriority
  reason: string | null
  dueAtUtc: string | null
}

export type ClientNoteSummary = {
  id: string
  type: string
  createdAtUtc: string
  /**
   * Trainer-authored free text (US-053), populated only for `type: 'client.note'`
   * events. Null for every other event type — those remain label-only in the UI.
   */
  text: string | null
}

/** Compact package session balance derived from the local ledger — shown in the Client Hub Packages card. */
export type ClientPackageBalanceSummary = {
  totalAvailableSessions: number
  activePurchaseCount: number
  displayTemplateName: string | null
}

/** One-payload overview for the Client Hub MVP — hydrated from local tables only. */
export type ClientHubOverview = {
  client: {
    clientIndexId: string
    erpCustomerId: string
    fullName: string
    phoneE164: string
    whatsappEnabled: boolean
    status: ClientIndexStatus
    safetyState: SafetyState
    onboardingState: OnboardingState
    billingMode: BillingMode
    paymentSummary: PaymentSummary
    primaryGoalLabel: string | null
    nextSessionAtUtc: string | null
    lastActivityAtUtc: string | null
  }
  goals: ClientGoalSummary[]
  pendingActions: ClientActionIntentSummary[]
  recentNotes: ClientNoteSummary[]
  packageBalance: ClientPackageBalanceSummary | null
  placeholders: {
    trainingProgram: { status: 'not_started' | 'available_later'; label: string }
    progress: { status: 'not_started' | 'available_later'; label: string }
  }
}

// ─── AI parse types (Phase 5) ─────────────────────────────────────────────────

/**
 * UI and server states for the optional AI-assisted Add Client parse.
 * idle/parsing are client-side states; the server action returns terminal states only.
 */
export type AiParseState =
  | 'idle'
  | 'parsing'
  | 'partial_success'
  | 'low_confidence'
  | 'failed'
  | 'timeout'

/**
 * Structured output of the AI parse — one ParsedField per Add Client form field.
 * Trainer reviews and edits all fields before submitting.
 * Safety, medical, and billing fields are intentionally excluded from AI parse.
 */
export type ClientParseFields = {
  fullName:        ParsedField<string>
  /** value = normalized E.164 string when parseable; null otherwise. */
  phone:           ParsedField<string>
  whatsappEnabled: ParsedField<boolean>
  /** Each value must be a canonical GOALS id from components/ui/GoalSelect.tsx. */
  goals:           ParsedField<string[]>
  notes:           ParsedField<string>
}

export type ClientParseResult = {
  /** Terminal result state (server action never returns 'idle' or 'parsing'). */
  state: Exclude<AiParseState, 'idle' | 'parsing'>
  fields: ClientParseFields
}
