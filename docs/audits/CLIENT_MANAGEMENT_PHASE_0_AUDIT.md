# Client Management — Phase 0 Audit

```text
Repo:        FitDesk product app (C:\Users\Lenovo\Dev\axis-erp\FitDesk)
Branch:      main
Remote:      https://github.com/TazUae/fitdesk.git
Mode:        Explore / read-only audit
Plan:        Client_Management_v1_2_Approved_MVP_Build_Plan.md (supplied from Downloads — NOT yet in repo)
Status:      Audit only. No code changed. No migrations. No commits.
```

> Scope note: the workspace root `axis-erp` is a multi-repo folder and is **not** a git repo.
> `fitdesk-app/` is the **Python/Frappe** app — NOT the target. The product UI app audited here is `FitDesk/`.
> Neither `provisioning-agent` nor `erp-execution-service` was touched.

---

## 0. Headline Finding (read this first)

**FitDesk currently stores zero client data locally.** Clients are the ERPNext `Customer`
DocType, read and written live through the Control Plane proxy. There is no `client_index`,
no `client_goal`, no notes table, no events table, no duplicate detection, no action queue,
and no client-area tests.

The v1.2 plan introduces a **local read model + local domain store** (`client_index`,
`client_goal`, `client_action_intent`, `client_event`) and — per §7 — makes
`client_index` the **source of truth for client identity**, with `erpCustomerId` as an
optional downstream link. That directly inverts the standing FitDesk doctrine
("ERPNext is the single source of truth for all business data", FitDesk/CLAUDE.md).

This is the single most important decision in the whole build and is unresolved in the plan.
Everything else (UI, AI, duplicate logic) is comparatively low-risk and partly already built.

---

## 1. Current Route Map

| Route | File | Type | Purpose |
|---|---|---|---|
| `/dashboard/clients` | [app/dashboard/clients/page.tsx](../../app/dashboard/clients/page.tsx) | Server | Fetches clients via `getClients()`, renders `<ClientsView>` |
| `/dashboard/clients` (loading) | [app/dashboard/clients/loading.tsx](../../app/dashboard/clients/loading.tsx) | Server | Route-level skeleton |
| `/dashboard/clients/new` | [app/dashboard/clients/new/page.tsx](../../app/dashboard/clients/new/page.tsx) | Client | "Premium" full-page Add Client form (manual-first) |
| `/dashboard/clients/[id]` | [app/dashboard/clients/[id]/page.tsx](../../app/dashboard/clients/[id]/page.tsx) | Server | Client detail: profile + sessions + invoices + deactivate |
| `/dashboard/clients/[id]/edit` | [app/dashboard/clients/[id]/edit/page.tsx](../../app/dashboard/clients/[id]/edit/page.tsx) | Client | Edit client |

Adjacent routes the client area links into:
`/dashboard/messages/[id]` (WhatsApp), `/dashboard/invoices/new?client=<id>`,
`/dashboard/invoices/[id]/pay`, `/dashboard/schedule`.

**Observation:** the directory "Add" button routes to the full-page `/new` form. The bottom-sheet
`AddClientSheet` defined inside `ClientsView.tsx` is **not rendered anywhere** — it is dead code.
The plan wants a mobile bottom sheet / desktop drawer, so this needs consolidation (one entry point).

---

## 2. Current Client Data Model

**There is no local client table.** Local persistence (Drizzle + libsql, `auth.db`) is limited to:

| Table | File | Relevance |
|---|---|---|
| `user`, `session`, `account`, `verification` | [lib/db/schema.ts](../../lib/db/schema.ts) | Better Auth |
| `trainer_mapping` | same | Maps Better Auth user → ERP trainer docname |
| `trainer_whatsapp_connection` | same | Evolution API instance state |
| `message_log` | same | Outgoing WhatsApp audit (`client_id` here is the **ERP** docname) |
| `WorkspaceProvisioning` | same | Tenant provisioning + **`tenantId`** lives here |

Migrations are hand-written SQL in [scripts/migrate-app.mjs](../../scripts/migrate-app.mjs) /
[scripts/migrate.mjs](../../scripts/migrate.mjs) (`CREATE TABLE IF NOT EXISTS`), run at boot by
[scripts/start-with-migrations.mjs](../../scripts/start-with-migrations.mjs). There is **no Drizzle
migration generator in the loop** despite `drizzle.config.ts` existing.

The **canonical client shape** is `Client` in [types/index.ts](../../types/index.ts):
`id` (= ERP Customer docname), `firstName/lastName/name`, `phone`, `status`, `trainerId`,
`sessionCount`, `goal?` (free-text), `notes?`, `createdAt`. No tenantId, no structured goal,
no safety/onboarding/billing state, no duplicate fields.

The ERP wire shape is `ERPCustomer` in [lib/erpnext/client.ts](../../lib/erpnext/client.ts):
`name`, `customer_name`, `mobile_no`, `disabled`, `custom_fitness_goals`, `custom_trainer_notes`,
`creation`. Goals are stored as a **JSON string** inside `custom_fitness_goals`; age is **stuffed
into the notes field**. `formatGoal()` ([lib/format/goal.ts](../../lib/format/goal.ts)) defensively
re-parses all of these shapes for display.

---

## 3. Current Add Client Flow

Two implementations exist (one live, one dead):

1. **Live — `/dashboard/clients/new`** ([new/page.tsx](../../app/dashboard/clients/new/page.tsx)):
   manual-first. Fields: full name*, phone (E.164 via `PhoneInput`), goals (`GoalMultiSelect`),
   age (`AgeInput`, folded into notes), trainer notes. On submit calls
   `createClient()` → `addClient()` → `createClient()` adapter → **ERP POST `Customer`**. Shows a
   success screen with "View client". **No** duplicate check, **no** AI assist, **no** confirm step,
   **no** action queue.
2. **Dead — `AddClientSheet`** inside [ClientsView.tsx](../../components/modules/ClientsView.tsx):
   a bottom sheet with the right shape (drag handle, safe-area inset) but never mounted.

Server path: [actions/clients.ts](../../actions/clients.ts) `addClient()` injects `trainer` from the
session (`resolveTrainerId` → `ensureTrainerIdForUser`) then calls the ERP adapter. Trainer id is
injected server-side and never trusted from the client — good pattern to preserve.

**Manual-first already satisfied.** A trainer can add a client in well under 30s today.

---

## 4. Current Goal / Taxonomy Files

| File | Role |
|---|---|
| [components/ui/GoalSelect.tsx](../../components/ui/GoalSelect.tsx) | `GOALS` list: `fat_loss, muscle_gain, strength, general_fitness, rehabilitation, sports_performance, mobility` |
| [components/ui/GoalMultiSelect.tsx](../../components/ui/GoalMultiSelect.tsx) | Multi-goal + `SUB_GOALS` map (e.g. `rehabilitation → back_pain/knee_recovery/injury_recovery`) + target weight |
| [components/ui/GoalWithSubGoal.tsx](../../components/ui/GoalWithSubGoal.tsx), [MultiGoalSelector.tsx](../../components/ui/MultiGoalSelector.tsx) | Alternate selectors |
| [lib/format/goal.ts](../../lib/format/goal.ts) | Normalises stored JSON/array/string goal → display string |
| [utils/goalHelpers.ts](../../utils/goalHelpers.ts) | Goal helper utilities |

A usable taxonomy (`goalId`, sub-goals, an implicit safety signal in `rehabilitation`) already
exists and maps cleanly to the plan's `client_goal.goalId / subGoalIds`. **Missing:** structured
`urgency`, `confidence`, `source`, and explicit `safetyFlags` — goals are persisted only as a JSON
blob in ERP, not as rows.

---

## 5. Current Scheduling Hooks

- Pure engine: [lib/scheduling/engine.ts](../../lib/scheduling/engine.ts) — `buildBookingPlan`,
  `expandPattern`, `detectConflict(s)`, `checkAvailability`. Pure, deterministic, well-tested
  ([lib/scheduling/__tests__/engine.test.ts](../../lib/scheduling/__tests__/engine.test.ts)).
- Server actions: [actions/sessions.ts](../../actions/sessions.ts) (`bookSession`, fetch, complete…).
- **ERP gap:** the `PT Session` DocType does **not** exist in this ERP instance.
  `getSessions()` returns `[]` and `createSession()` **throws 503** (see erp-adapter). The client
  detail page shows a disabled "+ Schedule" affordance ("coming soon").

**Implication for v1.2:** `client_index.nextSessionAtUtc` has **no persisted source of truth today**.
The projection/reconcile "Session booked → refresh nextSessionAtUtc" trigger cannot be implemented
until sessions are actually persisted somewhere. This must be treated as a placeholder field for MVP.

---

## 6. Current Billing Hooks

- Invoices: [actions/invoices.ts](../../actions/invoices.ts) + adapter `createInvoice`,
  `submitSalesInvoice`, `createAndSubmitPaymentEntry` (real ERP Sales Invoice / Payment Entry flow,
  with `methods.ts` provider abstraction and `status.ts` mapping). Well-tested
  ([actions/invoices.test.ts](../../actions/invoices.test.ts), [lib/payments/methods.test.ts](../../lib/payments/methods.test.ts), [lib/invoices/status.test.ts](../../lib/invoices/status.test.ts)).
- **Critical coupling:** invoices/payments key off the **ERP Customer docname** (`client.id`).
  `getInvoices({ clientId })` and `/dashboard/invoices/new?client=<id>` both pass the ERP docname.
- **No** `billingMode` / `paymentSummary` / package vs pay-per-session concept exists on the client
  record today. These plan fields are entirely new.

---

## 7. Current ERP Proxy / Client Usage

All ERP I/O goes through one chokepoint: [lib/erpnext/client.ts](../../lib/erpnext/client.ts) `erpFetch()`:

```text
FitDesk server → signTenantJwt(tenantId)  [HS256, FITDESK_JWT_SECRET, 5-min exp]
              → CONTROL_PLANE_URL + /api/erp/doctype/<DocType>  (Customer | Sales Invoice | Payment Entry)
              ← normalised app types
```

- Tenant comes from `getTenantContext()` ([lib/tenant/context.ts](../../lib/tenant/context.ts)) →
  latest `WorkspaceProvisioning.tenantId`. No ERP credentials live in FitDesk. ✅ matches doctrine.
- **Single-tenant-per-workspace model:** `getClients(trainerId)` **ignores** `trainerId` — every
  non-disabled `Customer` in the tenant's ERP belongs to that workspace's one trainer. Isolation
  today is enforced by the **tenant JWT**, not by row-level filters.
- `is-unavailable-error.ts` gives graceful "workspace still connecting" UX on ERP 503.

**Consequence for v1.2 tenant rules:** the *local* tables the plan introduces live in a **shared**
`auth.db` across all tenants. Unlike ERP (isolated per tenant by the proxy), local tables have **no
ambient isolation** — every query must carry an explicit tenant filter or cross-tenant leakage is
possible. This is a genuinely new isolation surface that does not exist today.

---

## 8. Current Tests

| Area | Test file | Covers clients? |
|---|---|---|
| ERP adapter | [lib/erpnext/client.test.ts](../../lib/erpnext/client.test.ts) | Adapter normalisation (indirectly) |
| Invoices | [actions/invoices.test.ts](../../actions/invoices.test.ts) | No |
| Payments | [lib/payments/methods.test.ts](../../lib/payments/methods.test.ts) | No |
| Invoice status | [lib/invoices/status.test.ts](../../lib/invoices/status.test.ts) | No |
| Sessions | [actions/sessions.test.ts](../../actions/sessions.test.ts) | No |
| Messages | [actions/messages.test.ts](../../actions/messages.test.ts) | No |
| Dashboard | [lib/dashboard/derive.test.ts](../../lib/dashboard/derive.test.ts) | No |
| Scheduling | [lib/scheduling/__tests__/engine.test.ts](../../lib/scheduling/__tests__/engine.test.ts) | No |

Runner: **Vitest** ([vitest.config.ts](../../vitest.config.ts)). **There are zero tests for the client
area** (creation, directory, detail, goal handling, duplicate logic, tenant isolation). This is the
single largest test gap and the plan's required case (created → immediately visible) has no harness.

Reusable AI pattern: [lib/claude.ts](../../lib/claude.ts) calls Claude (`claude-haiku-4-5-20251001`)
via raw `fetch` with a **template fallback** and never-throws contract — exactly the shape the AI
parse route needs, but it has **no timeout** (the plan requires a 3-second cap).

---

## 9. Files Safe to Edit / Add

**Safe to add (net-new, low blast radius):**
- `lib/db/schema.ts` — append new tables (additive only).
- New migration statements in `scripts/migrate-app.mjs` (additive `CREATE TABLE IF NOT EXISTS`).
- New `lib/clients/*` (repositories, projection service, duplicate service, hub hydration).
- New `actions/clients-*.ts` or extend `actions/clients.ts` (new actions only).
- New `app/api/clients/parse/route.ts` (AI parse route).
- New `components/clients/*` (Add Client sheet/drawer, Hub, action queue).
- New tests under existing patterns.

**Safe to edit with care:**
- `components/modules/ClientsView.tsx` — directory shell (remove dead `AddClientSheet`, wire sheet).
- `app/dashboard/clients/new/page.tsx` and `[id]/page.tsx` — convert to plan flow.
- `types/index.ts` — additive new types.

## 10. Files NOT Safe to Touch Without Approval

- [lib/erpnext/client.ts](../../lib/erpnext/client.ts) `erpFetch` / JWT / DocType constants — ERP boundary & tenant JWT.
- [lib/erpnext/types.ts](../../lib/erpnext/types.ts) ERP payload shapes.
- [actions/invoices.ts](../../actions/invoices.ts), [lib/payments/*](../../lib/payments), [lib/invoices/*](../../lib/invoices) — payment logic (workspace CLAUDE.md §4).
- [middleware.ts](../../middleware.ts), [lib/auth.ts] / Better Auth wiring — auth.
- [lib/tenant/context.ts](../../lib/tenant/context.ts) — tenant resolution.
- Existing migration scripts' **existing** statements (append only; never alter shipped DDL).
- Anything under `provisioning-agent`, `erp-execution-service`, `provisioning_api`, `control-plane`.

## 11. Recommended Implementation Path

1. **Resolve the source-of-truth question first** (escalation — see §12). Do not write schema until
   the team confirms whether `client_index` owns client identity and how/when ERP `Customer` is
   created. This single decision reshapes the create transaction, invoicing, and the directory query.
2. Phase 1 design doc + contracts (types only). Reuse `GOALS`/`SUB_GOALS`, `Client`, `ActionResult`.
3. Additive schema + repositories with mandatory tenant filter.
4. Directory shell reading `client_index` (feature-flag fallback to live ERP read).
5. Manual-first sheet/drawer (consolidate the two entry points; delete dead `AddClientSheet`).
6. AI parse route reusing `lib/claude.ts` + a 3s `AbortController`.
7. Duplicate detect/override with audit event.
8. Atomic local create transaction (no ERP/WhatsApp/booking/invoice side effects).
9. Client Hub + action queue.
10. Tests last-but-required, including the created→visible integration test.

## 12. Risks & Unknowns

| # | Risk / Unknown | Severity | Note |
|---|---|---|---|
| 1 | **Client identity source of truth.** Plan §7 makes `client_index` authoritative; FitDesk doctrine says ERP is. | **Critical** | Must be reconciled & approved before any schema. Changes invoicing coupling. |
| 2 | **When is the ERP `Customer` created?** Guardrail forbids ERP mutation in Add Client, but invoices need an ERP docname. | **Critical** | Need a defined sync step / boundary. Otherwise invoicing breaks for new clients. |
| 3 | **No job runner** for `client_index_reconcile_job`. No BullMQ (plan rejects it), no cron in the Next app. | High | Where does the 15-min job run? Vercel cron? Docker sidecar? Undecided. |
| 4 | **`nextSessionAtUtc` has no backing store** — PT Session DocType absent; `createSession` throws. | High | Treat as placeholder for MVP; cannot wire the session→projection trigger yet. |
| 5 | **Local DB is shared across tenants** (`auth.db`); no ambient isolation. | High | Every client query MUST filter tenant; this is new and untested. |
| 6 | **Tenant key ambiguity:** `tenantId` (provisioning) vs `trainerId` (ERP) vs `userId` (auth). | Medium | Plan says `tenantId` on every row — pick one canonical key and document it. |
| 7 | **Two Add Client entry points**, one dead. | Low | Consolidate to sheet/drawer; delete dead code. |
| 8 | **Goals/age are JSON-in-text / notes hacks.** | Low | Structured `client_goal` removes the hack; keep `formatGoal` for legacy reads. |
| 9 | **Zero client-area tests.** | Medium | New harness required (DB-backed integration tests against libsql). |
| 10 | Plan file not yet committed to repo. | Low | Add `Client_Management_v1_2_Approved_MVP_Build_Plan.md` to `docs/plans/` for traceability. |

---

### Exit criteria check

- [x] Audit file exists
- [x] Existing logic mapped (routes, model, add flow, goals, scheduling, billing, ERP, tests)
- [x] ERP boundaries confirmed (single chokepoint `erpFetch`, tenant JWT, no creds in app)
- [x] Scheduling/billing hooks identified (engine pure-core; PT Session DocType absent; invoices keyed by ERP docname)
- [x] Safe-edit files listed
- [x] No implementation started
