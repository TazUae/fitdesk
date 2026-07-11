# Phase 1+ Safe Run — Master Execution Note

> **Type:** Execution plan + read-only audit (tier-4 execution artifact).
> **Date:** 2026-07-11 · **Base:** `main` @ `7005418` (Phase 0 merged, PR #31).
> **Branch:** `hardening/phase-1-plus-safe-run` (local; nothing committed/pushed).
> **Discipline:** FitDesk Safe Autonomy + Execution Playbook — audit-first, one story→one US-ID,
> approval gates honored, NOW/NEXT/LATER ≠ build status, do not rebuild already-built flows.
> **Governs:** the approved Production-Hardening Push
> (`.claude/plans/…crystalline-valiant.md`, memory `[[fitdesk_production_hardening_plan]]`).

This note records the read-only audit of Phases 1–6 against the **current** codebase and defines
the safe execution order. Several phases are **further built than the source backlog assumes** —
those deltas are called out so we do not rebuild working code.

---

## 0. Run outcome (TL;DR)

This is a **plan-and-audit run**. After a full audit, there is **no runtime code or test change
that is simultaneously safe (no approval gate), non-speculative, and genuinely additive** — because
every non-gated surface in scope is already built and well-tested, and everything else is behind an
approval gate or depends on gated upstream work.

- **Phase 1** (US-017/039/049) — financial-impact design **APPROVED** (see §Phase 1 "Approved
  financial-impact design"). Implementation itself still requires session status + financial
  mutation code that does not exist yet — build on a dedicated branch per the sequencing there.
- **Phase 2** (US-059 consent) — **STOP gate**: schema migration + WhatsApp-consent enforcement.
- **Phase 3** (US-050/046/038/047) — blocked behind P1 (needs real outcomes) and P2 (consent); also
  touches runtime attention UI (`ActionCenter` render branches). Plan only. US-046 risk scoring is
  explicitly **not** part of Phase 1 — see §Phase 1 "Attendance and retention."
- **Phase 4** (US-048 send) — **STOP gate**: real WhatsApp send path.
- **Phase 5** (US-053/052) — new local read-model feature code → not in the "without stopping" set.
- **Phase 6** (US-043/058) — **already delivered and tested**; only the form's fallback UI is
  untested, and that needs jsdom (a **dependency add = STOP gate**). No safe test gap worth filling.

**Recommended next decision:** with the Phase 1 financial-impact design now approved, begin
implementation on a fresh `hardening/phase-1-session-outcomes` branch per the sequencing in §Phase 1.

---

## 1. Audit deltas — what is already built (do NOT rebuild)

| Area | Backlog/audit assumption | Actual state on `main` @ 7005418 |
|---|---|---|
| Attention engine (Phase 3 base) | "Needs Attention is invoice-only" | `lib/dashboard/derive.ts` already has `getAttentionItems` (invoices) **plus** `getUnresolvedSessions`/`getUnresolvedSessionAttentionItems` (US-057/003), `getMissingNextSessionAttentionItems` (US-003), `combineAttentionItems` (US-027), `getSessionsThisWeek` (US-045) — all pure + tested. |
| AI Quick Add (US-043) | "Not built" (doc pack) | Fully built + hardened: `lib/clients/ai-parse.ts` (server-only, 3s abort→`timeout`, no-key→`failed` no-call, zod-validated, never throws, goal-filter, phone-normalize) and **fully tested** (`ai-parse.test.ts`, `clients.test.ts:882` for the `parseClientDetails` action). Form fallback wired in `AddClientForm.tsx:453`. |
| Add Client capture (US-058) | "Not built" | Confirmed-first create is built + tested: `addClient` returns success only after ERP+local both succeed; ERP-failure → no local rows; ERP-ok/local-fail → recoverable error, ERP Customer untouched (`clients.test.ts:226-259`). Clear pending state + form-preserved-on-error in the UI. |
| `client_action_intent` (Phase 3 sink) | — | Table exists with `reason`/`status`/`priority`/`source`/`due_at_utc` + tenant-scoped complete/dismiss (`lib/db/schema.ts:197`, tested in `repository.test.ts`/`hub.test.ts`). Reuse as the signal sink. |
| `client_event` (Phase 5 notes / P2 consent audit) | — | Append-only audit table exists (`lib/db/schema.ts:219`). Reuse for notes timeline (US-053) and consent-change audit (US-059). |
| Session statuses | — | `FDSessionStatus` already includes `cancelled`/`no_show`/`skipped` (`types/scheduling.ts:81`) and the completion sheet renders labels for them — but **no write path sets them** (see §Phase 1). |

**Confirmed gaps (still true):** no consent field anywhere in `lib/db/schema.ts`; `message_log` has no
`reason` column (`lib/db/schema.ts:94`); no timezone-aware reminder-timing helper.

---

## 2. Gate map

| Phase | Stories | Gate class | May start now? |
|---|---|---|---|
| 1 | US-017, US-039, US-049 | Session status + **financial** mutation | ✅ financial design approved — implement per §Phase 1 |
| 2 | US-059, message_log.reason, tz helper | **Schema migration + WhatsApp consent** | ❌ approve schema + gate design |
| 3 | US-050, US-046, US-038, US-047 | New attention rules + `ActionCenter` UI; US-050 needs bulk balance read; depends on P1/P2 data | ❌ after P1/P2 |
| 4 | US-048 | **Real WhatsApp send** | ❌ approve send behavior |
| 5 | US-053, US-052 | New local read-model feature code | ❌ approve as feature work |
| 6 | US-043, US-058 | Already done; UI test needs jsdom (**dependency add**) | ⚠️ nothing safe to add |

---

## Phase 1 — Session Outcome Truth  ✅ FINANCIAL DESIGN APPROVED

### Current state (audited)
- `lib/scheduling/sessionCompletionService.ts` implements **only** `completeSession()`;
  `MUTABLE_STATUSES = ['scheduled','confirmed']` → `'completed'` only. No `no_show`/`cancelled`/
  reschedule transition exists.
- Completion billing dispatch already handles: **trial** (status flip), **package** (ledger-first
  `consumeForSession`), **pay-per-session** (idempotent invoice create+submit then flip). Deps are
  injected — the natural extension point.
- `components/scheduling/SessionCompletionSheet.tsx` offers **only** "Complete session". Status
  labels for cancelled/no_show/skipped are display-only. `actions/schedulingActions.ts` deliberately
  does **not** export `cancelSessionAction`/`markNoShowAction` (asserted by test).
- Legacy `actions/sessions.ts` no-show/cancel stubs were **deleted in Phase 0** — the FD Session path
  is the only path forward.

### What US-017 / US-039 / US-049 need
- **US-017 No-Show:** new `markNoShow()` transition (`scheduled|confirmed` → `no_show`) with a
  billing-mode-specific trainer choice (see "Approved financial-impact design" below — PPS offers
  charge/waive only; package offers deduct/waive); audit row; no silent mutation.
- **US-039 Cancel/Reschedule:** `cancelSession()` (→ `cancelled`, keep history, capture reason) and
  `rescheduleSession()` (preserve billing/invoice/package context, no financial side effect).
- **US-049 Attendance:** pure `deriveAttendanceSummary(sessions)` counting completed/no_show/
  cancelled/rescheduled, tenant-scoped, surfaced in Client Hub. Consumes US-017/039 output — build
  **after** them (avoid an orphan consumer with no data). Approved to count these four outcomes now
  (see "Attendance and retention" below); no risk scoring in this phase.

### ✅ Approved financial-impact design (product-owner decision, 2026-07-11)

This replaces the prior "proposed design, not implemented" table and its open sub-questions — all
three were resolved by the product owner. This is now the binding design for implementation.

**1. Pay-per-session no-show:**
- **"Charge"** = create/submit the PPS invoice through the existing approved invoice path (reuse the
  same idempotent create+submit flow `completeSession()` uses for PPS completion).
- **There is no separate "deduct" option for PPS** — PPS has no balance to deduct from. The PPS
  no-show choice is **charge / waive only**.
- **"Waive"** = status → `no_show`, no invoice.

**2. Package no-show:**
- **"Deduct"** = consume 1 package session through the existing package consumption/idempotency path
  (reuse `consumeForSession`, ledger-first ordering preserved).
- **"Waive"** = status → `no_show`, no package consumption.
- **Do not create any package invoice during no-show handling** (packages are pre-paid; consumption,
  not invoicing, is the financial effect).

**3. Cancelled PPS session with an existing invoice:**
- MVP only **surfaces** the existing invoice/payment state clearly to the trainer — it does not
  change it.
- **Do not auto-void, auto-credit, auto-refund, or silently mutate payment state.**
- Any void/refund/credit workflow is separate, **future, approval-gated payment work** — out of scope
  for Phase 1.

**4. Reschedule:**
- MVP reschedule **has no financial side effect by itself.**
- Preserve audit/context (who, when, from/to).
- **Do not duplicate billing or package consumption** — a reschedule moves the same session; it is
  not a new completion event.

**5. Attendance and retention:**
- Record no-show now as a **real, auditable outcome** (not a placeholder).
- **US-049 may count completed / no_show / cancelled / rescheduled outcomes now.**
- **US-046 cancellation/no-show risk scoring derives from these outcomes later, in Phase 3** — Phase 1
  produces the auditable outcome data; it does not build the scoring itself.
- **Do not build risk scoring inside Phase 1.**

**Resulting outcome table:**

| Outcome | Pay-per-session | Package | Trial |
|---|---|---|---|
| **No-show → charge** (PPS only) | Issue the PPS invoice exactly as a completion would (reuse the existing idempotent invoice path) | n/a — package uses deduct/waive, not charge | No charge |
| **No-show → deduct** (package only) | n/a — PPS uses charge/waive, not deduct | Consume 1 unit via `consumeForSession`, **no invoice** | No charge |
| **No-show → waive** | Status→`no_show`, **no** invoice | Status→`no_show`, **no** consumption | No charge |
| **Cancel** (US-039) | Status→`cancelled`, **no** invoice; if an invoice already exists, **surface it as-is** — no auto-void/credit/refund | Status→`cancelled`, **no** consumption | No charge |
| **Reschedule** | Move time, keep `scheduled`, no financial effect, no duplicate billing | same | same |

**Guardrails to preserve (from the completion service):** optimistic-concurrency version check,
terminal-state guard, ledger-first ordering for package, invoice-first idempotency for PPS, and
"never fake success." Every outcome writes a `client_event` audit row.

**Implementation sequencing:** implement on a fresh `hardening/phase-1-session-outcomes` branch, one
US-ID per change set, each with unit tests (financial-impact + audit assertions) + tenant-isolation
tests + `story-gate.mjs`. **No real ERP writes** outside an approved test tenant (reuse the
`[[phase_7b_pps_live_qa_pass]]` local-stack workflow).

---

## Phase 2 — Consent Foundation  ⚠ APPROVAL REQUIRED (schema + WhatsApp)

- **US-059:** add `whatsapp_consent_state` to `client_index` (`lib/db/schema.ts:134`), default
  `'unknown'`, values `unknown|opt_in_requested|opted_in|opted_out`; backfill existing rows to
  `'unknown'`. Audit every change via `client_event`. One enforcement guard `canSendReminder(state)`
  (opted_in required; unknown → offer opt-in; opted_out → excluded, no override) that **every** later
  WhatsApp entry point calls.
- **Shared infra:** add `reason` to `message_log` (`:94`); add a pure timezone helper for
  "is it the right local time to prompt" (reuse `luxon`, already a dependency; and the tz-safe
  date-string pattern in `derive.ts`). **No new scheduler.**
- **Gate:** schema migration **and** WhatsApp behavior — stop for approval on the migration + guard
  design before coding. Verify: migration test, consent state-machine unit tests, tenant isolation on
  consent read/write, `story-gate.mjs`.

---

## Phase 3 — Retention Signals (deterministic, no sends)

Build each as a rule over already-available data → `client_action_intent` row → surfaced via
`combineAttentionItems`, with a matching `ActionCenter.tsx` render branch (required — it falls through
to overdue-invoice styling for unknown types).

- **US-050 Renewal:** low-package-balance detection. Needs a **tenant-wide** balance query
  (`lib/billing/package-ledger-repository.ts` has per-purchase/per-client derivation today — extend to
  bulk, read-only) + a product-set "low" threshold (capture it). Consent-gated follow-up, **no
  auto-charge**.
- **US-046 Cancellation Risk:** thresholds over Phase 1 no-show/cancel outcomes → **needs P1 first**
  (explicitly deferred to this phase per the approved Phase 1 decision — Phase 1 records the
  auditable outcomes only, it does not score risk).
- **US-038 Client Pulse:** deterministic risk reason + follow-up link; rules before scoring.
- **US-047 Follow-Up Suggestions:** rule-triggered intents (reuse `client_action_intent`); least
  blocked of the group (infra exists) but still writes a new signal type + UI branch.
- **Gate:** low-risk individually, but new attention types touch `ActionCenter` runtime UI and US-050
  adds a billing-layer read query → treat as approved feature work, after P1/P2. New `.tsx` render
  branches are now unit-testable (Phase 0 enabled the oxc JSX transform).

---

## Phase 4 — WhatsApp Reminder Delivery (US-048)  ⚠ APPROVAL REQUIRED (send)

Consent-gated (P2 guard), reason-tagged (`message_log.reason`), tz-timed prompt (P2 helper),
trainer-approved send through the existing `actions/messages.ts` → `lib/evolution.ts` path. **No
background auto-send** (locked). Keep `PILOT_MODE` gating. Verify consent-blocked states never reach
the send call. No real sends in test (already mocked in `actions/messages.test.ts`).

---

## Phase 5 — Client Workflow Depth (US-053, US-052)

- **US-053 Notes:** fast note entry → append to existing `client_event` timeline; tenant-scoped.
- **US-052 Progress:** simple progress entries, optionally goal-linked (`client_goal`), shown in Hub.
- No hard-rule gate (no payment/WhatsApp/session/schema — `client_event` already exists), **but** it
  is new runtime feature code, so it is out of this run's "without stopping" set → plan, then approve
  as feature work. Parallelizable with P3/P4.

---

## Phase 6 — Capture Hardening (US-043, US-058)  — already delivered

- **US-043:** parse layer + action wrapper fully built and tested (see §1). Form fallback on
  failure/timeout is correct (`AddClientForm.tsx:459` → toast + no field mutation + manual form
  intact). Acceptance criteria met.
- **US-058:** confirmed-first create, clear pending state, form-preserved-on-error, no billing before
  ERP Customer — all present and backend-tested.
- **Only** untested surface: the form component's fallback/pending UI. Testing it needs jsdom
  (**dependency add = STOP gate**) or brittle source-string assertions (low value). **No safe,
  worthwhile change** — recommend a jsdom-based component-test decision as separate approved work if
  UI-level coverage is desired.

---

## Safe work completed this run

- Read-only audit of all six phases (files cited above).
- This master execution note (docs-only).
- **No** runtime code, schema, test, or config change — by design, per the gate map.

## Verification run

- Preflight: clean `main` @ `7005418`, Phase 0 artifacts confirmed present.
- No code changed → no `story-gate.mjs` needed for this doc; the last green gate was Phase 0
  (70 files / 1933 tests, build:verify + lint PASS).

## Recommended next user decision

The **Phase 1 financial-impact design is approved** (§Phase 1). Next: begin implementation on a fresh
`hardening/phase-1-session-outcomes` branch, one US-ID per change set (US-017, then US-039, then
US-049), per the sequencing in §Phase 1. Phase 2's schema/consent approval can be requested in
parallel since it's independent of Phase 1.

## Branch status

`hardening/phase-1-plus-safe-run` holds only this planning doc (uncommitted). **Not PR-ready** — it is
a planning artifact, not an implementation. Suggested commit (only if you want it tracked):
`docs(execution): Phase 1+ safe-run audit & execution plan`.
