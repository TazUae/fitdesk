# Phase 1B — Onboarding Validation Blocker

> **Date:** 2026-07-04
> **Phase:** FitDesk Remaining Roadmap v2.1 — Phase 1 (Re-open FitDesk safely) / Phase 1B (six reset-user onboarding validation)
> **Status:** BLOCKED — data-state mismatch, no rows reset, no Start Workspace run
> **Related:** [`docs/plans/FITDESK_REMAINING_ROADMAP_V2.md`](../plans/FITDESK_REMAINING_ROADMAP_V2.md), [`docs/audits/FITDESK_2026_AUTH_ONBOARDING_PHASE_1_IMPLEMENTATION_SPEC.md`](FITDESK_2026_AUTH_ONBOARDING_PHASE_1_IMPLEMENTATION_SPEC.md) (D6 finding, dated 2026-06-25)

## Expected state

Per the roadmap's Phase 1 scope and the handbook's D6 finding: **six reset test users** should have **zero `WorkspaceProvisioning` rows**, dead-ending at the pre-Phase-1C "contact support" message, and should be walked through login → `/onboarding` → `WorkspaceSetupForm` → Start Workspace, one at a time, to validate the fix.

## Actual state

The live local Docker DB has **6 users total, and all 6 already have exactly one `WorkspaceProvisioning` row each** (5 `completed`, 1 `failed`). **Zero users have zero rows.** The expected precondition for Phase 1B does not hold in this environment.

## Live DB source

- Container: `axis-local-fitdesk-1`
- Path: `/app/data/fitdesk-auth.db`
- Docker volume: `axis-local_fitdesk-data` (named volume, not a host bind mount)
- Size/mtime at time of check: 303,104 bytes, modified 2026-07-03 12:35 UTC (actively growing)
- Other `.db` files found nearby (host `FitDesk/auth.db`, `FitDesk/local.db`, `FitDesk/prisma/auth.db`, and three in-container backup/snapshot files) were compared by metadata only, not opened — none matched a "six zero-row users" state.

## Why Phase 1B is blocked

The premise Phase 1B depends on (six zero-row accounts) is not reproducible against the current live stack. Proceeding would mean either:
- validating against the wrong six accounts (already-provisioned QA fixtures, not the D6 accounts), or
- resetting real accounts' `WorkspaceProvisioning` rows without confirmation that they are the intended six — a destructive, hard-to-reverse action taken on an unconfirmed identity match.

Neither is acceptable without explicit direction. See the reconciliation pass for the full hypothesis (the D6 finding is dated 2026-06-25 and labeled "operational state, not in code" — a human observation, not derivable from this DB; the 6 accounts present span `createdAt` 2026-06-05 → 2026-07-02 with QA-fixture-style naming, inconsistent with a single reset-and-retest batch).

## Failed row summary

- User: `qa.trainer.july02@example.com` (masked: `qa.***@example.com`)
- Local row: `status: failed`, local `failureReason: null`
- Control Plane (read-only `GET /jobs/:id`, `GET /tenants/:id`) shows the real cause: tenant `qa-trainer-july-02-studio` progressed `site_created` → `erp_installed` → `scheduler_enabled` (all completed) then failed at `locale_configured` — `bench execute provisioning_api.api.bootstrap.setup_locale` throws `ModuleNotFoundError: No module named 'provisioning_api.api.bootstrap'`.
- Truth-gap noted: the local row never synced this detailed Control Plane failure reason down, even though `lastSyncedAt` shows a status sync did occur. Flagged for the status-sync path owner; not fixed here (out of scope for a docs-only blocker note).

## Stop conditions honored

- No `WorkspaceProvisioning` rows deleted or created.
- No Start Workspace flow run.
- No container restarted or stopped.
- No Docker volumes mutated.
- No code, schema, or migration changed.
- No secret values printed (Control Plane API key/token used only in-memory inside the container to make read-only GET calls; never logged).
- Nothing staged, committed, or pushed.

## Decision

**Do not reset any `WorkspaceProvisioning` rows without explicit approval and a prior backup.** The 5 `completed` rows represent real, dated QA state that other audit/freeze docs in this repo may already reference — resetting them to chase an unconfirmed identity match would destroy working test fixtures for no confirmed benefit.

## Recommended next options

- **A.** Provide the exact intended six reset-user emails (and confirm which environment they live in), so they can be located and validated correctly.
- **B.** Approve a backup-first, controlled reset of specifically named test users (exact `userId`s confirmed in advance), scoped to deleting only their `WorkspaceProvisioning` rows, then re-run Phase 1B against them.
- **C.** Validate onboarding behavior against the current 6 provisioned users only (re-entry / already-completed / retry-from-failed paths), treating the "six zero-row users" scenario as separately unresolved.
- **D.** Leave Phase 1B blocked and move to the next safe roadmap phase that doesn't depend on this precondition, returning to Phase 1B once A or B is resolved.
