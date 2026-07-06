# FitDesk Remediation Sequence — Closeout Report

- **Date:** 2026-07-06
- **Author:** Claude Code (docs-only)
- **Scope:** Closes the full remediation sequence tracked in [`docs/plans/FITDESK_REMAINING_ROADMAP_V2.md`](../plans/FITDESK_REMAINING_ROADMAP_V2.md) (Phase 0 → Phase 10, including Phase 1.5)
- **HEAD at closeout:** `15b2610` — `docs(onboarding): record Phase 1C current-user validation and close zero-row gap`

---

## 1. Executive Verdict

**The FitDesk remediation sequence is closed.** All 12 planned phases (0 through 10, including 1.5) have been executed, verified, and landed on `main`. The application is in an **MVP / pilot-safe state**: ERP writes remain gated by explicit trainer action and test-tenant discipline (not by a flag), the highest-risk live-ERP path (pay-per-session invoicing) has been validated against a real ERPNext tenant, the goal-safety gap identified in the original audit is closed server-side, and deployment/CI hardening is in place. `main` is synced with `origin/main` and CI is green through the current HEAD.

One caveat remains open by design, not by omission: **true zero-row onboarding validation is blocked** on missing test data (see §5). It does not block pilot use by existing or newly-provisioned trainers — it blocks only a specific *validation* step for a scenario that cannot currently be reproduced safely.

---

## 2. Completed Phase Table

| Phase | Goal | Status | Key evidence |
|---|---|---|---|
| **0** | Truth repair — reconcile architecture docs with shipped code | ✅ Closed | Architecture handbook updated; FD Session confirmed shipped, PT Session confirmed dead/stub |
| **1** | Re-open FitDesk safely — validate app state before behavior changes | ✅ Closed (with caveat) | Local stack healthy; current-user onboarding paths validated (Phase 1C) |
| **1B** | Onboarding validation precondition audit | ✅ Closed — documented blocker | [`PHASE_1B_ONBOARDING_VALIDATION_BLOCKER.md`](PHASE_1B_ONBOARDING_VALIDATION_BLOCKER.md) — 0/6 users have zero-row state |
| **1C** | Current-user onboarding behavior validation | ✅ PASS | [`PHASE_1C_ONBOARDING_CURRENT_USER_VALIDATION.md`](PHASE_1C_ONBOARDING_CURRENT_USER_VALIDATION.md) — completed/failed user routing verified by code trace + live DB state |
| **1.5** | Basic CI gate (test/lint/build) | ✅ Closed | `.github/workflows/ci.yml` established before write-path phases began |
| **2** | BookingSheet mobile portal/layout fix | ✅ Closed | [`PHASE_2_BOOKINGSHEET_VISUAL_QA_CLOSEOUT.md`](PHASE_2_BOOKINGSHEET_VISUAL_QA_CLOSEOUT.md) |
| **3** | Server-side goal safety enforcement (hard-conflict + safetyState) | ✅ Closed | Hard-conflict rejection and safety-state persistence added to `actions/clients.ts` / `lib/clients/repository.ts`, ahead of ERP Customer creation |
| **4** | FD Session truth on client detail page | ✅ Closed | Client detail page reads real `FD Session` data via `sessionRepository`, replacing the dead PT Session stub |
| **5** | `nextSessionAtUtc` foundation + reconcile | ✅ Closed | Dry-run reconcile utility and next-session projection landed, tenant-scoped and idempotent |
| **6** | Package ledger hardening | ✅ Closed | [`PHASE_6D_SESSION_COMPLETION_PATH_AUDIT.md`](PHASE_6D_SESSION_COMPLETION_PATH_AUDIT.md), [`PHASE_6E_BILLING_FAILURE_RECONCILE_CLOSEOUT.md`](PHASE_6E_BILLING_FAILURE_RECONCILE_CLOSEOUT.md) — concurrency guard, reversal path, audited |
| **7B** | Live ERP QA — PPS invoice-on-completion | ✅ **PASS** | [`PHASE_7B_PPS_LIVE_ERP_QA_REPORT.md`](PHASE_7B_PPS_LIVE_ERP_QA_REPORT.md) — one submitted, unpaid Sales Invoice (`ACC-SINV-2026-00003`), zero Payment Entries |
| **8** | Feature-folder safe-leaf migration | ✅ Closed | [`PHASE_8_CLOSEOUT.md`](../architecture/PHASE_8_CLOSEOUT.md) — safe leaves migrated behind shims; orchestrators/business-rule UI explicitly deferred |
| **9** | Goal System UX MVP (progressive disclosure) | ✅ Closed | [`PHASE_9_GOAL_UX_DEFAULT_DECISION.md`](../product/PHASE_9_GOAL_UX_DEFAULT_DECISION.md); `GoalAccordion` confirmed/kept as production default with Smart Accordion progressive disclosure |
| **10** | Deployment / payment safety hardening | ✅ Closed | [`PAYMENT_SAFETY_GATES.md`](../architecture/PAYMENT_SAFETY_GATES.md) — 10A audit, 10B env docs + Docker CI gate, 10C payment safety audit, 10D architecture decision record |

---

## 3. Key Production-Safety Confirmations

1. **ERP I/O still goes exclusively through the Control Plane proxy.** All ERP reads/writes use `erpFetch()` / the tenant-JWT proxy path (`lib/erpnext/client.ts`). No direct ERP database or credential access was introduced anywhere in this sequence.
2. **No direct ERP credentials exist in FitDesk.** Confirmed unchanged across Phases 0–10; FitDesk holds no ERP username/password/API secret — auth to ERPNext is brokered entirely by the Control Plane.
3. **PPS live QA passed with a real, submitted, unpaid invoice and zero Payment Entries.** Phase 7B produced exactly one submitted (docstatus 1) Sales Invoice (`ACC-SINV-2026-00003`, grand_total 20, outstanding 20 — unpaid) with **zero** Payment Entries and **no** Whish/external link, on a confirmed non-production test tenant, via a single authenticated-operator UI completion (not agent-driven).
4. **Whish / external payments are not live.** Confirmed in the Phase 10C/10D payment safety audit: `generatePaymentLink()` in `lib/whish.ts` is mock-only (the real API call is a commented-out sketch, never executed); `isExternalPaymentsAllowed()` has zero callers and is dormant by design until a real integration lands, at which point it must be wired fail-closed.
5. **`GoalAccordion` is the confirmed production default Goal UX.** `AddClientGoalWorkspace` remains experimental and flag-gated (`NEXT_PUBLIC_GOAL_WORKSPACE`), unpromoted pending component tests, mobile/375px QA, and explicit product-owner sign-off. Phase 9 added section-level progressive disclosure (Core always expanded; Specialist/Emerging collapsible) without changing this default.
6. **Phase 8 feature-folder migration is closed and cleaned.** Every safe UI leaf (onboarding, messaging, dashboard, scheduling, client, and shared-atom components) was moved into `features/*` or `components/ui/` behind re-export shims, verified with zero import leaks. Orchestrators, business-rule UI, and the scheduling/booking integration boundary were explicitly and intentionally deferred to their own future phases — not silently left incomplete.

---

## 4. Remaining Caveat

**True zero-row onboarding validation remains BLOCKED.** All 6 users currently in the local environment have exactly one `WorkspaceProvisioning` row each (5 `completed`, 1 `failed`) — **0 users have zero rows**. The `WorkspaceSetupForm` / Start Workspace path exists and was traced as correct in code (Phase 1C), but there is currently no reset/new user in this environment to exercise it end-to-end. This is a **missing test-data precondition**, not a code defect, and it does not block current-user onboarding (validated PASS in Phase 1C) or normal trainer use.

Unblocking requires one of:
- **Option A:** Product owner provides the exact intended reset-user emails/environment.
- **Option B:** Explicit, backup-first reset approval for named users (exact `userId`s confirmed in advance, scoped only to their `WorkspaceProvisioning` rows).

---

## 5. Do-Not-Do-Next List

- **Do not start C8 (payment collection / Payment Entry creation on PPS invoices) without explicit approval.** This was intentionally scoped out of Phase 7B and remains a separate, approval-gated task.
- **Do not delete or reset any `WorkspaceProvisioning` rows without backup-first, named-user approval.** Zero-row onboarding validation cannot proceed on unconfirmed accounts (see §4, Option B).
- **Do not touch the real Whish integration without wiring `isExternalPaymentsAllowed()` fail-closed first.** Per `PAYMENT_SAFETY_GATES.md`, replacing the mock `generateLink()` block with a real API call must check the gate before the real call is made — not after, not optionally.

---

## 6. Recommended Next Roadmap Choices

1. **Product demo / visual QA** — walk the shipped Phase 2 (BookingSheet) and Phase 9 (Goal Accordion progressive disclosure) UX live, on both desktop and mobile breakpoints, ahead of any pilot trainer exposure.
2. **Optional zero-row onboarding reset plan** — if pilot onboarding of genuinely new trainers is imminent, resolve the §4 caveat via Option A or B before relying on that path untested.
3. **Future C8 — payment collection, approval-gated** — design and execute Payment Entry / mark-paid handling for PPS invoices as its own scoped, explicitly-approved phase.
4. **Production-hardening later items** — the P1/P2 items already logged in `PAYMENT_SAFETY_GATES.md` (persistent payment audit table, `markInvoicePaid()` dead-code decision, PPS concurrency/idempotency hardening) and in `PHASE_8_CLOSEOUT.md` (dead-code cleanup, goals/billing/scheduling UI migration phases) remain valid future work, none of which blocks pilot use today.

---

## 7. Final Disposition

The FitDesk remediation sequence (Phases 0–10) is **closed**. The codebase is in an MVP/pilot-safe state with ERP write paths validated live, goal-safety enforcement server-side, deployment/CI hardening in place, and architecture documentation reconciled with shipped reality. The one open item — zero-row onboarding validation — is explicitly tracked as a data-precondition gap, not a defect, and has a documented path to resolution (§4) whenever the product owner is ready to act on it. No further phase work is required to consider the pilot-readiness goal of this sequence met.
