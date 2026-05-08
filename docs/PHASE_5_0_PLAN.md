# Phase 5.0 — Revised Execution Checklist

**Status:** Approved with revisions on 2026-05-09. Binding execution document.
**Reference:** the full Phase 5.0 plan (audit + sub-phase descriptions) lives in the prior planning conversation; this checklist is the delta-and-execution-ready summary that supersedes it.

---

## Gate 0: Phase 4 manual demo replay (precondition)

**This must pass before any Phase 5 sub-phase starts.**

- [ ] Replay `docs/PHASE_4_0_DEMO_SCRIPT.md` end-to-end on tenant `phase-264-fitdesk-repeat-2`
- [ ] Verify all 9 walkthrough steps complete in ≤5 minutes
- [ ] If any P0 flow breaks: **STOP**. Create an un-numbered hotfix branch (e.g. `hotfix/4.0.x-<short-name>`), commit a focused fix with tests, then re-run the demo
- [ ] Demo evidence captured (screenshots or short recording)
- [ ] Migration auto-run confirmed in deployed image (already true per `start-with-migrations.mjs`); local run already done

**Artifact:** demo evidence note appended to `docs/PHASE_4_0_REPORT.md` or filed under `docs/QA/DEMO_EVIDENCE_4.0.md`.

---

## Revised execution order

```
1.  5.0.1   Security + tenant-boundary fixes        (BLOCKER)
2.  5.0.2   Env/secrets centralized validation
3.  5.0.6   Pilot mode + safe defaults
4.  5.0.7   Manual QA matrix
5.  5.0.3a  Logger + error mapper foundation
6.  5.0.3b  Gradual action-file migration
7.  5.0.4   Data safety + cleanup runbooks
8.  5.0.5   Deployment + sibling-repo audit (no commits to siblings)
9.  5.0.8   Performance + reliability smoke
10. 5.0.9   Admin/support runbook
11. 5.0.10  Pilot launch checklist + evidence pack
```

Rationale for this order: ship the **safety guardrails** (5.0.1, 5.0.2, 5.0.6) before the **QA matrix (5.0.7)** so the matrix exercises the safe defaults. Observability (5.0.3) follows because it's invasive — easier when the QA matrix is already a known-good baseline.

---

## 5.0.1 — Security and Tenant Boundary Fixes (BLOCKER)

**Scope** (revised — broader than the original plan):
- [ ] Enumerate every route under `app/api/dev/**` — not just `tenant-readiness`. Confirm the full list before coding
- [ ] In production (`NODE_ENV === 'production'`), **every** dev route returns 404 (consistent shape: `NextResponse.json({ error: 'Not found' }, { status: 404 })`)
- [ ] Implement the gate as a runtime guard in each route handler — do **not** rely on build-time stripping or .gitignore
- [ ] Remove the hardcoded `TARGET_TENANT` constant in `app/api/dev/tenant-readiness/route.ts`
- [ ] In non-production, the route uses **the authenticated user's resolved tenant context** (`getTenantContext()`) — no hardcoded tenant
- [ ] **Do not** add `FITDESK_DEV_TENANT_ID` env var. If the audit proves it's necessary, escalate before adding
- [ ] Rename internal task: ~~"trainer-ownership check"~~ → **"response integrity and tenant-scope assertion"** in `getClientById` (`lib/erpnext/client.ts:282`)
- [ ] Minimum assertion in `getClientById`: returned `customer.name === requestedId`. Throw a clear `ERPNextError(404, ...)` otherwise
- [ ] Do **not** invent a new trainer-ownership model. If the existing Customer DocType has no trainer link field (it doesn't), the check is bounded to response integrity only
- [ ] `lib/auth.ts:resolveAuthSecret` — defer all validation to `lib/env.ts` from 5.0.2; for now leave a TODO comment pointing to it. (The new `lib/env.ts` lands in the next sub-phase, so this commit must not import it yet)
- [ ] Top-of-file comment in `middleware.ts` listing `/api/*` paths NOT covered (today: all of them rely on per-route auth)

**Deliverables:**
- [ ] Production runtime guard verified by a route-handler unit test per dev route
- [ ] `TARGET_TENANT` constant removed; readiness route runs against `getTenantContext()` result
- [ ] `getClientById` integrity check + test
- [ ] Middleware coverage comment

**Acceptance:**
- [ ] Tests green (target ≥230 — adds ~5 from new guards + integrity check)
- [ ] Lint clean
- [ ] Build clean
- [ ] Manual: with `NODE_ENV=production` set, every `/api/dev/**` route returns 404

**Risks:** Removing `TARGET_TENANT` could break the existing readiness diagnostic for a different (non-Phase-3) tenant. **Action:** confirm the readiness route still produces useful output for any active tenant before deleting the const.

---

## 5.0.2 — Centralized Env and Secrets Validation

**Scope** (revised — single source of truth):
- [ ] **All** env validation lives in new `lib/env.ts`. Nothing else does string-equality on secret values
- [ ] `lib/auth.ts:resolveAuthSecret` is reduced to: read the validated value or throw a generic "auth secret not validated" — the actual validation lives in `lib/env.ts`
- [ ] `lib/env.ts` exports `validateEnvAtStartup({ strict: boolean })`:
  - **strict (production)**: missing required → throw; placeholder/`dev-only-*`/build-only-placeholder in required → throw
  - **non-strict (dev)**: same checks but `console.warn` instead of throw
- [ ] Required vars (with min-length where applicable):
  - `BETTER_AUTH_SECRET` ≥32
  - `DATABASE_URL`
  - `CONTROL_PLANE_URL`
  - `CONTROL_PLANE_API_KEY` ≥16
  - `FITDESK_JWT_SECRET` ≥32
- [ ] Optional-but-warn vars (warn in strict only): `EVOLUTION_*`, `WHISH_*`, `ANTHROPIC_API_KEY`
- [ ] Wire into `scripts/start-with-migrations.mjs` — call before migrations with `strict: process.env.NODE_ENV === 'production'`
- [ ] **No duplication** between `lib/auth.ts` and `lib/env.ts` — the auth file consumes the validated env
- [ ] New `docs/ENV_REFERENCE.md` — table per var: name, required, min length, where read, behavior on absence

**Deliverables:**
- [ ] `lib/env.ts` with full required + optional matrix
- [ ] `lib/env.test.ts` — placeholder detection, dev-default detection, missing var, valid env, strict vs non-strict
- [ ] Startup wiring + clear failure message
- [ ] `docs/ENV_REFERENCE.md`
- [ ] `.env.example` annotated: `# REPLACE BEFORE PRODUCTION` above each `dev-only-*` line

**Acceptance:**
- [ ] Production-style startup with placeholder secret throws and exits non-zero
- [ ] Dev-style startup warns but continues
- [ ] No string-comparison secret-checking anywhere outside `lib/env.ts`

**Risks:** Local dev breaking if a contributor's `.env` is incomplete. **Mitigation:** dev mode warns only; required vars are tightly scoped to "things FitDesk genuinely cannot run without."

---

## 5.0.6 — Pilot Mode and Safe Defaults

**Scope** (revised — adds WhatsApp allowlist + payment-write defensive flag):
- [ ] New env var `PILOT_MODE` (boolean). Defaults to `false`. Validated in `lib/env.ts`
- [ ] When `PILOT_MODE=true`:
  - [ ] Dashboard renders a discreet pilot banner (component: `components/modules/PilotBanner.tsx`) at top of `app/dashboard/layout.tsx`
  - [ ] **All** WhatsApp message types require explicit confirmation (extends today's behavior which only confirms invoice/reminder)
  - [ ] **WhatsApp allowlist enforcement** in `actions/messages.ts:sendMessage`:
    - Read `FITDESK_ALLOWED_TEST_PHONE` (single number, exact match) and/or `FITDESK_ALLOWED_TEST_PHONE_PREFIXES` (comma-separated prefixes, e.g. `+961,+1555`)
    - If neither env is set → block with: `"Pilot mode: no allowlisted test phone configured."`
    - If neither matches the destination → block with: `"Pilot mode: target phone is not on the test allowlist."`
    - The block returns `{ success: false, error: ... }` like any other failure; no Evolution API call is made
    - Audit row IS still inserted into `message_log` with `status='failed'` so blocks are visible in history
  - [ ] **Payment-write defensive flag**: any future external payment-write paths gated behind `PILOT_ALLOW_EXTERNAL_PAYMENTS=true`. Today there are no such writes (only link generation + manual mark-paid), so this is a documented future-proof
- [ ] Test suite must pass with `PILOT_MODE=true` AND `PILOT_MODE=false`
- [ ] New unit tests for the allowlist matcher (exact, prefix, no env, mismatch, match)

**Deliverables:**
- [ ] `PilotBanner.tsx`
- [ ] Pilot-mode confirmation extension in `MessagesView.tsx`
- [ ] Allowlist matcher (pure function in `lib/whatsapp-allowlist.ts` or co-located) + tests
- [ ] Allowlist enforcement in `sendMessage`
- [ ] Defensive `PILOT_ALLOW_EXTERNAL_PAYMENTS` constant referenced in `lib/whish.ts` with a TODO/comment for future writers
- [ ] `docs/ENV_REFERENCE.md` updated with `PILOT_MODE`, `FITDESK_ALLOWED_TEST_PHONE`, `FITDESK_ALLOWED_TEST_PHONE_PREFIXES`, `PILOT_ALLOW_EXTERNAL_PAYMENTS`

**Acceptance:**
- [ ] With `PILOT_MODE=true` and an unlisted destination → send returns `{ success: false }` with the pilot warning; no Evolution API call observed
- [ ] With `PILOT_MODE=true` and a matched destination → send proceeds normally
- [ ] With `PILOT_MODE=false` → existing behavior unchanged
- [ ] Pilot banner visible only when flag is on

**Risks:** Allowlist false-positives (e.g. prefix accidentally matching a real client). **Mitigation:** require exact-match by default; prefix matching is opt-in via a separate env var; document examples clearly.

---

## 5.0.7 — Manual QA Matrix

**Scope:**
- [ ] `docs/QA/REGRESSION_MATRIX.md` — tabular: route × scenario × expected × pass/fail × notes. Cover all 14 P0 flows from Phase 4 + the new Phase 5.0.1/5.0.2/5.0.6 surfaces
- [ ] `docs/QA/SCREENSHOT_TEMPLATE.md` — capture template per row
- [ ] One full execution recorded — captured against the live tenant with `PILOT_MODE=true`

**Acceptance:**
- [ ] Matrix is replayable by a second person without ambiguity
- [ ] Pilot-mode allowlist test scenario explicitly listed
- [ ] Each row has either a pass mark or a documented waiver

**Risks:** None — pure documentation.

---

## 5.0.3a — Logger and Error Mapper Foundation

**Scope** (split — foundation only, no migration):
- [ ] New `lib/log.ts`:
  - `log.info | log.warn | log.error(event: string, ctx?: Record<string, unknown>)`
  - One JSON line per call (level, ts, event, ...ctx)
  - All string values pass through scrubber (re-export the SECRET regex from `lib/dev/tenant-readiness.ts` or copy to a neutral location like `lib/scrub.ts` to avoid the `dev/*` dependency)
  - Optional `correlationId`
- [ ] New `lib/errors.ts`:
  - `UserErrorCode` enum: `'AUTH' | 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'UPSTREAM' | 'INTERNAL'`
  - `toUserError(err): { code, message }` — wraps `SchedulingErrorCode` mapping where applicable; otherwise classifies by err shape; always passes message through scrubber
- [ ] `app/api/health/route.ts` — extend with `?deep=1`:
  - Reports tenant-context presence (boolean only, no value)
  - Pings `CONTROL_PLANE_URL/healthz` with 2s timeout
  - Includes `workspaceProvisioning.failureReason` for the authenticated user
  - **Auth-required for deep mode**; default GET stays cheap and unauthenticated
- [ ] Tests: `lib/log.test.ts`, `lib/errors.test.ts`, `app/api/health/route.test.ts`

**Deliverables:** logger + mapper + deep health + tests. **No** action-file edits.

**Acceptance:**
- [ ] Tests green (target ≥240 by this point)
- [ ] Lint clean
- [ ] Build clean
- [ ] `curl /api/health` cheap; `curl /api/health?deep=1` 401 unauth, full payload with cookie

---

## 5.0.3b — Gradual Action-File Migration

**Scope** (split — mechanical replacement only):
- [ ] Migrate `console.log/error/warn` calls in `actions/*` to `log.info/warn/error`. **Mechanical only** — do not change behavior, do not silently swallow, do not add new error paths
- [ ] Migrate action-layer error returns to use `toUserError` where they currently do `err instanceof Error ? err.message : 'Failed'`. Apply per file; one commit per file ideally
- [ ] Each file's migration should produce a tiny diff and pass existing tests unchanged
- [ ] Files in scope (audit-confirm before starting):
  - `actions/clients.ts`
  - `actions/invoices.ts`
  - `actions/messages.ts`
  - `actions/whatsapp.ts`
  - `actions/trainerSettings.ts`
  - `actions/schedulingActions.ts` (already has its own mapping; just route logs through `lib/log.ts`)
- [ ] After migration: a final grep `console\.(log|error|warn)` across `actions/` and `lib/` should show zero hits (excluding intentional ones in `scripts/*` startup banners)

**Acceptance:**
- [ ] Each per-file migration commit is mechanical and reviewable in isolation
- [ ] Test count unchanged or higher
- [ ] No new lint warnings
- [ ] No raw ERP error wording leaks to UI

**Risks:** Behavior drift. **Mitigation:** run the QA matrix after this sub-phase to confirm nothing regressed.

---

## 5.0.4 — Data Safety, Backups, and Cleanup Runbooks

**Scope** (unchanged from original plan):
- [ ] `docs/RUNBOOKS/BACKUPS.md` — `auth.db` (local volume snapshots; Turso platform docs link); ERP DB ownership escalation
- [ ] `docs/RUNBOOKS/CLEANUP_FAILED_TENANTS.md` — Phase 2.6.5 matrix copied; Level 1 (CP-only) and Level 2 (ERP site/DB) procedures with explicit approval gates. **No automation in this sub-phase.**
- [ ] `docs/RUNBOOKS/RESTORE.md` — happy-path `auth.db` restore; ERP side links out to `bench-agent`/`provisioning-agent`
- [ ] `docs/RUNBOOKS/README.md` — index

**Acceptance:** all four files exist and are reviewable.

---

## 5.0.5 — Deployment Reproducibility and Sibling-Repo Audit

**Scope** (revised — sibling repos catalogued, not committed):
- [ ] **Strict constraint:** do **not** commit changes to `control-plane`, `provisioning-agent`, `provisioning_api`, `erp-execution-service`, `bench-agent`, or `fitdesk-app` in this sub-phase. Audit only
- [ ] Catalogue current state of each sibling repo: branch, ahead/behind, dirty file list (names only)
- [ ] **Treat `provisioning_api` untracked files as a HIGH-RISK reproducibility item** — `api/bootstrap.py` and `api/doctype/` are not in git. Document this explicitly with the operator/owner. Phase 4.0.2 audit confirmed `api/fitdesk_setup.py` IS tracked, so the Phase 4 client-fields work is reproducible; the broader provisioning surface is not
- [ ] Document whether the **pilot depends on new tenant provisioning** or only on an already-provisioned tenant:
  - If pilot uses `phase-264-fitdesk-repeat-2` (already provisioned) → reproducibility risk is ops-only; can launch
  - If pilot needs to provision a **new** tenant → sibling-repo cleanup is a **pilot blocker**; escalate before launch
- [ ] New `docs/DEPLOYMENT.md` — Dokploy assumptions, network names, env_file, reverse proxy, build args, healthcheck, rollback procedure, branch strategy
- [ ] Note workspace snapshot directories (`control-plane-fetch-timeout`, `provisioning-agent-phase2-split`, etc.) as cleanup candidate post-pilot — do not delete

**Acceptance:**
- [ ] DEPLOYMENT.md exists
- [ ] Sibling repo state catalogued in DEPLOYMENT.md (or a sibling doc)
- [ ] Pilot dependency on new-tenant provisioning explicitly answered yes/no
- [ ] FitDesk repo verified reproducible from a clean clone: `git clone → cp .env.example .env → fill required vars → docker compose up --build → /api/health 200`

---

## 5.0.8 — Performance and Reliability Smoke

**Scope** (unchanged):
- [ ] `scripts/smoke/dashboard-latency.mjs` — warm `/api/health`, time 10 authenticated `/dashboard` fetches
- [ ] `scripts/smoke/erp-roundtrip.mjs` — measure typical ERP fetch sequence (clients + sessions + invoices)
- [ ] `docs/QA/PERF_BASELINE.md` — record numbers; document Frappe rate limits (60 rpm/IP default)

---

## 5.0.9 — Admin/Support Runbook

**Scope** (unchanged):
- [ ] `docs/RUNBOOKS/SUPPORT.md` — common operations
- [ ] `docs/RUNBOOKS/INCIDENTS.md` — failure scenarios + recovery
- [ ] Log locations + rotation behavior (`json-file` driver)
- [ ] Escalation path

---

## 5.0.10 — Pilot Launch Checklist and Evidence Pack

**Scope** (unchanged):
- [ ] `docs/PILOT_LAUNCH_CHECKLIST.md` — every box ticked or explicitly waived in writing
- [ ] `docs/PHASE_5_0_REPORT.md` — sub-phase outcomes, test/lint/build counts, deferred items carry-over
- [ ] Bundle: this report + QA matrix execution + perf baseline + screenshots
- [ ] Final `npm run test && npm run lint && npm run build` clean

---

## Revised acceptance criteria

**Security**
- [ ] **Every** `/api/dev/**` route returns 404 in production (5.0.1)
- [ ] No `BETTER_AUTH_SECRET` placeholder reaches runtime (5.0.2)
- [ ] All `dev-only-*` defaults trip startup error in production (5.0.2)
- [ ] All env/secret validation centralized in `lib/env.ts` — no duplication (5.0.2)
- [ ] `getClientById` performs response-integrity + tenant-scope assertion (returned `customer.name === requestedId`) (5.0.1)
- [ ] Middleware coverage documented in code (5.0.1)

**Pilot safety**
- [ ] `PILOT_MODE=true` requires confirmation on **all** WhatsApp sends (5.0.6)
- [ ] `PILOT_MODE=true` blocks WhatsApp sends to non-allowlisted numbers (5.0.6)
- [ ] Block events visible in `message_log` history (5.0.6)
- [ ] Defensive `PILOT_ALLOW_EXTERNAL_PAYMENTS` flag documented for future payment writes (5.0.6)
- [ ] Pilot banner visible when flag is on (5.0.6)

**Operational**
- [ ] BACKUPS / RESTORE / CLEANUP_FAILED_TENANTS / SUPPORT / INCIDENTS runbooks exist
- [ ] Migration auto-runs on container start (already true; re-verified)
- [ ] DEPLOYMENT.md documents Dokploy + rollback + branch strategy

**Observability**
- [ ] `lib/log.ts` and `lib/errors.ts` exist with tests (5.0.3a)
- [ ] `/api/health?deep=1` reports tenant + CP + provisioning state (5.0.3a)
- [ ] All `actions/*` use `log.*` and `toUserError`; zero `console.*` calls in actions/ (5.0.3b)

**Reproducibility (revised — scoped)**
- [ ] **FitDesk repo is reproducible from a clean clone** — verified end-to-end (5.0.5)
- [ ] **Full AXIS workspace reproducibility is a documented cross-repo risk** if sibling repos are not cleaned in this phase. The risk is acceptable if pilot uses an already-provisioned tenant; it is a blocker if pilot requires new-tenant provisioning (5.0.5)

**QA / Pilot**
- [ ] Regression matrix populated and executed once
- [ ] Performance baseline captured
- [ ] PILOT_LAUNCH_CHECKLIST.md ticked

**Test / Build**
- [ ] `npx vitest run` green (target ≥250 tests after 5.0.1+5.0.2+5.0.6+5.0.3a+5.0.3b add tests)
- [ ] `npx next lint` clean (only pre-existing `<img>` warning)
- [ ] `npx next build` clean
- [ ] Working tree clean at closeout

---

## Implementation prompts status

The 5.0.1, 5.0.2, and 5.0.3 prompts in section M of the prior plan are now **stale** — they don't reflect:
- 5.0.1's expanded scope to all `app/api/dev/**` routes and the renamed integrity-check task
- 5.0.2's no-duplication requirement vs `lib/auth.ts`
- 5.0.6's allowlist + payment-defensive flag

When ready to start 5.0.1, request a **revised** Phase 5.0.1 prompt before implementation. The same applies for 5.0.2 and 5.0.6 in turn.

---

## Next decision point

Either:
1. **Run Gate 0** — execute the Phase 4 demo replay against the live tenant, then come back with results
2. **Request revised 5.0.1 prompt** — to start the security hardening immediately after Gate 0 passes

This document supersedes any earlier Phase 5 plan content that may have been informally circulated.
