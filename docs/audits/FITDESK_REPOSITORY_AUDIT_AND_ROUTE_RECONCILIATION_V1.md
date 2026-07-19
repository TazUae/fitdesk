> **Status:** Target direction — adopted as canonical intent, NOT implemented state.
> **Adopted:** 2026-07-19 · **Source:** `FITDESK_REPOSITORY_AUDIT_AND_ROUTE_RECONCILIATION_V1.md` (documentation pack) · **sha256 (source body):** `2bbe371843c1728963634d79e928f17b43b0b11f9cd3eae3c965f0313b6212b2`
> **Implementation reality:** see `docs/audits/FITDESK_IMPLEMENTATION_STATUS_RECONCILIATION_2026-07-19.md`
> **Rule:** This document describes intended product direction. Do not cite it as evidence
> that a capability exists. Verify against code before planning or estimating work.
>
> **Method-vs-findings note:** This document is an audit *specification* — its
> Route Reconciliation table uses the literal placeholder "Audit" in the
> "Current route" column throughout. It defines the method, not the results.
> For actual, verified findings, see
> `docs/audits/FITDESK_IMPLEMENTATION_STATUS_RECONCILIATION_2026-07-19.md`.
>
---

# FitDesk Repository Audit and Route Reconciliation v1

```text
Product: FitDesk SaaS Platform
Document: Repository Audit and Route Reconciliation
Version: v1.0
Status: Executable audit specification — audit not yet performed
Canonical repository direction: C:\Users\Lenovo\Dev\axis-erp\FitDesk
Generated: 2026-07-18
```

> **Adoption discipline:** This document defines the audit. It does not claim the repository has already been inspected. Start read-only, record evidence, and keep documentation adoption separate from implementation changes.

## 1. Purpose

Define the read-only audit required before adopting the new PRD, route names, navigation, Client Hub, Inbox, Billing, offline, and AI direction.

## 2. Safety Rules

1. Confirm the active repository directory before every command.
2. Start with read-only commands.
3. Do not edit the production server directly.
4. Do not modify compose files, firewall, volumes, or databases during audit.
5. Git is source of truth; Dokploy deploys from Git.
6. Preserve working routes/logic until replacements are verified.
7. Prefer aliases/redirects and atomic commits over rewrites.
8. Do not mix docs adoption with app, schema, lockfile, dependency, or deployment changes.
9. Verify backup and rollback before later schema/high-risk mutation.

## 3. Product Direction to Reconcile

Desktop:

```text
Dashboard · Schedule · Clients · Inbox · Billing · Settings
```

Mobile:

```text
Home · Schedule · Clients · Inbox · More
```

Structural decisions:

- Messages becomes Inbox as a product concept, with compatibility preserved.
- Invoices is consolidated under Billing, with deep links preserved.
- Programs leaves primary navigation.
- Client program assignment stays inside Client Hub.
- Program Library and Exercise Catalog live under Settings.
- Search remains persistent and outside More.
- Bounded offline read cache and completion intent join the MVP baseline without offline authority.

## 4. Required Deliverables

1. Repository/branch/worktree status.
2. Route tree inventory.
3. Desktop/mobile navigation inventory.
4. Canonical workflow entry-point map.
5. Component/action/service/repository map.
6. Schema/model inventory.
7. ERP/Control Plane integration map.
8. Evolution API capability map.
9. Offline/local-state inventory.
10. AI/program/catalog/feature-flag inventory.
11. Test/CI/build/deploy command matrix.
12. Route compatibility plan.
13. Risk register and atomic implementation sequence.

## 5. Phase A — Repository Identity and Git State

Capture:

```text
absolute directory · repository root · remotes · active branch · HEAD
worktree status · untracked files · submodules · recent commits
modernization branches · pending diffs
```

Required conclusions:

- Is this the canonical FitDesk repository?
- Is the active branch correct?
- Is the BookingSheet portal layout fix uncommitted?
- Are unrelated changes present?
- Are submodules/generated files stale?

## 6. Phase B — Route Tree

For each Next.js route record:

```text
route
page/layout/loading/error/not-found
auth/tenant guard
data loader/server action
mobile/desktop behavior
deep links
feature flag
navigation entry
tests
```

### Route Reconciliation Table

| Destination | Proposed route | Current route | Classification | Required action |
|---|---|---|---|---|
| Dashboard | `/dashboard` | Audit | existing/alias/planned | Preserve working default |
| Schedule | `/schedule` | Audit | existing/alias/planned | Preserve deep links |
| Session detail | `/sessions/{sessionId}` | Audit | existing/alias/planned | Verify completion/reschedule |
| Clients | `/clients` | Audit | existing/alias/planned | Verify Add Client/filters |
| Client Hub | `/clients/{clientId}` | Audit | existing/alias/planned | Reconcile views/panels |
| Inbox | `/inbox` | Audit likely `/messages` | alias/planned | Add compatibility first |
| Billing | `/billing` | Audit likely `/invoices` | alias/planned | Preserve old links |
| Billing invoices | `/billing/invoices` | Audit | alias/planned | Map list/detail IDs |
| Invoice detail | `/billing/invoices/{invoiceId}` | Audit | alias/planned | Preserve contextual links |
| Search | `/search` | Audit | existing/planned | Keep persistent access |
| Settings | `/settings` | Audit | existing | Inventory children |
| Program library | `/settings/program-library` | Audit | planned/flagged | No primary nav |
| Exercise catalog | `/settings/exercise-catalog` | Audit | planned/flagged | No primary nav |
| Onboarding | `/onboarding` | Audit | existing | Verify provisioning truth |

Do not remove or rename working routes before all internal links, bookmarks, redirects, tests, and external references are inventoried.

## 7. Phase C — Navigation

Identify:

- desktop sidebar/top nav;
- mobile bottom tabs;
- mobile header controls;
- More menu;
- FAB/global action;
- command palette/Search;
- breadcrumbs/deep links;
- active-route matching;
- feature-flagged entries.

Questions:

- Is Messages currently primary navigation?
- Is Invoices currently primary navigation?
- Is Programs visible/planned as primary nav?
- Is Search hidden in More?
- Does More contain frequent actions?
- Are desktop/mobile labels consistent?

## 8. Phase D — Canonical Workflow Mapping

| Objective | Expected workflow | Audit entry points |
|---|---|---|
| Add client | AddClientSheet/Form | Dashboard, Clients, FAB, Search |
| Book/reschedule | BookingSheet | Schedule, Client Hub, Dashboard, completion success |
| Complete/resolve | SessionCompletionSheet | Today, Session, Needs Attention |
| Record payment | RecordPaymentSheet/action | Completion, Invoice, Statement, Client Hub |
| Assign/renew package | Package workflow family | Client Hub, warnings, recovery |
| Send/reply | MessageComposer | Inbox, Client Hub, Session, Billing |
| Review account | Statement | Client Hub, overdue item, Invoice |
| Manage recurrence | Recurring Schedule Manager | Client Hub, Session, Schedule |
| Resolve attention | AttentionResolver | Dashboard/deep link |

Flag duplicated validation, mutation, audit, or recovery logic.

## 9. Phase E — Scheduling Stack

Verify exact files/responsibilities:

```text
lib/scheduling/engine.ts
lib/scheduling/bookingService.ts
lib/scheduling/sessionRepository.ts
actions/schedulingActions.ts
session completion service
BookingSheet
SessionCompletionSheet
```

Record:

- pure vs impure logic;
- conflict response type;
- timezone/DST;
- recurrence cap/expansion;
- package awareness;
- buffer/working-hours classification;
- location handling;
- expected version/idempotency;
- transaction/recovery boundaries;
- tests.

Do not move business logic into UI during route reconciliation.

## 10. Phase F — Client, Package, Billing, ERP

### Client creation

Verify:

- `actions/clients.ts` or equivalent;
- ERP Customer path;
- local projection order;
- duplicate handling;
- partial-success repair;
- tenant enforcement.

### Packages

Verify:

- template catalog;
- client assignment;
- package invoice creation;
- Paid Now/Pay Later;
- balance/consumption ownership;
- unique session linkage;
- expiry/negative-balance guard.

### Billing/payments

Verify:

- invoice list/detail routes;
- PPS invoice completion hook;
- Record Payment;
- ERP allocation;
- partial/uncertain handling;
- Statement data path;
- manual invoice entry points;
- receipt/correction support.

Critical: no direct ERP I/O outside the approved client/proxy and Control Plane path.

## 11. Phase G — Client Hub

Inventory:

```text
Today/Overview · Goals/Safety · Sessions/Recurrence · Progress
Program/Workout · Package/Billing · Statement · Attendance
Communication · Activity · Lifecycle
```

For each section record:

- component/route state;
- data source/freshness;
- empty/partial/error states;
- actions and canonical reuse;
- mobile/desktop behavior;
- accessibility tests;
- product classification.

## 12. Phase H — Messaging and Evolution API

Verify:

- current Messages route/components;
- outbound and native handoff;
- Evolution client/config ownership;
- instance version/events;
- webhook verification;
- provider IDs/unique constraints;
- send/delivery/read semantics;
- inbound availability;
- sender normalization/matching;
- consent model;
- draft/history storage;
- retry/duplicate-send protection;
- integration health.

Do not enable inbound Inbox until authentication, deduplication, matching, privacy, and recovery are proven.

## 13. Phase I — Offline and Local Persistence

Inventory:

- service worker/PWA;
- browser storage libraries;
- persisted stores;
- cached responses;
- drafts/intents;
- encryption;
- tenant/user scope;
- expiry;
- logout/tenant-switch cleanup;
- background sync;
- multi-device behavior;
- operation IDs/expected versions.

Classify each field:

```text
safe to cache
cache with encryption and expiry
do not cache
```

Financial and safety data require explicit privacy review.

## 14. Phase J — AI, Program, Feature Flags

Verify:

- existing AI provider/client;
- feature registry;
- prompts/schemas/policies;
- context authorization;
- run audit/evals;
- tools and write-authority absence;
- kill switches/limits;
- program/exercise models;
- program versioning;
- rollout targeting.

Do not add AI microservice or multi-agent framework before proving the product-server module is insufficient.

## 15. Phase K — Tests, CI, Deployment

Record exact commands/files for:

```text
install · format · lint · typecheck · unit · integration · E2E
schema · migrations · build · security audit · Docker/Dokploy
environment preflight · smoke · rollback
```

Also record CI workflows, secrets/environments, test DBs/ports, staging tenants, provider accounts, skipped/flaky tests, and current build status.

## 16. Route Reconciliation Strategy

### Messages → Inbox

```text
1. Audit `/messages` behavior/deep links.
2. Establish one conversation/message model.
3. Add `/inbox` canonical route or alias.
4. Keep `/messages` compatibility redirect/route.
5. Update navigation/internal links atomically.
6. Add route/deep-link tests.
7. Observe before removal.
```

Do not present a full inbound Inbox if only a sent log exists; stage the label and capability truthfully.

### Invoices → Billing

```text
1. Audit `/invoices` list/detail IDs and query parameters.
2. Add `/billing` overview without duplicating invoice logic.
3. Alias `/billing/invoices` to existing canonical list logic.
4. Preserve `/invoices` and detail links.
5. Update nav/contextual links.
6. Add payment/statement deep-link tests.
7. Remove old routes only after stability and approval.
```

### Programs

- Remove only primary-nav exposure, not working program logic.
- Verify Client Hub program surface and flags.
- Move template management through atomic route changes.
- Preserve client program IDs/versions.

### Search and More

- Make Search persistent before removing old access.
- Mobile More remains Billing, Settings, Help, Account, Sign out.
- Do not hide Inbox, Search, client-contextual Programs, or frequent actions in More.

## 17. Classification Output

Every route/capability receives one:

```text
EXISTING — aligned
EXISTING — needs hardening
ALIAS
PARTIAL
FEATURE-FLAGGED
PLANNED
FUTURE
REJECTED
DEPRECATED — compatibility only
UNKNOWN
```

## 18. Finding Template

```text
Finding ID
Area
Observed evidence
Current behavior
Expected behavior
Risk
User impact
Authority/data impact
Smallest safe change
Tests
Rollback
Owner
Status
```

## 19. Implementation Sequence After Audit

1. Adopt documentation only.
2. Validate login → `/onboarding` → Start Workspace for the six reset test users.
3. Return to visual QA and commit the pending BookingSheet portal layout fix separately.
4. Add route alias/redirect tests before relabeling navigation.
5. Reconcile desktop/mobile nav and persistent Search.
6. Reconcile Client Hub sections and canonical entry points.
7. Harden unified session completion and payment reuse.
8. Reconcile Billing and Statement reads.
9. Harden outbound communication, then add inbound Inbox foundation.
10. Add offline intent only after operation/version contracts are proven.
11. Add AI kernel/features behind flags after manual flows are stable.

## 20. Commit Strategy

Documentation:

```text
docs(fitdesk): add product and architecture baseline pack
```

Later examples:

```text
fix(scheduling): preserve BookingSheet portal layout on mobile
refactor(fitdesk): alias messages route to inbox
refactor(invoices): introduce billing route compatibility
fix(billing): reconcile session completion payment recovery
```

Every implementation commit is independently testable and reversible.

## 21. Definition of Complete

The audit is complete only when:

- repository/branch are proven;
- route/nav/component/action/service/schema inventories exist;
- every capability is classified;
- compatibility plans exist for route changes;
- source-of-truth boundaries are confirmed;
- idempotency/version/recovery evidence exists;
- test/deployment commands are proven;
- risks have owners and smallest safe next actions;
- the audit itself required no write mutation.
