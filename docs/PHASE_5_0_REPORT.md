# Phase 5.0 — Completion Report

**Branch:** `wip/main-2026-04-25`
**Baseline:** `1aedb1b` (end of Phase 4.0)
**Closeout commit:** to be determined at this commit
**Test suite:** 288 tests across 16 files — 0 failures

## Sub-phase status

| Sub-phase | Commit | Outcome |
|---|---|---|
| Hotfix — `normalizePhone` | `592ce34` | ✅ LB-hardcode removed; E.164-only contract; 7 new tests |
| 5.0.1 — Security + tenant boundaries | `6d48363` | ✅ `/api/dev/**` returns 404 in production; `TARGET_TENANT` removed; `getClientById` response-integrity assertion; middleware coverage documented |
| 5.0.2 — Centralized env validator | `c1f27f8` | ✅ `lib/env.ts` (TS) + `scripts/env-validate.mjs` (runtime mirror); strict-fail in production on placeholders; `docs/ENV_REFERENCE.md` |
| 5.0.6 — Pilot mode + WhatsApp allowlist | `8ae1d0c` | ✅ `PILOT_MODE` flag, dashboard banner (server-rendered above client shell); all-types confirm; allowlist matcher with fail-closed default; `PILOT_ALLOW_EXTERNAL_PAYMENTS` reserved |
| 5.0.3a — Logger + errors + deep health | `39ee9d6` | ✅ `lib/log.ts`, `lib/errors.ts`, `lib/scrub.ts`; `/api/health?deep=1`; force-dynamic fix for the build-cache health bug |
| 5.0.3b — Mechanical action migration | `d0f2487` | ✅ `actions/messages.ts`, `lib/evolution.ts`, `lib/trainer.ts` migrated; `lib/whish.ts` + `lib/claude.ts` left on `console.*` (reachable from client components for const exports) — documented |
| 5.0.4 — Runbooks (data safety) | `ea21605` | ✅ BACKUPS / RESTORE / CLEANUP_FAILED_TENANTS + index README |
| 5.0.5 — Deployment + sibling audit | `d4d3434` | ✅ `docs/DEPLOYMENT.md` with sibling-repo dirty-state catalogue; pilot-dependency-on-new-tenant question raised |
| 5.0.7 — QA matrix templates | `6e7f59c` | ✅ 28-row regression matrix; screenshot template |
| 5.0.8 — Perf smoke + baseline | `4a7eae3` | ✅ Two scripts in `scripts/smoke/`; baseline captured (health p95 5.6 ms; ERP roundtrip 196 ms total) |
| 5.0.9 — Support + incident runbooks | `beb4365` | ✅ SUPPORT.md (trainer-facing) + INCIDENTS.md (stack-level) |
| 5.0.10 — Launch checklist + this report | (this commit) | ✅ `PILOT_LAUNCH_CHECKLIST.md` + report |

Plus the planning doc itself: `2ecb80c` — `docs/PHASE_5_0_PLAN.md`.

## Test / lint / build summary

| Metric | Phase 4.0 close | Phase 5.0 close | Δ |
|---|---|---|---|
| Tests | 225 | **288** | **+63** |
| Test files | 10 | **16** | **+6** |
| `npm run lint` | 1 pre-existing warning | 1 pre-existing warning (unchanged) | 0 |
| `npm run build` | clean | clean | 0 |

New test files:
- `lib/evolution.test.ts` — `normalizePhone` E.164 contract (7)
- `lib/env.test.ts` — env validator (10)
- `lib/pilot.test.ts` — pilot mode + allowlist (12)
- `lib/log.test.ts` — structured logger + scrubber (6)
- `lib/errors.test.ts` — toUserError mapping (8)
- `app/api/dev/tenant-readiness/route.test.ts` — prod 404 gate + dev 401 (2)

## What was deferred

Per the revised plan (`docs/PHASE_5_0_PLAN.md`), these are NOT closed in Phase 5.0 and are documented as carry-overs:

| Item | Status | Next phase |
|---|---|---|
| Manual demo replay (Gate 0) | Deferred — operator's job | Pre-pilot |
| QA matrix execution | Templates only — operator runs | Pre-pilot |
| Sibling-repo cleanup | Catalogued, NOT committed (in scope was "audit only") | Phase 6 if pilot needs new-tenant provisioning |
| `provisioning_api` untracked files | Documented as HIGH risk in `docs/DEPLOYMENT.md` | Phase 6 (escalated to repo owner) |
| WhatsApp allowlist E2E verification | Unit-tested; live send proof requires real Evolution dispatch | Pre-pilot manual QA (REGRESSION_MATRIX rows 21, 22) |
| Whish payment integration | Mock implementation; env-readiness indicator only | Phase 6 (when pilot needs paid links) |
| Pilot launch sign-off | Checklist exists, all boxes unticked | Pre-pilot, requires named operators |

## Risk register (final)

| Risk | Severity | Mitigation in Phase 5 |
|---|---|---|
| Cross-container secret rotation footgun | OPS HYGIENE → addressed | DEPLOYMENT.md + SUPPORT.md document the `--no-deps` rule, ALTER USER procedure for postgres, and rotating-secrets workflow |
| Build-time env caching of `/api/health` | LOW → fixed | `dynamic = 'force-dynamic'` in 5.0.3a |
| LB-hardcoded phone normalizer | MEDIUM → fixed | Hotfix `592ce34` |
| `/api/dev/*` reachable in production | HIGH → fixed | Runtime gate in 5.0.1 |
| Placeholder secret in production | HIGH → fixed | Strict env validator in 5.0.2 |
| Real WhatsApp send to wrong number | HIGH → mitigated | `PILOT_MODE=true` + allowlist enforcement in 5.0.6; fail-closed default |
| Sibling-repo reproducibility (esp. `provisioning_api`) | HIGH → documented | Catalogued in DEPLOYMENT.md; pilot-dependency question explicitly raised |
| Rate limit on Frappe (60 rpm/IP) | MEDIUM → documented | Noted in PERF_BASELINE.md with mitigation options |

## What pilot can launch with today

**If pilot uses already-provisioned `repeat-2`:**
- All P0 product flows demonstrably work (backend audit 2026-05-09 confirmed)
- Pilot safety guardrails active (PILOT_MODE + allowlist)
- Observability sufficient for operator to detect issues
- Runbooks cover the failure modes we know about
- Manual QA matrix needs to be run once — 1-2 hour exercise
- **Status: launchable after manual QA + checklist sign-off**

**If pilot needs new-tenant provisioning:**
- Sibling-repo dirty state is a blocker (HIGH-risk untracked files in `provisioning_api` particularly)
- Cleanup + commit + push of those repos must happen first
- Recommend Phase 6 mini-phase to address before second-trainer onboarding

## Acceptance criteria — final check

Per `docs/PHASE_5_0_PLAN.md` § "Revised acceptance criteria":

- [x] **Security** — every `/api/dev/**` returns 404 in production; placeholder secrets blocked at startup; `getClientById` integrity check; middleware coverage documented
- [x] **Pilot safety** — PILOT_MODE confirms all WhatsApp sends; allowlist blocks unmatched destinations; blocks visible in `message_log`; PILOT_ALLOW_EXTERNAL_PAYMENTS reserved; banner visible
- [x] **Operational** — BACKUPS / RESTORE / CLEANUP / SUPPORT / INCIDENTS exist; migration auto-runs; DEPLOYMENT.md complete
- [x] **Observability** — `lib/log.ts` + `lib/errors.ts` exist with tests; `/api/health?deep=1` works; actions migrated where importable
- [x] **Reproducibility (scoped)** — FitDesk repo reproducible; full workspace reproducibility documented as cross-repo risk
- [x] **QA / Pilot** — regression matrix populated (execution = manual); perf baseline captured; PILOT_LAUNCH_CHECKLIST.md created
- [x] **Test/Build** — 288/288, lint clean, build clean, working tree clean at closeout

## Next action

1. Push Phase 5.0 to origin: `git push origin wip/main-2026-04-25`
2. Run manual QA matrix execution against the pilot deployment (`docs/QA/REGRESSION_MATRIX.md`)
3. Operator + engineering + ops sign off on `docs/PILOT_LAUNCH_CHECKLIST.md`
4. Pilot launch (or NO-GO with documented blockers)
