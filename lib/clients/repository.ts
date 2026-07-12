/**
 * Tenant-scoped repository for Client Management local tables.
 *
 * RULES (enforced):
 *  1. Every public method requires ctx.tenantId — throws before any SQL if missing.
 *  2. No raw client SQL outside this file. Actions and components call this repository only.
 *  3. JSON columns (subGoalIdsJson, safetyFlagsJson, payloadJson) are serialized here;
 *     callers always see typed arrays/objects.
 *  4. createClientRow() is the ONLY path for creating a full local client record.
 *     It is NOT wired into actions/clients.ts yet (Phase 4).
 *
 * Architecture: ERPNext Customer remains canonical (ADR-001).
 * This repository owns only FitDesk local enrichment rows.
 */

import { and, desc, eq, or } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from '@/lib/db/schema'
import { computeSafetyFlags } from '@/lib/goals/safety'
import { canSendAutomatedWhatsApp, isOptedOut } from '@/lib/clients/consent'
import { isIntakeGoalId } from '@/lib/goals/taxonomy'
import type {
  ActionIntentPriority,
  ActionIntentSource,
  ActionIntentType,
  AddProgressEntryResult,
  BillingMode,
  ClientActionIntent,
  ClientActionIntentStatus,
  ClientCreateDraft,
  ClientCreateResult,
  ClientEvent,
  ClientGoal,
  ClientIndex,
  ClientIndexStatus,
  FieldConfidence,
  GoalSource,
  GoalStatus,
  GoalUrgency,
  MissingNextSessionCandidateResult,
  OnboardingState,
  PaymentSummary,
  ReminderCandidateResult,
  SafetyState,
  SelectedGoalDraft,
  WhatsAppConsentState,
} from '@/types/clients'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TenantCtx = {
  tenantId: string
}

type AppDb = LibSQLDatabase<typeof schema>

// ─── Hydration helpers ────────────────────────────────────────────────────────

function assertTenantId(ctx: TenantCtx): string {
  if (!ctx.tenantId || ctx.tenantId.trim() === '') {
    throw new Error('[ClientRepository] tenantId is required for all client queries')
  }
  return ctx.tenantId
}

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

type RawClientIndex = typeof schema.clientIndex.$inferSelect
type RawClientGoal = typeof schema.clientGoal.$inferSelect
type RawClientActionIntent = typeof schema.clientActionIntent.$inferSelect
type RawClientEvent = typeof schema.clientEvent.$inferSelect

function hydrateClientIndex(row: RawClientIndex): ClientIndex {
  return {
    id:                        row.id,
    tenantId:                  row.tenantId,
    erpCustomerId:             row.erpCustomerId,
    fullName:                  row.fullName,
    phoneE164:                 row.phoneE164,
    whatsappEnabled:           row.whatsappEnabled,
    whatsappConsentState:      row.whatsappConsentState as WhatsAppConsentState,
    status:                    row.status as ClientIndexStatus,
    primaryGoalLabel:          row.primaryGoalLabel,
    primaryGoalId:             row.primaryGoalId,
    safetyState:               row.safetyState as SafetyState,
    onboardingState:           row.onboardingState as OnboardingState,
    billingMode:               row.billingMode as BillingMode,
    paymentSummary:            row.paymentSummary as PaymentSummary,
    nextSessionAtUtc:          row.nextSessionAtUtc,
    lastActivityAtUtc:         row.lastActivityAtUtc,
    possibleDuplicateClientId: row.possibleDuplicateClientId,
    duplicateOverrideReason:   row.duplicateOverrideReason,
    createdAtUtc:              row.createdAtUtc,
    updatedAtUtc:              row.updatedAtUtc,
  }
}

function hydrateClientGoal(row: RawClientGoal): ClientGoal {
  return {
    id:                row.id,
    tenantId:          row.tenantId,
    clientIndexId:     row.clientIndexId,
    erpCustomerId:     row.erpCustomerId,
    goalId:            row.goalId,
    isPrimary:         row.isPrimary,
    subGoalIds:        parseJsonArray(row.subGoalIdsJson),
    trainerSubGoalIds: parseJsonArray(row.trainerSubGoalIdsJson),
    urgency:           row.urgency as GoalUrgency,
    confidence:        row.confidence as FieldConfidence,
    source:            row.source as GoalSource,
    safetyFlags:       parseJsonArray(row.safetyFlagsJson),
    notes:             row.notes,
    status:            row.status as GoalStatus,
    createdAtUtc:      row.createdAtUtc,
    updatedAtUtc:      row.updatedAtUtc,
  }
}

function hydrateClientActionIntent(row: RawClientActionIntent): ClientActionIntent {
  return {
    id:              row.id,
    tenantId:        row.tenantId,
    clientIndexId:   row.clientIndexId,
    erpCustomerId:   row.erpCustomerId,
    type:            row.type as ActionIntentType,
    status:          row.status as ClientActionIntentStatus,
    priority:        row.priority as ActionIntentPriority,
    source:          row.source as ActionIntentSource,
    reason:          row.reason,
    dueAtUtc:        row.dueAtUtc,
    completedAtUtc:  row.completedAtUtc,
    dismissedAtUtc:  row.dismissedAtUtc,
    expiresAtUtc:    row.expiresAtUtc,
    createdAtUtc:    row.createdAtUtc,
    updatedAtUtc:    row.updatedAtUtc,
  }
}

function hydrateClientEvent(row: RawClientEvent): ClientEvent {
  return {
    id:              row.id,
    tenantId:        row.tenantId,
    clientIndexId:   row.clientIndexId ?? null,
    erpCustomerId:   row.erpCustomerId ?? null,
    type:            row.type,
    payloadJson:     parseJsonObject(row.payloadJson),
    createdByUserId: row.createdByUserId ?? null,
    createdAtUtc:    row.createdAtUtc,
  }
}

// ─── Repository class ─────────────────────────────────────────────────────────

export class ClientRepository {
  constructor(private readonly db: AppDb) {}

  // ── Reads ────────────────────────────────────────────────────────────────

  async findClientByErpId(
    ctx: TenantCtx,
    erpCustomerId: string,
  ): Promise<ClientIndex | null> {
    const tenantId = assertTenantId(ctx)
    const rows = await this.db
      .select()
      .from(schema.clientIndex)
      .where(
        and(
          eq(schema.clientIndex.tenantId, tenantId),
          eq(schema.clientIndex.erpCustomerId, erpCustomerId),
        ),
      )
      .limit(1)
    return rows[0] ? hydrateClientIndex(rows[0]) : null
  }

  async findClientById(
    ctx: TenantCtx,
    clientIndexId: string,
  ): Promise<ClientIndex | null> {
    const tenantId = assertTenantId(ctx)
    const rows = await this.db
      .select()
      .from(schema.clientIndex)
      .where(
        and(
          eq(schema.clientIndex.tenantId, tenantId),
          eq(schema.clientIndex.id, clientIndexId),
        ),
      )
      .limit(1)
    return rows[0] ? hydrateClientIndex(rows[0]) : null
  }

  async findClientsByStatus(
    ctx: TenantCtx,
    status: ClientIndexStatus,
  ): Promise<ClientIndex[]> {
    const tenantId = assertTenantId(ctx)
    const rows = await this.db
      .select()
      .from(schema.clientIndex)
      .where(
        and(
          eq(schema.clientIndex.tenantId, tenantId),
          eq(schema.clientIndex.status, status),
        ),
      )
      .orderBy(desc(schema.clientIndex.updatedAtUtc))
    return rows.map(hydrateClientIndex)
  }

  async findClientsByPhone(
    ctx: TenantCtx,
    phoneE164: string,
  ): Promise<ClientIndex[]> {
    const tenantId = assertTenantId(ctx)
    const rows = await this.db
      .select()
      .from(schema.clientIndex)
      .where(
        and(
          eq(schema.clientIndex.tenantId, tenantId),
          eq(schema.clientIndex.phoneE164, phoneE164),
        ),
      )
    return rows.map(hydrateClientIndex)
  }

  async listClients(
    ctx: TenantCtx,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<ClientIndex[]> {
    const tenantId = assertTenantId(ctx)
    const limit = opts.limit ?? 100
    const offset = opts.offset ?? 0
    const rows = await this.db
      .select()
      .from(schema.clientIndex)
      .where(eq(schema.clientIndex.tenantId, tenantId))
      .orderBy(desc(schema.clientIndex.updatedAtUtc))
      .limit(limit)
      .offset(offset)
    return rows.map(hydrateClientIndex)
  }

  // ── Goals ────────────────────────────────────────────────────────────────

  async listGoals(ctx: TenantCtx, clientIndexId: string): Promise<ClientGoal[]> {
    const tenantId = assertTenantId(ctx)
    const rows = await this.db
      .select()
      .from(schema.clientGoal)
      .where(
        and(
          eq(schema.clientGoal.tenantId, tenantId),
          eq(schema.clientGoal.clientIndexId, clientIndexId),
        ),
      )
      .orderBy(desc(schema.clientGoal.createdAtUtc))
    return rows.map(hydrateClientGoal)
  }

  // ── Action intents ───────────────────────────────────────────────────────

  /**
   * Read a single action intent by id, tenant-scoped. Read-only — no status
   * transition. completeActionIntent/dismissActionIntent already do this
   * lookup internally but don't expose it; callers that need to inspect an
   * intent (e.g. verify its type/status) before deciding whether to act on
   * it (US-048) need this exposed separately.
   */
  async findActionIntentById(
    ctx: TenantCtx,
    intentId: string,
  ): Promise<ClientActionIntent | null> {
    const tenantId = assertTenantId(ctx)
    const rows = await this.db
      .select()
      .from(schema.clientActionIntent)
      .where(
        and(
          eq(schema.clientActionIntent.tenantId, tenantId),
          eq(schema.clientActionIntent.id, intentId),
        ),
      )
      .limit(1)
    return rows[0] ? hydrateClientActionIntent(rows[0]) : null
  }

  async listPendingActions(
    ctx: TenantCtx,
    clientIndexId: string,
  ): Promise<ClientActionIntent[]> {
    const tenantId = assertTenantId(ctx)
    const rows = await this.db
      .select()
      .from(schema.clientActionIntent)
      .where(
        and(
          eq(schema.clientActionIntent.tenantId, tenantId),
          eq(schema.clientActionIntent.clientIndexId, clientIndexId),
          eq(schema.clientActionIntent.status, 'pending'),
        ),
      )
      .orderBy(desc(schema.clientActionIntent.createdAtUtc))
    return rows.map(hydrateClientActionIntent)
  }

  // ── Events ───────────────────────────────────────────────────────────────

  async listEvents(ctx: TenantCtx, clientIndexId: string): Promise<ClientEvent[]> {
    const tenantId = assertTenantId(ctx)
    const rows = await this.db
      .select()
      .from(schema.clientEvent)
      .where(
        and(
          eq(schema.clientEvent.tenantId, tenantId),
          eq(schema.clientEvent.clientIndexId, clientIndexId),
        ),
      )
      .orderBy(desc(schema.clientEvent.createdAtUtc))
    return rows.map(hydrateClientEvent)
  }

  // ── Write: create local client rows ──────────────────────────────────────

  /**
   * Create a complete local client record in a single transaction.
   *
   * Creates: client_index + client_goal rows + initial action intents +
   * client_event:client.created.
   *
   * Goal insertion supports two paths:
   *   selectedGoals (non-empty) — multi-goal path: inserts one client_goal row per
   *     entry; sub-goal layer validation must be applied by the caller before passing
   *     (see sanitizeSelectedGoalDrafts in lib/clients/create-draft.ts).
   *   selectedGoals absent/empty — legacy single-goal path: inserts one row from
   *     draft.goalId when present.
   *
   * Call only after ERP Customer has already been created successfully (ADR-001).
   */
  async createClientRow(
    ctx: TenantCtx,
    draft: ClientCreateDraft,
    selectedGoals?: SelectedGoalDraft[],
  ): Promise<ClientCreateResult> {
    const tenantId = assertTenantId(ctx)
    const now = new Date().toISOString()

    const clientIndexId = crypto.randomUUID()
    const eventId = crypto.randomUUID()

    let createdGoal: ClientGoal | null = null
    let createdActions: ClientActionIntent[] = []
    let createdEvent!: ClientEvent

    const useMultiGoalPath = selectedGoals !== undefined && selectedGoals.length > 0

    await this.db.transaction(async (tx) => {
      // 1. Insert client_index
      await tx.insert(schema.clientIndex).values({
        id:                       clientIndexId,
        tenantId,
        erpCustomerId:            draft.erpCustomerId,
        fullName:                 draft.fullName,
        phoneE164:                draft.phoneE164,
        whatsappEnabled:          draft.whatsappEnabled,
        status:                   'active',
        primaryGoalLabel:         draft.primaryGoalLabel,
        primaryGoalId:            draft.primaryGoalId,
        safetyState:              draft.safetyState ?? 'clear',
        onboardingState:          'not_started',
        billingMode:              draft.billingMode ?? 'unset',
        paymentSummary:           'unset',
        nextSessionAtUtc:         null,
        lastActivityAtUtc:        now,
        possibleDuplicateClientId: draft.possibleDuplicateClientId ?? null,
        duplicateOverrideReason:   draft.duplicateOverrideReason ?? null,
        createdAtUtc:             now,
        updatedAtUtc:             now,
      })

      // 2a. Multi-goal path: insert one client_goal row per SelectedGoalDraft.
      //     The primary goal row is tracked for the return value.
      if (useMultiGoalPath) {
        for (const g of selectedGoals!) {
          const goalRowId = crypto.randomUUID()
          // Phase 3 — per-goal safety flags derived from the taxonomy (lib/goals/safety.ts),
          // not a hardcoded []. sanitizeSelectedGoalDrafts (actions/clients.ts) already
          // filters to known IntakeGoalIds; the guard here is defensive.
          const goalSafetyFlags = isIntakeGoalId(g.goalId)
            ? computeSafetyFlags([g.goalId]).map(f => f.id)
            : []
          await tx.insert(schema.clientGoal).values({
            id:                    goalRowId,
            tenantId,
            clientIndexId,
            erpCustomerId:         draft.erpCustomerId,
            goalId:                g.goalId,
            isPrimary:             g.isPrimary,
            subGoalIdsJson:        JSON.stringify(g.clientSubGoalIds),
            trainerSubGoalIdsJson: JSON.stringify(g.trainerSubGoalIds),
            urgency:               g.urgency,
            confidence:            'high',
            source:                'trainer_manual',
            safetyFlagsJson:       JSON.stringify(goalSafetyFlags),
            notes:                 g.trainerNotes,
            status:                'active',
            createdAtUtc:          now,
            updatedAtUtc:          now,
          })
          if (g.isPrimary) {
            createdGoal = {
              id:                goalRowId,
              tenantId,
              clientIndexId,
              erpCustomerId:     draft.erpCustomerId,
              goalId:            g.goalId,
              isPrimary:         true,
              subGoalIds:        g.clientSubGoalIds,
              trainerSubGoalIds: g.trainerSubGoalIds,
              urgency:           g.urgency as GoalUrgency,
              confidence:        'high',
              source:            'trainer_manual',
              safetyFlags:       goalSafetyFlags,
              notes:             g.trainerNotes,
              status:            'active',
              createdAtUtc:      now,
              updatedAtUtc:      now,
            }
          }
        }
      }

      // 2b. Legacy single-goal path: insert one row from draft.goalId when present.
      //     Only runs when selectedGoals is absent or empty.
      if (!useMultiGoalPath && draft.goalId) {
        const goalId = crypto.randomUUID()
        const isPrimary         = draft.isPrimary ?? true
        const trainerSubGoalIds = draft.trainerSubGoalIds ?? []
        await tx.insert(schema.clientGoal).values({
          id:                    goalId,
          tenantId,
          clientIndexId,
          erpCustomerId:         draft.erpCustomerId,
          goalId:                draft.goalId,
          isPrimary,
          subGoalIdsJson:        JSON.stringify(draft.subGoalIds),
          trainerSubGoalIdsJson: JSON.stringify(trainerSubGoalIds),
          urgency:               draft.goalUrgency ?? 'active_focus',
          confidence:            draft.goalConfidence,
          source:                draft.goalSource,
          safetyFlagsJson:       JSON.stringify(draft.safetyFlags),
          notes:                 draft.goalNotes,
          status:                'active',
          createdAtUtc:          now,
          updatedAtUtc:          now,
        })
        createdGoal = {
          id:                goalId,
          tenantId,
          clientIndexId,
          erpCustomerId:     draft.erpCustomerId,
          goalId:            draft.goalId,
          isPrimary,
          subGoalIds:        draft.subGoalIds,
          trainerSubGoalIds,
          urgency:           (draft.goalUrgency ?? 'active_focus') as GoalUrgency,
          confidence:        draft.goalConfidence,
          source:            draft.goalSource,
          safetyFlags:       draft.safetyFlags,
          notes:             draft.goalNotes,
          status:            'active',
          createdAtUtc:      now,
          updatedAtUtc:      now,
        }
      }

      // 3. Insert default action intents for a new client
      const defaultIntentTypes: ActionIntentType[] = [
        'send_whatsapp_welcome',
        'book_first_session',
        'setup_billing',
      ]
      const intentRows: ClientActionIntent[] = []
      for (const type of defaultIntentTypes) {
        const intentId = crypto.randomUUID()
        await tx.insert(schema.clientActionIntent).values({
          id:            intentId,
          tenantId,
          clientIndexId,
          erpCustomerId: draft.erpCustomerId,
          type,
          status:        'pending',
          priority:      'normal',
          source:        'system',
          reason:        null,
          dueAtUtc:      null,
          completedAtUtc: null,
          dismissedAtUtc: null,
          expiresAtUtc:  null,
          createdAtUtc:  now,
          updatedAtUtc:  now,
        })
        intentRows.push({
          id:            intentId,
          tenantId,
          clientIndexId,
          erpCustomerId: draft.erpCustomerId,
          type,
          status:        'pending',
          priority:      'normal',
          source:        'system',
          reason:        null,
          dueAtUtc:      null,
          completedAtUtc: null,
          dismissedAtUtc: null,
          expiresAtUtc:  null,
          createdAtUtc:  now,
          updatedAtUtc:  now,
        })
      }
      createdActions = intentRows

      // 4. Insert client_event:client.created
      const eventPayload: Record<string, unknown> = {
        erpCustomerId: draft.erpCustomerId,
        fullName:      draft.fullName,
      }
      await tx.insert(schema.clientEvent).values({
        id:              eventId,
        tenantId,
        clientIndexId,
        erpCustomerId:   draft.erpCustomerId,
        type:            'client.created',
        payloadJson:     JSON.stringify(eventPayload),
        createdByUserId: draft.createdByUserId,
        createdAtUtc:    now,
      })
      createdEvent = {
        id:              eventId,
        tenantId,
        clientIndexId,
        erpCustomerId:   draft.erpCustomerId,
        type:            'client.created',
        payloadJson:     eventPayload,
        createdByUserId: draft.createdByUserId,
        createdAtUtc:    now,
      }

      // 5. Duplicate-override audit (Phase 6): written in the SAME transaction so
      // the override event and the override columns can never diverge. Only when
      // the trainer continued past a possible-duplicate warning.
      if (draft.possibleDuplicateClientId) {
        await tx.insert(schema.clientEvent).values({
          id:              crypto.randomUUID(),
          tenantId,
          clientIndexId,
          erpCustomerId:   draft.erpCustomerId,
          type:            'duplicate.override',
          payloadJson:     JSON.stringify({
            possibleDuplicateClientId: draft.possibleDuplicateClientId,
            reason:                    draft.duplicateOverrideReason ?? null,
          }),
          createdByUserId: draft.createdByUserId,
          createdAtUtc:    now,
        })
      }
    })

    const createdClientIndex: ClientIndex = {
      id:                        clientIndexId,
      tenantId,
      erpCustomerId:             draft.erpCustomerId,
      fullName:                  draft.fullName,
      phoneE164:                 draft.phoneE164,
      whatsappEnabled:           draft.whatsappEnabled,
      whatsappConsentState:      'unknown',
      status:                    'active',
      primaryGoalLabel:          draft.primaryGoalLabel,
      primaryGoalId:             draft.primaryGoalId,
      safetyState:               draft.safetyState ?? 'clear',
      onboardingState:           'not_started',
      billingMode:               draft.billingMode ?? 'unset',
      paymentSummary:            'unset',
      nextSessionAtUtc:          null,
      lastActivityAtUtc:         now,
      possibleDuplicateClientId: draft.possibleDuplicateClientId ?? null,
      duplicateOverrideReason:   draft.duplicateOverrideReason ?? null,
      createdAtUtc:              now,
      updatedAtUtc:              now,
    }

    return {
      clientIndex: createdClientIndex,
      goal:        createdGoal,
      actions:     createdActions,
      event:       createdEvent,
    }
  }

  // ── Write: event ────────────────────────────────────────────────────────

  /**
   * Insert a single client_event row.
   * Used by backfill to record client.backfilled events without a full
   * createClientRow transaction.
   */
  async insertClientEvent(opts: {
    tenantId: string
    clientIndexId: string | null
    erpCustomerId: string | null
    type: string
    payloadJson: Record<string, unknown>
    createdByUserId: string | null
  }): Promise<ClientEvent> {
    assertTenantId({ tenantId: opts.tenantId })
    const now = new Date().toISOString()
    const id = crypto.randomUUID()

    await this.db.insert(schema.clientEvent).values({
      id,
      tenantId:        opts.tenantId,
      clientIndexId:   opts.clientIndexId ?? null,
      erpCustomerId:   opts.erpCustomerId ?? null,
      type:            opts.type,
      payloadJson:     JSON.stringify(opts.payloadJson),
      createdByUserId: opts.createdByUserId ?? null,
      createdAtUtc:    now,
    })

    return {
      id,
      tenantId:        opts.tenantId,
      clientIndexId:   opts.clientIndexId ?? null,
      erpCustomerId:   opts.erpCustomerId ?? null,
      type:            opts.type,
      payloadJson:     opts.payloadJson,
      createdByUserId: opts.createdByUserId ?? null,
      createdAtUtc:    now,
    }
  }

  /**
   * Add a trainer-authored free-text note (US-053).
   *
   * Fail-closed ownership check: verifies clientIndexId belongs to the caller's
   * tenant before writing (returns null otherwise), then delegates to the
   * generic insertClientEvent writer — no new table, just a client_event row
   * with type 'client.note'. Append-only: no edit/delete path exists.
   */
  async addClientNote(
    ctx: TenantCtx,
    clientIndexId: string,
    text: string,
  ): Promise<ClientEvent | null> {
    const tenantId = assertTenantId(ctx)
    const clientRows = await this.db
      .select()
      .from(schema.clientIndex)
      .where(and(eq(schema.clientIndex.tenantId, tenantId), eq(schema.clientIndex.id, clientIndexId)))
      .limit(1)
    const clientRow = clientRows[0]
    if (!clientRow) return null

    return this.insertClientEvent({
      tenantId,
      clientIndexId:   clientRow.id,
      erpCustomerId:   clientRow.erpCustomerId,
      type:            'client.note',
      payloadJson:     { text },
      createdByUserId: null,
    })
  }

  /**
   * Add a trainer-authored progress entry, optionally linked to one of the
   * client's own goals (US-052).
   *
   * Same reuse pattern as addClientNote — a client_event row with type
   * 'client.progress', no new table. When goalId is provided it is verified
   * against the client's own client_goal rows before the link is stored
   * (fails closed to invalid_goal_link rather than storing an unrelated or
   * cross-tenant goal reference).
   */
  async addProgressEntry(
    ctx: TenantCtx,
    clientIndexId: string,
    text: string,
    goalId: string | null,
  ): Promise<AddProgressEntryResult> {
    const tenantId = assertTenantId(ctx)
    const clientRows = await this.db
      .select()
      .from(schema.clientIndex)
      .where(and(eq(schema.clientIndex.tenantId, tenantId), eq(schema.clientIndex.id, clientIndexId)))
      .limit(1)
    const clientRow = clientRows[0]
    if (!clientRow) return { outcome: 'client_not_found' }

    if (goalId) {
      const goalRows = await this.db
        .select()
        .from(schema.clientGoal)
        .where(
          and(
            eq(schema.clientGoal.tenantId, tenantId),
            eq(schema.clientGoal.clientIndexId, clientIndexId),
            eq(schema.clientGoal.goalId, goalId),
          ),
        )
        .limit(1)
      if (!goalRows[0]) return { outcome: 'invalid_goal_link' }
    }

    const event = await this.insertClientEvent({
      tenantId,
      clientIndexId:   clientRow.id,
      erpCustomerId:   clientRow.erpCustomerId,
      type:            'client.progress',
      payloadJson:     { text, goalId },
      createdByUserId: null,
    })
    return { outcome: 'created', event }
  }

  // ── Write: backfill upsert ────────────────────────────────────────────────

  /**
   * Repair local billing mode from ERP canonical truth.
   *
   * This is intentionally narrow:
   * - only transitions unset -> package/pay_per_session
   * - never overwrites an existing Package/PPS mode
   * - writes a local audit event in the same transaction
   * - performs no ERP, invoice, payment, package, or ledger writes
   */
  async setBillingModeIfUnset(
    ctx: TenantCtx,
    erpCustomerId: string,
    mode: Exclude<BillingMode, 'unset'>,
  ): Promise<ClientIndex | null> {
    const tenantId = assertTenantId(ctx)
    const now = new Date().toISOString()

    let updated: ClientIndex | null = null

    await this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(schema.clientIndex)
        .where(
          and(
            eq(schema.clientIndex.tenantId, tenantId),
            eq(schema.clientIndex.erpCustomerId, erpCustomerId),
          ),
        )
        .limit(1)

      const row = rows[0]
      if (!row) return
      if (row.billingMode !== 'unset') return

      await tx
        .update(schema.clientIndex)
        .set({
          billingMode:  mode,
          updatedAtUtc: now,
        })
        .where(
          and(
            eq(schema.clientIndex.tenantId, tenantId),
            eq(schema.clientIndex.erpCustomerId, erpCustomerId),
            eq(schema.clientIndex.billingMode, 'unset'),
          ),
        )

      await tx.insert(schema.clientEvent).values({
        id:              crypto.randomUUID(),
        tenantId,
        clientIndexId:   row.id,
        erpCustomerId:   row.erpCustomerId,
        type:            'client.billing_mode_synced',
        payloadJson:     JSON.stringify({
          previousMode: 'unset',
          newMode:      mode,
          source:       'erp_customer',
        }),
        createdByUserId: null,
        createdAtUtc:    now,
      })

      updated = hydrateClientIndex({
        ...row,
        billingMode:  mode,
        updatedAtUtc: now,
      })
    })

    return updated
  }

  /**
   * Set the client's WhatsApp consent state (US-059).
   *
   * Unlike setBillingModeIfUnset, this is not a one-way transition — a
   * trainer may change a client's consent in either direction (e.g. opted_in
   * -> opted_out after a client asks to stop). Every actual change is
   * written in the same transaction as its client_event audit row. Setting
   * the same state the row already has is a no-op (no event written) rather
   * than fabricating an audit entry for a non-change.
   *
   * Returns null when no client_index row exists for this tenant+erpCustomerId
   * (fail closed — no row is created here).
   */
  async setWhatsAppConsent(
    ctx: TenantCtx,
    erpCustomerId: string,
    newState: WhatsAppConsentState,
  ): Promise<ClientIndex | null> {
    const tenantId = assertTenantId(ctx)
    const now = new Date().toISOString()

    let result: ClientIndex | null = null

    await this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(schema.clientIndex)
        .where(
          and(
            eq(schema.clientIndex.tenantId, tenantId),
            eq(schema.clientIndex.erpCustomerId, erpCustomerId),
          ),
        )
        .limit(1)

      const row = rows[0]
      if (!row) return

      const previousState = row.whatsappConsentState as WhatsAppConsentState

      if (previousState === newState) {
        result = hydrateClientIndex(row)
        return
      }

      await tx
        .update(schema.clientIndex)
        .set({
          whatsappConsentState: newState,
          updatedAtUtc:         now,
        })
        .where(
          and(
            eq(schema.clientIndex.tenantId, tenantId),
            eq(schema.clientIndex.erpCustomerId, erpCustomerId),
          ),
        )

      await tx.insert(schema.clientEvent).values({
        id:              crypto.randomUUID(),
        tenantId,
        clientIndexId:   row.id,
        erpCustomerId:   row.erpCustomerId,
        type:            'client.whatsapp_consent_changed',
        payloadJson:     JSON.stringify({
          previousState,
          newState,
          source: 'trainer_manual',
        }),
        createdByUserId: null,
        createdAtUtc:    now,
      })

      result = hydrateClientIndex({
        ...row,
        whatsappConsentState: newState,
        updatedAtUtc:         now,
      })
    })

    return result
  }

  /**
   * Create a trainer-approved WhatsApp reminder candidate (US-050) —
   * suggestion/approval infrastructure only, never an automatic send. Never
   * calls Evolution API, never writes message_log, never sends anything.
   *
   * Consent-gated using the same canSendAutomatedWhatsApp predicate US-059
   * uses everywhere else, so this can never drift from the rest of the
   * app's consent enforcement:
   *   - opted_out  -> blocked, no intent created, no override.
   *   - unknown    -> blocked ("unknown blocks reminder generation" — see
   *                   CLAUDE.md's WhatsApp Consent States, tier-1 authority).
   *                   A future "Send Initial Opt-In Request" action is a
   *                   different intent type, not this one.
   *   - opted_in   -> a pending client_action_intent row is created for the
   *                   trainer to review and act on via the EXISTING
   *                   completeActionIntent/dismissActionIntent lifecycle —
   *                   no new approval mechanism.
   *
   * `reason` is caller-supplied free text (e.g. why this reminder is being
   * suggested) — this method does not decide WHEN to suggest a reminder,
   * only whether consent allows creating the candidate. See
   * docs/execution/us-050-reminder-candidates-plan.md for why no automatic
   * trigger (e.g. low package balance) is wired in here.
   */
  async createWhatsAppReminderCandidate(
    ctx: TenantCtx,
    clientIndexId: string,
    reason: string,
  ): Promise<ReminderCandidateResult> {
    const tenantId = assertTenantId(ctx)

    const rows = await this.db
      .select()
      .from(schema.clientIndex)
      .where(
        and(
          eq(schema.clientIndex.tenantId, tenantId),
          eq(schema.clientIndex.id, clientIndexId),
        ),
      )
      .limit(1)

    const row = rows[0]
    if (!row) return { outcome: 'client_not_found' }

    const consentState = row.whatsappConsentState as WhatsAppConsentState

    if (!canSendAutomatedWhatsApp(consentState)) {
      return {
        outcome: 'blocked',
        reason:  isOptedOut(consentState) ? 'opted_out' : 'consent_unknown',
      }
    }

    const now = new Date().toISOString()
    const intentId = crypto.randomUUID()

    await this.db.insert(schema.clientActionIntent).values({
      id:             intentId,
      tenantId,
      clientIndexId:  row.id,
      erpCustomerId:  row.erpCustomerId,
      type:           'whatsapp_reminder_candidate',
      status:         'pending',
      priority:       'normal',
      source:         'system',
      reason,
      dueAtUtc:       null,
      completedAtUtc: null,
      dismissedAtUtc: null,
      expiresAtUtc:   null,
      createdAtUtc:   now,
      updatedAtUtc:   now,
    })

    return {
      outcome: 'created',
      intent: {
        id:             intentId,
        tenantId,
        clientIndexId:  row.id,
        erpCustomerId:  row.erpCustomerId,
        type:           'whatsapp_reminder_candidate',
        status:         'pending',
        priority:       'normal',
        source:         'system',
        reason,
        dueAtUtc:       null,
        completedAtUtc: null,
        dismissedAtUtc: null,
        expiresAtUtc:   null,
        createdAtUtc:   now,
        updatedAtUtc:   now,
      },
    }
  }

  /**
   * Create a "missing next session" action intent (labeled "US-038" by the
   * batch that requested it; canonical US-038 is "Client Pulse" — this
   * matches US-003/US-027's "missing next sessions where data exists"
   * criterion instead; see docs/execution/us-038-missing-next-session-plan.md).
   *
   * This method is duplicate-prevention only — it does NOT decide whether a
   * next-session signal is warranted. The caller (action layer) must fetch
   * the client's FD Sessions and apply hasSessionHistory/hasUpcomingSession
   * (lib/scheduling/attendance.ts) BEFORE calling this. If a pending
   * `missing_next_session` intent already exists for this client, that
   * existing intent is returned (`already_pending`) instead of creating a
   * second one.
   *
   * Never auto-books anything — this only ever creates a reviewable
   * suggestion the trainer must act on via the existing
   * completeActionIntent/dismissActionIntent lifecycle.
   */
  async createMissingNextSessionCandidate(
    ctx: TenantCtx,
    clientIndexId: string,
  ): Promise<MissingNextSessionCandidateResult> {
    const tenantId = assertTenantId(ctx)

    const clientRows = await this.db
      .select()
      .from(schema.clientIndex)
      .where(
        and(
          eq(schema.clientIndex.tenantId, tenantId),
          eq(schema.clientIndex.id, clientIndexId),
        ),
      )
      .limit(1)

    const clientRow = clientRows[0]
    if (!clientRow) return { outcome: 'client_not_found' }

    const existingPending = await this.listPendingActions(ctx, clientIndexId)
    const alreadyPending = existingPending.find(a => a.type === 'missing_next_session')
    if (alreadyPending) return { outcome: 'already_pending', intent: alreadyPending }

    const now = new Date().toISOString()
    const intentId = crypto.randomUUID()

    await this.db.insert(schema.clientActionIntent).values({
      id:             intentId,
      tenantId,
      clientIndexId:  clientRow.id,
      erpCustomerId:  clientRow.erpCustomerId,
      type:           'missing_next_session',
      status:         'pending',
      priority:       'normal',
      source:         'system',
      reason:         'No upcoming session booked',
      dueAtUtc:       null,
      completedAtUtc: null,
      dismissedAtUtc: null,
      expiresAtUtc:   null,
      createdAtUtc:   now,
      updatedAtUtc:   now,
    })

    return {
      outcome: 'created',
      intent: {
        id:             intentId,
        tenantId,
        clientIndexId:  clientRow.id,
        erpCustomerId:  clientRow.erpCustomerId,
        type:           'missing_next_session',
        status:         'pending',
        priority:       'normal',
        source:         'system',
        reason:         'No upcoming session booked',
        dueAtUtc:       null,
        completedAtUtc: null,
        dismissedAtUtc: null,
        expiresAtUtc:   null,
        createdAtUtc:   now,
        updatedAtUtc:   now,
      },
    }
  }

  /**
   * Project the client's next-session timestamp (Phase 5B).
   *
   * Tenant- and client-scoped: the guard read and the UPDATE both filter on
   * (tenantId, clientIndexId). Updates ONLY nextSessionAtUtc + updatedAtUtc —
   * no other client_index column, and no sibling table, is touched. Unlike
   * setBillingModeIfUnset this has no "only if unset" guard: the projection
   * is a refreshable cache, not a one-way transition, so writing the same or
   * a new value is always allowed. Pass null to clear (no qualifying future
   * session). No ERP calls — the caller supplies the derived value.
   */
  async setClientNextSessionAtUtc(
    ctx: TenantCtx,
    clientIndexId: string,
    nextSessionAtUtc: string | null,
  ): Promise<ClientIndex | null> {
    const tenantId = assertTenantId(ctx)
    const now = new Date().toISOString()

    const existing = await this.findClientById(ctx, clientIndexId)
    if (!existing) return null

    await this.db
      .update(schema.clientIndex)
      .set({
        nextSessionAtUtc,
        updatedAtUtc: now,
      })
      .where(
        and(
          eq(schema.clientIndex.tenantId, tenantId),
          eq(schema.clientIndex.id, clientIndexId),
        ),
      )

    return { ...existing, nextSessionAtUtc, updatedAtUtc: now }
  }

  /**
   * Idempotent upsert used by the backfill script.
   * INSERT OR IGNORE on the (tenantId, erpCustomerId) unique index.
   * If the row already exists, updates safe summary fields only.
   * Never deletes ERP records or resets data.
   */
  async upsertClientFromBackfill(
    ctx: TenantCtx,
    draft: ClientCreateDraft,
  ): Promise<ClientIndex> {
    const tenantId = assertTenantId(ctx)
    const now = new Date().toISOString()

    const existing = await this.findClientByErpId(ctx, draft.erpCustomerId)

    if (existing) {
      // Update safe summary fields only — do not overwrite trainer-edited data
      await this.db
        .update(schema.clientIndex)
        .set({
          fullName:         draft.fullName,
          phoneE164:        draft.phoneE164,
          primaryGoalLabel: draft.primaryGoalLabel,
          primaryGoalId:    draft.primaryGoalId,
          updatedAtUtc:     now,
        })
        .where(
          and(
            eq(schema.clientIndex.tenantId, tenantId),
            eq(schema.clientIndex.erpCustomerId, draft.erpCustomerId),
          ),
        )
      return { ...existing, fullName: draft.fullName, phoneE164: draft.phoneE164, updatedAtUtc: now }
    }

    // New row — insert with default state
    const clientIndexId = crypto.randomUUID()
    const newRow: ClientIndex = {
      id:                        clientIndexId,
      tenantId,
      erpCustomerId:             draft.erpCustomerId,
      fullName:                  draft.fullName,
      phoneE164:                 draft.phoneE164,
      whatsappEnabled:           draft.whatsappEnabled,
      whatsappConsentState:      'unknown',
      status:                    'active',
      primaryGoalLabel:          draft.primaryGoalLabel,
      primaryGoalId:             draft.primaryGoalId,
      safetyState:               'clear',
      onboardingState:           'not_started',
      billingMode:               'unset',
      paymentSummary:            'unset',
      nextSessionAtUtc:          null,
      lastActivityAtUtc:         now,
      possibleDuplicateClientId: null,
      duplicateOverrideReason:   null,
      createdAtUtc:              now,
      updatedAtUtc:              now,
    }

    await this.db.insert(schema.clientIndex).values({
      ...newRow,
      whatsappEnabled: newRow.whatsappEnabled,
    })

    return newRow
  }

  // ── Write: action intent transitions (Phase 7) ─────────────────────────────

  /**
   * Mark a pending/in_progress action intent as completed.
   *
   * Tenant filter is applied in both the guard SELECT and the UPDATE — a caller
   * holding tenant A's session cannot mutate tenant B's rows even if they guess
   * an intent id. Returns null (no-op) when the intent is not found in this tenant
   * or is already in a terminal status (completed/dismissed/expired).
   */
  async completeActionIntent(
    ctx: TenantCtx,
    intentId: string,
  ): Promise<ClientActionIntent | null> {
    const tenantId = assertTenantId(ctx)
    const now = new Date().toISOString()

    // Guard read: tenant-scoped, confirms existence and transitionable status.
    const existing = await this.db
      .select()
      .from(schema.clientActionIntent)
      .where(
        and(
          eq(schema.clientActionIntent.tenantId, tenantId),
          eq(schema.clientActionIntent.id, intentId),
        ),
      )
      .limit(1)

    const row = existing[0]
    if (!row) return null
    if (row.status !== 'pending' && row.status !== 'in_progress') return null

    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.clientActionIntent)
        .set({ status: 'completed', completedAtUtc: now, updatedAtUtc: now })
        .where(
          and(
            eq(schema.clientActionIntent.tenantId, tenantId),
            eq(schema.clientActionIntent.id, intentId),
            or(
              eq(schema.clientActionIntent.status, 'pending'),
              eq(schema.clientActionIntent.status, 'in_progress'),
            ),
          ),
        )

      await tx.insert(schema.clientEvent).values({
        id:              crypto.randomUUID(),
        tenantId,
        clientIndexId:   row.clientIndexId,
        erpCustomerId:   row.erpCustomerId,
        type:            'action_intent.completed',
        payloadJson:     JSON.stringify({ intentId, intentType: row.type }),
        createdByUserId: null,
        createdAtUtc:    now,
      })
    })

    return hydrateClientActionIntent({
      ...row,
      status:         'completed',
      completedAtUtc: now,
      updatedAtUtc:   now,
    })
  }

  /**
   * Mark a pending/in_progress action intent as dismissed.
   *
   * Same tenant-filter and null/no-op contract as completeActionIntent.
   */
  async dismissActionIntent(
    ctx: TenantCtx,
    intentId: string,
  ): Promise<ClientActionIntent | null> {
    const tenantId = assertTenantId(ctx)
    const now = new Date().toISOString()

    const existing = await this.db
      .select()
      .from(schema.clientActionIntent)
      .where(
        and(
          eq(schema.clientActionIntent.tenantId, tenantId),
          eq(schema.clientActionIntent.id, intentId),
        ),
      )
      .limit(1)

    const row = existing[0]
    if (!row) return null
    if (row.status !== 'pending' && row.status !== 'in_progress') return null

    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.clientActionIntent)
        .set({ status: 'dismissed', dismissedAtUtc: now, updatedAtUtc: now })
        .where(
          and(
            eq(schema.clientActionIntent.tenantId, tenantId),
            eq(schema.clientActionIntent.id, intentId),
            or(
              eq(schema.clientActionIntent.status, 'pending'),
              eq(schema.clientActionIntent.status, 'in_progress'),
            ),
          ),
        )

      await tx.insert(schema.clientEvent).values({
        id:              crypto.randomUUID(),
        tenantId,
        clientIndexId:   row.clientIndexId,
        erpCustomerId:   row.erpCustomerId,
        type:            'action_intent.dismissed',
        payloadJson:     JSON.stringify({ intentId, intentType: row.type }),
        createdByUserId: null,
        createdAtUtc:    now,
      })
    })

    return hydrateClientActionIntent({
      ...row,
      status:          'dismissed',
      dismissedAtUtc:  now,
      updatedAtUtc:    now,
    })
  }
}
