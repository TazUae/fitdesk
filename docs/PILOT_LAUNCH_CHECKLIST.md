# Pilot Launch Checklist

Sign-off required before pointing a real trainer at the pilot. Every box is either ticked with evidence link, or waived with named operator + written reason. **Unticked boxes block launch.**

## Tenant decision

- [ ] Pilot tenant is **already-provisioned** (i.e. `phase-264-fitdesk-repeat-2`), OR
- [ ] Pilot will require **new-tenant provisioning** AND sibling repos (`provisioning_api`, `provisioning-agent`, `control-plane`, `erp-execution-service`) have been committed/pushed clean
  - See `docs/DEPLOYMENT.md` § "Sibling-repo state catalogue (audit, 2026-05-09)"

## Security

- [ ] `NODE_ENV=production` set in pilot deployment
- [ ] `npx vitest run app/api/dev/tenant-readiness/route.test.ts` green — confirms prod 404 gate
- [ ] Manual: `curl <prod>/api/dev/tenant-readiness` returns 404
- [ ] `BETTER_AUTH_SECRET` is real (not `dev-only-*` or build placeholder); startup validator did not throw
- [ ] `CONTROL_PLANE_API_KEY` and `FITDESK_JWT_SECRET` ≥ min length, no `dev-only-*` pattern
- [ ] `CONTROL_PLANE_API_KEY` matches across `fitdesk` ↔ `cp-api` ↔ `cp-worker` (sha-fingerprint check from SUPPORT.md)
- [ ] `FITDESK_JWT_SECRET` matches across `fitdesk` ↔ `cp-api`
- [ ] No real secrets present in `git log -p .env.example` (placeholders only)

## Pilot-mode safety (5.0.6)

- [ ] `PILOT_MODE=true` in pilot deployment
- [ ] Dashboard pilot banner visible (REGRESSION_MATRIX row 19)
- [ ] `FITDESK_ALLOWED_TEST_PHONE` and/or `FITDESK_ALLOWED_TEST_PHONE_PREFIXES` set to the pilot operator's number(s)
- [ ] Manual test: send to allowlisted number → succeeds (REGRESSION_MATRIX row 21)
- [ ] Manual test: send to non-allowlisted number → blocks with "Pilot mode: target phone is not on the test allowlist." AND row appears in `message_log` with status=failed (REGRESSION_MATRIX row 22)
- [ ] `PILOT_ALLOW_EXTERNAL_PAYMENTS` is **unset or false** (no future external payment writes exist today; flag is reserved)

## Observability (5.0.3)

- [ ] `/api/health` returns 200 with structured JSON, fresh timestamp (no longer build-cached — 5.0.3a)
- [ ] `/api/health?deep=1` returns 401 unauth, 200 + `deep` block when authed (REGRESSION_MATRIX rows 25, 26)
- [ ] FitDesk container logs are JSON-per-line (5.0.3b structured logger)
- [ ] No `console.*` calls in `actions/*` (Phase 5.0.3b grep clean)
- [ ] `docs/RUNBOOKS/INCIDENTS.md` § "Pre-pilot checklist (every morning during pilot)" understood by operator

## Operations runbooks

- [ ] `docs/RUNBOOKS/BACKUPS.md` reviewed; first manual backup taken and stored off-VPS
- [ ] `docs/RUNBOOKS/RESTORE.md` reviewed; named operator with restore approval authority identified
- [ ] `docs/RUNBOOKS/CLEANUP_FAILED_TENANTS.md` reviewed; no cleanup planned during pilot window
- [ ] `docs/RUNBOOKS/SUPPORT.md` reviewed; trainer support contact path documented
- [ ] `docs/RUNBOOKS/INCIDENTS.md` reviewed; escalation path agreed (named on-call)

## Deployment

- [ ] `docs/DEPLOYMENT.md` reviewed
- [ ] FitDesk repo reproducible from clean clone: `git clone → cp .env.example .env → fill required vars → docker compose up --build` → `/api/health` 200
- [ ] All env var names documented in `docs/ENV_REFERENCE.md` match what's actually read by the code
- [ ] Reverse proxy configured for `https://<pilot-domain>` → fitdesk container
- [ ] Rollback plan documented and image tag pinned

## Performance baseline

- [ ] `scripts/smoke/health-latency.mjs` run on pilot deployment; p95 within target (`docs/QA/PERF_BASELINE.md`)
- [ ] `scripts/smoke/erp-roundtrip.mjs` run on pilot deployment; total within target
- [ ] Frappe rate-limit awareness reviewed (60 rpm/IP default); pilot trainer informed if reload-spamming will trip it

## Quality / regression

- [ ] `npx vitest run` green (target ≥ 288 tests)
- [ ] `npm run lint` clean except the pre-existing `<img>` warning in `app/dashboard/account/page.tsx`
- [ ] `npm run build` clean
- [ ] `docs/QA/REGRESSION_MATRIX.md` executed end-to-end against pilot deployment; evidence captured per `docs/QA/SCREENSHOT_TEMPLATE.md`
- [ ] All P0 rows passed OR explicitly waived (with operator name + reason in the Notes column)

## Communication

- [ ] Pilot trainer briefed on what's in scope and what isn't (e.g. WhatsApp send is allowlist-restricted)
- [ ] Trainer knows how to report issues (channel, expected response time)
- [ ] Operator knows how to reach the trainer (out-of-band, in case the app is down)

## Final go / no-go

| Approver | Role | Signature (initials + date) | Decision |
|---|---|---|---|
| | Pilot owner | | |
| | Engineering | | |
| | Operations | | |

Decision: **GO** / **NO-GO**

If NO-GO: list blockers with linked issues / runbooks below.

## Post-launch (first 24 hours)

- [ ] Pre-pilot checklist (INCIDENTS.md) run morning-of-launch
- [ ] First-day backup taken (BACKUPS.md)
- [ ] Trainer's first session-complete → invoice flow verified live
- [ ] No P0 errors in fitdesk / cp-api logs over the first 4 hours
- [ ] Trainer's first WhatsApp send (to allowlisted number) succeeded
