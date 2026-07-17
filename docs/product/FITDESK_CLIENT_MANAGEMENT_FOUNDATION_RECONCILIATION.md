# FitDesk Client Management Foundation Reconciliation

> **Historical reconciliation evidence — not current execution authority.**
> The "no push / no merge / no Dokploy" framing below is now **stale** where present:
> the referenced branch was subsequently merged to `main`. Keep this document as
> traceability evidence only. Current execution authority is resolved through
> [`docs/DOCUMENTATION_AUTHORITY_MAP.md`](../DOCUMENTATION_AUTHORITY_MAP.md).

**Date:** 2026-06-14  
**Branch:** `feat/client-command-center`  
**Audited by:** grounded repo audit against source files

---

## Status

- **Track B Phase 1 is already implemented.** All data contracts, schema tables, migrations,
  repository, phone normalization, duplicate detection, and backfill are present and tested.
- **Do not reimplement Phase 1.** Running the stale implementation plan would overwrite 150
  passing tests and working wired code.
- **Current branch:** `feat/client-command-center`
- **No push / no merge / no Dokploy.** This branch is locally frozen pending controlled
  test-tenant validation before any flag-on deployment.

---

## Why This Note Exists

The `CLIENT_MANAGEMENT_PHASE_1_IMPLEMENTATION_PLAN.md` was written on 2026-06-12 against
`main@fe951a2`. At that commit, the local client tables did not exist, so the plan correctly
described them as future work.

Between that plan and the 2026-06-14 freeze audit, five commits on `feat/client-command-center`
fully implemented everything the plan described — plus additional phases (hub, directory, AI
parse, Phase 7 intent lifecycle).

Subsequent planning sessions inherited the stale plan and assumed the data foundation was missing.
The actual repo shows the foundation is complete. This note corrects the record.

The `docs/product/FITDESK_CLIENT_AREA_UI_FREEZE_HANDOVER.md` (committed `953a44d`) also contains
stale wording implying the `client_index`, `client_goal`, `client_action_intent`, and
`client_event` tables do not yet exist. That wording is inaccurate and should be corrected in a
follow-up commit.

---

## Implemented Foundation Commits

| Commit | Message |
|---|---|
| `22a31c3` | `feat(client-management): add ERP-linked client foundation` |
| `9cf3937` | `feat(client-management): implement ERP customer backfill` |
| `76301ba` | `feat(client-management): add duplicate detection and override audit` |
| `f638475` | `feat(client-management): add optional AI parse to Add Client` |
| `60065b2` | `feat(client-management): add Client Hub MVP action queue` |

All five commits precede the dashboard and client UI work on this branch.

---

## Implemented Files

### `types/clients.ts`

Full TypeScript contracts for the local enrichment layer. Confirmed contents:

- `ClientIndex` — local read model linked to ERPNext Customer
- `ClientGoal` — structured training goal row
- `ClientActionIntent` — suggested next action; strict 5-value status enum:
  `pending | in_progress | completed | dismissed | expired`
- `ClientEvent` — append-only local audit trail event
- `ParsedField<T>` — field value with parse confidence and source
- `DuplicateClientMatch` — result of tenant-scoped duplicate check
- `ClientCreateDraft` / `ClientCreateResult` — input and output of the local row creation
  transaction
- `ClientHubOverview` — one-payload overview for the Client Hub MVP
- `AiParseState`, `ClientParseFields`, `ClientParseResult` — AI-assisted parse types (Phase 5)

### `lib/db/schema.ts`

Drizzle schema for all four local enrichment tables. Confirmed:

- `clientIndex` — primary local read model; unique index on `(tenantId, erpCustomerId)`;
  additional indexes on tenant+phone, tenant+status, tenant+updatedAt
- `clientGoal` — structured goal rows linked to `clientIndex`
- `clientActionIntent` — action intent rows with full lifecycle timestamp columns
  (`completedAtUtc`, `dismissedAtUtc`, `expiresAtUtc`)
- `clientEvent` — append-only audit event rows; no DELETE path

### `scripts/migrate-app.mjs`

Migration runner covering all four tables. Confirmed:

- 4 `CREATE TABLE IF NOT EXISTS` blocks with full column definitions
- All required indexes
- `requiredTables` verification block at the end — calls `process.exit(1)` if any table is
  missing after migration

### `lib/clients/repository.ts`

`ClientRepository` class — all methods tenant-scoped. Confirmed:

- `assertTenantId(ctx)` throws before any SQL if `tenantId` is empty
- Read: `findClientByErpId`, `findClientsByStatus`, `findClientsByPhone`, `listClients`,
  `listGoals`, `listPendingActions`, `listEvents`
- Write: `createClientRow` (single atomic transaction: client_index + client_goal +
  3 default action intents + `client.created` event + optional `duplicate.override` event),
  `upsertClientFromBackfill` (idempotent), `insertClientEvent`
- Lifecycle: `completeActionIntent`, `dismissActionIntent` — both execute a tenant-guarded
  SELECT + UPDATE + audit event in a single transaction

### `lib/clients/phone.ts`

`normalizePhoneToE164()` — E.164 canonical form, handles Lebanon (+961) country code stripping
and bare local numbers. Used in `createClientRow` and `backfillTenantClients`.

### `lib/clients/duplicates.ts`

`findDuplicateCandidate()` — checks `client_index` by normalized E.164 phone (exact match)
and full name (case-insensitive) before ERP Customer creation. Returns a `DuplicateClientMatch`
or `null`.

### `lib/clients/backfill.ts`

`backfillTenantClients(repo, ctx, fetchCustomers)` — full injected-fetcher implementation.
Confirmed:

- `dryRun` defaults to `true` — real writes require explicit `{ dryRun: false }`
- Idempotent via `upsertClientFromBackfill` keyed on `(tenantId, erpCustomerId)`
- Skips disabled ERP Customers unless `includeDisabled: true`
- Skips Customers with missing or non-parseable phone; counts in `invalidPhone`
- Writes `client.backfilled` events only for newly created rows (not on updates)
- No direct ERP access; no ERP credentials stored here — ERP data arrives exclusively via the
  injected `fetchCustomers` callback

### `lib/clients/directory.ts`

Flag-gated local read path for the client list. `FITDESK_CLIENT_DIRECTORY_LOCAL_READ=1` to
enable. Falls back to ERP if flag is off, tenant context is absent, local table is empty, or
any error occurs. Flag is OFF (default false) in the current pilot.

### `lib/clients/hub.ts`

Flag-gated Client Hub overview. `FITDESK_CLIENT_HUB_ENABLED=1` to enable. Returns `null` on
any failure — hub is purely additive to the client detail page. Flag is OFF (default false) in
the current pilot.

### `lib/clients/create-draft.ts`

`buildClientCreateDraft()` — assembles a `ClientCreateDraft` from the Add Client form payload,
resolved trainer context, normalized phone, and parsed goal fields.

### `lib/clients/ai-parse.ts`

`parseClientDetails()` — optional AI-assisted field extraction for the Add Client form.
Called from the `parseClientDetails` server action. Trainer reviews all fields before
confirming. Safety, medical, and billing fields are intentionally excluded from AI parse.

### `actions/clients.ts` (client-management wiring)

All five client management server actions are implemented and wired:

- `addClient` — distributed-transaction: ERP Customer created first (canonical), then local
  `createClientRow`; ERP Customer is NOT deleted or rolled back on local-write failure
- `findClientDuplicates` — calls `findDuplicateCandidate` tenant-scoped
- `parseClientDetails` — calls `ai-parse.ts`; AI-only, trainer always reviews
- `completeClientAction` — calls `repo.completeActionIntent` with tenant guard
- `dismissClientAction` — calls `repo.dismissActionIntent` with tenant guard

---

## Architecture Status

| Requirement | Status |
|---|---|
| ERPNext Customer remains canonical identity (ADR-001) | ✅ `addClient` creates ERP Customer first; `erpCustomerId` is the business key for all ERP-backed flows |
| `client_index` is local read model / enrichment only | ✅ Schema and repository are additive; no ERP DocType changes |
| `erpCustomerId` remains the ERP-backed business key | ✅ `client_index.id` is a local UUID; all cross-system references use `erpCustomerId` |
| ERP I/O through approved proxy path only | ✅ `backfill.ts` uses injected `fetchCustomers`; `actions/clients.ts` uses `createClient` via Control Plane; no direct ERP DB access anywhere |
| Tenant-scoped repository exists | ✅ `ClientRepository` — all methods require `TenantCtx` |
| Local queries require tenant context | ✅ `assertTenantId(ctx)` throws before any SQL if `tenantId` is empty or blank |

---

## Test Status

```
npx vitest run lib/clients
```

**Previous verified result:** 12 test files / 150 tests / 0 failures

Test files confirmed present in `lib/clients/__tests__/`:

```
phone.test.ts
migration.test.ts
duplicates.test.ts
backfill.test.ts
directory-map.test.ts
directory.test.ts
create-draft.test.ts
repository.test.ts
ai-parse.test.ts
hub-map.test.ts
hub.test.ts
list-derive.test.ts
```

Full application suite from the 2026-06-14 UI freeze audit: **396/396 tests passed** (21 test
files) — `npm test`, lint, build, and Docker QA all clean.

---

## Roadmap Amendments Status

### 1. Distributed transaction risk

When a new client is created, ERP Customer write (step 1) can succeed while local row write
(step 2) fails.

**Status: ✅ Handled in `actions/clients.ts`**

- ERP Customer is NOT deleted or modified on local-write failure
- Failure is logged with `tenantId` only — no PII exposed
- `addClient` returns a distinct recoverable error message instructing operators not to
  re-create the client
- Repair path: `backfillTenantClients` with `dryRun: false`, keyed on
  `(tenantId, erpCustomerId)` — idempotent and safe to re-run

### 2. ERP drift and reconciliation

ERP data can change out-of-band (direct ERP edits, bulk imports).

**Status: ✅ MVP manual reconcile path exists**

- `backfillTenantClients` reads the current ERP Customer list and upserts `client_index` rows
  idempotently — this is the manual reconcile path
- Future: ERPNext webhook → secure FitDesk sync endpoint; requires HMAC auth, idempotency,
  async queue. This remains a production-hardening item, not required for Phase 1.

### 3. Action intent lifecycle

`client_action_intent` requires audit-grade lifecycle from the start.

**Status: ✅ Core lifecycle implemented**

- Strict 5-value status enum: `pending | in_progress | completed | dismissed | expired`
  (enforced in `types/clients.ts` as `ClientActionIntentStatus`)
- Lifecycle timestamp columns present in schema: `completedAtUtc`, `dismissedAtUtc`,
  `expiresAtUtc`, plus `dueAtUtc` and `createdAtUtc`
- `completeActionIntent` and `dismissActionIntent` both write an audit `action_intent.*`
  event in the same transaction as the status update
- No hard-delete path exists in the repository — events are append-only

**Deferred (optional):** `resolutionReason` / `resolvedAtUtc` columns for dismissed/expired
intents. Not present in current schema; can be added as a non-breaking additive migration when
genuinely needed.

---

## Current True Gaps

These items are NOT yet implemented and represent real remaining work:

| Gap | Notes |
|---|---|
| Feature flags are OFF for local directory and hub | `FITDESK_CLIENT_DIRECTORY_LOCAL_READ` and `FITDESK_CLIENT_HUB_ENABLED` both default false. Local reads are not active in pilot. Enabling requires controlled test-tenant validation first (see Recommended Next Work). |
| No backfill CLI runner | `backfillTenantClients` exists but has no CLI entrypoint or admin UI trigger. Manual repair currently requires writing a custom per-tenant script using the approved CP/erpFetch proxy path. |
| Projection-failure observability | Local-row creation failures are logged to `console.error` only. No queryable sink, no dashboard, no alerting. Operators cannot enumerate failed projections without scanning container logs. |
| Freeze handover doc has stale wording | `docs/product/FITDESK_CLIENT_AREA_UI_FREEZE_HANDOVER.md` (committed `953a44d`) incorrectly states the `client_index` etc. tables "do not exist yet". Needs a correction commit. |
| `resolutionReason` / `resolvedAtUtc` intent columns | Optional audit fields for dismissed/expired intents. Not in current schema. Defer unless operational need is confirmed. |
| Production rollout requires test-tenant verification | Before either feature flag is turned on in the pilot workspace, a controlled local Docker test using a single test tenant must pass. |

---

## Recommended Next Work

Pick one of the following tracks. Do not enable feature flags until option (c) passes.

### (a) Docs correction / freeze reconciliation commit

Correct the stale wording in `FITDESK_CLIENT_AREA_UI_FREEZE_HANDOVER.md`. Low risk,
single-file commit. Removes confusion for any future reader of that doc.

### (b) Operational backfill CLI runner plan

Design a `scripts/backfill-clients.mjs` runner (or admin endpoint) that calls
`backfillTenantClients(repo, ctx, fetchCustomers)` with a real tenant JWT and the approved
Control Plane proxy fetch path. Required before operators can repair projection failures
without writing ad-hoc scripts.

### (c) Controlled feature-flag test-tenant validation

Enable `FITDESK_CLIENT_DIRECTORY_LOCAL_READ=1` on a local Docker stack with a single test
tenant. Verify:

- Client roster loads from `client_index` (not direct ERP fetch)
- Fallback to ERP occurs correctly when `client_index` is empty
- `FITDESK_CLIENT_HUB_ENABLED=1` renders `ClientHubPanel` with real hub data

This is the **blocker** before either flag can be turned on in the pilot workspace.

### (d) Projection-failure observability hardening

Replace `console.error` in `addClient`'s local-write catch block with a queryable
projection-failure record — either a dedicated `client_projection_error` table or a
structured log sink. Required before the local write path is load-bearing in production.

---

## Safety Boundaries

| Boundary | Status |
|---|---|
| No production migrations | ✅ All schema tables are created by `scripts/migrate-app.mjs` locally only; no production migration has been run |
| No ERP proxy bypass | ✅ All ERP I/O goes through the approved Control Plane proxy (`erpFetch`) |
| No ERP credentials stored | ✅ No ERP credentials in any client management file; `backfill.ts` uses injected callback only |
| No direct ERPNext access | ✅ No direct DB connection to ERPNext from any FitDesk server code |
| No invoice/payment/WhatsApp/session/program changes | ✅ None added by any client management commit |
| No Dokploy | ✅ Branch not deployed; production untouched |
