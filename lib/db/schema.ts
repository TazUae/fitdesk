import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

// ─── Better Auth tables ───────────────────────────────────────────────────────
// These must match the tables created by scripts/migrate.mjs and
// scripts/migrate-app.mjs exactly.
// Column names are camelCase as expected by the Drizzle adapter.

export const user = sqliteTable('user', {
  id:            text('id').primaryKey(),
  name:          text('name').notNull(),
  email:         text('email').notNull().unique(),
  emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull().default(false),
  image:         text('image'),
  createdAt:     integer('createdAt', { mode: 'timestamp' }).notNull(),
  updatedAt:     integer('updatedAt', { mode: 'timestamp' }).notNull(),
  // Additional field — collected at registration, synced to ERPNext trainer profile
  phone:         text('phone'),
})

export const session = sqliteTable('session', {
  id:          text('id').primaryKey(),
  expiresAt:   integer('expiresAt', { mode: 'timestamp' }).notNull(),
  token:       text('token').notNull().unique(),
  createdAt:   integer('createdAt', { mode: 'timestamp' }).notNull(),
  updatedAt:   integer('updatedAt', { mode: 'timestamp' }).notNull(),
  ipAddress:   text('ipAddress'),
  userAgent:   text('userAgent'),
  userId:      text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
})

export const account = sqliteTable('account', {
  id:                    text('id').primaryKey(),
  accountId:             text('accountId').notNull(),
  providerId:            text('providerId').notNull(),
  userId:                text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken:           text('accessToken'),
  refreshToken:          text('refreshToken'),
  idToken:               text('idToken'),
  accessTokenExpiresAt:  integer('accessTokenExpiresAt',  { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refreshTokenExpiresAt', { mode: 'timestamp' }),
  scope:                 text('scope'),
  password:              text('password'),
  createdAt:             integer('createdAt', { mode: 'timestamp' }).notNull(),
  updatedAt:             integer('updatedAt', { mode: 'timestamp' }).notNull(),
})

export const verification = sqliteTable('verification', {
  id:         text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value:      text('value').notNull(),
  expiresAt:  integer('expiresAt', { mode: 'timestamp' }).notNull(),
  createdAt:  integer('createdAt', { mode: 'timestamp' }),
  updatedAt:  integer('updatedAt', { mode: 'timestamp' }),
})

// ─── FitDesk custom tables ────────────────────────────────────────────────────

/**
 * Maps a Better Auth user ID to an ERPNext Trainer docname.
 * Populated on registration via the Better Auth user.create.after hook.
 */
export const trainerMapping = sqliteTable('trainer_mapping', {
  userId:       text('user_id').primaryKey().notNull(),
  erpTrainerId: text('erp_trainer_id').notNull(),
  createdAt:    text('created_at').notNull(),
})

/**
 * Tracks each trainer's per-instance WhatsApp connection via Evolution API.
 * One row per trainer — upserted on every status change.
 */
export const trainerWhatsAppConnection = sqliteTable('trainer_whatsapp_connection', {
  id:                  text('id').primaryKey().notNull(),
  trainerId:           text('trainerId').notNull().unique(),
  instanceName:        text('instanceName').notNull(),
  instanceId:          text('instanceId'),
  status:              text('status').notNull().default('not_connected'),
  phoneNumber:         text('phoneNumber'),
  displayName:         text('displayName'),
  qrCode:              text('qrCode'),
  pairingCode:         text('pairingCode'),
  lastError:           text('lastError'),
  lastConnectedAt:     integer('lastConnectedAt',    { mode: 'timestamp' }),
  lastDisconnectedAt:  integer('lastDisconnectedAt', { mode: 'timestamp' }),
  createdAt:           integer('createdAt', { mode: 'timestamp' }).notNull(),
  updatedAt:           integer('updatedAt', { mode: 'timestamp' }).notNull(),
})

/**
 * Audit log of outgoing WhatsApp messages.
 * One row per send attempt (whether succeeded or failed).
 * Created by scripts/migrate-app.mjs — run that after pulling this schema version.
 */
export const messageLog = sqliteTable('message_log', {
  id:                 text('id').primaryKey().notNull(),
  trainerId:          text('trainer_id').notNull(),
  clientId:           text('client_id').notNull(),
  messageType:        text('message_type').notNull(),
  body:               text('body').notNull(),
  status:             text('status').notNull(),         // 'sent' | 'failed'
  errorDetail:        text('error_detail'),
  sentAt:             text('sent_at').notNull(),        // ISO-8601
  evolutionMessageId: text('evolution_message_id'),
})

/**
 * Tracks Control Plane workspace provisioning jobs per user.
 */
export const workspaceProvisioning = sqliteTable('WorkspaceProvisioning', {
  id:            text('id').primaryKey().notNull(),
  userId:        text('userId').notNull(),
  slug:          text('slug').notNull(),
  tenantId:      text('tenantId'),
  jobId:         text('jobId').notNull(),
  status:        text('status').notNull(),
  failureReason: text('failureReason'),
  lastSyncedAt:  text('lastSyncedAt'),
  createdAt:     text('createdAt').notNull(),
  updatedAt:     text('updatedAt').notNull(),
})

// ─── Client Management v1.2.1 — local enrichment tables ──────────────────────
// These are additive read-model tables. ERPNext Customer remains canonical.
// Every table requires tenantId — shared auth.db has no ambient tenant isolation.
// See: docs/adr/ADR-001-client-management-erp-authoritative-hybrid.md

/**
 * Local read model linked to an ERPNext Customer.
 * erpCustomerId = ERPNext Customer docname (required, unique per tenant for MVP).
 * id = local UUID — NOT the business client identity for ERP-backed flows.
 * Timestamps are ISO-8601 UTC TEXT (matching WorkspaceProvisioning / messageLog).
 * JSON arrays are stored as *Json TEXT columns; the repository hydrates them.
 */
export const clientIndex = sqliteTable(
  'client_index',
  {
    id:                       text('id').primaryKey().notNull(),
    tenantId:                 text('tenant_id').notNull(),
    erpCustomerId:            text('erp_customer_id').notNull(),

    fullName:                 text('full_name').notNull(),
    phoneE164:                text('phone_e164').notNull(),
    whatsappEnabled:          integer('whatsapp_enabled', { mode: 'boolean' }).notNull().default(false),
    status:                   text('status').notNull().default('active'),

    primaryGoalLabel:         text('primary_goal_label'),
    primaryGoalId:            text('primary_goal_id'),
    safetyState:              text('safety_state').notNull().default('clear'),

    onboardingState:          text('onboarding_state').notNull().default('not_started'),
    billingMode:              text('billing_mode').notNull().default('unset'),
    paymentSummary:           text('payment_summary').notNull().default('unset'),

    nextSessionAtUtc:         text('next_session_at_utc'),   // null = no session (MVP placeholder)
    lastActivityAtUtc:        text('last_activity_at_utc'),

    possibleDuplicateClientId: text('possible_duplicate_client_id'),
    duplicateOverrideReason:   text('duplicate_override_reason'),

    createdAtUtc:             text('created_at_utc').notNull(),
    updatedAtUtc:             text('updated_at_utc').notNull(),
  },
  (t) => [
    uniqueIndex('client_index_tenant_erp_idx').on(t.tenantId, t.erpCustomerId),
    index('client_index_tenant_phone_idx').on(t.tenantId, t.phoneE164),
    index('client_index_tenant_status_idx').on(t.tenantId, t.status),
    index('client_index_tenant_updated_idx').on(t.tenantId, t.updatedAtUtc),
  ],
)

/** Structured training goal — linked to a clientIndex row. */
export const clientGoal = sqliteTable('client_goal', {
  id:              text('id').primaryKey().notNull(),
  tenantId:        text('tenant_id').notNull(),
  clientIndexId:   text('client_index_id').notNull(),
  erpCustomerId:   text('erp_customer_id').notNull(),

  goalId:                text('goal_id').notNull(),
  isPrimary:             integer('is_primary', { mode: 'boolean' }).notNull().default(false),
  subGoalIdsJson:        text('sub_goal_ids_json').notNull().default('[]'),
  trainerSubGoalIdsJson: text('trainer_sub_goal_ids_json').notNull().default('[]'),
  urgency:               text('urgency').notNull().default('active_focus'),
  confidence:            text('confidence').notNull().default('unknown'),
  source:                text('source').notNull().default('system_inferred'),
  safetyFlagsJson:       text('safety_flags_json').notNull().default('[]'),
  notes:                 text('notes'),
  status:                text('status').notNull().default('active'),

  createdAtUtc:    text('created_at_utc').notNull(),
  updatedAtUtc:    text('updated_at_utc').notNull(),
})

/**
 * Suggested next action for a client — never auto-executed.
 * status transitions: pending → in_progress → completed | dismissed | expired.
 */
export const clientActionIntent = sqliteTable('client_action_intent', {
  id:              text('id').primaryKey().notNull(),
  tenantId:        text('tenant_id').notNull(),
  clientIndexId:   text('client_index_id').notNull(),
  erpCustomerId:   text('erp_customer_id').notNull(),

  type:            text('type').notNull(),
  status:          text('status').notNull().default('pending'),
  priority:        text('priority').notNull().default('normal'),
  source:          text('source').notNull().default('system'),
  reason:          text('reason'),

  dueAtUtc:        text('due_at_utc'),
  completedAtUtc:  text('completed_at_utc'),
  dismissedAtUtc:  text('dismissed_at_utc'),
  expiresAtUtc:    text('expires_at_utc'),

  createdAtUtc:    text('created_at_utc').notNull(),
  updatedAtUtc:    text('updated_at_utc').notNull(),
})

/** Append-only local audit trail for client workflow events. */
export const clientEvent = sqliteTable('client_event', {
  id:              text('id').primaryKey().notNull(),
  tenantId:        text('tenant_id').notNull(),
  clientIndexId:   text('client_index_id'),
  erpCustomerId:   text('erp_customer_id'),
  type:            text('type').notNull(),
  payloadJson:     text('payload_json').notNull().default('{}'),
  createdByUserId: text('created_by_user_id'),
  createdAtUtc:    text('created_at_utc').notNull(),
})
