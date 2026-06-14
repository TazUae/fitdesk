# FitDesk Client Area UI Freeze / Handover

**Frozen:** 2026-06-14  
**Audit:** PASS — all verification and Docker QA passed

---

## Status

| Item | Value |
|---|---|
| Frozen locally | ✅ No push, no merge, no Dokploy |
| Branch | `feat/client-command-center` |
| Parent branch | `feat/dashboard-command-center-phase1` |
| Production | Untouched |

### Commits (client area work)

```
36f7120  polish(clients): refine client detail layout
4931312  feat(clients): add command center roster
```

Parent branch (dashboard command center, frozen separately):

```
8afa6e1  docs(dashboard): add command center freeze handover
733904d  feat(dashboard): itemize overdue invoice attention
c6a1f5e  polish(dashboard): tighten command center density
b8b67ac  polish(dashboard): reduce empty-day redundancy
ae0b344  polish(dashboard): refine command center empty states
0062d38  feat(dashboard): add command center responsive shell
15cc936  docs(dashboard): add command center product blueprint
92d627f  docs(dashboard): add command center visual blueprint
```

---

## What was built

### Client roster (`app/dashboard/clients/page.tsx`, `components/modules/ClientsView.tsx`)

- Responsive card grid (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`) replaces stretched mobile column
- Pure `deriveClientRoster()` in `lib/clients/list-derive.ts` — invoice-derived needs-action signal:
  - `overdue` tier → `outstanding` tier → `missing_contact` tier → no signal
  - Sorted by outstanding balance desc within money tiers
- Always-visible search bar
- Owes money filter chip — only rendered when `invoicesAvailable && oweCount > 0` (honest)
- Dead `AddClientSheet` (was never mounted) permanently removed
- 19 unit tests for `deriveClientRoster` in `lib/clients/__tests__/list-derive.test.ts`

### Wide client route canvas (`components/modules/DashboardClientShell.tsx`)

- `/dashboard/clients` and `/dashboard/clients/*` now opt into `lg:mx-0 lg:max-w-none`
- All other sub-routes remain `max-w-[480px]` until redesigned

### Grid loading skeleton (`app/dashboard/clients/loading.tsx`)

- Matches the 3-column grid shape with `CardSkeleton` placeholders

### ERP status and email normalization (`lib/erpnext/client.ts`)

- `normalizeClient`: `raw.disabled === 1 → status: 'inactive'` (was hardcoded `'active'`)
- `normalizeClient`: `email: raw.email_id ?? undefined` (was hardcoded `undefined`)
- `email_id?: string` added to `ERPCustomer` interface (type-only, standard Frappe field)
- 5 new normalizer tests in `lib/erpnext/client.test.ts`

### Client detail (`app/dashboard/clients/[id]/page.tsx`)

- `xl:grid-cols-2` two-column layout with `Promise.allSettled` resilience
- Removed manual `+ Invoice` CTA (approved billing-UX change; billing hidden per workspace rule)
- Removed `sessionCount` (was always 0 — no real session backend exists)
- "Added {date}" from real `client.createdAt` (ERP `creation` field, already normalized)
  - `fmtMonthDayYear()` added to `lib/date.ts` — returns "Jun 8, 2025"
  - Format confirmed in QA: "Added Jun 5, 2026"
- Sessions panel: honest "Scheduling is not connected yet." — not "No sessions yet."
- Disabled `+ Schedule` span removed entirely
- Outstanding balance displayed prominently when > 0
- Danger Zone (`DeactivateClientButton`) moved to full-width footer below the xl grid
- Right column focused on invoices/money only
- ERP unavailable error state preserved

### Client edit (`app/dashboard/clients/[id]/edit/page.tsx`)

- Email field: shown read-only (`readOnly`, `tabIndex={-1}`, `opacity-60`) when ERP provides email; hidden entirely when absent
- `email_id` removed from `updateClient` submit payload (write path not yet audited for ERP round-trip)
- All other editable fields (name, phone, status, goals, notes) unchanged

---

## Verification results

| Check | Result |
|---|---|
| `npm test` (Vitest) | **396/396 passed** (21 test files) |
| `npm run lint` (ESLint) | **Clean** — no warnings or errors |
| `npm run build` (Next.js) | **Compiled successfully** — 21/21 pages |
| `npm run build:verify` | **Compiled successfully** — 21/21 pages |
| Local Docker QA | **PASS** — all services healthy, all routes tested |
| Desktop layout (1280px) | **PASS** — two-column client detail, wide roster grid |
| Mobile layout (390px) | **PASS** — single-column, readable |

---

## Local Docker QA results

Stack rebuilt and verified on 2026-06-14. All services confirmed healthy:

```
✔ fitdesk (healthy)            ✔ cp-api (healthy)
✔ cp-postgres (healthy)        ✔ cp-redis (healthy)
✔ provisioning-agent (healthy) ✔ axis-bench-agent (healthy)
✔ erp-backend (healthy)        ✔ erp-execution-service (running)
✔ FitDesk reachable — http://localhost:3000/api/health (HTTP 200)
✔ Control Plane reachable — http://localhost:4000/health (HTTP 200)
```

Note: FitDesk runs as a production Docker image (`build: context: FitDesk`), not a
volume-mounted dev server. The image must be rebuilt (`docker compose build fitdesk`)
before local QA when uncommitted changes are tested.

---

## Safety boundaries preserved

| Boundary | Status |
|---|---|
| ERP proxy / JWT internals | ✅ Not touched |
| ERP credentials | ✅ Never exposed to frontend |
| ERP DocType changes | ✅ None |
| Payment mutations | ✅ None added |
| Invoice creation | ✅ Removed from client detail; not added elsewhere |
| WhatsApp / Evolution API sends | ✅ None triggered |
| Session backend | ✅ None implemented (`getSessions()` still returns `[]`) |
| Client Hub | ✅ Flag-gated OFF (`FITDESK_CLIENT_HUB_ENABLED` default false); behavior unchanged |
| Migrations / schema changes | ✅ None |
| Package dependencies | ✅ None added |
| Production | ✅ Untouched |
| Dokploy | ✅ Not deployed |

---

## Current honest limitations

- **client_index foundation not implemented.** The UI uses live ERP `Customer` data fetched
  via the existing proxy boundary. The `client_index`, `client_goal`, `client_action_intent`,
  and `client_event` local tables described in the v1.2 data architecture do not exist yet.
- **Client Hub is placeholder/disabled.** `getClientHubOverview()` returns `null` when
  `FITDESK_CLIENT_HUB_ENABLED` is false (the default). `{hub && <ClientHubPanel />}` renders
  nothing in production.
- **Sessions backend is stubbed.** `getSessions()` returns `[]` unconditionally. The PT Session
  DocType does not exist in the ERP workspace. The Sessions panel shows an honest
  "Scheduling is not connected yet." — no fake zero-session state.
- **Email write path not audited.** Email is surfaced read-only on the edit page. It will not
  be submitted to ERP until a separate audit confirms the `email_id` write round-trip is safe.
- **Needs-action signals are limited to invoice data.** The `overdue` / `outstanding` /
  `missing_contact` tiers derive from real Sales Invoices only — no session-derived signals,
  no AI-generated client health scores.
- **Owes money filter** only appears when at least one client has a real outstanding balance.
  In the current test workspace all invoices are paid, so the filter is correctly hidden.
- **`client.notes` may contain `Age: XX` artifact** from an early import that stuffed age into
  `custom_trainer_notes`. This is displayed raw — not parsed — to avoid data loss.

---

## Roadmap amendments

### 1. Distributed transaction risk (Phase 4)

When a new client is created, two writes occur in sequence:
1. ERP Customer created via Control Plane proxy
2. Local `client_index` row written

**Risk:** ERP Customer write may succeed while the local row write fails (network partition,
DB error, process crash). If this happens:

- **Do NOT auto-delete the ERP Customer.** The customer exists in the system of record.
- **Log the projection failure** with the ERP Customer docname, tenant ID, and timestamp.
- **Repair via idempotent backfill/reconcile.** A backfill job must be able to re-derive the
  local row from ERP Customer data without side effects.
- The UI should handle clients that exist in ERP but not yet in `client_index` gracefully
  (fall through to ERP fetch rather than 404).

### 2. ERP drift and reconciliation (Phase 9)

ERP data can change out-of-band (direct ERP edits, other integrations, bulk imports):

- **MVP:** manual reconcile command / admin endpoint that re-derives `client_index` rows
  from current ERP Customer state for a given tenant.
- **Future:** ERPNext webhook → secure FitDesk sync endpoint. The webhook receiver must:
  - Authenticate the source (HMAC or shared secret, not exposed to frontend)
  - Be idempotent (safe to replay)
  - Handle partial/stale payloads gracefully
  - Queue updates asynchronously to avoid blocking ERP

### 3. Audit-grade `client_action_intent` lifecycle (Phase 7+)

`client_action_intent` must be designed for auditability from the start:

- **Strict status enum:** `pending | completed | dismissed | expired` — no free-text states
- **Timestamps:** `created_at`, `completed_at`, `dismissed_at`, `expired_at` — all nullable,
  set at transition time
- **Resolution reason:** optional field for `dismissed` and `expired` states (e.g. "duplicate",
  "client inactive", "manual override")
- **Immutable audit log:** intents should never be hard-deleted; use soft-delete or archival
- **Idempotency key:** prevents duplicate intent creation from repeated backfill/webhook runs

---

## Next recommended work — Track B: Client Management v1.2.1 Foundation

**UI polish track is now paused.** The next major work is data foundation only — no new UI.

### Phase 1 deliverables

| Item | Description |
|---|---|
| Data contracts | TypeScript interfaces for `ClientIndex`, `ClientGoal`, `ClientActionIntent`, `ClientEvent` — aligned with existing `types/clients.ts` |
| Additive schema | SQL migrations: `client_index`, `client_goal`, `client_action_intent`, `client_event` tables — tenant-scoped, no existing table modifications |
| Tenant-scoped repository | `lib/clients/repository.ts` — read/write functions scoped by `tenantId`; no cross-tenant access |
| Phone normalization | `normalizePhone()` utility — E.164 canonical form, handles Lebanon (+961) country code stripping |
| Duplicate helper | `findDuplicateCandidate()` — checks `client_index` by phone (normalized) and name before ERP Customer creation |
| Backfill skeleton | `backfillClientIndex(tenantId)` — reads ERP Customer list via proxy, upserts `client_index` rows idempotently |
| Tests | Unit tests for phone normalizer, duplicate helper, and backfill skeleton (no I/O in unit tests) |

**Constraints:**
- No UI changes
- No modifications to existing tables or ERP DocTypes
- No new package dependencies without approval
- Backfill must be idempotent and safe to re-run
- All new tables must have `tenant_id` as a non-nullable indexed column
- Do not enable `FITDESK_CLIENT_DIRECTORY_LOCAL_READ` or `FITDESK_CLIENT_HUB_ENABLED` until
  the data foundation is verified in a test tenant
