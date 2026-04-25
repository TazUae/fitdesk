import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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
  // Additional fields
  phone:         text('phone'),
  currency:      text('currency'),
  businessName:  text('businessName'),
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
