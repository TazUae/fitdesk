> **Status:** Archived - historical evidence only
> **Replacement authority:** docs/adr/ADR-001-client-management-erp-authoritative-hybrid.md and docs/plans/ACTIVE_PLAN_INDEX.md
> **Archived date:** 2026-07-18
> **Instruction:** Do not execute this historical plan without a new current-state audit.

---

# Client Management v1.2.1 — Phase 1 Implementation Plan

```text
Document status: Approved — ready for implementation
Product: FitDesk SaaS Platform
Module: Client Management
Version: v1.2.1
Phase: Phase 1 — Data contracts + additive schema + tenant-scoped repository
Produced by: Claude Code (Opus, Plan mode)
Date: 2026-06-12
Controlling ADR: docs/adr/ADR-001-client-management-erp-authoritative-hybrid.md
Scope document: docs/plans/CLIENT_MANAGEMENT_PHASE_1_SCOPE.md
```

---

## 1. Executive Summary

Phase 1 builds the safe data foundation for Client Management v1.2.1. It creates no UI and wires no new user-visible flows. Its outputs are:

- TypeScript type contracts for all client entities.
- Four additive local tables (`client_index`, `client_goal`, `client_action_intent`, `client_event`) that do not alter any existing table.
- A tenant-scoped repository as the only permitted access path to the new tables.
- A phone normalization helper and a duplicate detection helper.
- A backfill skeleton (manually triggered, idempotent, per-tenant).
- Tests for tenant isolation, table creation idempotency, phone normalization, duplicate matching, and created-to-visible local query.

The ERP-authoritative hybrid architecture from ADR-001 is preserved: ERPNext Customer remains the canonical business identity; local tables are the enrichment/read-model layer.

---

## 2. Repo Verification (Baseline)

Verified state at plan time:

```text
Repo path:    C:\Users\Lenovo\Dev\axis-erp\FitDesk
Branch:       main
HEAD commit:  fe951a2  docs(client-management): add approved v1.2.1 MVP planning pack
Working tree: clean (no uncommitted app changes)
```

Key confirmed facts:

- No local client tables exist. `lib/db/schema.ts` contains only Better Auth + FitDesk infra tables: `user`, `session`, `account`, `verification`, `trainerMapping`, `trainerWhatsAppConnection`, `messageLog`, `workspaceProvisioning`.
- `scripts/migrate-app.mjs` currently creates only the `WorkspaceProvisioning` table and its two indexes via raw `CREATE TABLE IF NOT EXISTS`.
- `@libsql/client`, `drizzle-orm`, `libphonenumber-js`, and `zod` are all present — no new dependencies needed.
- `crypto.randomUUID()` is available (Node.js 14.17+).
- Vitest is configured for `node` environment with pattern `**/*.test.ts`.
- The local database is a shared `auth.db` (one file, all tenants) — every new table must enforce tenant filtering at query time.

---

## 3. ERP Customer Creation Path (Verified)

The exact call chain confirmed by reading the source:

```
app/dashboard/clients/new/page.tsx
  → createClient() [lib/business-data/index.ts:46]
      → addClient() [actions/clients.ts:63]
          → resolveTrainerId() → ensureTrainerIdForUser()
          → createClient({...payload, trainer}) [lib/erpnext/client.ts via lib/business-data/erp-adapter.ts re-export]
              → erpFetch('/api/resource/Customer', {method:'POST', body:payload}) [lib/erpnext/client.ts]
                  → getTenantContext() → signTenantJwt(tenantId) [HS256, FITDESK_JWT_SECRET, 5 min TTL]
                  → fetch CONTROL_PLANE_URL + /api/erp/doctype/Customer
                      → Control Plane ERP proxy → ERPNext Customer DocType
```

Side effects from the existing path: **one POST /api/resource/Customer only**. No Contact, Address, Invoice, Payment Entry, Session, WhatsApp, webhook.

Return value: `Client` where `Client.id = ERPCustomer.name` (the ERP docname). `normalizeClient` in `lib/erpnext/client.ts` hardcodes `trainerId: ''`, `status: 'active'`, `sessionCount: 0`.

**Naming collision note:** two functions are named `createClient` in the codebase:
- `lib/business-data/index.ts:createClient` — the server-action-level wrapper.
- `lib/erpnext/client.ts:createClient` — the ERP adapter (re-exported via `erp-adapter.ts`).

Phase 1 implementation must not alter either. The Phase 4 Add Client wire-up will extend the server-action wrapper after both ERP success and local row writes.

---

## 4. Risk Register

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| `migrate-app.mjs` and `schema.ts` drift out of sync | Medium | High | Each new table must be added to both in the same commit; test plan includes migration idempotency check |
| Tenant filter accidentally omitted from a query | Medium | Critical | Repository throws if `tenantId` is null; all queries explicitly include `WHERE tenant_id = ?`; test verifies cross-tenant isolation |
| `libphonenumber-js` parses a UAE number differently than expected | Low | Medium | Phone normalization unit test covers UAE `+971` prefixes and Lebanese `+961` prefixes |
| Backfill run twice creates duplicate rows | Low | High | Backfill uses `INSERT OR IGNORE` / `ON CONFLICT DO NOTHING` on `(tenantId, erpCustomerId)` unique index |
| Phase 1 changes break existing app build | Low | Critical | Acceptance criteria requires `npm run build` and `npm run lint` pass with zero new errors |

---

## 5. Dependency Inventory

All dependencies are already in `package.json`. No new installs required:

| Dependency | Used by | Already present |
|---|---|---|
| `@libsql/client` | `lib/db.ts`, `scripts/migrate-app.mjs` | Yes |
| `drizzle-orm` | `lib/db/schema.ts`, repository | Yes |
| `libphonenumber-js` | phone normalization helper | Yes |
| `zod` | type validation helpers (optional in Phase 1) | Yes |
| `vitest` | tests | Yes |

---

## 6. Type Contracts

File: `types/clients.ts` (new file)

### 6.1 Enums and literals

```ts
export type ClientStatus = "active" | "inactive" | "archived";
export type SafetyState = "clear" | "needs_review" | "blocked_downstream";
export type OnboardingState = "not_started" | "sent" | "in_progress" | "completed";
export type BillingMode = "package" | "pay_per_session" | "unset";
export type PaymentSummary = "paid" | "to_collect" | "overdue" | "unset";

export type GoalConfidence = "high" | "medium" | "low" | "unknown";
export type GoalSource = "ai_parse" | "trainer_manual" | "system_inferred";
export type GoalUrgency = "urgent" | "active_focus" | "background";
export type GoalStatus = "active" | "archived";

export type ActionIntentType =
  | "send_whatsapp_welcome"
  | "send_intake_form"
  | "book_first_session"
  | "setup_billing"
  | "create_program"
  | "review_safety_note";

export type ActionIntentStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "dismissed"
  | "expired";

export type ActionIntentPriority = "low" | "normal" | "high";
export type ActionIntentSource = "system" | "ai_parse" | "trainer_manual";
```

### 6.2 Core entity types

```ts
export type ClientIndex = {
  id: string;
  tenantId: string;
  erpCustomerId: string;

  fullName: string;
  phoneE164: string;
  whatsappEnabled: boolean;
  status: ClientStatus;

  primaryGoalLabel: string | null;
  primaryGoalId: string | null;
  safetyState: SafetyState;

  onboardingState: OnboardingState;
  billingMode: BillingMode;
  paymentSummary: PaymentSummary;

  nextSessionAtUtc: string | null;
  lastActivityAtUtc: string | null;

  possibleDuplicateClientId: string | null;
  duplicateOverrideReason: string | null;

  createdAtUtc: string;
  updatedAtUtc: string;
};

export type ClientGoal = {
  id: string;
  tenantId: string;
  clientIndexId: string;
  erpCustomerId: string;

  goalId: string;
  subGoalIds: string[];
  urgency: GoalUrgency;
  confidence: GoalConfidence;
  source: GoalSource;
  safetyFlags: string[];
  notes: string | null;
  status: GoalStatus;

  createdAtUtc: string;
  updatedAtUtc: string;
};

export type ClientActionIntent = {
  id: string;
  tenantId: string;
  clientIndexId: string;
  erpCustomerId: string;

  type: ActionIntentType;
  status: ActionIntentStatus;
  priority: ActionIntentPriority;
  source: ActionIntentSource;
  reason: string | null;

  dueAtUtc: string | null;
  completedAtUtc: string | null;
  dismissedAtUtc: string | null;
  expiresAtUtc: string | null;

  createdAtUtc: string;
  updatedAtUtc: string;
};

export type ClientEvent = {
  id: string;
  tenantId: string;
  clientIndexId: string | null;
  erpCustomerId: string | null;
  type: string;
  payloadJson: Record<string, unknown>;
  createdByUserId: string | null;
  createdAtUtc: string;
};
```

### 6.3 Helper and draft types

```ts
export type ParsedField<T> = {
  value: T | null;
  confidence: GoalConfidence;
  source: "ai_parse" | "trainer_manual";
};

export type DuplicateClientMatch = {
  clientIndexId: string;
  erpCustomerId: string;
  fullName: string;
  phoneE164: string;
  status: ClientStatus;
  matchType: "exact_phone" | "possible_name";
  confidence: GoalConfidence;
};

export type ClientCreateDraft = {
  tenantId: string;
  erpCustomerId: string;
  fullName: string;
  phoneE164: string;
  whatsappEnabled: boolean;
  primaryGoalLabel: string | null;
  primaryGoalId: string | null;
  goalId: string | null;
  subGoalIds: string[];
  goalUrgency: GoalUrgency | null;
  goalConfidence: GoalConfidence;
  goalSource: GoalSource;
  safetyFlags: string[];
  goalNotes: string | null;
  createdByUserId: string | null;
};

export type ClientCreateResult = {
  clientIndex: ClientIndex;
  goal: ClientGoal | null;
  actions: ClientActionIntent[];
  event: ClientEvent;
};
```

### 6.4 Summary types (for Client Hub and Directory)

```ts
export type ClientGoalSummary = {
  id: string;
  goalId: string;
  urgency: GoalUrgency;
  confidence: GoalConfidence;
  primaryGoalLabel: string | null;
  status: GoalStatus;
};

export type ClientActionIntentSummary = {
  id: string;
  type: ActionIntentType;
  status: ActionIntentStatus;
  priority: ActionIntentPriority;
  reason: string | null;
  dueAtUtc: string | null;
};

export type ClientNoteSummary = {
  id: string;
  type: string;
  createdAtUtc: string;
};

export type ClientHubOverview = {
  client: {
    clientIndexId: string;
    erpCustomerId: string;
    fullName: string;
    phoneE164: string;
    whatsappEnabled: boolean;
    status: ClientStatus;
    safetyState: SafetyState;
    onboardingState: OnboardingState;
    billingMode: BillingMode;
    paymentSummary: PaymentSummary;
    primaryGoalLabel: string | null;
    nextSessionAtUtc: string | null;
    lastActivityAtUtc: string | null;
  };
  goals: ClientGoalSummary[];
  pendingActions: ClientActionIntentSummary[];
  recentNotes: ClientNoteSummary[];
  placeholders: {
    trainingProgram: { status: "not_started" | "available_later"; label: string };
    progress: { status: "not_started" | "available_later"; label: string };
  };
};
```

---

## 7. Additive Schema

File: `lib/db/schema.ts` — additive edits only, no existing tables touched.

### 7.1 Drizzle table definitions

```ts
// client_index — local read model linked to ERP Customer
export const clientIndex = sqliteTable(
  "client_index",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    erpCustomerId: text("erp_customer_id").notNull(),

    fullName: text("full_name").notNull(),
    phoneE164: text("phone_e164").notNull(),
    whatsappEnabled: integer("whatsapp_enabled", { mode: "boolean" }).notNull().default(false),
    status: text("status").notNull().default("active"),

    primaryGoalLabel: text("primary_goal_label"),
    primaryGoalId: text("primary_goal_id"),
    safetyState: text("safety_state").notNull().default("clear"),

    onboardingState: text("onboarding_state").notNull().default("not_started"),
    billingMode: text("billing_mode").notNull().default("unset"),
    paymentSummary: text("payment_summary").notNull().default("unset"),

    nextSessionAtUtc: text("next_session_at_utc"),
    lastActivityAtUtc: text("last_activity_at_utc"),

    possibleDuplicateClientId: text("possible_duplicate_client_id"),
    duplicateOverrideReason: text("duplicate_override_reason"),

    createdAtUtc: text("created_at_utc").notNull(),
    updatedAtUtc: text("updated_at_utc").notNull(),
  },
  (t) => ({
    uniqTenantErp: uniqueIndex("client_index_tenant_erp_idx").on(t.tenantId, t.erpCustomerId),
    idxTenantPhone: index("client_index_tenant_phone_idx").on(t.tenantId, t.phoneE164),
    idxTenantStatus: index("client_index_tenant_status_idx").on(t.tenantId, t.status),
    idxTenantUpdated: index("client_index_tenant_updated_idx").on(t.tenantId, t.updatedAtUtc),
  }),
);

// client_goal — structured goal storage
export const clientGoal = sqliteTable("client_goal", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  clientIndexId: text("client_index_id").notNull(),
  erpCustomerId: text("erp_customer_id").notNull(),

  goalId: text("goal_id").notNull(),
  subGoalIdsJson: text("sub_goal_ids_json").notNull().default("[]"),
  urgency: text("urgency").notNull().default("active_focus"),
  confidence: text("confidence").notNull().default("unknown"),
  source: text("source").notNull().default("system_inferred"),
  safetyFlagsJson: text("safety_flags_json").notNull().default("[]"),
  notes: text("notes"),
  status: text("status").notNull().default("active"),

  createdAtUtc: text("created_at_utc").notNull(),
  updatedAtUtc: text("updated_at_utc").notNull(),
});

// client_action_intent — suggested next actions (not auto-executed)
export const clientActionIntent = sqliteTable("client_action_intent", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  clientIndexId: text("client_index_id").notNull(),
  erpCustomerId: text("erp_customer_id").notNull(),

  type: text("type").notNull(),
  status: text("status").notNull().default("pending"),
  priority: text("priority").notNull().default("normal"),
  source: text("source").notNull().default("system"),
  reason: text("reason"),

  dueAtUtc: text("due_at_utc"),
  completedAtUtc: text("completed_at_utc"),
  dismissedAtUtc: text("dismissed_at_utc"),
  expiresAtUtc: text("expires_at_utc"),

  createdAtUtc: text("created_at_utc").notNull(),
  updatedAtUtc: text("updated_at_utc").notNull(),
});

// client_event — local audit trail
export const clientEvent = sqliteTable("client_event", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  clientIndexId: text("client_index_id"),
  erpCustomerId: text("erp_customer_id"),
  type: text("type").notNull(),
  payloadJson: text("payload_json").notNull().default("{}"),
  createdByUserId: text("created_by_user_id"),
  createdAtUtc: text("created_at_utc").notNull(),
});
```

**Important:** arrays (`subGoalIds`, `safetyFlags`) are stored as `*Json TEXT` columns. The repository layer is responsible for `JSON.parse` on read and `JSON.stringify` on write. The TypeScript types present them as proper arrays.

**Timestamp convention:** ISO-8601 UTC TEXT, matching `WorkspaceProvisioning` and `messageLog` precedent (e.g., `new Date().toISOString()`).

---

## 8. Migration Plan

File: `scripts/migrate-app.mjs` — additive only, existing `WorkspaceProvisioning` DDL untouched.

Append four `CREATE TABLE IF NOT EXISTS` statements and their indexes to the existing `statements` array:

```js
// client_index
`CREATE TABLE IF NOT EXISTS client_index (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  erp_customer_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone_e164 TEXT NOT NULL,
  whatsapp_enabled INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  primary_goal_label TEXT,
  primary_goal_id TEXT,
  safety_state TEXT NOT NULL DEFAULT 'clear',
  onboarding_state TEXT NOT NULL DEFAULT 'not_started',
  billing_mode TEXT NOT NULL DEFAULT 'unset',
  payment_summary TEXT NOT NULL DEFAULT 'unset',
  next_session_at_utc TEXT,
  last_activity_at_utc TEXT,
  possible_duplicate_client_id TEXT,
  duplicate_override_reason TEXT,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL
)`,

`CREATE UNIQUE INDEX IF NOT EXISTS client_index_tenant_erp_idx
  ON client_index (tenant_id, erp_customer_id)`,

`CREATE INDEX IF NOT EXISTS client_index_tenant_phone_idx
  ON client_index (tenant_id, phone_e164)`,

`CREATE INDEX IF NOT EXISTS client_index_tenant_status_idx
  ON client_index (tenant_id, status)`,

`CREATE INDEX IF NOT EXISTS client_index_tenant_updated_idx
  ON client_index (tenant_id, updated_at_utc)`,

// client_goal
`CREATE TABLE IF NOT EXISTS client_goal (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  client_index_id TEXT NOT NULL,
  erp_customer_id TEXT NOT NULL,
  goal_id TEXT NOT NULL,
  sub_goal_ids_json TEXT NOT NULL DEFAULT '[]',
  urgency TEXT NOT NULL DEFAULT 'active_focus',
  confidence TEXT NOT NULL DEFAULT 'unknown',
  source TEXT NOT NULL DEFAULT 'system_inferred',
  safety_flags_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL
)`,

// client_action_intent
`CREATE TABLE IF NOT EXISTS client_action_intent (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  client_index_id TEXT NOT NULL,
  erp_customer_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'normal',
  source TEXT NOT NULL DEFAULT 'system',
  reason TEXT,
  due_at_utc TEXT,
  completed_at_utc TEXT,
  dismissed_at_utc TEXT,
  expires_at_utc TEXT,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL
)`,

// client_event
`CREATE TABLE IF NOT EXISTS client_event (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  client_index_id TEXT,
  erp_customer_id TEXT,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_by_user_id TEXT,
  created_at_utc TEXT NOT NULL
)`,
```

**Migration safety rule:** `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` — never `DROP`, never `ALTER` existing columns, never `CREATE OR REPLACE`.

---

## 9. Tenant-Scoped Repository Plan

File: `lib/clients/repository.ts` (new file)

### 9.1 Context type

```ts
type TenantCtx = { tenantId: string };

function assertTenantId(ctx: TenantCtx): string {
  if (!ctx.tenantId) throw new Error("tenantId is required for all client queries");
  return ctx.tenantId;
}
```

### 9.2 Required methods (Phase 1)

```ts
// Reads
findClientByErpId(ctx: TenantCtx, erpCustomerId: string): Promise<ClientIndex | null>
findClientsByStatus(ctx: TenantCtx, status: ClientStatus): Promise<ClientIndex[]>
findClientByPhone(ctx: TenantCtx, phoneE164: string): Promise<ClientIndex[]>
listClients(ctx: TenantCtx, opts?: { limit?: number; offset?: number }): Promise<ClientIndex[]>

// Writes
createClientRow(ctx: TenantCtx, draft: ClientCreateDraft): Promise<ClientCreateResult>
upsertClientFromBackfill(ctx: TenantCtx, draft: ClientCreateDraft): Promise<ClientIndex>

// Goals
listGoals(ctx: TenantCtx, clientIndexId: string): Promise<ClientGoal[]>

// Actions
listPendingActions(ctx: TenantCtx, clientIndexId: string): Promise<ClientActionIntent[]>

// Events
listEvents(ctx: TenantCtx, clientIndexId: string): Promise<ClientEvent[]>
```

### 9.3 Repository rules

- Every method calls `assertTenantId(ctx)` before any SQL.
- No method accepts a raw SQL string from callers.
- JSON columns are parsed on read and stringified on write inside the repository.
- `createClientRow` creates `client_index`, `client_goal` (if goal data present), one or more `client_action_intent` rows, and `client_event: client.created` in a single transaction.
- `upsertClientFromBackfill` uses `INSERT OR IGNORE` for `client_index` (keyed on `tenantId + erpCustomerId`) and updates safe summary fields if the row already exists. Used only by the backfill script.
- The repository imports `db` from `@/lib/db` (the singleton). It does not create its own database connection.

---

## 10. Phone Normalization Helper Plan

File: `lib/clients/phone.ts` (new file)

```ts
import { parsePhoneNumber, isValidPhoneNumber } from "libphonenumber-js";

export type PhoneNormalizeResult =
  | { ok: true; e164: string }
  | { ok: false; reason: string };

export function normalizePhoneToE164(
  raw: string,
  defaultRegion: string = "LB",
): PhoneNormalizeResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "Phone number is empty" };

  try {
    if (!isValidPhoneNumber(trimmed, defaultRegion as any)) {
      return { ok: false, reason: "Not a valid phone number" };
    }
    const parsed = parsePhoneNumber(trimmed, defaultRegion as any);
    return { ok: true, e164: parsed.format("E.164") };
  } catch {
    return { ok: false, reason: "Could not parse phone number" };
  }
}
```

Default region `"LB"` (Lebanon) covers the majority of current FitDesk trainers. UAE numbers beginning with `+971` parse correctly without a default region.

---

## 11. Duplicate Detection Helper Plan

File: `lib/clients/duplicates.ts` (new file)

```ts
import type { TenantCtx } from "./repository";
import type { DuplicateClientMatch } from "@/types/clients";

export async function findDuplicatesByPhone(
  ctx: TenantCtx,
  phoneE164: string,
): Promise<DuplicateClientMatch[]> {
  // Delegates to ClientRepository.findClientByPhone
  // Returns DuplicateClientMatch[] scoped to ctx.tenantId only
  // Cross-tenant results are never returned
}
```

Rules:
- Always scoped to `ctx.tenantId`. Cross-tenant results are never returned.
- Exact `phoneE164` match → `matchType: "exact_phone"`, `confidence: "high"`.
- Name similarity check is deferred to a later phase (§15 out of scope below).
- Returns an empty array (not an error) when no duplicates are found.

---

## 12. Backfill Script Plan

File: `lib/clients/backfill.ts` (skeleton for Phase 1; full implementation in Phase 2)

```ts
export type BackfillContext = {
  tenantId: string;
  dryRun?: boolean;
};

export type BackfillResult = {
  inspected: number;
  created: number;
  updated: number;
  skipped: number;
  errors: { erpCustomerId: string; reason: string }[];
};

export async function backfillTenantClients(
  ctx: BackfillContext,
): Promise<BackfillResult> {
  // Phase 1: skeleton only — structure is approved, ERP reads deferred to Phase 2.
  //
  // Full Phase 2 sequence:
  //   1. Read all ERP Customers for ctx.tenantId through existing proxy path.
  //   2. For each Customer:
  //      a. Normalize phone to E.164.
  //      b. Call repo.upsertClientFromBackfill().
  //      c. If goal JSON is cleanly parseable, create/update client_goal.
  //      d. Write client_event: client.backfilled.
  //   3. Return BackfillResult with counts and errors.
  //
  // Idempotency: upsertClientFromBackfill uses INSERT OR IGNORE on (tenantId, erpCustomerId).
  // Running twice is safe.
  throw new Error("backfillTenantClients: Phase 2 not yet implemented");
}
```

Phase 1 ships the type shape and function signature. Phase 2 fills in the ERP read loop.

---

## 13. Test Plan

Test root: `lib/clients/__tests__/`

### 13.1 Unit tests

File: `lib/clients/__tests__/phone.test.ts`

- `normalizePhoneToE164("+96170123456")` → `{ ok: true, e164: "+96170123456" }`.
- `normalizePhoneToE164("03123456", "LB")` → Lebanese E.164.
- `normalizePhoneToE164("+971501234567")` → UAE E.164.
- `normalizePhoneToE164("")` → `{ ok: false }`.
- `normalizePhoneToE164("not-a-phone")` → `{ ok: false }`.

File: `lib/clients/__tests__/duplicates.test.ts`

- Exact phone match → `DuplicateClientMatch[]` with `matchType: "exact_phone"`.
- Different phone → empty array.
- Tenant B record is never returned to Tenant A query.

### 13.2 Integration tests (in-memory libsql)

Test setup:
```ts
import { createClient } from "@libsql/client";
const memDb = createClient({ url: ":memory:" });
// Run migration statements against memDb before each test suite
```

File: `lib/clients/__tests__/migration.test.ts`

- Run all four `CREATE TABLE IF NOT EXISTS` statements twice — no error on second run.
- All four tables and their indexes exist after migration.

File: `lib/clients/__tests__/repository.test.ts`

- `createClientRow` with valid draft → `ClientCreateResult` with non-null `clientIndex`.
- `findClientByErpId(ctx, id)` returns the row created above.
- `findClientByErpId(ctx, id)` with a different `tenantId` returns `null` (tenant isolation).
- `listClients(ctxTenantA)` does not return rows belonging to tenant B.
- `createClientRow` without `tenantId` throws.
- `upsertClientFromBackfill` called twice with same `(tenantId, erpCustomerId)` → one row, no duplicate.

---

## 14. File-Level Plan

| File | Status | Change type | Notes |
|---|---|---|---|
| `types/clients.ts` | New | Create | All type contracts (§6) |
| `lib/db/schema.ts` | Existing | Additive edit | Append 4 table definitions; no existing table touched |
| `scripts/migrate-app.mjs` | Existing | Additive edit | Append DDL for 4 tables + indexes; no existing statement touched |
| `lib/clients/repository.ts` | New | Create | Tenant-scoped repository (§9) |
| `lib/clients/phone.ts` | New | Create | Phone normalization helper (§10) |
| `lib/clients/duplicates.ts` | New | Create | Duplicate detection helper (§11) |
| `lib/clients/backfill.ts` | New | Create | Backfill skeleton (§12) |
| `lib/clients/__tests__/phone.test.ts` | New | Create | Phone normalization unit tests |
| `lib/clients/__tests__/duplicates.test.ts` | New | Create | Duplicate detection unit tests |
| `lib/clients/__tests__/migration.test.ts` | New | Create | Migration idempotency tests |
| `lib/clients/__tests__/repository.test.ts` | New | Create | Repository + tenant isolation integration tests |

**No other files are touched.** In particular:
- `actions/clients.ts` — not touched.
- `lib/erpnext/client.ts` — not touched.
- `lib/db.ts` — not touched.
- Any UI component or page — not touched.
- Auth, provisioning, ERP proxy, invoice, payment, WhatsApp, scheduling code — not touched.

---

## 15. Acceptance Criteria

Phase 1 is complete only when all of the following pass:

```text
[ ] types/clients.ts exists with all entity types, enums, and helper types from §6.
[ ] lib/db/schema.ts has 4 new table definitions; no existing definition is altered.
[ ] scripts/migrate-app.mjs runs successfully with CREATE TABLE IF NOT EXISTS idempotency.
[ ] Running migrate-app.mjs a second time produces no error.
[ ] lib/clients/repository.ts throws if tenantId is missing.
[ ] Repository findClientByErpId returns null for a different tenant's row.
[ ] lib/clients/phone.ts normalizes +961 and +971 numbers to E.164.
[ ] lib/clients/duplicates.ts returns empty array (not cross-tenant rows) for a non-matching query.
[ ] lib/clients/backfill.ts exports BackfillContext, BackfillResult, backfillTenantClients().
[ ] All tests in lib/clients/__tests__/ pass with npx vitest run lib/clients.
[ ] npm run lint passes with no new lint errors.
[ ] npm run build passes with no new type errors.
[ ] No app code (actions, UI, ERP adapter, invoices, payments, WhatsApp) was modified.
[ ] No ERP credentials introduced.
[ ] No migrations run against the production database (migrate-app.mjs is a manual script).
```

---

## 16. Rollback Strategy

Phase 1 is designed to be fully reversible:

- All new files (`types/clients.ts`, `lib/clients/*`) can be deleted with no side effect on the running app.
- The additive edits to `lib/db/schema.ts` and `scripts/migrate-app.mjs` can be reverted to the prior commit.
- The new tables are not referenced by any production UI code yet, so they remain unused if the feature is rolled back.
- Drizzle does not auto-run migrations; the tables only exist if the migrate script has been manually run. If rolled back before the script runs in production, no tables exist to clean up.
- If tables were already created in a development or staging database, they are empty and additive — no data was destroyed to create them.

---

## 17. Out of Scope for Phase 1

Do not build or change in this phase:

```text
Client Directory UI
Add Client Sheet / Drawer UI
AI parse endpoint
Client Hub UI
Action queue UI
Invoice logic
Payment logic
WhatsApp sending
Session booking
Program Design engine
ERP proxy internals
Auth or tenant context internals
Direct ERPNext API calls
Production server files
Cross-tenant client portability
Outbox / event bus
Background ERP sync worker
Fully offline client creation
```

---

## 18. Recommended Phase 1 Implementation Prompt

Use this prompt to start the implementation session:

```text
Claude Code model: claude-sonnet-4-6
Effort: high
Mode: Implement

Task: Client Management v1.2.1 Phase 1 — Data contracts + additive schema + tenant-scoped repository.

Read these documents first:
  docs/plans/CLIENT_MANAGEMENT_PHASE_1_IMPLEMENTATION_PLAN.md
  docs/plans/CLIENT_MANAGEMENT_PHASE_1_SCOPE.md
  docs/adr/ADR-001-client-management-erp-authoritative-hybrid.md

Then implement exactly the files listed in §14 of the Phase 1 plan with the designs in §6–§13.

SECURITY AND SAFETY CONSTRAINTS (enforced, non-negotiable):
- Do not modify application code outside the new lib/clients/ files and the two additive edits to schema.ts and migrate-app.mjs.
- Do not create migrations that run automatically.
- Do not edit any UI component or page.
- Do not touch actions/clients.ts, lib/erpnext/client.ts, lib/db.ts, or any ERP adapter.
- Do not store ERP credentials in FitDesk.
- Do not bypass erpFetch() or the Control Plane proxy.
- Do not create invoices, payment entries, WhatsApp sends, sessions, or programs.
- Every local client query must be tenant-scoped (tenantId from context — never null).
- No raw client SQL from UI actions — all access through the tenant-scoped repository.

After implementation, run:
  npx vitest run lib/clients
  npm run lint
  npm run build

Report acceptance criteria results from §15 one by one.
```
