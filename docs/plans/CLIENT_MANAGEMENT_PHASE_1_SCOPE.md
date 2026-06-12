# Client Management Phase 1 Scope

```text
Project: FitDesk SaaS Platform
Plan: Client Management v1.2.1 - ERP-Authoritative Hybrid MVP
Phase: Phase 1
Mode: Data contracts + additive schema + tenant-scoped repository
Status: Ready for Claude Code planning, then implementation after approval
```

## Phase 1 Objective

Build only the safe data foundation for Client Management v1.2.1.

Phase 1 does not build the UI. It prepares the local ERP-linked read model and repository layer so later phases can build the Directory, Add Client Sheet, Client Hub, and Action Queue safely.

## Architecture decision for this phase

```text
ERPNext Customer remains canonical.
client_index is local enrichment/read model.
Add Client will create ERP Customer through the approved proxy path, then write local rows.
```

## Approved Phase 1 build scope

### 1. Type contracts

Create or prepare types for:

- `ClientIndex`
- `ClientGoal`
- `ClientActionIntent`
- `ClientEvent`
- `ClientHubOverview`
- `ParsedField<T>`
- `DuplicateClientMatch`
- `ClientCreateDraft`
- `ClientCreateResult`

### 2. Additive local schema

Add only additive tables:

```text
client_index
client_goal
client_action_intent
client_event
```

Do not alter or delete existing tables.

### 3. Tenant-scoped repository

Create a repository choke point for local client tables.

Rules:

- Every method requires `ctx.tenantId`.
- No action/component should query the new tables directly.
- Duplicate detection must be tenant-scoped.
- Repository methods should be testable without UI.

### 4. Backfill script plan or skeleton

Prepare a manually triggered tenant-level backfill path.

MVP behavior:

```text
Run once per tenant before that tenant's Client Directory goes live.
Read ERP Customers through existing proxy path.
Create/update client_index rows idempotently.
Create client_goal rows only when goal data parses cleanly.
Write client_event: client.backfilled.
```

### 5. Tests

Add Phase 1 tests for:

- Local table creation/migration idempotency.
- Repository tenant isolation.
- Phone normalization.
- Duplicate matching helper.
- Created local client row visible in directory query after transaction.
- Backfill idempotency.

## Explicitly out of scope for Phase 1

Do not build or change:

- Client Directory UI
- Add Client Sheet / Drawer UI
- AI parse endpoint
- Client Hub UI
- Action queue UI
- Invoice logic
- Payment logic
- WhatsApp sending
- Scheduling engine
- Program Design engine
- ERP proxy internals
- Auth or tenant context internals
- Direct ERPNext API calls
- Production server files

## Files likely involved

| File | Change type | Purpose |
|---|---|---|
| `types/clients.ts` | Add | Client Management contracts |
| `lib/db/schema.ts` | Edit additive | Add new table definitions |
| `scripts/migrate-app.mjs` | Edit additive | `CREATE TABLE IF NOT EXISTS` statements |
| `lib/clients/repository.ts` | Add | Tenant-scoped repository |
| `lib/clients/phone.ts` | Add | Server-side phone normalization helper |
| `lib/clients/duplicates.ts` | Add | Tenant-scoped duplicate helpers |
| `lib/clients/backfill.ts` | Add or plan | Manual tenant backfill utility |
| `lib/clients/__tests__/*` | Add | Unit/integration tests |

## Data model details

### client_index

```text
id
 tenantId
 erpCustomerId
 fullName
 phoneE164
 whatsappEnabled
 status
 primaryGoalLabel
 primaryGoalId
 safetyState
 onboardingState
 billingMode
 paymentSummary
 nextSessionAtUtc
 lastActivityAtUtc
 possibleDuplicateClientId
 duplicateOverrideReason
 createdAtUtc
 updatedAtUtc
```

Required indexes:

```text
unique (tenantId, erpCustomerId)
index (tenantId, phoneE164)
index (tenantId, status)
```

### client_goal

```text
id
 tenantId
 clientIndexId
 erpCustomerId
 goalId
 subGoalIdsJson
 urgency
 source
 confidence
 safetyFlagsJson
 notes
 status
 createdAtUtc
 updatedAtUtc
```

### client_action_intent

```text
id
 tenantId
 clientIndexId
 erpCustomerId
 type
 status
 priority
 source
 reason
 dueAtUtc
 completedAtUtc
 dismissedAtUtc
 expiresAtUtc
 createdAtUtc
 updatedAtUtc
```

Allowed status values:

```text
pending
in_progress
completed
dismissed
expired
```

### client_event

```text
id
 tenantId
 clientIndexId
 erpCustomerId
 type
 payloadJson
 createdByUserId
 createdAtUtc
```

## Phase 1 acceptance criteria

Phase 1 is complete only when:

- New local tables are additive and idempotent.
- Repository requires tenant context for every local client query.
- No UI changes are required for the app to build.
- No ERP proxy internals are edited.
- No invoice/payment/WhatsApp/scheduling logic is changed.
- Backfill path is documented or skeletoned and idempotent.
- Tests pass for tenant isolation and created-to-visible local query.
- Lint and build pass.

## Rollback strategy

Phase 1 must be reversible:

- New files can be removed.
- New code paths should not be wired into production UI yet.
- Additive tables remain unused if feature is rolled back.
- No destructive migration is allowed.

## Claude Code routing

### Phase 1 planning prompt

```text
Claude Code model:
- Model: opusplan
- Effort: xhigh
- Mode: Plan
```

### Phase 1 implementation prompt

```text
Claude Code model:
- Model: sonnet
- Effort: high
- Mode: Implement
```

### Phase 1 verification prompt

```text
Claude Code model:
- Model: sonnet
- Effort: medium
- Mode: Verify
```

## Final instruction

Phase 1 is the foundation only.

Do not let Claude Code expand into UI, AI, invoices, WhatsApp, scheduling, or Program Design during Phase 1.
