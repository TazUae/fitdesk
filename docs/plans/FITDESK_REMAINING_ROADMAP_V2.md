# FitDesk Remaining Roadmap v2.1

> **This remains Phase-N roadmap authority.** Sprint 1 US-ID traceability now lives
> in [`docs/execution/SPRINT_1_STORY_TRACEABILITY_MAP.md`](../execution/SPRINT_1_STORY_TRACEABILITY_MAP.md).
> Use [`docs/DOCUMENTATION_AUTHORITY_MAP.md`](../DOCUMENTATION_AUTHORITY_MAP.md) to
> resolve authority conflicts between this roadmap and other docs.

> **Version:** v2.1
> **Status:** Active planning — supersedes the "0/9 phases" framing in
> [`../architecture/FITDESK_2026_ARCHITECTURE_HANDBOOK/02_CLEANUP_ROADMAP.md`](../architecture/FITDESK_2026_ARCHITECTURE_HANDBOOK/02_CLEANUP_ROADMAP.md)
> **Date:** 2026-07-03
> **Doctrine:** Bad decisions avoided > code produced · truth-first · small reversible changes
> **Author:** Roadmap synthesis from the 2026-07-03 Plan-vs-Code Gap Report

**v2.1 updates:**
- Pulls basic CI forward before critical write-path changes.
- Clarifies split-brain reconcile as idempotent tenant-scoped upsert.
- Clarifies ledger concurrency guard should prefer database-level atomic conditional mutation.

---

## 1. Current Baseline

Workspace cleanup is closed *enough* to return to product work. This roadmap is grounded in
**current code reality**, not the stale cleanup roadmap.

### Cleanup — closed

- control-plane ERP proxy risk closed
- fitdesk-platform pushed to private GitHub
- stale clone folders quarantined
- safe snapshot artifacts quarantined
- stale root docs/audit files quarantined
- governance files preserved
- env / db / sensitive files untouched
- all source repos untouched

### Current code / audit facts (verified)

| Fact | Evidence |
|---|---|
| Full FitDesk suite passes: **1565 / 1565 tests** | `npx vitest run` (2026-07-03) |
| Client Management v1.2 is **mostly delivered** | `lib/clients/*`, `client_index`/`client_goal`/`client_action_intent`/`client_event` in `lib/db/schema.ts`; [ADR-001](../adr/ADR-001-client-management-erp-authoritative-hybrid.md) |
| Goal taxonomy / data layer is **built and tested** | `lib/goals/{taxonomy,mapping,conflicts,safety}.ts` + `__tests__` |
| **FD Session is the real shipped session architecture** | `lib/scheduling/sessionRepository.ts` (`DOCTYPE_SESSION = 'FD Session'`), `bookingService.ts`, `sessionCompletionService.ts`, `lib/dashboard/dashboardDataService.ts` |
| **PT Session path is legacy / dead / stubbed** | `lib/erpnext/client.ts:411-459` — `getSessions()` returns `[]`; `createSession`/`markSessionComplete` throw 503 |
| Client detail page still calls the **dead PT Session path** → empty session history | `app/dashboard/clients/[id]/page.tsx:61` calls `getSessions` from `lib/business-data` |
| Goal **mapping engine has no runtime consumer** | `resolveProgramGoal` / `INTAKE_GOAL_PROGRAM_MAP` imported only by their test file — no program builder exists |
| **Server-side hard-conflict enforcement missing** | `hasUnresolvedHardConflict` used in UI only; never in `actions/clients.ts` / `lib/clients/repository.ts` |
| **Save-time safetyState / safetyFlags persistence missing** | `lib/clients/create-draft.ts:197` hardcodes `safetyFlags: []`; `lib/clients/repository.ts:359,563` hardcode `safetyState: 'clear'` |
| Client **reconcile / repair job missing** | `lib/clients/reconcile.ts` absent |
| **`nextSessionAtUtc` always null** | written `null` at `lib/clients/repository.ts:363,567,751`; never projected |
| Package / session consumption **built**, but concurrency / reversal / expiry hardening remains | `lib/billing/package-consumption-service.ts:86` read-then-insert; no reversal event; no expiry sweep |
| Pay-per-session invoice-on-completion **implemented, live ERP QA not run** | `lib/scheduling/sessionCompletionService.ts` PPS path; C7 freeze report notes mock-only verification |
| **CI workflow missing** | no `.github/workflows` in FitDesk |
| **`features/` directory is mostly scaffold** | 28 `.gitkeep` + one real component (`features/clients/components/ClientWorkspaceOverlay.tsx`) |
| Platform / deployment hardening **remains later** | control-plane / provisioning-agent / erp-execution-service checkout hygiene |

---

## 2. Executive Summary

The program returns to product work in **truth-first order**: fix the documentation and
user-visible data lies before adding features, close the one high-value safety gap that a crafted
payload can bypass today, then harden the money-adjacent flows, run the gated live-ERP QA, and only
then build the premium Goal UX and platform hardening.

```text
0    Truth repair (docs)            ← start here, zero code risk
1    Re-open FitDesk safely         ← validate before changing behavior
1.5  Basic CI gate                  ← automated test/lint/build before write-path changes
2    BookingSheet visual QA / commit
3    Server-side goal enforcement   ← highest-value safety close
4    FD Session detail-page truth   ← remove user-visible session lie
5    Client reconcile + nextSessionAtUtc
6    Ledger hardening               ← APPROVAL: ERP Payment Entries
7    Live PPS / Pay Later QA        ← APPROVAL: ERP writes, test tenant only
8    Feature-folder migration
9    Full Goal System UX
10   Platform deployment hardening  ← APPROVAL: mostly outside FitDesk repo
```

Ordering rationale: docs truth unblocks honest planning; validation de-risks everything after it;
basic CI (Phase 1.5) is pulled forward so every subsequent write-path change — client-save
validation, goal persistence, billing ledger logic, tenant-sensitive paths — lands under automated
gates instead of manual-only verification; the goal-safety gap (Phase 3) is a spec-mandated control
that is currently unenforced server-side; FD Session truth (Phase 4) removes a correctness bug
users can see. Money and ERP-write phases (6, 7) and platform (10) are approval-gated and sequenced
after the cheap, reversible wins.

---

## 3. Phase-by-Phase Roadmap

Each phase lists: **Goal · Why it matters · Scope · Explicit non-goals · Files/modules likely
involved · Risks · Acceptance criteria · Suggested model/mode · Suggested commit.**

---

### Phase 0 — Truth repair before more feature work

- **Goal:** Update project truth so future work follows the real codebase, not stale docs.
- **Why it matters:** The standing roadmap says "0/9 phases started" and marks the session
  architecture "FROZEN," while FD Session is actually shipped and PT Session is dead. Every future
  plan built on that document inherits false premises.
- **Scope:**
  1. Update the architecture handbook / cleanup roadmap.
  2. Record **FD Session** as the shipped session architecture (canonical truth).
  3. Mark **PT Session** as legacy / dead / stub path.
  4. Mark Graphify audit and design-token repair as **completed** (confirmed).
  5. Mark `features/` migration and CI as **still open**.
  6. Remove / replace the false "0/9 phases started" wording.
  7. Record that workspace cleanup Phase 2 is closed enough and product work has resumed.
- **Explicit non-goals:** No code, schema, or config change. No deletion of the PT stub yet
  (Phase 4 handles isolation; removal is later).
- **Files/modules likely involved:**
  `docs/architecture/FITDESK_2026_ARCHITECTURE_HANDBOOK/02_CLEANUP_ROADMAP.md`,
  `.../01_ARCHITECTURE_TRUTH_AUDIT.md`, `.../09_SCHEDULING_ARCHITECTURE.md`; evidence anchors:
  `lib/scheduling/sessionRepository.ts`, `lib/erpnext/client.ts:411-459`,
  `docs/audits/PHASE_B0_GRAPHIFY_KNOWLEDGE_GRAPH_AUDIT.md`, `graphify-out/`,
  `app/globals.css` (OKLCH triplets), `tailwind.config.ts` (`oklch(var(--…))`).
- **Risks:** Very low — docs only. Only risk is mis-stating status; cross-check each claim against
  the file it cites.
- **Acceptance criteria:**
  - Roadmap matches actual code.
  - FD Session documented as current truth; PT Session marked legacy/dead.
  - Graphify + token repair marked done; `features/` + CI marked open.
  - No "0/9 phases started" wording remains.
  - Next implementation phase is grounded in real code.
- **Suggested model/mode:** Sonnet · plan-then-write (docs edits are low-risk, fast).
- **Suggested commit:** `docs(architecture): reconcile cleanup roadmap with shipped FD Session reality`

---

### Phase 1 — Re-open FitDesk safely

- **Goal:** Validate the current app state before changing behavior.
- **Why it matters:** Cleanup touched clones, snapshots, and quarantines. Confirm onboarding and
  tenant isolation still work end-to-end before layering new code on top.
- **Scope:**
  1. Verify FitDesk repo clean state.
  2. Validate six reset test users: login → `/onboarding` → Start Workspace.
  3. Confirm `WorkspaceProvisioning` rows recreate correctly.
  4. Confirm no stale tenant mapping returns.
  5. Confirm existing working users remain untouched.
  6. Run local health checks (`npm run local:up`, `npm run local:check`).
- **Explicit non-goals:** No behavior change; no schema/migration; no code edits beyond what a
  failure diagnosis strictly requires (and that would be its own scoped fix).
- **Files/modules likely involved:** `middleware.ts`, `lib/tenant/context.ts`, `lib/workspace/*`,
  onboarding routes under `app/onboarding/`, `WorkspaceProvisioning` schema; local stack scripts.
- **Risks:** Low. Any discovered tenant-mapping regression is a **stop-and-report** event
  (tenant isolation is an approval-gated area).
- **Acceptance criteria:**
  - All six reset users onboard cleanly.
  - No cross-tenant mapping.
  - Existing users unaffected.
  - Local stack healthy.
- **Suggested model/mode:** Sonnet · plan-then-verify (uses the `/run` + `/verify` skills).
- **Suggested commit:** n/a (validation only; file a follow-up if a fix is needed).

---

### Phase 1.5 — Basic CI gate

- **Goal:** Add a minimal GitHub Actions CI workflow before modifying critical write paths.
- **Why it matters:** The test suite is large and currently manually run. Before changing
  client-save validation, goal persistence, billing ledger logic, or tenant-sensitive paths, the
  repo needs automated test/lint/build gates on every PR.
- **Scope:**
  1. Add a minimal GitHub Actions workflow for: install · typecheck if available · tests · lint ·
     build or build verification.
  2. Use existing package scripts only; do not invent a new test strategy.
  3. Keep the first CI workflow boring and reliable.
  4. Document any slow or flaky command instead of hiding it.
  5. Do not start feature-folder migration here.
- **Explicit non-goals:**
  - No feature-folder migration.
  - No import-path refactor.
  - No branch protection setup unless separately approved.
  - No changes to app behavior.
- **Files/modules likely involved:** `.github/workflows/ci.yml` or equivalent (absent today);
  `package.json`; `package-lock.json` only if required by install/tooling reality.
- **Risks:** Low-medium. CI can fail because local-only assumptions were never encoded for GitHub
  runners. Treat failures as environment gaps, not reasons to weaken tests.
- **Acceptance criteria:**
  - CI file exists.
  - CI uses existing scripts.
  - CI runs tests / lint / build or documented closest equivalents.
  - No app code changed.
  - Local test / lint / build still pass.
- **Suggested model/mode:** Sonnet · Implement, then Verify.
- **Suggested commit:** `ci: add FitDesk test lint build workflow`

---

### Phase 2 — BookingSheet visual QA and commit

- **Goal:** Close the pending BookingSheet portal layout fix before touching deeper logic.
- **Why it matters:** A known pending visual diff should land narrowly and be verified so it does
  not entangle with the scheduling/billing changes in later phases.
- **Scope:**
  1. Inspect pending BookingSheet portal layout diff.
  2. QA desktop and mobile layout.
  3. Confirm no scheduling-engine behavior changed.
  4. Run tests / lint / build.
  5. Commit with a narrow conventional commit.
- **Explicit non-goals:** No scheduling-engine logic change; no booking-flow behavior change; no
  refactor of adjacent components.
- **Files/modules likely involved:** `components/scheduling/BookingSheet.tsx`,
  `components/scheduling/booking/*`; visual only. Do **not** touch `lib/scheduling/*` logic.
- **Risks:** Low-medium — portal/z-index layout can regress mobile. Verify both breakpoints.
- **Acceptance criteria:**
  - BookingSheet layout verified on desktop + mobile.
  - No scheduling logic regression.
  - Tests / lint / build pass.
  - Committed cleanly.
- **Suggested model/mode:** Sonnet · with the `verify` skill (run the app, screenshot both breakpoints).
- **Suggested commit:** `fix(scheduling): polish BookingSheet portal layout`

---

### Phase 3 — Server-side Goal System safety enforcement

- **Goal:** Close the highest-value Goal System safety gap **without** building the full program engine.
- **Why it matters:** `hasUnresolvedHardConflict` and `computeSafetyFlags` run in the UI only. A
  stale or crafted client payload can persist a hard-conflicting goal set (e.g. `underweight` +
  `fat-loss`), and rehab/postnatal selections never transition `safetyState`. The spec
  ([FITDESK_GOAL_SYSTEM.md](../product/FITDESK_GOAL_SYSTEM.md) §7, §10) mandates enforcement at the
  repository write path, not just the UI.
- **Scope:**
  1. Add **server-side hard-conflict rejection** in the client-save path.
  2. Add **save-time safety-flag derivation**.
  3. **Persist `safetyState`** on create and update (stop hardcoding `'clear'`).
  4. Add tests:
     - `underweight` + `fat-loss` hard conflict rejected server-side
     - `rehab` + pain note → `needs_review`
     - `postnatal` safety rule
     - stale / crafted payload rejected server-side (bypasses UI)
- **Explicit non-goals:**
  - Do **not** build the full program engine.
  - Do **not** create `TrainingActionAvailabilityService` yet.
  - Do **not** add new DB tables unless separately approved.
- **Files/modules likely involved:** `actions/clients.ts` (`addClient`, `editClient`);
  `lib/clients/repository.ts` (currently hardcodes `safetyState: 'clear'` at lines 359, 563);
  `lib/clients/create-draft.ts` (hardcodes `safetyFlags: []` at line 197). **Reuse existing**
  `lib/goals/conflicts.ts` (`hasUnresolvedHardConflict`, `detectConflicts`) and
  `lib/goals/safety.ts` (`computeSafetyFlags`, `deriveSafetyState`) — do not reimplement.
- **Risks:** Medium — sits on the client-create write path that creates an ERP Customer first.
  Reject **before** the ERP call so no orphan Customer is created for an invalid payload. Additive
  server-side validation, so blast radius stays small if guarded correctly.
- **Ordering requirement:** Server-side goal validation **must reject invalid payloads before ERP
  Customer creation**. This prevents invalid local goal payloads from causing orphan ERP Customers
  — the hard-conflict and safety checks run first, and `createClient()` is only called once the
  payload passes.
- **Acceptance criteria:**
  - Client-side and server-side rules match.
  - Hard conflicts cannot bypass the UI.
  - Rehab / postnatal safety state persists to `client_index` / `client_goal`.
  - Existing Add Client flow still works (1565 baseline stays green + new tests).
  - Invalid payloads are rejected **before** ERP Customer creation — no orphan Customers.
- **Suggested model/mode:** **Opus · plan-then-execute** (safety-critical write path).
- **Suggested commit:** `feat(goals): enforce hard-conflict + safety-state server-side at client save`

---

### Phase 4 — FD Session truth cleanup

- **Goal:** Remove user-visible session lies caused by dead PT Session code.
- **Why it matters:** The client detail page calls the dead `getSessions()` stub, so a client who
  trains weekly shows an empty session history even though live FD Sessions exist for them.
- **Scope:**
  1. Document the PT Session path as legacy / dead.
  2. Rewire the client detail session section to the **FD Session repository**.
  3. Keep all ERP I/O through the existing proxy path.
  4. Add / adjust tests for client session history.
  5. Do **not** delete the old PT stub until after verification.
- **Explicit non-goals:** No new direct ERP calls; no dashboard/session-flow behavior change; no
  deletion of the PT stub in this phase (isolate only).
- **Files/modules likely involved:** `app/dashboard/clients/[id]/page.tsx:61` (move off
  `getSessions` from `lib/business-data` / `lib/erpnext/client.ts`) onto
  `lib/scheduling/sessionRepository.ts` (`findSessionsInRange`); reuse the adapter pattern in
  `lib/dashboard/fdSessionAdapter.ts` (`fdSessionToSession`).
- **Risks:** Low-medium — read-path swap. Ensure client-scoped filtering and timezone handling
  match the dashboard's existing FD Session read.
- **Acceptance criteria:**
  - Client detail page shows real FD Sessions.
  - No direct ERP calls introduced (all via `erpFetch` / proxy).
  - Dashboard / session flow unchanged.
  - Dead PT Session path isolated for later removal.
- **Suggested model/mode:** Opus or Sonnet · plan-then-execute.
- **Suggested commit:** `fix(clients): show real FD Sessions on client detail page`

---

### Phase 5 — Client Management hardening

- **Goal:** Finish the read-model safety net.
- **Why it matters:** If a local `client_index` row drifts from ERP (including the documented
  "ERP created but local row failed" path in `addClient`), the only repair today is a manual
  backfill. And `nextSessionAtUtc` is always null, so the "No next session" badge cannot be honest.
- **Scope:**
  1. Add a **manual reconcile / repair utility** (or a documented script) **first**.
  2. Project `nextSessionAtUtc` from FD Sessions.
  3. Add / verify tenant-scoped repair tests.
  4. Add an expired-intent sweep **later** (not blocking).
- **Explicit non-goals:** No background worker for MVP; no scheduler/queue infra; no cross-tenant
  reads.
- **Split-brain reconcile strategy (explicit):**
  - Reconcile must be **tenant-scoped and idempotent**.
  - Use **upsert semantics** where possible — re-running reconcile must not create duplicate rows.
  - **ERPNext Customer remains authoritative** for ERP-backed customer identity; reconcile never
    overrides the ERP Customer, it only heals the local projection.
  - The reconcile utility must heal local `client_index` / related local read-model state
    **without overwriting** linked sessions, package ledgers, invoices, or unrelated local
    enrichment.
  - The reconcile utility must be **safe to re-run**.
  - The first implementation may be **manual / scripted**; no background worker required for MVP.
- **Files/modules likely involved:** new `lib/clients/reconcile.ts` (absent today) or a
  `scripts/` utility; `lib/clients/repository.ts` (nextSessionAtUtc written `null` at lines
  363, 567, 751); source of truth = `lib/scheduling/sessionRepository.ts`; existing
  `lib/clients/backfill.ts` as a pattern reference.
- **Risks:** Low-medium — repair logic must be strictly tenant-scoped (mandatory `tenantId` filter);
  reconcile must never cross tenants. Cover with an isolation test.
- **Acceptance criteria:**
  - Local client read model can be repaired.
  - "No next session" badge becomes truthful.
  - No cross-tenant leakage.
  - No background worker required for MVP.
  - Reconcile can be re-run without duplicating clients or events.
  - ERP-created / local-failed split-brain case has a documented recovery path.
  - Existing session / package / invoice references are preserved.
- **Suggested model/mode:** Opus · plan-then-execute (data-integrity + tenant isolation).
- **Suggested commit:** `feat(clients): add reconcile utility and project next-session date`

---

### Phase 6 — Billing and package hardening

- **Goal:** Protect money-adjacent flows before pilot.
- **Why it matters:** The package ledger reads balance then inserts in two statements (last-unit
  race can drive balance negative); there is no un-consume path for a mis-click; expired packages
  are never surfaced; and duplicate-override leaves no persistent audit note.
- **Scope:**
  1. Ledger **concurrency guard** (conditional insert / row lock / CHECK).
  2. Package **reversal / un-consume** event (compensating `+1`).
  3. Package **expiry sweep** or surfaced expired state.
  4. Package **override audit metadata**.
  5. **Pay Later payment QA on a test tenant only.**
- **High-sensitivity rule:** Pay Later QA creates **ERP Payment Entries** → requires **explicit
  approval** and **test-tenant isolation**.
- **Explicit non-goals:** No production-tenant writes; no change to the frozen C5/C6 happy paths
  beyond the hardening above; manual invoice creation stays hidden from normal trainer flows.
- **Ledger concurrency strategy (explicit):**
  - Prefer a **database-level atomic conditional mutation or insert strategy** over
    application-only locking (application-level locks do not hold across a stateless server-action
    invocation).
  - The critical invariant: **consumption cannot be recorded if the remaining package balance is
    zero.**
  - Add a **concurrent double-click / double-submit test** — do not rely only on UI button
    disabling; the guard must hold when two requests race at the data layer.
  - Keep ledger events **auditable and reversible**.
  - **Do not prescribe a final implementation up front.** `package_ledger` is event-sourced
    (`lib/billing/package-ledger-repository.ts`) with no `balance` column — balance is derived via
    `deriveBalanceByPurchase()`. Before implementing, **audit the schema** and choose the safest
    equivalent for this codebase:
    - a transactional conditional insert (insert only if derived balance > 0, inside one
      transaction),
    - a serialized transaction around read-then-insert,
    - a unique idempotency key that rejects a second concurrent consumption for the same
      package/session,
    - or a derived-balance guard re-checked inside the same DB transaction as the insert.
- **Files/modules likely involved:** `lib/billing/package-consumption-service.ts:86`
  (read-then-insert); `lib/billing/package-ledger-repository.ts`; `package_ledger` schema (metadata
  column would be a **schema change → approval-gated**); `app/dashboard/invoices/[id]/pay/`
  (Pay Later path); `lib/erpnext/client.ts` (`createAndSubmitPaymentEntry`, `markInvoicePaid`).
- **Risks:** High — money and ERP writes. Any `package_ledger` column addition is a schema change
  requiring approval. Pay Later QA mutates ERP.
- **Acceptance criteria:**
  - Package balance cannot go negative through race conditions.
  - Mistaken consumption can be reversed (audited).
  - Expired packages handled honestly (surfaced or swept).
  - Pay Later recovery path verified on a test tenant.
  - Two concurrent last-session consumption attempts result in exactly one success.
  - Balance never goes negative.
  - The failed attempt returns a structured, user-safe error.
- **Suggested model/mode:** **Opus · plan-then-execute · with explicit approval** before any ERP
  write or schema change.
- **Suggested commit:** `feat(billing): ledger concurrency guard + reversal + expiry handling`
  (Pay Later QA results recorded separately as a freeze-report doc).

---

### Phase 7 — Pay-per-session live ERP QA

- **Goal:** Verify the highest-risk ERP write path before real trainer use.
- **Why it matters:** The C7 PPS invoice-on-completion path is implemented but verified by mocks
  only. It writes **submitted Sales Invoices to ERPNext** on every PPS completion — it must be
  proven on a test tenant before any trainer relies on it.
- **Scope (only with explicit approval):**
  1. Test tenant only.
  2. Create a pay-per-session client.
  3. Book an FD Session.
  4. Complete the session.
  5. Confirm a Sales Invoice is created / submitted **once**.
  6. Confirm idempotent retry **reuses** the invoice.
  7. Document the Payment Entry gap as **C8**.
- **Explicit non-goals:** No production tenant touched; no Payment Entry creation in this phase
  (that is C8); no cancel / no-show / reschedule handling.
- **Files/modules likely involved:** `lib/scheduling/sessionCompletionService.ts` (PPS dispatch,
  `SessionRateNotConfiguredError`), `lib/erpnext/client.ts` (`findInvoiceBySession`,
  `createInvoice`, `submitSalesInvoice`), `lib/scheduling/sessionInvoiceBuilder.ts`.
- **Risks:** Highest ERP blast radius in this roadmap. Guardrail: verify the ERP target is the
  test tenant before any completion; watch for TOCTOU double-create (accepted MVP residual — note,
  do not "fix-forward" mid-QA).
- **Acceptance criteria:**
  - PPS live ERP invoice creation verified.
  - Retry does not duplicate the invoice.
  - No production tenant touched.
  - C8 payment-collection scope documented.
- **Suggested model/mode:** **Opus · with explicit approval · `verify` skill** (drive the real app
  against the test tenant).
- **Suggested commit:** `docs(billing): record C7 live PPS QA results and C8 scope`

---

### Phase 8 — Feature-folder migration

- **Goal:** Move from scattered `lib/`/`components/` domain code to the cleaner `features/`
  structure the handbook targets.
- **Why it matters:** `features/` is an empty scaffold (28 `.gitkeep` files + one real component)
  that the handbook's target architecture depends on. Basic CI already landed in Phase 1.5, so this
  migration proceeds under automated gates rather than manual-only verification.
- **Scope:**
  1. Promote the tenant-isolation test into CI as a merge gate (CI itself already exists from
     Phase 1.5 — this only strengthens the gate).
  2. Create a `features/` migration map.
  3. Move one feature at a time behind re-export shims.
  4. Avoid big-bang import rewrites.
- **Explicit non-goals:** No broad refactor without shims; no simultaneous multi-feature moves;
  no behavior change during migration; no initial CI setup (that is Phase 1.5, already done).
- **Files/modules likely involved:** `features/*` (currently `.gitkeep` +
  `features/clients/components/ClientWorkspaceOverlay.tsx`); shim re-exports from `lib/*` /
  `components/*`; `tsc --noEmit` per move; the CI workflow from Phase 1.5 (to add the
  tenant-isolation gate).
- **Risks:** Medium — import churn. Mitigate with re-export shims and a type-check after each move.
- **Acceptance criteria:**
  - `features/` migration has a committed map.
  - No broad refactor lands without shims.
  - Tenant-isolation test runs as a CI merge gate.
- **Suggested model/mode:** Sonnet · plan-then-execute (incremental, mechanical).
- **Suggested commit:** `refactor(features): begin shimmed feature migration`

---

### Phase 9 — Goal System 2.0 full product UX

- **Goal:** After safety enforcement and data truth are fixed, complete the premium goal experience.
- **Why it matters:** The post-save goal profile (spec §9) is ~20% built — the Client Hub shows a
  goal label chip and two static placeholders. Trainers cannot yet see urgency, metrics, timeline,
  or next actions.
- **Scope:**
  1. Client Hub goal summary cards.
  2. Urgency pills.
  3. Key-metrics dashboard.
  4. Suggested onboarding timeline.
  5. Next-action buttons: schedule first session · generate program · set benchmarks · send intake form.
  6. Program-mapping consumer **design** (not build).
- **Explicit non-goals:** No fake program generation; the mapping engine gets a runtime consumer
  **only when a real program engine exists**; no autonomous AI actions.
- **Files/modules likely involved:** `components/modules/ClientHubPanel.tsx` (goal cards,
  placeholders today); `lib/clients/hub.ts` / `hub-map.ts` (overview payload); reuse
  `lib/goals/*` for labels/urgency/mapping metadata.
- **Risks:** Medium — cognitive-load limits (spec caps primary metrics at 4); keep to design tokens
  (no hardcoded demo colors).
- **Acceptance criteria:**
  - Goals feel like a real client profile.
  - Saved urgency / safety is visible.
  - No fake program generation.
  - Mapping engine gains a runtime consumer only alongside a real program engine.
- **Suggested model/mode:** Opus or Sonnet · design-then-execute (`DesignSync` for UX alignment).
- **Suggested commit:** `feat(goals): client hub goal profile UX`

---

### Phase 10 — Platform / deployment hardening

- **Goal:** Production readiness, not product feature work.
- **Why it matters:** Deployment source hygiene (detached checkouts, nested service copies, backup
  handling) is the last gate before a clean Dokploy cutover.
- **Scope:**
  1. control-plane local checkout back to `main`.
  2. provisioning-agent and erp-execution-service attach to `main`.
  3. Sensitive backup decision: `.env.bak`, auth DB backups.
  4. Nested service-copy cleanup **after** a Dokploy build-context check.
  5. fitdesk-platform cutover plan.
  6. Quarantine final deletion **after** a review window.
- **Explicit non-goals:** No production server edits; no Docker volume deletion; no DB reset; no
  secret values printed.
- **Files/modules likely involved:** mostly **outside** the FitDesk repo — sibling service repos,
  `fitdesk-platform`, quarantine folders, Dokploy build contexts.
- **Risks:** High — production-adjacent. Every mutating step is read-only-first, one safe command at
  a time, approval-gated.
- **Acceptance criteria:**
  - Deployment source is clean.
  - No stale nested build-context risk.
  - Secrets / backups handled intentionally.
  - Rollback plan exists.
- **Suggested model/mode:** **Opus · with explicit approval** per action; read-only diagnostics first.
- **Suggested commit:** n/a (per-repo; each change committed in its own repo with a scoped message).

---

## 4. Cross-Cutting Guardrails

- ERPNext remains **canonical** for ERP-backed business data.
- **All ERP I/O** goes through the existing ERP client / Control Plane proxy — never bypass
  `erpFetch()`.
- **No ERP credentials** in FitDesk.
- Keep **manual invoice creation hidden** from normal trainer workflows.
- **Preserve** scheduling / billing hooks.
- Prefer **small, reversible** changes.
- **No direct production server edits.**
- **No Docker volume deletion or DB reset.**
- Billing, payment, ERP, auth, tenant isolation, provisioning, and production deployment require
  **explicit approval**.

---

## 5. High-Risk Approval Gates

| Gate | Phase | Why |
|---|---|---|
| Pay Later QA | 6 | Creates ERP Payment Entries |
| `package_ledger` schema change (audit metadata) | 6 | Database schema change |
| PPS live ERP QA | 7 | Writes submitted Sales Invoices to ERPNext |
| Platform / deployment + secret/backup handling | 10 | Production-adjacent, sibling repos |
| Any new DB table | any | Schema change (per workspace CLAUDE.md §4) |

For each gate: state what the command does, why it is needed, what it can affect, the rollback
plan, and the exact command — then wait for approval.

---

## 6. Recommended Immediate Next Step

**Start Phase 0 (Truth repair).** It is docs-only, zero code risk, and unblocks every later phase by
making the architecture handbook match reality (FD Session shipped, PT Session dead, Graphify +
tokens done, `features/` migration open, "0/9" removed). Then run Phase 1 validation, then
Phase 1.5 (basic CI) before any critical write-path change.

---

## 7. Remaining Phase Count

**12 phases remaining: Phase 0 through Phase 10, including Phase 1.5.**

- Docs / validation: Phases 0, 1
- Infrastructure (pulled forward): Phase 1.5
- Product / correctness: Phases 2, 3, 4, 5, 9
- Money / ERP-write (approval-gated): Phases 6, 7
- Infrastructure: Phases 8, 10
