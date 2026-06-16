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

// ─── Action intent literals ───────────────────────────────────────────────────

export type ActionIntentType =
  | 'send_whatsapp_welcome'
  | 'send_intake_form'
  | 'book_first_session'
  | 'setup_billing'
  | 'create_program'
  | 'review_safety_note'

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
  subGoalIds: string[]
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
  subGoalIds: string[]
  goalUrgency: GoalUrgency | null
  goalConfidence: GoalConfidence
  goalSource: GoalSource
  safetyFlags: string[]
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
