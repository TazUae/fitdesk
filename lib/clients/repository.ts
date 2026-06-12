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

import { and, desc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from '@/lib/db/schema'
import type {
  ActionIntentPriority,
  ActionIntentSource,
  ActionIntentType,
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
  OnboardingState,
  PaymentSummary,
  SafetyState,
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
    id:            row.id,
    tenantId:      row.tenantId,
    clientIndexId: row.clientIndexId,
    erpCustomerId: row.erpCustomerId,
    goalId:        row.goalId,
    subGoalIds:    parseJsonArray(row.subGoalIdsJson),
    urgency:       row.urgency as GoalUrgency,
    confidence:    row.confidence as FieldConfidence,
    source:        row.source as GoalSource,
    safetyFlags:   parseJsonArray(row.safetyFlagsJson),
    notes:         row.notes,
    status:        row.status as GoalStatus,
    createdAtUtc:  row.createdAtUtc,
    updatedAtUtc:  row.updatedAtUtc,
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
   * Creates: client_index + client_goal (if goalId present) + initial
   * action intents + client_event:client.created.
   *
   * NOT wired into actions/clients.ts yet — that is Phase 4.
   * Call only after ERP Customer has already been created successfully.
   */
  async createClientRow(
    ctx: TenantCtx,
    draft: ClientCreateDraft,
  ): Promise<ClientCreateResult> {
    const tenantId = assertTenantId(ctx)
    const now = new Date().toISOString()

    const clientIndexId = crypto.randomUUID()
    const eventId = crypto.randomUUID()

    let createdGoal: ClientGoal | null = null
    let createdActions: ClientActionIntent[] = []
    let createdEvent!: ClientEvent

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
        safetyState:              'clear',
        onboardingState:          'not_started',
        billingMode:              'unset',
        paymentSummary:           'unset',
        nextSessionAtUtc:         null,
        lastActivityAtUtc:        now,
        possibleDuplicateClientId: null,
        duplicateOverrideReason:   null,
        createdAtUtc:             now,
        updatedAtUtc:             now,
      })

      // 2. Insert client_goal if goalId is provided
      if (draft.goalId) {
        const goalId = crypto.randomUUID()
        await tx.insert(schema.clientGoal).values({
          id:              goalId,
          tenantId,
          clientIndexId,
          erpCustomerId:   draft.erpCustomerId,
          goalId:          draft.goalId,
          subGoalIdsJson:  JSON.stringify(draft.subGoalIds),
          urgency:         draft.goalUrgency ?? 'active_focus',
          confidence:      draft.goalConfidence,
          source:          draft.goalSource,
          safetyFlagsJson: JSON.stringify(draft.safetyFlags),
          notes:           draft.goalNotes,
          status:          'active',
          createdAtUtc:    now,
          updatedAtUtc:    now,
        })
        createdGoal = {
          id:            goalId,
          tenantId,
          clientIndexId,
          erpCustomerId: draft.erpCustomerId,
          goalId:        draft.goalId,
          subGoalIds:    draft.subGoalIds,
          urgency:       (draft.goalUrgency ?? 'active_focus') as GoalUrgency,
          confidence:    draft.goalConfidence,
          source:        draft.goalSource,
          safetyFlags:   draft.safetyFlags,
          notes:         draft.goalNotes,
          status:        'active',
          createdAtUtc:  now,
          updatedAtUtc:  now,
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
    })

    const createdClientIndex: ClientIndex = {
      id:                        clientIndexId,
      tenantId,
      erpCustomerId:             draft.erpCustomerId,
      fullName:                  draft.fullName,
      phoneE164:                 draft.phoneE164,
      whatsappEnabled:           draft.whatsappEnabled,
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

    return {
      clientIndex: createdClientIndex,
      goal:        createdGoal,
      actions:     createdActions,
      event:       createdEvent,
    }
  }

  // ── Write: backfill upsert ────────────────────────────────────────────────

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
}
