# H5 — Trainer ownership / IDOR on session & invoice by-id mutations (PLAN ONLY)

> **Historical evidence / plan-only — not current execution authority.**
> This document's claim that FitDesk has no test harness is **stale**: the repo now
> has `npm test` / Vitest. US-025 (Tenant-Isolation Test Coverage) requires a
> current-`main` recheck of the findings below before any acceptance criteria are
> written. See [`docs/DOCUMENTATION_AUTHORITY_MAP.md`](../DOCUMENTATION_AUTHORITY_MAP.md)
> and [`docs/execution/SPRINT_1_STORY_TRACEABILITY_MAP.md`](../execution/SPRINT_1_STORY_TRACEABILITY_MAP.md).

**Status:** Plan only — **not implemented this run.** Reasons: (1) FitDesk has **no test harness** (`package.json` has no `test` script; no `*.test.ts` files), so the required "add tests for forged ids" cannot be met without first standing up a test runner + ERP mocking; (2) the clean fix changes the **ERP adapter** and the **financial completion flow** and is **auth/isolation-sensitive** (workspace `CLAUDE.md` §4 approval gate). This supersedes the earlier H5 note, which was written against the `wip/main-2026-04-25` line, not `origin/main`.

## Corrected finding (against current `origin/main`)
- ✅ **`actions/sessions.ts` `bookSession` (L83-95) is safe** — it server-derives the trainer: `createSession({ ...payload, trainer: resolved.trainerId })` via `resolveTrainerId()`.
- ⚠️ **`completeSession` (L100-113)** — checks only that the caller is *authenticated*, then calls `markSessionComplete(sessionId, notes)` with the **client-supplied `sessionId`** and **no trainer-ownership check**.
- ⚠️ **`cancelSession` (L118-128)** — same: authenticated-only, then `cancelSession(sessionId)` (`lib/erpnext/client.ts:416`) by id, no ownership check.
- The ERP adapter (`lib/erpnext/client.ts`: `markSessionComplete` L401, `cancelSession` L416, `createSession` L389) does **not** scope session reads/mutations by trainer.
- **To verify:** `actions/invoices.ts` by-id reads/mutations (`getInvoiceById`) for the same pattern.

## Severity
Intra-tenant IDOR. **Cross-tenant is blocked** (each tenant has its own ERPNext site; the FitDesk→ERP connection is per-tenant). **Latent** today under the single-trainer-per-tenant assumption (`CLAUDE.md`: each user maps to exactly one Trainer); **High** the moment a tenant has multiple trainers — any authenticated trainer could complete/cancel another trainer's session by docname.

## Implementation plan
1. **Prerequisite — add a test harness** (currently none): Vitest (or Node test) with the ERPNext client mocked. This is its own setup task.
2. **Enforce ownership** on `completeSession` / `cancelSession` (and any reschedule + invoice-by-id mutations). Preferred (ERP = source of truth): thread the resolved `trainerId` into the ERP adapter calls and **scope the ERPNext query by `custom_trainer`**, so a non-owned docname returns not-found. Alternative: fetch the session by id, assert `session.trainer === resolveTrainerId()` before mutating (needs a `getSessionById` exposing the trainer field).
3. **Preserve financial hooks** — completion must still update session count/history and any invoice/payment side-effects.
4. **Apply the same scoping to invoices** (`getInvoiceById` and by-id invoice mutations) once a `custom_trainer_id` filter is available.
5. **Tests** (after harness): mock ERP client; completing/cancelling a session owned by another trainer → denied/not-found; owned → succeeds; forged `sessionId`/`clientId` rejected.

## Notes
- This is an **authorization/isolation change** (approval-sensitive); land as a reviewed FitDesk PR that includes the new test harness.
- Until fixed, **confirm and document the single-trainer-per-tenant invariant** as the current mitigation, and avoid exposing multi-trainer tenants.
