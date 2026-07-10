# Sprint 1 Story Traceability Map

> Governed by `docs/DOCUMENTATION_AUTHORITY_MAP.md`. This file records the current
> mapping problem between Sprint 1's four User-Story IDs and this repo's existing
> Phase-N documentation and code — it does not define new acceptance criteria.
> Acceptance criteria are written separately, only once sourced from approved product
> strategy, and are explicitly out of scope for this file.

## The mapping problem

FitDesk's documentation and planning history is organized entirely by **Phase number**
(Phase 0 through Phase 10+, see `docs/plans/FITDESK_REMAINING_ROADMAP_V2.md`). It has
never used a User-Story-ID convention. Sprint 1 introduces four stories by ID:

- **US-025** — Tenant-Isolation Test Coverage
- **US-026** — Zero-Row Onboarding Validation
- **US-030** — Production Feature Flag Verification
- **US-018** — Statement of Account Financial Clarity

The pre-flight inventory (`docs/audits/PRE_FLIGHT_INVENTORY_REPORT.md`) confirmed zero
matches for any of these four IDs anywhere in the repo. This file traces each story to
the closest existing evidence — docs, code, tests — found by direct search, so that
scoping the acceptance criteria later starts from what's actually true today rather
than from a blank page.

## Traceability table

| Story | Canonical intent | Existing repo docs found | Existing code/tests likely involved | Ready for /goal? | Gap |
|---|---|---|---|---|---|
| **US-018** | Statement of Account Financial Clarity | None with a US-ID. The feature exists as shipped work but has never been documented as a discrete "story." | `components/clients/StatementSheet.tsx`, `components/clients/StatementButton.tsx`, `lib/statements/assembleStatement.ts`, `lib/statements/groupAndFilter.ts` (+ `groupAndFilter.test.ts`), `actions/statements.ts` (+ `actions/statements.test.ts`) | **No** — already implemented and merged to `main` | Retroactive traceability only: acceptance criteria should describe the shipped behavior for the record, not drive new implementation |
| **US-025** | Tenant-Isolation Test Coverage | `docs/security/H5-trainer-ownership.md` (status: **Plan Only, not implemented**) — documents a **previously documented potential intra-tenant IDOR gap that must be re-verified against current `main`**: as of that doc, `completeSession` (L100-113) and `cancelSession` (L118-128) in `actions/sessions.ts` were described as checking only that the caller is authenticated, before mutating by client-supplied `sessionId`. Explicitly flagged in that doc as "auth/isolation-sensitive" per `CLAUDE.md` §4 approval gate. | `actions/sessions.ts` (`completeSession`, `cancelSession`), `lib/erpnext/client.ts` (`markSessionComplete` L401, `cancelSession` L416, `createSession` L389) — **previous audit claimed these paths lacked trainer ownership scoping; current `main` must be rechecked before acceptance criteria are written.** | **No** | The H5 doc states FitDesk "has no test harness" — that claim is now **stale**: `package.json` has a working `vitest` test script and multiple `*.test.ts` files exist elsewhere in the repo. The isolation gap itself has not been re-verified against current `main`, and no isolation-specific test suite is confirmed to exist. Needs a status recheck before any acceptance criteria are written. |
| **US-026** | Zero-Row Onboarding Validation | `docs/audits/PHASE_1B_ONBOARDING_VALIDATION_BLOCKER.md` and `docs/audits/PHASE_1C_ONBOARDING_CURRENT_USER_VALIDATION.md` — **exact match to the story name**. Phase 1C's own stated status: "True zero-row onboarding validation: **BLOCKED** (missing test-data precondition — unchanged from Phase 1B)." As of the Phase 1C snapshot, all 6 live users had exactly 1 `WorkspaceProvisioning` row each (5 completed, 1 failed); **zero users had zero rows**. | `app/onboarding/page.tsx`, `components/onboarding/workspace-setup-form.tsx`, `components/onboarding/provisioning-status.tsx`, `features/onboarding/components/workspace-setup-form.tsx`, `features/onboarding/components/provisioning-status.tsx` | **No** | Blocked upstream on a test-data precondition (no confirmed zero-row test accounts exist), not on missing acceptance criteria alone. Resolving the gap requires either provisioning fresh zero-row test accounts (needs approval — see `CLAUDE.md` §4/§9 on tenant/provisioning mutations) or an explicit decision to validate a different way. |
| **US-030** | Production Feature Flag Verification | No dedicated doc. The flags themselves are documented inline as comments in `FitDesk/.env.example` under a "Feature flags" section. | `.env.example`: `NEXT_PUBLIC_GOAL_WORKSPACE` (Pop-and-Split Goal Workspace toggle), `FITDESK_CLIENT_DIRECTORY_LOCAL_READ` (local client-index read model toggle, with automatic ERP fallback), `FITDESK_CLIENT_DIRECTORY_LOCAL_TENANTS` (tenant-scoped allowlist for the read-model flag) | **No** | No canonical doc enumerates all production flags, their current rollout state, or their intended verification method. Needs authoring from scratch — this is the story with the least existing evidence. |

## Initial status summary

- **US-018** — implemented/merged into `main`; repo docs still need traceability
  (satisfied above; a formal acceptance-criteria writeup for the record is the
  remaining work).
- **US-025** — not ready for `/goal` until acceptance criteria are imported or
  written, and the H5 doc's stale "no test harness" claim is corrected.
- **US-026** — not ready for `/goal` until acceptance criteria are imported or
  written, and the underlying zero-row test-data blocker is resolved or explicitly
  re-scoped.
- **US-030** — not ready for `/goal` until acceptance criteria are imported or
  written; no existing doc to import from, so this is net-new authoring.

## Explicitly out of scope for this file

- No acceptance criteria are defined here. Per `docs/DOCUMENTATION_AUTHORITY_MAP.md`,
  acceptance criteria belong in `docs/product/*` (canonical intent) and are then
  packaged for `/goal` execution — neither step has happened yet for any of these
  four stories.
- No code changes, test additions, or provisioning actions were taken to produce this
  table. All findings are from read-only inspection of the existing repo.
