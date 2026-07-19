# Phase 1C — Onboarding Current-User Behavior Validation

- **Date:** 2026-07-06
- **Phase:** FitDesk Remaining Roadmap v2.1 — Phase 1 (Re-open FitDesk safely) / Phase 1C
- **Author:** Claude Code (docs-only)
- **Related:** [`docs/audits/PHASE_1B_ONBOARDING_VALIDATION_BLOCKER.md`](PHASE_1B_ONBOARDING_VALIDATION_BLOCKER.md), [`docs/plans/FITDESK_REMAINING_ROADMAP_V2.md`](../archive/plans/2026-07-18-consolidation-20260718-170652/FITDESK_REMAINING_ROADMAP_V2.md)

---

## Status

- **Current-user onboarding behavior validation: PASS.**
- **True zero-row onboarding validation: BLOCKED** (missing test-data precondition — unchanged from Phase 1B).

---

## Phase 1B blocker context

Phase 1 (per the roadmap) requires validating **six reset test users** — accounts with **zero** `WorkspaceProvisioning` rows — through login → `/onboarding` → `WorkspaceSetupForm` → Start Workspace, to confirm the D4/D6 fix (new/reset users see the setup form, not a stuck spinner).

[`PHASE_1B_ONBOARDING_VALIDATION_BLOCKER.md`](PHASE_1B_ONBOARDING_VALIDATION_BLOCKER.md) (2026-07-04) found this precondition does not hold in the live local stack: all 6 existing users already have exactly one `WorkspaceProvisioning` row each (5 `completed`, 1 `failed`). Zero users have zero rows. Resetting any of them without a confirmed identity match to the intended six would be a destructive, hard-to-reverse action on unconfirmed accounts — explicitly declined without approval.

Phase 1C proceeds under **Option C** from that blocker doc: validate onboarding behavior against the current, existing users only (completed re-entry, failed retry/recovery), and leave the zero-row scenario formally unresolved.

---

## Current WorkspaceProvisioning state (reconfirmed, read-only)

| Metric | Value |
|---|---|
| Total users | 6 |
| Completed rows | 5 |
| Failed rows | 1 |
| Zero-row users | **0** |

This is unchanged from the 2026-07-04 blocker snapshot — no rows were created, deleted, or modified between Phase 1B and Phase 1C.

---

## Code trace (read-only)

**[`middleware.ts`](../../middleware.ts)** — protects `/dashboard/:path*`:
- No session → redirect to `/auth/login`.
- Session present, provisioning `status !== 'completed'` → redirect to `/onboarding`.
- Session present, `status === 'completed'` → request proceeds (`NextResponse.next()`).
- Any internal-API failure while checking status → conservatively redirects to `/onboarding` (never silently grants dashboard access).

**[`app/api/provisioning/status/route.ts`](../../app/api/provisioning/status/route.ts)** — returns the latest `WorkspaceProvisioning.status` for the authenticated session user (`null` if no row exists), backing the middleware check above.

**[`app/onboarding/page.tsx`](../../app/onboarding/page.tsx)** — the D3/D4/D6 fix:
- `status === 'completed'` → server-side `redirect('/dashboard')` (closes D3 — completed users are never shown the setup form or left on a stuck spinner).
- **No row at all** → renders `WorkspaceSetupForm` (closes D4/D6 — this is the only branch that can trigger Start Workspace, and it requires the total absence of a provisioning row).
- Any other status (`failed`, queued/running, or unknown) → renders `ProvisioningStatus`, never the setup form.

**[`features/onboarding/components/provisioning-status.tsx`](../../features/onboarding/components/provisioning-status.tsx)**:
- `status === 'failed'` → shows a "Provisioning failed" card with the failure reason and a **"Retry"** button.
- Retry only calls `POST /api/workspace/retry` on **explicit button click** — nothing fires automatically on page load, mount, or poll.
- Non-failed, non-completed statuses show a polling spinner UI; on reaching `completed` client-side, it calls `router.replace('/dashboard')`.

---

## Completed-user behavior verdict

**PASS.** Middleware allows completed users straight through to `/dashboard`. If a completed user navigates to `/onboarding` directly, the page server-redirects them back to `/dashboard` — they never see the setup form. The `WorkspaceSetupForm` branch requires `!latestProvisioning` (no row at all), which is false for every completed user, so **no Start Workspace flow can trigger** for a completed row regardless of how the page is reached.

## Failed-user behavior verdict

**PASS.** The one failed user (`qa.trainer.july02@example.com`, tenant `qa-trainer-july-02-studio`) is redirected by middleware from `/dashboard` to `/onboarding` (status `failed` ≠ `completed`). On `/onboarding`, the page's zero-row branch is skipped (a row exists), so the failed user sees the `ProvisioningStatus` retry/recovery card with the failure reason and an explicit Retry button — not the `WorkspaceSetupForm`. The failed row is therefore **not silently treated as completed** (blocked from `/dashboard`) and **not silently treated as zero-row** (shown recovery UI, not the setup form). Viewing this page is safe: no retry fires without an explicit click.

## Zero-row validation verdict

**BLOCKED — unchanged.** 0 of 6 users have zero `WorkspaceProvisioning` rows. The `WorkspaceSetupForm` / Start Workspace path exists and is reachable only for such users, but no such user currently exists in this environment to exercise it against. This cannot be validated honestly without one of the remaining options below.

---

## Explicit confirmation

- **No `WorkspaceProvisioning` rows were changed** in Phase 1B or Phase 1C.
- **No workspaces were created.**
- **No Start Workspace action was triggered.**
- All findings in this report come from static code tracing and read-only database inspection — no runtime code was edited, no destructive commands were run, and no live provisioning state was altered.

---

## Remaining options

- **A.** Product owner provides the exact intended six reset-user emails (and confirms which environment they live in), so they can be located and validated correctly.
- **B.** Explicit backup-first reset approval for named users — exact `userId`s confirmed in advance, scoped to deleting only their `WorkspaceProvisioning` rows, then re-run zero-row validation against them.
- **C.** Current-user validation is now closed as **PASS** (this report).
- **D.** Leave true zero-row validation **BLOCKED** until A or B is resolved.

---

## Final disposition

- **Current-user behavior validation: CLOSED as PASS.** Completed-user re-entry and failed-user retry/recovery both match the intended D3/D4/D6 fix, verified by code trace and live provisioning state.
- **True zero-row onboarding validation: remains BLOCKED** due to a missing test-data precondition (no zero-row users exist), not a code defect. Unblocking requires product-owner input (Option A) or an explicitly approved, backup-first reset of named users (Option B).
