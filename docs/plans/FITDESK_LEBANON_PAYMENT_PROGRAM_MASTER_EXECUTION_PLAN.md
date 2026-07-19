# FitDesk Lebanon Payment Program — Master Execution Plan (Phases 1–9)

**Planning run date:** 2026-07-16
**Mode:** Planning only. No file edited outside this plan file, no git mutation, no migration, no deployment, no ERP mutation, no production access.
**Verdict:** `MASTER PLAN READY WITH RECORDED BLOCKERS`

---

## 0. Document status and provenance

**Persisted to this repository:** 2026-07-17, as a documentation-only change. No application code, schema, migration, test, deployment file, submodule, ERPNext record, Control Plane service, or Payment Slice 2 file was touched to create it.

**Source of record:** the planning run at `C:\Users\Lenovo\.claude\plans\claude-code-model-elegant-elephant.md` (2026-07-16). Sections 1–19 below are that plan reproduced verbatim and byte-for-byte; only this §0 was added.

**Authority tier: 5** — `docs/plans/*` under [`docs/DOCUMENTATION_AUTHORITY_MAP.md`](../DOCUMENTATION_AUTHORITY_MAP.md). That tier is authoritative for *what this phase of work is and why*. It does **not** override `CLAUDE.md` (tier 1) or the binding ADR below, it is **not** a source of acceptance criteria where a `docs/product/*` or `docs/execution/*` equivalent exists, and — most importantly — **recording this plan is not approval to execute any part of it.** Every gate named in §16 still stands unmet.

### Controlling cross-references

| Document | Standing | Relationship to this plan |
|---|---|---|
| [`docs/adr/ADR-MKT-001-workspace-operating-market-authority.md`](../adr/ADR-MKT-001-workspace-operating-market-authority.md) | **Approved — binding** (2026-07-16) | Settles the architecture this plan executes: `Tenant.country` never authorizes payment-method eligibility; `operatingMarket` is separate, nullable, operator-verified, and fails closed when unverified; no backfill. The ADR's approval covers the architecture decision and documentation governance **only** — it authorizes no implementation, migration, deployment, ERP provisioning, or Lebanon-catalog enablement. This plan must not be read as widening that scope. |
| [`docs/plans/FITDESK_WORKSPACE_OPERATING_MARKET_AUTHORITY_PLAN.md`](../archive/plans/2026-07-18-consolidation-20260718-170652/FITDESK_WORKSPACE_OPERATING_MARKET_AUTHORITY_PLAN.md) | Architecture-approved; execution phases still gated | The predecessor plan. **§3 below records this plan's corrections (C1–C12) against it and against the supplied program premise** — most consequentially C1, which finds that production's "safe state" is an accident of a swallowed ERP provisioning error rather than a product control. Where the two disagree on current state, §3 is the later evidence; where a conflict is material, §3's own rule applies — stop and ask for architect review rather than silently preferring the newer document. |

### Record semantics — the distinction this plan depends on

Phase 9 keeps two separate records, and conflating them would reintroduce the exact failure the design exists to prevent:

| Record | Role |
|---|---|
| **`PaymentCatalogOperation` + `PaymentCatalogMethodResult`** | **Authoritative current execution state.** The queryable truth of what was attempted, by which credential, on whose asserted authority, against which approved plan hash, and what each method actually did. This is what `GET /tenants/:id/payment-catalog/operations/:operationId` reads, and what a restarted worker resumes from. |
| **Append-only `AuditEvent` records** | **Transition and operator-history record.** Written alongside each transition as a secondary log of how the operation moved through its states and who asserted what. Rows are only ever appended, never updated in place. |

**Why the separation is load-bearing (D14).** Losing an `AuditEvent` row cannot manufacture a false success, because the operation row — not the log — is the truth. This is precisely why Phase 4's in-transaction audit (D2) must **not** be copied into Phase 9: Phase 4 is a single local write that one transaction can cover, whereas Phase 9 spans four services and **no Prisma transaction may stay open across an HTTP call**. Two different problems, two different mechanisms; §15 (D14) says plainly that they must not be unified.

**Residuals, recorded rather than smoothed over (§12).** "Append-only" describes the write discipline, not a database-enforced constraint — `AuditEvent` carries no append-only enforcement, so a database administrator could still edit rows. Separately, per D16, the recorded human name is an **asserted claim and never proof of who acted**: the admin key authenticates a shared service credential, not a person. Any closeout that presents that name as an authenticated identity is a misrepresentation, not evidence.

### On §18 and §19

Both describe the planning run that produced this document and are preserved verbatim as part of the record. §18's "Why it is not in the repo" states the position as of 2026-07-16; **this file is the fulfilment of §18's own recommendation**, persisted under the separate documentation-only change §18 asks for rather than smuggled into PR1 or PR2. §19's confirmations attest to that planning run — not to this one.

---

## 1. Context — why this plan exists, and what the audit changed

The program's goal is to offer six Lebanon-specific payment methods (Whish Money, OMT Pay, MyMonty, Suyool, Purpl, Bank Transfer — Fresh USD) **only** to workspaces whose operating market is authoritatively verified as Lebanon, with Cash remaining global. `ADR-MKT-001` (Approved, binding) settles the architecture: Control Plane owns a separate, nullable, operator-verified `operatingMarket`; `Tenant.country` stays a locale/Chart-of-Accounts seed and authorizes nothing; unverified fails closed.

**The audit invalidated the program's stated starting premise.** The supplied context says production is in a safe state — "Cash available, Lebanon-specific methods hidden, six Lebanon-specific methods remain held and unprobed." That is true of the *uncommitted Slice 2 worktree*. It is **not** true of production.

### The central finding

Production runs FitDesk at platform pin `615e56b`, whose payment catalog is the **Slice 1** catalog:

| id | ERP docname | `enabled` in production |
|---|---|---|
| `cash` | `Cash` | `true` |
| `whish_money` | `Whish Money` | **`true`** |
| `omt` | `OMT` | `false` |

Evidence: `git show 615e56b:lib/payments/methods.ts` → `PAYMENT_METHODS` at `:26-32`. There is **no `market` field and no market gate in production at all**.

`whish_money` is **not held by the product**. It is enabled, and `isEnabledPaymentMethod()` (`lib/payments/methods.ts`) returns `true` for it — so the write-side guard in `recordPayment` accepts it today. It is invisible in the selector for one reason only: the availability probe (`lib/payments/availability.ts:145-194`) cannot find an enabled, company-mapped `Whish Money` Mode of Payment on the tenant's ERP site.

**The "safe state" is an accident of a swallowed ERP provisioning error, not a product control.**

### Why the Mode of Payment is probably missing

`provisioning_api/provisioning_api/api/fitdesk_setup.py:_create_mode_of_payment` (`:550`) runs during every tenant provisioning as step 6 of `setup_fitdesk_schema` (`:107-112`). It creates, strictly in this order:

1. **Cash** — requires a leaf `Cash`-type account, no fallback (`:570-576`)
2. **Bank Transfer** — requires a leaf `Bank`-type account, **no fallback**; raises `ValueError` if absent (`:579-590`)
3. **Whish Money** — tries `Bank`, falls back to `Cash` (`:592-600`)

ERPNext's standard Chart of Accounts commonly creates `Bank Accounts` as a **group** with no leaf `Bank`-type child until a user adds one. `_get_account_for_company` (`:435`) requires `is_group: 0`. So step 2 raises, the exception propagates out of `_create_mode_of_payment`, and **step 3 never runs**. The raise is swallowed at `fitdesk_setup.py:107-112` (`errors.append(...)`, `results["mode_of_payment"] = {"error": ...}`) and provisioning reports success anyway — consistent with `verify_fitdesk_schema:763-765` ("Mode of Payment records are advisory... must not block tenants").

This is a hypothesis with strong supporting evidence, not a confirmed fact — the ERP is unreachable from this environment (`TENANT_PAYMENT_METHOD_PROVISIONING_EXECUTION_REPORT.md` §3 Blocker 4: `CONTROL_PLANE_URL` → localhost, HTTP 000; Docker not running). **It is Phase 1's first read-only verification.**

### What this changes about the program

1. **Anyone who creates a `Whish Money` Mode of Payment on that site makes it instantly live and completely ungated** — an operator, a re-run of `setup-fitdesk`, or Phase 9 itself. The ERP record *is* the switch.
2. Phase 9 must never precede the deployed market gate. The approved plan calls the 1–4 → 5–6 ordering "for cleanliness, not safety"; that is correct for the *market endpoint*, but the ERP-provisioning ordering is a **hard financial-safety constraint**, now proven rather than assumed.
3. **An ERP configuration freeze is required immediately** (Phase 1), covering the tenant's Modes of Payment and any re-run of `setup-fitdesk`.
4. Slice 2's `whish_money → enabled: false` flip is the program's **first real safety gain** — it converts an accidental hold into a product hold. It is not merely a refactor.

### Intended outcome

A verified-`LB` pilot workspace sees the seven-method catalog; every other workspace sees Cash only, makes zero Lebanon ERP probes, and cannot record a Lebanon method even by direct POST. Historical payment identity stays exact and market-independent everywhere.

---

## 2. Re-verified current state

All SHAs confirmed against GitHub with read-only `git ls-remote` (no fetch, no local ref mutation).

| Repo / worktree | Root | Branch | HEAD | origin/main | Status | Role |
|---|---|---|---|---|---|---|
| **FitDesk** | `axis-erp/FitDesk` | `main` | `ac4efa3` | `ac4efa3` ✅ remote-confirmed | 0/0. 3 untracked paths (expected) | Canonical product + Execution Kit source |
| **FitDesk Slice 2** | `axis-erp/FitDesk-payment-slice2` | `feat/tenant-aware-payment-slice-2` | `615e56b` | — | **17 modified + 1 untracked, uncommitted** | In-flight payment work — **do not disturb** |
| **fitdesk-platform** | `axis-erp/fitdesk-platform` | `main` | `96b7b92` | `96b7b92` ✅ remote-confirmed | Clean | Deployment superrepo (submodules) |
| **CP operating-market** | `axis-erp/control-plane-operating-market` | `feat/workspace-operating-market-authority` | `abd2c4b` | `abd2c4b` | Clean, no implementation | CP implementation worktree |
| **control-plane (canonical clone)** | `axis-erp/control-plane` | `feat/provisioning-reliability-v2` | `d3fa151` | `99aa186` **(stale)** | Clean; 5 ahead of a stale ref | **Stale — do not use** |
| **erp-execution-service** | `axis-erp/erp-execution-service` | `feat/provisioning-reliability-v2` | `2c43a86` | — | Clean, 0 ahead / 2 behind | Not changed by this program |
| **provisioning-agent** | `axis-erp/provisioning-agent` | `feat/provisioning-reliability-v2` | `37dbcee` | — | Clean, 0 ahead / 3 behind | Not changed by this program |
| **provisioning_api** | `axis-erp/provisioning_api` | `main` | `5c324cd` | `5c324cd` | Clean, all tracked | ERP-side; read-only reference |

**Platform submodule pins @ `96b7b92`:** `fitdesk` `615e56b` · `control-plane` `abd2c4b` · `erp-execution-service` `28a53eb` · `provisioning-agent` `d8d8f68` · `provisioning_api` `5c324cd` · `bench-agent` `de8e6c2` · `fitdesk-app` `ee3ce5c`.

**Applicable instructions:** workspace `axis-erp/CLAUDE.md` + `AGENTS.md`; `FitDesk/CLAUDE.md` (217 lines, tier 1); `FitDesk/docs/DOCUMENTATION_AUTHORITY_MAP.md`; `FitDesk/docs/execution/EXECUTION_KIT_SUBMODULE_POLICY.md`; `fitdesk-safe-autonomy` skill. **No `CLAUDE.md`/`AGENTS.md` exists in control-plane, fitdesk-platform, erp-execution-service, or provisioning-agent** — the workspace file is the only governing instruction there.

**Canonical commands:**

| Repo | Test | Lint | Typecheck | Build |
|---|---|---|---|---|
| FitDesk | `npm test` (vitest, 83 files) | `npm run lint` | **none** (`tsc --noEmit` manual only) | `npm run build:verify` |
| control-plane | `npm test` (`node:test` via tsx) | **none** | **none** | `npm run build` (tsc) |

---

## 3. Corrections to supplied assumptions

| # | Supplied claim | Verified reality | Impact |
|---|---|---|---|
| **C1** | "Production payment selector currently shows Cash only" / "safe state" / "Lebanon-specific methods hidden" | **Misleading.** True as an observation, false as a control. Production (`615e56b`) has `whish_money: enabled: true` with no market gate. It is hidden only because the ERP lacks the MoP — an accident. | **Critical.** Drives the Phase 1 ERP freeze and the Phase 9 ordering constraint. |
| **C2** | "Six Lebanon-specific methods remain held and unprobed" | True **only in the uncommitted Slice 2 worktree**, which is not deployed. Production holds exactly one method (`omt`), and offers `whish_money`. | Reframes Slice 2 from refactor to safety fix. |
| **C3** | Control Plane worktree "already created" from the canonical repo | The worktree hangs off the **fitdesk-platform submodule's** git dir (`fitdesk-platform/.git/modules/services/control-plane/worktrees/...`), not `axis-erp/control-plane`. Its `origin/main` (`abd2c4b`) **is** correct and remote-confirmed. | Phase 1/7 must use this worktree and treat `axis-erp/control-plane` as stale. |
| **C4** | (implied) `axis-erp/control-plane` is the canonical clone | **Stale.** Last fetched 2026-07-09; `origin/main` = `99aa186`; it does not even contain object `abd2c4b`. Its branch `feat/provisioning-reliability-v2` (5 commits) is **already merged** as PR #20 → `abd2c4b`. | Prevents branching from a stale base. Also corrects memory `provisioning_reliability_v2_pr1.md` ("unpushed" → merged). |
| **C5** | ADR §4.3 / plan §4.3: reuses "the module that **already** returns tenant metadata (`companyName`, `currency`) to FitDesk" | **Inaccurate.** `resolveTenantFromAuth()` (`erp-proxy.routes.ts:49-89`) resolves them *internally*; **no endpoint returns them as a body**. Only `currency` leaks out, via the two report endpoints. | Design still sound (the JWT path is real and in use); the "in-pattern extension" claim is weaker than stated. Record, don't re-litigate. |
| **C6** | (implied) Control Plane CI validates new tests | **False.** `npm test` = `tsx --test src/**/*.test.ts`; POSIX `sh` does not expand `**`, so it runs **4 of 19** test files. `src/modules/erp-proxy/*.test.ts` — the natural home for the new contract tests — **is in the excluded set**. `test:integration` targets a `tests/` dir that does not exist. | **Blocker.** Prerequisite PR0. |
| **C7** | (implied) migrations can be verified in CI | **False.** `.github/workflows/ci.yml` has no Postgres service. Migration behaviour is unverifiable in CI as configured. | Phase 2 must add a service or accept local-only validation. |
| **C8** | Plan §4.2: audit via "the existing helper (`control-plane/src/lib/audit.ts`)" | The helper is **fail-open** (`audit.ts:20-22` swallows write failures) and is **never enlisted in the caller's transaction** (`tenant.routes.ts:316-335` writes audit *after* commit). | Conflicts with Phase 4's "no false success event". Requires the in-transaction design below. |
| **C9** | (implied) Payment Slice 2 rebase carries conflict risk | **Zero conflicts.** `615e56b..ac4efa3` is 2 commits touching only 4 docs files; Slice 2 touches 17 code files + 1 different docs file. **No overlap.** | De-risks Phase 6. |
| **C10** | "no known non-cash method silently becomes Cash" | True for `methodId`/`methodLabel`. But `mapPaymentProvider` (`lib/erpnext/client.ts:223-228`) **still defaults unknown → `'cash'`** for `Payment.provider`, on the same object. `assembleStatement` never reads it, so no user-visible defect — but the lossy field is live. | Recorded in threat model; out of scope (Slice 2 §11, §18 item 4). |
| **C11** | (implied) `erpFetch` is bounded | **No timeout, no retry anywhere** in `lib/erpnext/`. Masked today (probe fans out to 1 read). Goes to **7 concurrent unbounded reads** the moment the LB methods go live. | New Phase 6 hardening item. |
| **C12** | Phase 9 is mainly about Modes of Payment | The real blocker is **accounts**. No "ensure account" helper exists in any repo; `_upsert_mode_of_payment` hard-fails without one (`fitdesk_setup.py:506-511`). Bank Transfer — Fresh USD needs a leaf USD `Bank` account that likely does not exist. | Reshapes Phase 9. |

---

## 4. Executive program strategy

**Critical path:** `P1 → PR0(CI) → P2 → P3 → P4 → P7a → P8a → P5 → P6 → P7b → P8b → P9`

Five decisions shape it:

1. **Freeze the ERP first (P1).** Until the market gate is deployed, creating a `Whish Money` MoP — or re-running `setup-fitdesk` — silently ships an ungated Lebanon method. This costs nothing and closes the program's largest live risk.
2. **Fix Control Plane CI before writing Control Plane code (PR0).** Otherwise every test Phases 2–4 write is theatre. Separate PR, so any newly-surfaced failures don't contaminate the feature review.
3. **Control Plane ships and deploys completely before FitDesk consumes it.** Two platform PRs, two deploys. FitDesk fails closed on a 404, so this is for rollback granularity and independent proof, not safety.
4. **P5 and P6 are one FitDesk PR.** Plan §4.6 is explicit: the `enabled` flip and the write-side market check must land together, or `isEnabledPaymentMethod()` silently stops gating. The resolver (P5) is the flip's precondition and lives in the same worktree. Splitting them means rebasing the audited work twice for no benefit.
5. **Phase 9 builds a narrow, allowlisted ERP payment-provisioning capability along the approved execution path** (`operator → Control Plane → provisioning-agent (pure relay) → ERP Execution Service → Frappe HTTP API → provisioning_api`). Manual/direct ERPNext configuration is **rejected** (D5) — it bypasses the Control Plane execution architecture. The generic ERP proxy is **rejected as a write path** — it has no DocType allowlist and rides the tenant's System Manager credential (B6). The cost is real and is accepted: four service repos plus an **ERPNext image rebuild** (B7).

**Parallelisable:** P2/P3/P4 authoring (one worktree, sequential commits, but reviewable together) · P5 resolver tests alongside P4 · Phase 9 runbook drafting during P8.
**Strictly sequential:** P1 → everything · PR0 → P2 · P4 → P7a → P8a → P5 · P6 → P7b → P8b → P9.

**Recorded blockers (do not block planning; do block execution):**

| ID | Blocker | Evidence needed | Fail-closed rule |
|---|---|---|---|
| **B1** | Pilot tenant's real ERP MoP state unknown | Read-only: does an enabled, company-mapped `Whish Money` MoP exist? | Assume it may exist. Freeze ERP. Do not flip anything on until verified. |
| **B2** | CP CI runs 4/19 test files | `ci.yml` + `package.json:8` | PR0 before any CP feature code. |
| **B3** | No Postgres in CP CI → migration untestable | `ci.yml` has no `services:` | Validate on a disposable local DB; add CI service in PR0. |
| **B4** | No leaf `Bank`/USD account on the tenant CoA (probable) | Read-only Account list for the company | Phase 9 creates accounts before MoPs, operator-approved. |
| **B5** | Settlement account mapping per method is an unmade accounting decision | Owner/accountant decision | Phase 9's **dry-run** produces the matrix; apply blocked until decided. |
| **B6** | CP ERP proxy has **no DocType allowlist**; tenant ERP user is System Manager | `erp-proxy.routes.ts:243`, `bench.py:793-794` | Standing security finding. **Rejected as the Phase 9 write path.** Separate hardening slice. |
| **B7** | **`provisioning_api` is baked into the ERPNext image**; changing it rebuilds and restarts the system of record for **every** tenant | `images/erpnext/Dockerfile.erpnext:32` (`COPY services/provisioning_api → apps/`), used by every `erpnext-*` container; bench-agent bakes the same app set and must stay identical | Phase 9 splits the ERPNext redeploy into its own platform PR where the new code is **inert** (no caller yet). Scheduled window + owner approval. |

---

## 5. Nine-phase master execution plan

> Every phase carries the same approval-gate ladder. Stated once, applies to all:
> **G-MUT** (before any mutation) · **G-COMMIT** · **G-PUSH** · **G-MERGE** · **G-DEPLOY** (before deployment / production mutation). Per workspace `CLAUDE.md` §4, schema/migration/payment/deployment/ERP phases are **CRITICAL** gates requiring explicit owner approval after seeing the risk. No phase self-approves the next.

---

### Phase 1 — Program preflight, state freeze, and ownership map

**Purpose.** Establish verified ground truth, protect the uncommitted Slice 2 work, and close the live ERP exposure (C1) before anything else moves.

**Current-state evidence.** §2 table (all remote-confirmed). Slice 2 = 17 modified + 1 untracked, uncommitted, unpushed. Production = `615e56b` with `whish_money: enabled: true` and no market gate.

**Scope.** Read-only verification; backup of Slice 2; ERP freeze declaration; ownership matrix; dependency graph; state ledger; rollback anchors.
**Out of scope.** Any code, schema, branch, or ERP change.

**Repositories.** All (read-only). **Branch/worktree.** None created.
**Files affected.** None. Artifacts land in the scratchpad, not the repos.

**Ordered tasks.**
1. Re-verify all SHAs via `git ls-remote` (no fetch).
2. **B1 verification (read-only, highest priority):** determine whether the pilot tenant's ERP has an enabled, company-mapped `Whish Money` Mode of Payment. Preferred: bring up the local stack (`npm run local:up` per workspace convention) and read via the existing proxy. Failing that, read the pilot tenant's provisioning job step output for `mode_of_payment: {"error": ...}` from the Control Plane DB **read-only**. Last resort: a single read-only production `GET`, owner-approved.
3. **Declare the ERP freeze** (see below) and record owner acknowledgement.
4. Back up Slice 2: `git diff HEAD --binary` → scratch patch; copy the untracked checkpoint doc; full directory copy of the worktree to scratch as belt-and-braces.
5. Record rollback anchors; publish the ownership matrix (§7) and dependency graph (§6).

**ERP freeze — the deliverable that matters.** Until the market-gated FitDesk build is live in production, the following are **prohibited without explicit owner approval**: creating/enabling any Mode of Payment on any tenant site; re-running `setup-fitdesk` / `setup_fitdesk_schema` for the pilot tenant; adding a leaf `Bank`-type account to the pilot company (it would let a later `setup-fitdesk` re-run succeed and create `Whish Money`); any tenant re-provisioning that includes step 6.

**Read-only preflight commands.**
```bash
git ls-remote --heads https://github.com/TazUae/fitdesk.git main
git ls-remote --heads https://github.com/TazUae/control-plane.git main
git ls-remote --heads https://github.com/TazUae/fitdesk-platform.git main
git -C FitDesk status --porcelain=v1
git -C FitDesk-payment-slice2 status --porcelain=v1
git -C FitDesk-payment-slice2 diff --stat HEAD
git -C fitdesk-platform submodule status
git -C control-plane-operating-market status --porcelain=v1
git show 615e56b:lib/payments/methods.ts     # production catalog
```

**Proposed mutation commands (not run).**
```bash
git -C FitDesk-payment-slice2 diff HEAD --binary > "$SCRATCH/slice2-tracked-$(date +%Y%m%d-%H%M%S).patch"
cp FitDesk-payment-slice2/docs/execution/TENANT_AWARE_PAYMENT_SLICE_2_CHECKPOINT.md "$SCRATCH/"
cp -r FitDesk-payment-slice2 "$SCRATCH/slice2-full-copy/"
```

**Tests / verification.** Patch re-applies cleanly to a scratch clone at `615e56b` (`git apply --check`). **Expected:** 17 files, +868/−161; `git status` in the real worktree byte-identical before and after.

**Stop conditions.** Any SHA mismatch vs §2 · Slice 2 diff ≠ 17 files/+868/−161 · backup fails to verify · B1 shows `Whish Money` **is** live in production (→ stop, escalate: an ungated Lebanon method is live).

**Rollback.** N/A (read-only). **Anchors recorded:** FitDesk `ac4efa3` · platform `96b7b92` · CP `abd2c4b` · Slice 2 base `615e56b`.

**Commit / PR.** None. **Docs.** None (findings → handoff artifact).
**Handoff artifact.** `PROGRAM_PREFLIGHT_LEDGER.md` (scratch): SHA table, B1 verdict, freeze acknowledgement, backup paths + checksums, anchors.
**Definition of done.** All SHAs re-verified; B1 answered with evidence; freeze acknowledged by owner; backup verified re-appliable; ledger published.
**Dependencies.** None. **Parallel:** B1 verification ∥ backup. **Sequential:** blocks every other phase.
**Risk: LOW** (execution) / **the B1 finding may be CRITICAL.**
**Isolation & financial safety.** Read-only. The freeze is itself the program's largest financial-safety control: it prevents an ungated Lebanon method going live via ERP configuration.

---

### Phase 2 — Control Plane operating-market data model and additive migration

**Purpose.** Add the authoritative, nullable market fields per ADR-MKT-001 §4.1. Purely additive; every existing row NULL; behaviour byte-identical until an operator acts.

**Current-state evidence.** `prisma/schema.prisma:34-70` — `Tenant`; `country String` required at `:46`; `updatedAt DateTime @updatedAt` at `:65`; **no version column anywhere**. `AuditEvent` at `:133-139` — 5 fields, **no index, no FK, no actor, no requestId**. 16 hand-authored migrations, convention `<YYYYMMDDHHMMSS>_<snake_case>`, applied via `migrate deploy` in the compose command (`docker-compose.prod.yml:115`), **not** in the Dockerfile (`Dockerfile:22`).

**Scope.** Four `Tenant` fields; `SUPPORTED_MARKETS` constant; two additive `AuditEvent` indexes; one additive migration; schema tests; docs.
**Out of scope.** Backfill (ADR-forbidden) · touching `country` · endpoints (P3/P4) · tenant activation (P8) · a `version` column (see decision D3).

**Repository.** control-plane. **Worktree.** `control-plane-operating-market` (exists) — **branch `feat/workspace-operating-market-authority`, base `abd2c4b`**. Do **not** use `axis-erp/control-plane` (C4).

**Files.** `prisma/schema.prisma` · `prisma/migrations/20260716000000_add_tenant_operating_market/migration.sql` (new) · `src/lib/markets.ts` (new) · `src/lib/markets.test.ts` (new) · `docs/` note.

**Data contract.**
```prisma
/// Authoritative operating market. NULL = unverified (fail closed).
/// Deliberately SEPARATE from `country` (a locale/CoA provisioning seed).
/// Never derived from country, timezone, phone, locale, IP, or currency.
/// See FitDesk docs/adr/ADR-MKT-001-workspace-operating-market-authority.md.
operatingMarket           String?    // ISO 3166-1 alpha-2, e.g. "LB"
operatingMarketSource     String?    // only "operator_verified" is defined today
operatingMarketVerifiedAt DateTime?
operatingMarketVerifiedBy String?    // operator identifier, for audit
```
**Invariants** (enforced in the P4 service, not the DB — see D4): all four NULL, or all four non-NULL · `operatingMarket ∈ SUPPORTED_MARKETS` · `operatingMarketSource === 'operator_verified'`.
`SUPPORTED_MARKETS = ['LB'] as const` — deliberately a real allowlist, unlike `country`'s 2-char check (`tenant.schemas.ts:28-33`). Start with `LB` only: it is the sole market with a defined catalog, and an allowlist that lists markets we cannot serve is a lie. **This closes C-drift**: the enforced allowlist moves to the authoritative side of the trust boundary (today `ALLOWED_COUNTRY_CODES` lives in FitDesk at `app/onboarding/actions.ts:14` while CP accepts any 2 letters).

**Additive `AuditEvent` indexes:** `@@index([tenantId])`, `@@index([type, createdAt])`. Rationale: P4 makes `AuditEvent` a queryable compliance record; today an unindexed table-scan. Additive, zero-risk, same migration.

**Ordered tasks.** 1) `src/lib/markets.ts` + tests. 2) Schema fields + doc comments. 3) `AuditEvent` indexes. 4) Hand-author `migration.sql` (matching convention — do **not** run `migrate dev` against a shared DB). 5) Validate on a **disposable** local Postgres. 6) Verify NULL landing on a seeded pre-migration row.

**Read-only preflight.**
```bash
git -C control-plane-operating-market status --porcelain=v1     # must be empty
git -C control-plane-operating-market log --oneline -1           # abd2c4b
ls control-plane-operating-market/prisma/migrations | tail -5
grep -n "operatingMarket" -r control-plane-operating-market/src control-plane-operating-market/prisma  # expect zero
```

**Proposed migration SQL (additive, reversible).**
```sql
ALTER TABLE "Tenant" ADD COLUMN "operatingMarket" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "operatingMarketSource" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "operatingMarketVerifiedAt" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN "operatingMarketVerifiedBy" TEXT;
CREATE INDEX "AuditEvent_tenantId_idx" ON "AuditEvent"("tenantId");
CREATE INDEX "AuditEvent_type_createdAt_idx" ON "AuditEvent"("type", "createdAt");
```
No `NOT NULL`, no `DEFAULT`, no `UPDATE`. **Zero backfill by construction.**

**Proposed validation (disposable DB only).**
```bash
# against a throwaway container, NEVER a shared/production DATABASE_URL
npx prisma migrate deploy
npx prisma migrate status
npm run build
npm test
```

**Expected outputs.** `migrate status` → all applied, no drift · pre-existing seeded row → all four columns NULL · `npm run build` exit 0 · `npm test` green (post-PR0).

**Approval gates.** **G-MUT: CRITICAL** — DB schema change (`CLAUDE.md` §4). G-COMMIT · G-PUSH · G-MERGE per §13. **G-DEPLOY belongs to P8, not here** — *generation ≠ validation ≠ deployment ≠ tenant activation.* These four are distinct and must never be collapsed.

**Stop conditions.** `migrate status` reports drift · any generated SQL contains `UPDATE`/`NOT NULL`/`DEFAULT` on the new columns · `DATABASE_URL` is not demonstrably disposable · any diff touches `country`.

**Rollback.** Pre-merge: delete the migration dir + revert schema. Post-deploy: **do not drop columns.** Four unread nullable columns are inert; a down-migration is strictly riskier than leaving them. Revert the *application* pin instead (P8 rollback). Record explicitly.

**Commit strategy.** 3 commits: `feat(markets): add SUPPORTED_MARKETS allowlist` · `feat(schema): add nullable operating-market fields to Tenant` · `feat(schema): index AuditEvent for market audit queries`.
**PR.** Part of the single CP PR (§13, PR1).
**Docs.** `control-plane/docs/` note pointing at ADR-MKT-001 as controlling.
**Handoff.** Migration validation log (disposable DB), NULL-landing proof.
**DoD.** Fields exist, nullable, undefaulted; migration additive + validated on a disposable DB; existing row lands NULL; build + tests green; no `country` diff.
**Dependencies.** P1; **PR0** (B2/B3). **Parallel:** `markets.ts` ∥ nothing. **Sequential:** blocks P3/P4.
**Risk: MEDIUM** — additive and all-NULL, but it is a production schema change.
**Isolation & financial safety.** No behaviour change. Every tenant stays exactly as today (Cash-only offer path untouched). No field is read by any code path until P3. No backfill means no tenant is retroactively granted a financial capability — the ADR's load-bearing point.

---

### Phase 3 — Control Plane tenant-scoped read contract

**Purpose.** Let a workspace read **only its own** authoritative market state, over the existing per-tenant JWT — never the admin god key.

**Current-state evidence.** `erp-proxy.routes.ts:49-89` `resolveTenantFromAuth()`: `jose` `jwtVerify`, **HS256 pinned** (`:64`), secret `env.FITDESK_JWT_SECRET`, claim `tenantId` (`:66-69`) = `Tenant.id` UUID, `findUnique` loads the **full row** (`:74`) → returning market is a shape change, not a new query. Status ladder: 401 missing/invalid · 404 not found · **403 inactive** (`:76`) · **503 unprovisioned credentials** (`:78`) · 503 if `FITDESK_JWT_SECRET` unset (`:53`). Errors via `withProxyError` (`:201-215`). Routes register **absolute paths on the shared singleton `app`** (no prefix plugin), side-effect-imported at `server.ts:6`. Test template: `erp-proxy.routes.test.ts` — `app.inject()`, Prisma stubbed via `Object.defineProperty`, no live DB.

**Scope.** One route: `GET /api/erp/tenant/market`. Contract tests.
**Out of scope.** Write path (P4) · returning `country` or credentials (ADR-prohibited) · any list-all · FitDesk changes (P5).

**Repository/worktree.** control-plane / `control-plane-operating-market`.
**Files.** `src/modules/erp-proxy/erp-proxy.routes.ts` (add route) · `src/modules/erp-proxy/erp-proxy.market.routes.test.ts` (new).

**API contract.**
```
GET /api/erp/tenant/market
Authorization: Bearer <FITDESK_JWT>          # HS256, claim { tenantId }
200 → { "operatingMarket": "LB", "verified": true,  "verifiedAt": "2026-07-20T10:00:00.000Z" }
200 → { "operatingMarket": null, "verified": false, "verifiedAt": null }
401 { error } missing/invalid/expired JWT
403 { error } tenant not active
404 { error } tenant not found
503 { error } ERP credentials unprovisioned | FITDESK_JWT_SECRET unset
```
`verified = operatingMarket !== null && operatingMarketSource === 'operator_verified'`. **Revoked is indistinguishable from never-verified by design** — both are NULL, both fail closed; distinguishing them would leak history to the tenant for no product gain.

**Design decision (D1): reuse `resolveTenantFromAuth()` unchanged.** Consequence, accepted and recorded: it **503s when ERP credentials are unprovisioned**, so market is unreadable before ERP provisioning completes → FitDesk fails closed → Cash only. Safe, and irrelevant in practice (Lebanon methods need a provisioned ERP anyway). *Alternative considered:* a credential-free `resolveTenantIdFromAuth()`. Rejected for MVP: more surface, no benefit, diverges from the approved plan. **Recorded risk:** `resolveTenantFromAuth` reads plaintext credential columns (`:77`, `:83-84`) rather than `readTenantErpCredentials()`; when the H1 encryption cutover lands, **every** `/api/erp/*` route including this one fails closed with 503. Pre-existing; this route inherits it.

**Ordered tasks.** 1) Add route beside the existing ones (absolute path, `withProxyError`). 2) Project **exactly three fields** — never spread the tenant row. 3) Tests. 4) Verify no `country`/credential leak by explicit negative assertion.

**Tests (each asserted individually).**
- 401: no header · malformed · wrong secret · expired.
- **Isolation:** JWT for tenant A ⇒ body reflects A. A JWT whose claim is B returns **B's** row — proving the claim, not a caller-supplied param, is the scope. **There is no route parameter to forge**; a tenant cannot request another tenant's market at all. Assert: no query/body/path input influences which row is read.
- 403 inactive · 404 unknown · 503 unprovisioned.
- NULL → `{ null, false, null }`; verified → `{ 'LB', true, <iso> }`.
- **Negative leak assertion:** `assert.deepEqual(Object.keys(body).sort(), ['operatingMarket','verified','verifiedAt'])` and `assert.ok(!('country' in body) && !('erpApiKey' in body) && !('erpApiSecret' in body) && !('erpSite' in body))`.

**Attack cases proven.** (a) Forged `tenantId` claim → requires `FITDESK_JWT_SECRET`; if held, the attacker already owns every `/api/erp/*` route — **this route adds no new capability** (recorded in §12 as a pre-existing systemic weakness, not one this phase introduces). (b) Tenant A guesses B's UUID → **no input accepts it**. (c) `alg: none` / RS256 confusion → blocked by the pinned `algorithms: ["HS256"]` (`:64`). (d) Expired token → rejected by `jose` default `exp` handling.

**Caching / retries / timeouts.** None server-side (single indexed PK read). **Caching is FitDesk's job (P5)** and must include market in the key.
**Observability.** Reuse pino; log `{ reqId, tenantId, verified }`. **Never log the market value's provenance or the JWT.** Redaction already configured (`logger.ts:6-22`).

**Gates.** G-MUT (new FitDesk-facing contract) · G-COMMIT · G-PUSH · G-MERGE.
**Stop conditions.** Any response key beyond the three · any `country` in the body · route reachable without a valid JWT · any caller-supplied tenant selector.
**Rollback.** Revert the commit; the route is purely additive and unreferenced until P5.
**Commit.** `feat(erp-proxy): add tenant-scoped GET /api/erp/tenant/market`.
**PR.** CP PR1. **Docs.** Contract block in `control-plane/docs/`.
**Handoff.** Contract test output + the negative-leak assertion.
**DoD.** Route live behind the JWT; three fields only; all attack cases tested; tests actually run in CI (requires PR0).
**Dependencies.** P2 (fields), PR0 (CI). **Parallel:** with P4 authoring. **Sequential:** blocks P5.
**Risk: LOW–MEDIUM.**
**Isolation & financial safety.** Read-only. Scope is the JWT claim, not a parameter — structurally unforgeable without the secret. Returns no credential and no `country`. Grants nothing: a `verified: true` response is necessary but not sufficient (the ERP preflight still gates).

---

### Phase 4 — Control Plane operator grant/change/revoke and durable audit

**Purpose.** The privileged, audited, human-owned write path. Revocation ships **with** grant — a mis-verification must be undoable without a database console.

**Current-state evidence.** `requireInternalApiKey` (`src/middleware/require-internal-api-key.ts:15-35`): header is **`Authorization: Bearer <key>`** (not a custom header), constant-time `safeEqual` (`:9-13`), 401 missing / **403 invalid** (`:31-34`). **`tenant.service.ts` is read-only — no `updateTenant`, no `PATCH /tenants/:id` exists anywhere.** This write path is entirely net-new. `$transaction` precedent: `tenant.routes.ts:268-310` (interactive). `writeAuditEvent` (`src/lib/audit.ts:6-23`) is **fail-open** and written **after** commit (`tenant.routes.ts:316-335`). Request ID: `app.ts:14` honours inbound `x-request-id` else mints a UUID; **never persisted into `AuditEvent`**.

**Scope.** `POST` grant/change · `DELETE` revoke · in-transaction audit · operator runbook.
**Out of scope.** **No trainer-facing settings toggle** (explicitly excluded from MVP) · no self-declaration tier (`operatingMarketSource` is designed to carry it later) · no evidence upload · no `country` write path.

**Repository/worktree.** control-plane / `control-plane-operating-market`.
**Files.** `src/modules/tenants/tenant.routes.ts` (add 2 routes) · `src/modules/tenants/tenant.schemas.ts` (add schema) · `src/modules/tenants/operating-market.service.ts` (new) · `src/modules/tenants/operating-market.routes.test.ts` (new) · `docs/runbooks/OPERATING_MARKET_VERIFICATION.md` (new).

**API contract.**
```
POST /tenants/:id/operating-market      preHandler: [requireInternalApiKey]
body { "market": "LB", "verifiedBy": "<operator-id>" }     # zod: enum(SUPPORTED_MARKETS), min(1)
200 { "tenantId", "operatingMarket": "LB", "operatingMarketSource": "operator_verified",
      "operatingMarketVerifiedAt": "<iso>", "operatingMarketVerifiedBy": "<id>", "changed": true|false }
400 invalid body · 401 no key · 403 bad key · 404 unknown tenant · 422 unsupported market

DELETE /tenants/:id/operating-market    preHandler: [requireInternalApiKey]
body { "verifiedBy": "<operator-id>" }
200 { "tenantId", "operatingMarket": null, "changed": true|false }
```
**Idempotency.** Re-granting the identical market → `changed: false`, no field write, **audit still emitted** (the operator's re-affirmation is itself a fact worth recording). Revoking an already-NULL market → `changed: false`. Neither is an error.

**Design decision (D2): audit inside the transaction.** The user's requirement — *"durable audit mechanism… no false success event"* — is **incompatible with the existing helper** (C8): it is fail-open and post-commit, so a committed grant can silently have no audit row. Therefore:
```ts
await prisma.$transaction(async (tx) => {
  const before = await tx.tenant.findUnique({ where: { id }, select: MARKET_FIELDS })
  if (!before) throw new NotFound()
  const changed = before.operatingMarket !== market
  if (changed) await tx.tenant.update({ where: { id }, data: { ...marketFields } })
  await tx.auditEvent.create({ data: {                 // NOT writeAuditEvent() — must not be fail-open
    type: 'tenant.operating_market.verified',
    tenantId: id,
    payload: {
      requestId,
      authenticatedServiceIdentity: 'control-plane-admin-key',  // WHAT was authenticated (D16)
      assertedHumanOperator: verifiedBy,                        // CLAIMED human — NOT authenticated
      changed, before, after,
    },
  }})
})
```
**Identity semantics (D16).** `requireInternalApiKey` authenticates a **shared service credential**, not a person. `verifiedBy` / `operatingMarketVerifiedBy` is therefore an **asserted, unauthenticated claim** — anyone holding `CONTROL_PLANE_API_KEY` can write any name into it. The audit payload must keep the two separate and the schema comment must say so plainly:
```prisma
operatingMarketVerifiedBy String?   // ASSERTED operator identity — NOT authenticated.
                                    // The admin key authenticates a service credential, not a
                                    // person. Treat as a claim recorded alongside the request,
                                    // never as proof of who acted. See D16.
```
This keeps the ADR's field spec intact (it says "operator identifier, for audit" — it never claimed authentication) while removing the overstatement. **No ADR supersession needed.** Per-operator credentials would be a separate hardening slice.
Audit failure ⇒ transaction rollback ⇒ **no grant without its audit row, ever**. The existing fail-open `writeAuditEvent` stays untouched for its current callers (out of scope). `AuditEvent.payload` is `Json`, so `requestId` / `actor` / `before` / `after` need **no migration** — only the P2 indexes.

**Design decision (D3): no optimistic-locking column.** No `version` field exists anywhere (`schema.prisma`), so adding one is a schema change with migration cost. Operator writes are rare, human-serialized, and every write emits a full before/after audit row — last-write-wins is therefore *auditable*, and the reconstructable history is the real control. The read-modify-write sits inside a single interactive transaction, so no torn state. *Alternative recorded:* compare-and-set on `updatedAt`, or a `version Int @default(0)`. Adopt only if concurrent operator writes ever become real. **Recommended default: no version column.**

**Design decision (D4): invariants in the service, not the DB.** A four-column CHECK constraint would be a non-additive migration on a live table. The service is the only writer, and the invariants are asserted by tests. *Alternative:* add the CHECK later, once the columns have proven stable.

**Ordered tasks.** 1) `OperatingMarketSchema` (zod enum over `SUPPORTED_MARKETS` + `verifiedBy.min(1)`). 2) `operating-market.service.ts` — the transaction above. 3) Both routes on `tenant.routes.ts`, `preHandler: [requireInternalApiKey]`, `requestId = String(req.id)`. 4) Tests. 5) Runbook.

**Tests.** No key → 401 · bad key → 403 (assert the **403**, not 401 — that is this guard's actual shape) · unsupported market (`"XX"`, `"lb"`, `""`, `"USA"`) → 422 · valid grant → all four fields set + exactly one audit row with `before`/`after`/`actor`/`requestId` · idempotent re-grant → `changed:false`, fields untouched, audit still written · change `LB`→(future market) → audit shows the transition · revoke → all four NULL + audit · revoke when already NULL → `changed:false` · **404 unknown tenant emits no audit row** · **simulated audit-write failure ⇒ tenant row unchanged** (the "no false success event" proof) · `verifiedBy` empty → 400.

**Gates.** **G-MUT: CRITICAL** — new authorization surface granting a financial capability. G-COMMIT · G-PUSH · G-MERGE. **Using the endpoint against a real tenant is P8, separately gated.**
**Stop conditions.** Audit write outside the transaction · fail-open audit on this path · any inference of market from `country`/timezone/locale/phone/IP/currency/company name · market accepted from anywhere but the operator body · route not behind `requireInternalApiKey`.
**Rollback.** Revert commits. Operationally, `DELETE` **is** the rollback — that is why it ships with grant.
**Commits.** `feat(tenants): add operating-market zod schema` · `feat(tenants): add operator grant/revoke with in-transaction audit` · `docs(runbooks): operating-market verification standard`.
**PR.** CP PR1.

**Operator runbook — the half that isn't code** (ADR §7; plan §7). Must state: **required evidence** — a direct, recorded confirmation from the trainer that the business operates in Lebanon; **explicitly not evidence** — timezone, phone prefix, locale, IP, currency, company/site name, `Tenant.country`, ERPNext `Company.country` (this list *is* the ADR's point); who may verify; where evidence is retained; how revocation is triggered; that market is **necessary, not sufficient** (ERP preflight still gates).

**Handoff.** Test output incl. the audit-rollback proof; the runbook.
**DoD.** Grant/change/revoke behind the admin key; supported-market allowlist enforced server-side; every write atomically audited with actor + requestId + before/after; idempotent; revoke tested; runbook merged.
**Dependencies.** P2. **Parallel:** with P3. **Sequential:** blocks P7a.
**Risk: MEDIUM.**
**Isolation & financial safety.** Admin-key-gated; per-tenant by path param; grants no money movement — only *eligibility*, which the ERP preflight still gates. Fails closed: a rejected/failed grant leaves NULL. Audit is atomic with the grant, so the trail cannot silently diverge from the state.

---

### Phase 5 — FitDesk tenant market resolver and server-side policy gate

> **P5 and P6 are one PR** (§4 strategy #4). P5 = the resolver and gate mechanics; P6 = reconciliation and the `enabled` flip. They are separate commits, not separate PRs — plan §4.6 forbids splitting the flip from the gate.

**Purpose.** Resolve the workspace's market server-side, fail closed on every failure, and filter **before** any Lebanon ERP probe.

**Current-state evidence.** `lib/tenant/` exists with exactly one file, `context.ts` (`TenantContext = { userId, slug, tenantId, provisioningStatus, lastSyncedAt }` — **no country/market**). **`lib/tenant/market.ts` and `lib/tenant/cp-jwt.ts` do not exist.** `signTenantJwt()` (`lib/erpnext/client.ts:92-106`) is **module-private**, signs `{ tenantId }` only, HS256, `exp 5m`, secret `FITDESK_JWT_SECRET`; base URL `CONTROL_PLANE_URL` (`:126`). `lib/controlplane/client.ts`: **`getTenant` (`:88`) and `listTenants` (`:92`) are confirmed dead code — zero call sites** (grep-verified); both ride `CONTROL_PLANE_API_KEY`, the god key that also reaches `GET /tenants/:id/erp-credentials`. `erpFetch` has **no timeout and no retry** (C11). Cache key `availability.ts:135` = `` `${p.tenantId}|${p.company}|${p.currency}|${CONFIG_VERSION}` `` — **no market**. `CatalogEntry` (`:88-95`) **drops `market`** during the `PAYMENT_METHODS.map` (`:111-117`). `ResolveAvailabilityParams` (`:58-62`) has no market field. **Existing CP client/proxy code to reuse:** yes — `signTenantJwt` + `erpFetch`'s path-rewrite pattern (`:143-145`). Reuse `signTenantJwt`; **do not** reuse `lib/controlplane/client.ts` (god key — ADR-prohibited).

**Scope.** Extract `signTenantJwt` → `lib/tenant/cp-jwt.ts` · new `lib/tenant/market.ts` · thread market through `availability.ts` (param, catalog projection, cache key, filter) · write-side gate · bounded probe timeout · delete the dead god-key exports.
**Out of scope.** The `enabled` flip (P6) · any historical-readback filtering (ADR-prohibited) · `mapPaymentProvider` (C10) · onboarding `country` provenance fix · country-list consolidation.

**Repository/worktree.** FitDesk / **`FitDesk-payment-slice2`** (exists) — after the P6 rebase. **Files.** `lib/tenant/cp-jwt.ts` (new) · `lib/tenant/market.ts` (new) · `lib/erpnext/client.ts` (import the moved helper; bounded probe timeout) · `lib/payments/availability.ts` · `actions/invoices.ts` · `actions/packages.ts` · `lib/billing/package-assignment-service.ts` · `lib/controlplane/client.ts` (delete 2 exports) · tests.

**Contract (client side).**
```ts
// lib/tenant/market.ts — server-only
export async function resolveWorkspaceMarket(): Promise<{ market: string | null; verified: boolean }>
```
**Fails closed on every path** — no tenant context · non-200 · timeout · malformed body · network error · unparseable JSON → `{ market: null, verified: false }`. **Never throws into the payment path. Never assumes LB.** Own `AbortController` timeout (new code, zero blast radius). Short TTL cache keyed by `tenantId`, mirroring the existing 60s pattern.

**The `enabled`/`market` split.** `enabled` = product kill switch. `market` = eligibility. Two orthogonal gates, neither overloaded.

**Ordered tasks.**
1. **Mechanical:** move `signTenantJwt` → `lib/tenant/cp-jwt.ts`, export it, re-import in `lib/erpnext/client.ts`. No behaviour change.
2. `lib/tenant/market.ts` — resolver + fail-closed + TTL cache + timeout.
3. `CatalogEntry` gains `market`; carry it through the projection at `:111-117`.
4. `ResolveAvailabilityParams` gains `market: string | null`, **resolved server-side in `actions/invoices.ts` — never client-supplied**.
5. **The filter, at `availability.ts:155`** — the existing `candidates` line, after the single list call, **before any `getModeOfPaymentDoc`**:
   ```ts
   const candidates = CATALOG.filter(
     (c) => c.productSupported && (c.market === 'global' || c.market === params.market)
   )
   ```
   Non-LB and unverified tenants therefore make **zero** Lebanon detail probes — structurally, not by convention.
6. **Cache key must include market** (`:135`). Not an optimisation: without it a **revocation** is ignored for a full TTL.
7. **The §4.6 write-side gate.** `isEnabledPaymentMethod()` (`methods.ts:103-106`) is **synchronous with zero tenant context** and is the guard at `actions/invoices.ts:223` (`recordPayment`), `:409` (`collectPayment`), `actions/packages.ts:64`, `lib/billing/package-assignment-service.ts:210`. It blocks the six today **only because they are globally `enabled: false`**. The moment P6 flips them, **it silently stops being market-aware.** Therefore `recordPayment`/`collectPayment` must **re-resolve the market and reject an ineligible method before any ERP write** — the same defence-in-depth shape Slice 1 established. `assignPackage`'s Paid Now path defers to the invoice flow and inherits the gate; assert that with the existing source-level test (`components/clients/__tests__/assign-package-source.test.ts:69`) or gate it explicitly.
8. **Bounded probe timeout (C11).** Own commit. `erpFetch` has no timeout; the probe fan-out goes **1 → 7 concurrent unbounded reads** when the LB methods go live. Add an optional bounded timeout with a generous default (≈10s) so no existing call changes behaviour except unbounded → bounded.
9. Delete `getTenant`/`listTenants` from `lib/controlplane/client.ts` (plan §9) so the god-key path can't be casually re-adopted.

**Tests.** Resolver fails closed on 404 / 500 / 503 / timeout / malformed body / no tenant context — **each asserted individually** · verified `LB` → the six become candidates **and are** probed · non-`LB` → **assert `getModeOfPaymentDoc` was never called with each of the six docnames** · NULL/unverified → same as non-LB · `LB` + failing ERP checks → still unavailable (necessary ≠ sufficient) · **Cash unaffected in every case** · cache key includes market; a revocation takes effect on the next probe · **write-side: non-LB workspace POSTing `mymonty` → rejected before any ERP call** · historical readback stays exact and market-independent · tenant/company/currency isolation.

**Verification.** `npm test` · `npm run lint` · `npx tsc --noEmit` diffed against the `main` baseline (**21 pre-existing errors; require zero new**) · `npm run build:verify`.
**Gates.** **G-MUT: CRITICAL** — payment logic (`CLAUDE.md` §4). G-COMMIT · G-PUSH · G-MERGE (with P6).
**Stop conditions.** Market read from `country`/timezone/locale/phone/IP/currency/company name · market client-supplied · market read via `CONTROL_PLANE_API_KEY` · resolver throws into the payment path · any Lebanon probe on a non-LB tenant · cache key without market · flip without the write-side gate.
**Rollback.** Revert commits; resolver is inert until the filter is wired.
**Commits.** `refactor(tenant): extract signTenantJwt into lib/tenant/cp-jwt` · `feat(tenant): add fail-closed workspace market resolver` · `feat(payments): gate availability by operating market before ERP probes` · `feat(payments): enforce market on the payment write path` · `fix(erpnext): bound ERP probe requests with a timeout` · `chore(controlplane): remove unused god-key tenant reads`.
**PR.** FitDesk PR2 (with P6). **Docs.** Update the Slice 2 checkpoint; cross-reference ADR-MKT-001.
**Handoff.** Test matrix output; the "zero Lebanon probes when non-LB" proof.
**DoD.** Resolver fails closed on every path; filter precedes every detail read; cache keyed by market; write-side gate live; Cash unaffected; historical readback untouched; no god key on the payment path.
**Dependencies.** P3 + P4 merged **and deployed** (P7a/P8a); P6's rebase. **Parallel:** resolver tests ∥ P4. **Sequential:** blocks P6's flip.
**Risk: MEDIUM** alone; **HIGH** combined with P6.
**Isolation & financial safety.** Market resolves from the tenant-scoped JWT (`tenantId` claim), never a client value, never the god key. Every failure ⇒ Cash-only, never a wrong offer. Filtering precedes ERP reads, so ineligible tenants are structurally unprobeable. The write-side gate means a forged POST cannot record a Lebanon method. Historical readback is untouched: a non-LB workspace still resolves a historical MyMonty payment exactly.

---

### Phase 6 — Reconcile and close Payment Slice 2

**Purpose.** Land 868 lines of audited work without losing it, and convert the six temporary global holds into real market gating — **without ever making a Lebanon method globally enabled**.

**Current-state evidence.** Worktree `FitDesk-payment-slice2`, branch `feat/tenant-aware-payment-slice-2`, base `615e56b`, **17 modified + 1 untracked, uncommitted**. Catalog (`lib/payments/methods.ts:67-89`): 7 entries; `cash` global/enabled; six `market: 'LB'`, **all `enabled: false`**; **OMT: `omt` → `'OMT Pay'`** ✅ matches the required table; **Bank Transfer — Fresh USD → `'Bank Transfer - Fresh USD'`** (ASCII hyphen in the docname, em dash in the label — deliberate, must not be "tidied"); **no `mobile_wallet_other` entry**; **no `usdt` entry** (`SettlementAsset` has a `'USDT'` value but nothing maps to it). Unknown-value behaviour: `erpModeToPaymentMethod` (`methods.ts:163-168`) → `null`; `normalizePayment` (`client.ts:304-314`) sets `methodId: null`, `methodLabel = raw.mode_of_payment` **verbatim — never Cash**. `assembleStatement.ts:132` renders `methodLabel`. Checkpoint declares **PARTIAL**, §13 = the architecture gap this program closes, §14 items 13–15 = "not testable — no code path exists", §18 = 6 open items.

**Rebase risk: ZERO (C9, verified).** `615e56b..ac4efa3` = 2 commits touching only `docs/DOCUMENTATION_AUTHORITY_MAP.md`, `docs/adr/ADR-MKT-001…`, `docs/architecture/14_…`, `docs/plans/FITDESK_WORKSPACE…`. Slice 2 touches 17 code files + `docs/execution/TENANT_AWARE_PAYMENT_SLICE_2_CHECKPOINT.md`. **No overlapping path.**

**Scope.** Backup → commit → rebase → P5 work → flip the six → full matrix → checkpoint update → PR.
**Out of scope.** `mobile_wallet_other` (**no exact tenant-admin provider contract exists** — out of scope until one does) · `usdt` (**stays disabled; absent from the union by construction**) · `mapPaymentProvider` (C10) · `PaymentProvider`/`PaymentMethod` enum reconciliation.

**Repository/worktree.** FitDesk / `FitDesk-payment-slice2`. Branch `feat/tenant-aware-payment-slice-2`, **rebased onto `main` (`ac4efa3`)**.

**Ordered tasks.**
1. **Backup first** (P1 artifact re-verified): patch + full copy in scratch.
2. **Commit the audited work as-is, before touching anything.** `git rebase` requires a clean tree, so this is mandatory, not optional — and a commit on an unpushed local branch is a far better backup than a patch file. **G-COMMIT.**
3. **Conflict audit:** `git rebase --onto ac4efa3 615e56b` → expect zero conflicts (C9). If any conflict appears in a code file, **stop** — the premise is wrong.
4. Apply P5 commits.
5. **The flip — last, and only after the resolver is verified.** Restore `enabled: true` on the six. `enabled` reverts to its real meaning; `market` carries eligibility. **The flip and the write-side gate are the same commit** (§4.6).
6. Canonical seven-method catalog verified byte-exact against the required table (below).
7. Update the checkpoint: PARTIAL → resolved; cross-reference ADR-MKT-001 and this plan; supersede §13/§14/§18 items 1–2.

**Canonical catalog — must match exactly.**

| Internal ID | UI label | Exact ERP Mode of Payment | market |
|---|---|---|---|
| `cash` | Cash | `Cash` | global |
| `whish_money` | Whish Money | `Whish Money` | LB |
| `omt` | OMT Pay | `OMT Pay` | LB |
| `mymonty` | MyMonty | `MyMonty` | LB |
| `suyool` | Suyool | `Suyool` | LB |
| `purpl` | Purpl | `Purpl` | LB |
| `bank_transfer_fresh_usd` | Bank Transfer — Fresh USD | `Bank Transfer - Fresh USD` | LB |

**The guarantee that no Lebanon method becomes globally enabled.** Three independent, individually sufficient structural controls, each with a test:
1. **Ordering.** The flip is the *last* commit, gated on the resolver's tests passing. Before it, `productSupported: false` ⇒ never a candidate ⇒ never probed.
2. **The filter precedes the flip's effect.** After the flip, `productSupported: true`, but `availability.ts:155` requires `c.market === 'global' || c.market === params.market`. `params.market` is `null` for every unverified tenant ⇒ six filtered out ⇒ zero probes.
3. **The write-side gate.** Even a forged POST is rejected before any ERP write.
Plus a **fourth, external** control: no tenant is verified `LB` until P8's deliberate operator act. At merge time, **every tenant in the system is NULL**, so the flip's blast radius at deploy is provably zero.

**Mobile selector behaviour.** `InvoicesView.tsx` already carries the Slice 2 CSS fix (`flex` → `flex flex-wrap`, `min-w-[100px]`) so 7 buttons wrap on a phone. Mobile-first (`CLAUDE.md`): verify at 375px. A non-LB tenant renders exactly 1 button — unchanged from today.

**Tests.** Full Slice 2 suite green (**baseline 2,514**) · targeted (**baseline 899**) · plus every P5 test · plus: catalog byte-exact vs the table · six are `market: 'LB'` · `cash` is `global` · **no `mobile_wallet_other` id exists** · **no `usdt` id exists** · unknown ERP value → `methodId: null` + raw label preserved, **never Cash** · audit identity exact per method · **`whish_money` `enabled: true→false→true` net effect vs `615e56b` is documented and intentional** (see below).

**The `whish_money` regression — must be surfaced, not buried.** Slice 2 flips `whish_money` `true → false`; P6 flips it back to `true` with `market: 'LB'`. Net vs production (`615e56b`): **`whish_money` goes from globally enabled/ungated → LB-gated.** That is the program's core safety gain. **But** if B1 shows Whish Money is *currently live and in use* on the pilot tenant, then post-deploy it disappears until the tenant is verified `LB` (P8) — a **user-visible regression requiring explicit owner sign-off**. B1 must be answered before this PR merges.

**Verification.** `npm test` · `npm run lint` · `npx tsc --noEmit` (zero new vs 21 baseline) · `npm run build:verify` · `git diff --stat` reviewed hunk-by-hunk for ownership.
**Gates.** G-MUT (already committed at task 2) · **G-COMMIT: CRITICAL** (payment logic) · G-PUSH · **G-MERGE: CRITICAL**.
**Stop conditions.** Any conflict in a code file during rebase (C9 says there should be none) · the flip landing without the write-side gate · any Lebanon method `enabled: true` with `market: 'global'` · `mobile_wallet_other` or `usdt` appearing · catalog deviating from the table · full suite below 2,514 · any new `tsc` error · B1 unanswered.
**Rollback.** Pre-push: `git reset --hard <commit>` **on this local unpushed branch only** (never on a shared branch). Post-merge: `git revert` the merge commit → catalog returns to the six-held state. The backup patch is the last resort.
**Commit strategy.** C1 `feat(payments): tenant-aware payment catalog with exact identity` (the audited 868 lines, verbatim) · C2–C6 the P5 commits · C7 `feat(payments): enable Lebanon catalog behind the operating-market gate` (**the flip + the write-side gate, together**) · C8 `docs(execution): close out payment slice 2`.
**PR.** FitDesk PR2 (§13). **Review focus:** C7 is the whole review — flip and gate must be inseparable.
**Docs.** Checkpoint updated to resolved; ADR-MKT-001 code-review checklist walked line by line.
**Handoff.** Updated checkpoint + full test output + the `tsc` baseline diff.
**DoD.** Rebased conflict-free; catalog byte-exact; six LB-gated not globally enabled; write-side gate atomic with the flip; 2,514+ green; zero new `tsc` errors; checkpoint closed; B1 answered.
**Dependencies.** P1 (backup), P5, P8a (CP deployed). **Parallel:** doc updates. **Sequential:** blocks P7b.
**Risk: HIGH** — payment logic, uncommitted audited work, and the §4.6 trap.
**Isolation & financial safety.** Four independent controls (above) prevent global enablement. Every tenant is NULL at merge ⇒ deploy blast radius provably zero. Historical readback is explicitly untouched — market gates *new* selection only. Exact identity preserved: unknown ERP text never becomes Cash.

---

### Phase 7 — Repository PR sequence, merge order, and platform reference updates

**Purpose.** Integrate through Git in an order that is safe, provable, and revertable at each step.

**Current-state evidence.** Platform `main` `96b7b92`, pins per §2. **fitdesk-platform has no CI at all** (no `.github`). Submodule policy (`FitDesk/docs/execution/EXECUTION_KIT_SUBMODULE_POLICY.md`): canonical source is `FitDesk/`; **never hand-edit `fitdesk-platform/services/fitdesk`**; a lagging pin is not a bug; the bump is a **separate, deliberately-reviewed PR**, not a side effect. Deploy: Dokploy Compose app on `main` → `docker-compose.prod.yml`, cloned `--recurse-submodules` (`docs/RUNBOOK.md:28-62`).

**Scope.** Five PRs across three repos, in a fixed order — the **gate**. Phase 9's capability adds six more (PR5–PR9b) across four further repos; see §13 for the combined map.
**Out of scope of P7 specifically.** The Phase 9 capability PRs (PR5–PR9b) — they merge **after** P8c, not here. **bench-agent and fitdesk-app are untouched by the entire program**; `bench-agent`'s image is rebuilt only to keep its baked app set identical to the ERPNext image (B7), with **no source change**.

**The PR map.**

| # | Repo | Branch | Base | Contents | Merge prereq |
|---|---|---|---|---|---|
| **PR0** | control-plane | `fix/cp-ci-test-glob` | `main` `abd2c4b` | Fix `npm test` glob (B2); add Postgres service to `ci.yml` (B3) | Green CI; **any newly-surfaced failures triaged first** |
| **PR1** | control-plane | `feat/workspace-operating-market-authority` | `main` | P2 + P3 + P4 (8 commits) | PR0 merged; owner approval (CRITICAL: schema + authz) |
| **PR2** | FitDesk | `feat/tenant-aware-payment-slice-2` | `main` `ac4efa3` | P5 + P6 (8 commits) | PR1 merged **and deployed** (P8a); B1 answered; owner approval (CRITICAL: payment) |
| **PR3** | fitdesk-platform | `chore/bump-control-plane-operating-market` | `main` | `services/control-plane` `abd2c4b` → PR1 merge SHA | PR1 merged |
| **PR4** | fitdesk-platform | `chore/bump-fitdesk-payment-slice-2` | `main` | `services/fitdesk` `615e56b` → PR2 merge SHA | PR2 merged; P8a healthy |

**Merge order and why.** `PR0 → PR1 → PR3 → [deploy+verify P8a] → PR2 → PR4 → [deploy+verify P8b] → P9`.
- PR0 first: otherwise PR1's tests never run (B2) — the review would be meaningless.
- PR1 before PR2: FitDesk must not depend on an unmerged contract. (FitDesk 404ing fails closed, so this is *cleanliness*, not safety — per plan §5.)
- **PR3 deployed and verified before PR2 merges**: this *is* a safety property — it proves the CP contract in isolation, on real infrastructure, before payment code depends on it.
- **Two platform PRs, not one.** `control-plane-api`'s command is `sh -lc "npx prisma migrate deploy && npm run start:api"` (`docker-compose.prod.yml:115`), so the API won't serve until the migration completes, and FitDesk fails closed regardless — a combined deploy would be *safe*. Two PRs are still better: independent verification, independent rollback, smaller blast radius per deploy. Recorded alternative: one combined bump, if deploy windows are scarce.

**Platform bump procedure (PR3 shown; PR4 identical with `services/fitdesk`).**

*Preflight (read-only):*
```bash
git -C fitdesk-platform status --porcelain=v1        # must be empty
git -C fitdesk-platform submodule status
git ls-remote --heads https://github.com/TazUae/control-plane.git main   # the target SHA
```
*Proposed (not run):*
```bash
git -C fitdesk-platform checkout main && git -C fitdesk-platform pull --ff-only
git -C fitdesk-platform checkout -b chore/bump-control-plane-operating-market
git -C fitdesk-platform/services/control-plane fetch origin main
git -C fitdesk-platform/services/control-plane checkout <PR1-merge-sha>
git -C fitdesk-platform add services/control-plane
git -C fitdesk-platform submodule status               # VERIFY: only this pin moved
git -C fitdesk-platform diff --cached                  # VERIFY: one line, one gitlink
```
**Caution (C3):** `control-plane-operating-market` is a registered worktree of **this submodule's git dir**. Checking out a new SHA in the submodule is safe (different worktree), but **never** run `git worktree prune`/`remove` or force-checkout the branch that worktree holds until P9 cleanup.
**Verify before commit:** `git diff --cached` shows **exactly one** changed gitlink · `submodule status` shows all other pins **unchanged** · the new SHA equals the PR merge SHA.

**Commit messages.** `chore(platform): bump control-plane to <sha> for operating-market authority` · `chore(platform): bump fitdesk to <sha> for tenant-aware payment slice 2`.
**Required checks.** CP: `npm test` + `npm run build` (post-PR0, actually meaningful). FitDesk: `npm test`, `npm run lint`, `npm run build:verify`, `docker build`. **Platform: none exist** — a recorded gap; the bump's correctness rests on the `submodule status` diff review.
**Review focus.** PR1: the transaction boundary + the negative-leak assertion. PR2: **commit C7 only** — flip and gate inseparable. PR3/PR4: exactly one gitlink moved.
**Gates.** G-PUSH and G-MERGE per PR; PR1/PR2 are **CRITICAL**. **No Dokploy action before platform `main` contains the intended pointer.**
**Stop conditions.** Any platform diff touching more than the intended gitlink · a pin not equal to a merged `main` SHA · PR2 merging before P8a is verified healthy · force-push proposed anywhere.
**Rollback.** Per-PR `git revert` (never force-push, never `reset --hard` on a shared branch). Platform revert = revert the bump commit → Dokploy redeploys the prior pin. **This is the primary production rollback lever for the whole program.**
**Docs.** Update the Slice 2 checkpoint + this plan's ledger with merge SHAs.
**Handoff.** Merge SHA ledger: PR#, merge SHA, platform pin before/after.
**DoD.** All five merged in order; platform `main` pins exactly the two intended SHAs; every other pin byte-identical; ledger published.
**Dependencies.** P4 (PR1), P6 (PR2). **Parallel:** PR0 anytime after P1. **Sequential:** PR1→PR3→P8a→PR2→PR4→P8b.
**Risk: MEDIUM.**
**Isolation & financial safety.** Nothing user-visible changes at merge — only at deploy, and even then every tenant is NULL. The revert path is a single commit per layer.

---

### Phase 8 — Deployment, health verification, and operating-market activation

**Purpose.** Deploy, prove health, then have a **human** verify the pilot tenant. Four distinct gates that must never collapse into one: *migration deployment ≠ endpoint health ≠ FitDesk deployment ≠ tenant activation.*

**Current-state evidence.** Dokploy Compose app tracks platform `main` (`docs/RUNBOOK.md:28-62`). Migration runs **inline in the api container's start command** (`docker-compose.prod.yml:115`) — not a one-shot job; the **worker does not migrate** (`:145`). Health endpoints (`scripts/smoke.sh`): `${FITDESK_PUBLIC_URL}/api/health` → 200 (`:53`) · `${ERP_PUBLIC_URL}/api/method/ping` → `"pong"` (`:64`) · internal `control-plane-api:4000/health`, `provisioning-agent:8080/health`, `erp-execution-service:8790/internal/health` (`:74-83`). Logger redaction configured (`logger.ts:6-22`).

**Scope.** P8a (CP deploy + verify) · P8b (FitDesk deploy + verify) · P8c (pilot activation).
**Out of scope.** ERP provisioning (P9) · direct DB edits · direct server code edits · any `docker restart` without approval.

**Repositories.** fitdesk-platform (deploy target). **Branch/worktree.** None.
**Files.** None. This phase runs commands and reads output.

**P8a — Control Plane deploy.**
1. Confirm platform `main` == PR3 merge SHA; `git ls-remote` the expected SHA.
2. Allow Dokploy to deploy from `main` (**G-DEPLOY**). Verify the deployed commit matches.
3. `docker ps` — `control-plane-api` healthy, `control-plane-worker` healthy.
4. **Migration verification is its own gate:** `npx prisma migrate status` **read-only** inside the api container → `20260716000000_add_tenant_operating_market` applied, no drift. (The API serving at all is itself evidence, since `migrate deploy &&` precedes `start:api`.)
5. `curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:4000/health` → 200.
6. **Read endpoint health with a real tenant JWT** → expect `{ "operatingMarket": null, "verified": false, "verifiedAt": null }`. **This is the key proof: every existing tenant is NULL. No backfill happened.**
7. Logs: `docker logs control-plane-api --tail 100`. **Scrub before sharing** (`CLAUDE.md` §8).

**P8b — FitDesk deploy.** Platform `main` == PR4 merge SHA → deploy (**G-DEPLOY**) → `docker ps` → `GET ${FITDESK_PUBLIC_URL}/api/health` → 200 → ERP proxy health (`/api/method/ping` → `"pong"`) → **QA: the selector still shows Cash only, for every tenant, because all are NULL.** Zero Lebanon probes in the logs.

**P8c — Pilot activation (the first moment anything changes for a trainer).**
1. **G-DEPLOY / CRITICAL — a deliberate human act, not a deploy.** Owner confirms the runbook's evidence standard was met: a direct, recorded confirmation from the trainer that the business operates in Lebanon. **Not** timezone, phone, locale, IP, currency, company name, or `Tenant.country`.
2. `POST /tenants/:id/operating-market {"market":"LB","verifiedBy":"<operator>"}` with the admin key. **Operator-only contract — never a DB edit.**
3. **Read back through the tenant-scoped contract** (not the admin route) → `{ "operatingMarket": "LB", "verified": true, "verifiedAt": "<iso>" }`.
4. **Prove fail-closed still holds:** a second, non-LB/unverified tenant reads `{ null, false, null }` and its selector is unchanged.
5. **Cache invalidation:** FitDesk's TTL is 60s and the key includes market, so a grant takes effect within one TTL. Verify by re-loading the pay page after >60s. **Then verify the revoke path end-to-end** (`DELETE` → within one TTL the six disappear) — then re-grant. Revocation correctness is worth proving *before* money moves, not after.
6. Confirm the audit rows exist (grant, revoke, re-grant) with actor + requestId + before/after.

**Expected outputs.** Migration applied, no drift · all health checks green · pre-activation: every tenant `{null,false,null}` and Cash-only · post-activation: pilot reads `LB/true` · **the pilot's selector still shows Cash only, because the ERP has no Lebanon Modes of Payment yet — that is P9, and this is the correct, expected result.**

**Rollback triggers.** Migration fails or reports drift · `control-plane-api` unhealthy · the read endpoint returns `country` or any credential · **any tenant reads non-NULL before activation** (⇒ a backfill happened ⇒ **stop the program**) · FitDesk health fails · any Lebanon method appears for an unverified tenant.
**Rollback order (reverse of deploy).** 1) `DELETE /tenants/:id/operating-market` (instant, no deploy). 2) Revert PR4 → redeploy FitDesk at `615e56b`. 3) Revert PR3 → redeploy CP at `abd2c4b`. 4) **Leave the columns.** Four unread nullable columns are inert; dropping them is strictly riskier. **No direct DB edits. No direct server code edits. No volume deletion.**
**Stop conditions.** Any non-NULL tenant pre-activation · migration drift · evidence standard not met · a request to "just set it in the database".
**Commit/PR.** None. **Docs.** Deployment record + activation record (actor, timestamp, evidence reference — **not the evidence itself if it contains personal data**).
**Handoff.** Deployment + activation report: platform SHA, migration status, health results, before/after market readback, audit row IDs.
**DoD.** CP deployed and healthy; migration applied, no drift; every tenant NULL pre-activation; pilot verified `LB` via the operator contract and reading back through the tenant contract; non-LB tenants proven fail-closed; revoke proven; cache invalidation proven.
**Dependencies.** P7 (PR3 → P8a; PR4 → P8b); P8b → P8c. **Parallel:** none. **Sequential:** all of it.
**Risk: HIGH** — production deployment + migration + the first capability grant.
**Isolation & financial safety.** No money moves. Activation grants *eligibility*, not availability — the pilot still sees Cash only until P9. Every other tenant is untouched and provably NULL. The revoke lever is instant and needs no deploy. No direct DB or ERP mutation.

---

### Phase 9 — ERP tenant payment provisioning, end-to-end QA, and closeout

**Purpose.** Build a narrow, admin-only, allowlisted ERP payment-provisioning capability on the approved execution path; use it to configure the pilot tenant's ERPNext accounting so the seven methods actually work; then prove the whole program end-to-end.

**Current-state evidence.**
*ERP side:* `_upsert_mode_of_payment` (`fitdesk_setup.py:476`) is **already fully idempotent** — creates / appends a company row / skips (`:513-547`) — and is the reuse target. `_get_account_for_company` (`:435`) **only reads** and requires `is_group: 0`. **No "ensure account" helper exists in any repo** (C12); `_upsert_mode_of_payment:506-511` hard-fails without one. `_create_mode_of_payment` (`:550`) hardcodes 3 modes, is **not parameterizable end-to-end** (`setup-fitdesk` accepts no method list — `bench-agent/client.ts:196-201`), and aborts at Bank Transfer (F1). `setup_fitdesk_schema` is **not `@frappe.whitelist()`** ⇒ unreachable over HTTP; the only whitelisted methods today are `scheduling.py:17` and `:50`.
*Transport, verified:* CP's **only** downstream is `PROVISIONING_API_URL` + `PROVISIONING_API_TOKEN` → provisioning-agent (`env.ts:14-15`, `http-adapter.ts:38`, `:484`); **CP has no erp-execution-service client or env var**. provisioning-agent → EES via `ERP_REMOTE_BASE_URL: http://erp-execution-service:8790` + `ERP_REMOTE_TOKEN` [PAIR D] (`docker-compose.prod.yml:203-205`); all on `platform-internal`. **EES already has a Frappe HTTP client** — `FrappeClient` (`src/lib/frappe-client/client.ts`) with `callMethod()` (`:120`), `X-Provisioning-Token` auth (`:9`), multi-site Host routing from `site_name`/`site` in the payload, and a timeout — currently wired **only** to `ping`/`read_db_name` (`routes/health.ts:23`). EES has **no Docker socket and spawns no bench** since Phase 1 (`src/config/env.ts:13-17`). `x-request-id` already propagates CP→PA (`app.ts:14`, `http-adapter.ts:486`).
*Constraints:* the CP proxy has **no DocType allowlist** (`erp-proxy.routes.ts:243`) and the tenant ERP user is a **System Manager** with full `PROVISIONING_ROLES` (`bench.py:793-794`) — B6. **`provisioning_api` is baked into the ERPNext image** (`images/erpnext/Dockerfile.erpnext:32`), used by every `erpnext-*` container; bench-agent bakes the same app set and the Dockerfile warns they must stay identical — B7. Prior attempt: **BLOCKED** (`TENANT_PAYMENT_METHOD_PROVISIONING_EXECUTION_REPORT.md`).

**Design decision (D5 — REVISED): build a narrow, admin-only, allowlisted ERP payment-provisioning capability along the approved execution path.** Manual/direct ERPNext configuration is **rejected as architecture-noncompliant** — it bypasses the Control Plane execution architecture (`CLAUDE.md` §2). The generic ERP proxy is **rejected as a write path** (B6: no DocType allowlist; the tenant ERP user is System Manager; using it would normalize a known gap).

**The approved path:**
```text
operator (CONTROL_PLANE_API_KEY)
  → Control Plane          POST /tenants/:id/payment-catalog/ensure   ← orchestration + audit + market check
  → provisioning-agent     POST /sites/payment-catalog/ensure         ← PURE 1:1 RELAY, zero business logic
  → ERP Execution Service  POST /sites/payment-catalog/ensure         ← executor: allowlists + validation
  → Frappe HTTP API        POST /api/method/provisioning_api.api.payment_methods.ensure_payment_catalog
  → provisioning_api       @frappe.whitelist() ensure_payment_catalog ← Frappe ORM work
```
**FitDesk is not in this path at all** — no ERP credentials in FitDesk, satisfied by construction. **No direct DB access. No direct Docker execution. No bench spawn** (EES has had no Docker socket since Phase 1 — `erp-execution-service/src/config/env.ts:13-17`).

**Why the implementation splits across two layers — this is not a violation, it is the only safe shape.** `FrappeClient.callMethod()` (`erp-execution-service/src/lib/frappe-client/client.ts:120`) can only invoke `@frappe.whitelist()` methods, authenticated by the `X-Provisioning-Token` header (`:9`) — a **provisioning-scoped** token matching `common_site_config.json`, **not** a System Manager API key. The alternative — EES calling Frappe's **core REST API** (`/api/resource/Account`) — would require exactly the highly-privileged credential B6 warns about, merely relocated. Therefore: **EES owns the executor contract** (route, operation allowlist, DocType allowlist, catalog allowlist, zod validation, timeout, correlation ID, structured per-method result); **provisioning_api owns the Frappe ORM work**, reusing the already-idempotent `_upsert_mode_of_payment` (`:476`) and adding the missing `_ensure_account` (C12). **Neither layer is a generic writer.** This is what `CLAUDE.md` §3 means by "erp-execution-service = infrastructure executor."

**Provisioning-agent's role — D10, RESOLVED by the owner 2026-07-17. Not an open question.**
```text
Provisioning Agent remains
  → strict 1:1 relay
  → no defaults
  → no retries
  → no mapping
  → no accounting decisions
  → no orchestration
```
This matches `CLAUDE.md` §2's canonical chain (`Control Plane → Provisioning Agent → ERP Execution Service → ERPNext/Frappe`) and the only wired route: CP's sole downstream is `PROVISIONING_API_URL` + `PROVISIONING_API_TOKEN` → provisioning-agent (`http-adapter.ts:38`, `:484`); provisioning-agent reaches EES at `ERP_REMOTE_BASE_URL: http://erp-execution-service:8790` with `ERP_REMOTE_TOKEN` [PAIR D] (`docker-compose.prod.yml:203-205`). CP has no EES client and no EES env var, so a direct wire would have added a new env pair, trust edge, and auth layer — which `CLAUDE.md` §2 forbids without approval. The relay route is a zod schema plus a 1:1 forwarder, identical in shape to the 18 routes already in `site-steps.ts`. **PR7 is enforced by a test asserting the forwarded body is byte-identical to the received body.** Orchestration lives in CP; retries live in CP's worker; accounting decisions live in the approved plan.

**Rejected alternatives.** **(A) Manual/direct ERPNext configuration** — bypasses the execution architecture. **Permitted only as a separately owner-approved emergency exception, never as the default, and never presented as architecture-compliant.** **(B) CP generic proxy writes** — leans on B6's missing allowlist. **(C) EES via Frappe core REST** — reintroduces the System Manager credential.

**Scope.** Four service repos + the ERPNext image · dry-run preflight · settlement accounts · seven Modes of Payment · readback · full QA · closeout.
**Out of scope.** **Other Mobile Wallet — until an exact tenant-admin provider contract exists.** **USDT — stays disabled; no `usdt` id exists in the union, so it is unavailable by construction.** No Payment Entry. No ledger mutation. No new DocType. Fixing `_create_mode_of_payment`'s Bank-Transfer ordering bug (F1 — recorded follow-up; **must never land before P8c**, or a `setup-fitdesk` re-run ships Whish Money ungated).

**Repositories.** provisioning_api · erp-execution-service · provisioning-agent · control-plane · fitdesk-platform (pins + **ERPNext image rebuild**, B7).
**Branches/worktrees.** `feat/erp-payment-catalog-provisioning` in each of the four service repos; two platform bump branches. See §13.

**Files.** `provisioning_api/provisioning_api/api/payment_methods.py` (new) + `tests/` · `erp-execution-service/src/routes/payment-catalog.ts` (new), `src/lib/payment-catalog/allowlist.ts` (new), `src/app.ts` (register) · `provisioning-agent/src/routes/site-steps.ts` + `src/clients/site-steps-forwarder.ts` + `site-steps-forwarder-port.ts` + `src/contracts/provisioning.ts` · **control-plane**: `prisma/schema.prisma` + `prisma/migrations/<ts>_add_payment_catalog_operations/` (new), `src/modules/tenants/payment-catalog.routes.ts` (new), `src/jobs/payment-catalog/runner.ts` (new), `scripts/worker.ts` (register the new queue), `src/lib/constants.ts` (`PAYMENT_CATALOG_QUEUE`), `src/lib/payment-catalog/plan.ts` (new — canonical hash), `src/lib/provisioning/http-adapter.ts` · `fitdesk-platform` pins + `images/erpnext/Dockerfile.erpnext` rebuild.

**Audit semantics (D14 — corrected).** For this distributed operation the **durable state IS the audit**: `PaymentCatalogOperation` + `PaymentCatalogMethodResult` are the authoritative, queryable record of what was attempted, by which credential, on whose asserted authority, against which approved plan hash, and what each method did. `AuditEvent` rows are written **alongside** the transitions (via the existing fail-open `writeAuditEvent`, matching `scripts/worker.ts`'s own usage) as a secondary log — **their loss cannot create a false success, because the operation row is the truth.** This is why the Phase 4 in-transaction pattern must **not** be copied here: there is no transaction that could span the ERP write, and pretending otherwise would be the false-success bug in a new costume.

**Durable orchestration (D14).** ERP provisioning is a **multi-service mutation across four hops**. It must never be a long synchronous request, and **no Prisma transaction may stay open across an HTTP call** — a Prisma transaction cannot include a downstream ERPNext write atomically, so "in-transaction audit per method" is the wrong model here. The correct model is **durable state transitions**, mirroring the `ProvisioningJob` / `ProvisioningStepRun` machinery that already exists (`prisma/schema.prisma:89-121`, `scripts/worker.ts`, `src/jobs/state/runner.ts`).

> **Contrast with Phase 4, deliberately.** Phase 4's market grant *is* a single local DB write with no downstream call, so its in-transaction audit (D2) is correct and stays. Phase 9 is distributed, so its durability comes from **persisted state transitions**, not from a transaction. Two different problems; two different mechanisms. Do not unify them.

**New Prisma models (P9 migration — additive, `CREATE TABLE` only).**
```prisma
enum PaymentCatalogOperationStatus { pending running succeeded partial failed enqueue_failed }
enum PaymentCatalogOperationMode   { dry_run apply }

/// Immutable, approved account plan. Produced by a dry_run; referenced by an apply.
model PaymentCatalogPlan {
  id                       String   @id @default(uuid())
  tenantId                 String
  planHash                 String                    // SHA-256 over the canonical (sorted-key) plan
  plan                     Json                      // the frozen matrix
  sourceOperationId        String                    // the dry_run that produced it
  approvedAt               DateTime?
  approvedByServiceIdentity String?                  // WHICH CREDENTIAL authenticated (e.g. "control-plane-admin-key")
  assertedHumanApprover    String?                   // CLAIMED human — NOT authenticated. See D16.
  createdAt                DateTime @default(now())
  tenant  Tenant @relation(fields: [tenantId], references: [id])
  @@index([tenantId, createdAt])
}

model PaymentCatalogOperation {
  id            String   @id @default(uuid())
  tenantId      String
  mode          PaymentCatalogOperationMode
  status        PaymentCatalogOperationStatus
  approvedPlanId String?                             // required when mode = apply
  attemptCount  Int      @default(0)
  requestId     String
  authenticatedServiceIdentity String               // the credential that authenticated (D16)
  assertedHumanOperator        String?              // the claimed human — NOT authenticated (D16)
  dispatchedAt  DateTime?                            // "dispatch recorded" transition
  failureReason String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  finishedAt    DateTime?
  tenant  Tenant @relation(fields: [tenantId], references: [id])
  results PaymentCatalogMethodResult[]
  @@index([tenantId, createdAt])
}

model PaymentCatalogMethodResult {
  id          String   @id @default(uuid())
  operationId String
  method      String                                 // internal PaymentMethod id
  status      String                                 // ok | skipped | failed
  accountAction String?                              // created | reused | would_create | would_reuse
  accountName String?
  modeAction  String?                                // created | reused | skipped | would_create | would_reuse
  reason      String?
  startedAt   DateTime @default(now())
  finishedAt  DateTime?
  operation PaymentCatalogOperation @relation(fields: [operationId], references: [id])
  @@unique([operationId, method])                    // ← duplicate prevention + resume, exactly like ProvisioningStepRun
}
```
`@@unique([operationId, method])` is lifted verbatim from `ProvisioningStepRun.@@unique([jobId, step])` (`schema.prisma:120`). It gives **duplicate prevention and restart-resume for free**: a retried worker upserts per method and skips what already succeeded.

**API contracts (the full chain).**
```jsonc
// ── 1a. Control Plane — SUBMIT (async). preHandler: [requireInternalApiKey, idempotencyMiddleware]
POST /tenants/:id/payment-catalog/operations
{ "mode": "dry_run", "assertedHumanOperator": "yasser" }
// or: { "mode": "apply", "approvedPlanId": "<uuid>", "assertedHumanOperator": "yasser" }
202 Accepted
{ "operationId": "<uuid>", "status": "pending", "requestId": "<uuid>" }
400 invalid body · 401 no key · 403 bad key · 404 tenant
409 market not verified LB  |  plan not approved  |  operation already running for this tenant
422 unsupported method/mode · 500 enqueue_failed (persisted, retryable)

// ── 1b. Control Plane — POLL
GET /tenants/:id/payment-catalog/operations/:operationId
200 {
  "operationId": "…", "mode": "dry_run",
  "status": "pending | running | succeeded | partial | failed | enqueue_failed",
  "attemptCount": 1, "requestId": "…",
  "authenticatedServiceIdentity": "control-plane-admin-key",
  "assertedHumanOperator": "yasser",          // CLAIMED, not authenticated (D16)
  "planId": "<uuid|null>", "planHash": "sha256:…",
  "results": [
    { "method": "whish_money", "status": "ok",
      "account": { "name": "Whish Money - ACME", "action": "would_create" },
      "mode": { "action": "would_create" } },
    { "method": "purpl", "status": "failed", "reason": "PARENT_ACCOUNT_NOT_FOUND" }
  ],
  "summary": { "ok": 5, "failed": 1, "skipped": 0 },
  "finishedAt": "…"
}

// ── 1c. Control Plane — APPROVE A PLAN (the durable gate before any apply)
POST /tenants/:id/payment-catalog/plans/:planId/approve
{ "assertedHumanApprover": "yasser" }
200 { "planId", "planHash", "approvedAt", "approvedByServiceIdentity", "assertedHumanApprover" }
409 already approved · 404 unknown plan

// ── 2. provisioning-agent (STRICT 1:1 RELAY — same body in, same body out)
POST /sites/payment-catalog/ensure     preHandler: [requireBearerToken]
// no defaults · no retries · no mapping · no accounting decisions · no orchestration (D10)

// ── 3. ERP Execution Service (executor — stateless, no retry, bounded timeout)
POST /sites/payment-catalog/ensure     Authorization: Bearer <ERP_REMOTE_TOKEN>
{ "site_name": "…", "company": "…", "currency": "USD", "dry_run": true,
  "methods": [ { "method":"whish_money", "mode_of_payment":"Whish Money",
                 "payment_type":"Bank", "account_name":"Whish Money - ACME",
                 "account_currency":"USD", "parent_account_type":"Bank" } ],
  "request_id": "…" }

// ── 4. Frappe HTTP API → provisioning_api
POST /api/method/provisioning_api.api.payment_methods.ensure_payment_catalog
X-Provisioning-Token: <redacted>          // provisioning-scoped, NOT a System Manager key
Host: <site_name>                          // existing multi-site routing (client.ts extractSiteHostFromPayload)
```

**State machine (durable; every transition is a committed row, no open transaction).**
```text
POST → [tx: create operation status=pending, requestId, identities]  ← short, local, no HTTP inside
     → commit → 202 returned
     → enqueue BullMQ  ── on failure ─► status=enqueue_failed (persisted; retryable)
                                        ↑ precedent: ProvisioningStatus.enqueue_failed already exists
worker picks up
     → acquireLock(`tenant:${id}:payment-catalog:lock`)  ← src/jobs/lock.ts, SET NX PX + Lua release
     → [tx: status=running, attemptCount++, dispatchedAt=now]   ← "dispatch recorded"
     → for each method (sequential, ordered):
          call CP→PA→EES→Frappe        ← NO transaction open across this
          → [tx: upsert PaymentCatalogMethodResult on (operationId, method)]  ← persisted immediately
     → [tx: status = succeeded | partial | failed, finishedAt]
     → releaseLock
```
**Worker restart recovery.** BullMQ stalled-job detection is already configured (`scripts/worker.ts`: `PROVISIONING_LOCK_DURATION_MS = 15min`, `PROVISIONING_STALLED_INTERVAL_MS = 2min`) — reuse the same shape for a new `PAYMENT_CATALOG_QUEUE`. A worker killed mid-operation leaves `status=running` with partial `PaymentCatalogMethodResult` rows; the retried job **resumes**, skipping methods already `ok` (the unique constraint makes this deterministic), because **every step is ensure-shaped and re-running it is a no-op**. `attemptCount` bounds it. A permanently stuck `running` operation is visible via `GET`, and the Redis lock TTL prevents two workers colliding.

**Retry ownership (D10).** Retries live **only** in the Control Plane worker (BullMQ attempts + the existing `src/jobs/state/retry-policy.ts` backoff). provisioning-agent has **no retries** — it is a relay. ERP Execution Service has **no retries** — it is a stateless executor with a bounded timeout that surfaces failures. Retrying an ERP mutation is safe precisely because every operation is ensure-shaped.

**Idempotency.** Three independent layers: (1) `idempotencyMiddleware` on submit (`tenant.routes.ts:198-200`, `IdempotencyKey` model) blocks duplicate submission of the same request; (2) the Redis lock blocks two concurrent operations for one tenant (409); (3) `@@unique([operationId, method])` + ensure-shaped ERP calls make re-execution a no-op.

**Immutable approved plan (D15).** A `dry_run` operation persists a `PaymentCatalogPlan` with `planHash = SHA-256(canonical(plan))`. An `apply` **must** carry `approvedPlanId`; the worker then **recomputes the plan from live ERP state** (an internal dry-run pass) and compares the hash. **Mismatch ⇒ the operation fails with `PLAN_DRIFT` and writes nothing.** That is the point: if ERP state moved between approval and apply, the approval is void. The worker also rejects a plan that is unapproved (`approvedAt == null`) or belongs to another tenant.

**Allowlists — enforced at three independent layers.**
| Layer | Enforces |
|---|---|
| **Control Plane** | Supported catalog (the exact 7) · **market must read `LB` verified** or 409 · site/company/currency resolved **from the Tenant row, never from the request** · idempotency key |
| **ERP Execution Service** | **Operation allowlist** — `ensure_payment_catalog` is the only callable method (never a generic `method` passthrough) · **DocType allowlist** `{"Account","Mode of Payment"}` · **field allowlist** per DocType · zod method enum · bounded timeout |
| **provisioning_api** | The whitelisted function takes **no doctype parameter**. It can only touch `Account` and `Mode of Payment`, with a fixed field set. **Structurally incapable** of writing Payment Entry, Journal Entry, GL Entry, or Sales Invoice. |

**Ordered tasks.**

*Stage 0 — build the capability (four PRs, bottom-up; each additive and inert until its caller ships).* PR5 provisioning_api → PR6 EES → PR7 provisioning-agent → PR8 control-plane. See §13.

*Stage 1 — target resolution (Control Plane, server-side).* CP resolves pilot tenant → `erpSite` → **exact `companyName`** (the join key for `accounts[].company`) → `defaultCurrency`, **all from the Tenant row**. Never client-supplied. **Fail closed if ambiguous** — the prior attempt stopped exactly here. CP also asserts `operatingMarket === 'LB' && verified` or **409** — so the capability cannot provision Lebanon rails onto an unverified workspace.

*Stage 2 — dry-run preflight (**the pre-mutation matrix, through the approved path, zero writes**).* `POST .../operations {"mode":"dry_run"}` → 202 → poll → `succeeded`. Returns, per method: does the MoP exist? enabled? company-mapped? which account would be used or created? its currency? plus the company's leaf `Cash`/`Bank` accounts and default currency. **This confirms/refutes B1** (is `Whish Money` already there and mapped?) and **B4** (is there a leaf `Bank` account?) **through the approved path rather than a side channel.** `dry_run=True` short-circuits before every `insert`/`save`/`commit` in provisioning_api. The operation persists a `PaymentCatalogPlan` + `planHash`.

*Stage 2b — plan approval (**the durable gate**).* Review the matrix, then `POST .../plans/:planId/approve {"assertedHumanApprover":"…"}`. This freezes it: `approvedAt`, `approvedByServiceIdentity`, `assertedHumanApprover`, `planHash`. **No apply may run without an approved plan, and an apply whose recomputed hash differs fails with `PLAN_DRIFT` before writing anything.**

*Stage 3 — settlement accounts (**G-DEPLOY / CRITICAL — accounting mutation**).* **B5 must be resolved by the owner/accountant first.** Recommended default: **one dedicated USD leaf account per method**, under the company's existing Bank/Cash parent, so settlement is distinguishable per provider and reconciliation works. Mapping all six to one shared account would conflate providers and make reconciliation impossible — not a permissible shortcut. Deterministic naming, `<Method Label> - <abbr>` (e.g. `Whish Money - ACME`). **`account_currency = USD`**, matching the invoice currency (`currencyCompatible` requires `cur === 'USD'` for every method — `availability.ts:120-127`); **currency validated before creation, not after**. `_ensure_account` (new, C12) is ensure-shaped: exists → validate type/currency/company and reuse; absent → create under the validated non-group parent. **No duplicates. No renames, merges, or disables of existing accounts. No opening balances. No Journal Entries.**

*Stage 4 — the seven Modes of Payment (**G-DEPLOY / CRITICAL**).* Exact docnames per the canonical table (§Phase 6) — **`OMT Pay`, not `OMT`; `Bank Transfer - Fresh USD` with an ASCII hyphen**. The docname is the join key; a mismatch reproduces the original incident. Reuses `_upsert_mode_of_payment` (`:476`), already idempotent: create → or append the company child row → or skip. **Duplicate prevention** is structural: `frappe.db.exists` + the `any(acc.company == company_name)` guard (`:520-523`). `Cash` already exists and is mapped — **verify, do not touch**. **No Payment Entry. No ledger mutation.**

*Stage 4b — durable partial-success handling.* `_upsert_mode_of_payment` commits **per method** (`:534`, `:547`), so partial success is real and must be **persisted and reported, never hidden**. Each method's outcome is written to `PaymentCatalogMethodResult` **immediately after its call returns** — so a crash mid-operation loses nothing. The operation terminates as `partial` when any method failed and at least one succeeded; `failed` when none succeeded; `succeeded` only when all did. **`partial` is a first-class terminal state, not an error to be retried blindly** — the operator reads `GET`, decides, and resubmits if appropriate; the resubmission resumes and skips completed methods.

*Stage 5 — readback verification (read-only).* Submit a second `dry_run` operation → every method must report `mode.action: "reused"`, `companyMapped: true`, account present, currency USD — i.e. **a clean no-op, proving idempotency on real data**. Independently, FitDesk's live probe path (`getModeOfPaymentDoc`) must agree — that is what actually drives the UI.

*Stage 6 — application availability.* Reload the pay page as the pilot trainer → **all seven appear**. Confirm ≤2–3 taps and correct wrapping at 375px (`CLAUDE.md` mobile-first).

*Stage 7 — end-to-end QA.*

| # | Test | Expected |
|---|---|---|
| 1 | **Cash regression** | Cash records exactly as before. **The most important test** — Cash is the only method every tenant depends on. |
| 2 | Each Lebanon method ×6 | Records; Payment Entry uses the exact MoP; invoice outstanding decreases correctly |
| 3 | Package **Paid Now** | Defers to the invoice flow; inherits the gate; invoice + payment consistent |
| 4 | **Pay Later** | Invoice created unpaid; **no Payment Entry** |
| 5 | **Failed preflight** | Temporarily disable one MoP in ERP → the method disappears; **Cash unaffected**; no partial write. Re-enable. |
| 6 | **Payment history** | Every method reads back with **exact** identity; `methodLabel` correct |
| 7 | **Unknown ERP value** | A payment against an MoP outside the catalog → `methodId: null`, raw label preserved, **never Cash** |
| 8 | **Audit logs** | Each payment logs the exact method identity; **no `provider: 'cash'` on a non-cash payment** |
| 9 | **Tenant isolation** | Tenant B cannot see/select/record the pilot's methods; B's selector unchanged |
| 10 | **Non-Lebanon negative** | An unverified tenant: zero Lebanon methods, **zero Lebanon ERP probes in the logs**, POST `mymonty` rejected before any ERP call |
| 11 | **Revoke-market negative** | `DELETE` the pilot's market → within one TTL the six disappear; **Cash remains**; **historical Lebanon payments still read back exactly** (the ADR's identity/eligibility separation, proven on real data) — then re-grant |
| 12 | **DST / currency / company** | `verifiedAt` is a correct ISO instant; USD-only compatibility holds; `accounts[].company` matches the resolved company exactly |

*Stage 8 — closeout.* Deployment closeout record · **cleanup only after validation**: remove worktrees `FitDesk-payment-slice2`, `control-plane-operating-market`, and the four Phase-9 service worktrees; delete merged branches. **Do not prune the CP submodule worktree until PR1 is merged and deployed (C3).** · final handover report.

**Capability tests (Stage 0, before any tenant is touched).**
- **provisioning_api** (pytest, `tests/`): `_ensure_account` creates once, reuses on re-run, **rejects a wrong-currency existing account**, rejects a group parent, never renames · `ensure_payment_catalog` idempotent across two runs (second = all `reused`/`skipped`) · **`dry_run=True` performs zero writes** (assert no `insert`/`save`/`commit`; assert row counts unchanged) · partial failure returns per-method status and does not abort the remainder · **asserts no Payment Entry / Journal Entry / GL Entry is ever created** · company isolation: a child row is added only for the named company.
- **erp-execution-service** (`node:test`): route rejects an unknown method (zod) · **rejects any DocType outside the allowlist** · **there is no generic `method` passthrough parameter** · rejects a missing/bad `ERP_REMOTE_TOKEN` · propagates `request_id` · bounded timeout returns 504, never hangs · maps partial failure to a structured result.
- **provisioning-agent** (`node:test`): relay is **1:1** — assert the forwarded body is byte-identical to the received body and that **no field is computed, defaulted, or branched on**. This is the test that keeps business logic out.
- **control-plane** (`node:test`): 401 no key / **403 bad key** · **409 when the tenant's market is not verified `LB`** · site/company/currency come from the Tenant row and **request-supplied values are ignored** · unsupported method → 422 · audit written **in-transaction**, one event per method + one per operation, with `requestId` + actor + before/after · idempotency key blocks duplicate submission · downstream failure → 502 with **no false success event**.

**Read-only preflight.** Stage 2's **dry-run is the preflight**, and it runs through the same code path as the apply — so a green dry-run is real evidence, not a parallel implementation. Plus `curl -sS ${FITDESK_PUBLIC_URL}/api/health`; ERP `/api/method/ping` → `"pong"`; `docker ps` for the erpnext-* stack.
**Gates.** **G-MUT: CRITICAL** for PR8's Prisma migration (M8a) · **G-MERGE ×4** (PR5–PR8 — early merge permitted, see §13's timing rule) · **G-DEPLOY: CRITICAL** for PR9a (**ERPNext image rebuild — restarts the system of record for every tenant**, B7; **only after P8b**) · **G-DEPLOY** for PR9b · **B5 owner/accounting decision + plan approval before apply** · **G-DEPLOY: CRITICAL** before the first `mode: apply` (**and CP independently 409s unless the pilot is verified `LB`**) · cleanup gate after Stage 7.
**Stop conditions.** Stage 1 ambiguous · **dry-run not reviewed** · **B5 undecided** · dry-run reports any unexpected `would_create` · any duplicate MoP name or duplicate company child row · **any Payment Entry created** · any existing account renamed/merged/disabled · any wrong-currency account reused · **any Lebanon method visible to an unverified tenant** (⇒ the gate failed ⇒ revert PR4 immediately) · Cash regressing at any point · the erpnext-* stack unhealthy after PR9a.
**Rollback (in order of increasing cost).** 1) `DELETE /tenants/:id/operating-market` — **instant, no deploy**; the six vanish within one TTL. 2) ERP: re-run `ensure` in a **disable** mode, or set `enabled = 0` on the created MoPs — **never delete** (deleting a MoP referenced by a Payment Entry breaks history). 3) Accounts: leave in place if any entry posted; **never delete an account with ledger entries**. 4) Revert PR9b → the capability is unreachable (CP route gone). 5) Revert PR9a → ERPNext image returns to the prior build; **another full erpnext-* restart, so this is the expensive one** — prefer 1/2/4. 6) Revert PR4 → FitDesk catalog returns to Slice 1.
**Commit strategy.** PR5: `feat(payments): whitelisted ensure_payment_catalog with ensure-account` + tests. PR6: `feat(payment-catalog): narrow allowlisted ERP payment provisioning route`. PR7: `feat(relay): forward payment-catalog ensure` (**relay only**). PR8: `feat(tenants): admin payment-catalog orchestration with audit`. PR9a/PR9b: pin bumps.
**PR strategy.** §13. **Review focus:** PR7 must contain **zero logic**; PR6's allowlists; PR8's market 409 + in-transaction audit.
**Docs.** Operator runbook for the ensure capability (dry-run first, always) · provisioning record · QA results · final handover.
**Handoff.** **Final program handover report:** dry-run vs post-apply matrix · exact docnames + accounts created · the 12-row QA matrix with evidence · audit row IDs · rollback levers · open follow-ups.
**DoD.** Capability merged, deployed, and exercised **dry-run first** · seven methods live for the verified pilot · Cash regression-free · zero Lebanon exposure for unverified tenants · revoke proven on real data · history exact · **no Payment Entry created** · closeout published · worktrees cleaned.
**Dependencies.** **P8c (the pilot must be verified `LB` and the gate deployed) — the hard financial-safety ordering constraint from C1.** PR5→PR6→PR7→PR8→PR9a→PR9b. **Parallel:** PR5–PR8 authoring may overlap P5/P6/P8 (they touch no shared file); the runbook drafts during P8. **Sequential:** the merge order, and Stages 1→8.
**Risk: CRITICAL** — a new ERP write capability plus an ERPNext image redeploy plus real accounting configuration on a live tenant.
**Isolation & financial safety.** Site is routed by `site_name` → Host (existing multi-site routing); company comes from the Tenant row, never the request; `accounts[]` child rows are per-company, so another tenant's company cannot resolve an account through these MoPs. **CP refuses to provision Lebanon rails onto a workspace that is not verified `LB` (409)** — the market gate guards the ERP write path too, not just the UI. The capability is **structurally incapable** of creating a Payment Entry or moving a ledger: provisioning_api's whitelisted function takes no doctype parameter and touches only `Account` and `Mode of Payment`. `dry_run` proves intent before any write. Cash is verified before and after. **Nothing here can move money; it only makes a correct payment possible.**

---

## 6. Dependency graph and critical path

```text
P1 (preflight + ERP FREEZE + B1)
 │
 ├─► PR0  CP CI fix (B2/B3) ──┐
 │                            ▼
 ├──────────────────────► P2  CP schema + additive migration
 │                            ├──► P3  tenant-scoped read contract ─┐
 │                            └──► P4  operator grant/revoke+audit ─┤
 │                                                                  ▼
 │                                                    P7·PR1 merge (CP)
 │                                                                  │
 │                                                    P7·PR3 platform bump (CP)
 │                                                                  │
 │                                                    P8a CP deploy + migrate + health
 │                                                                  │
 │                                                    P8c-pre: ALL tenants read NULL  ← backfill proof
 │                                                                  │
 └──► P6.1 backup + commit + rebase ──► P5 resolver + gate ──► P6.2 FLIP (atomic w/ write-gate)
                                                                    │
                                                    P7·PR2 merge (FitDesk)
                                                                    │
                                                    P7·PR4 platform bump (FitDesk)
                                                                    │
                                                    P8b FitDesk deploy + health (still Cash-only)
                                                                    │
                                                    P8c pilot activation (human act)
                                                                    │
   ┌────────────────────────────────────────────────────────────────┘
   │  P9 — ERP payment-provisioning capability (approved path)
   ▼
  PR5 provisioning_api  (whitelisted ensure_payment_catalog + _ensure_account)
   │        ▲ authoring may run in parallel with P5/P6/P8 — no shared files
  PR6 erp-execution-service  (narrow route + allowlists + FrappeClient)
   │
  PR7 provisioning-agent  (PURE 1:1 RELAY — zero logic)
   │
  PR8 control-plane  (admin orchestration + market 409 + in-tx audit)
   │
  PR9a platform: provisioning_api pin → ERPNext IMAGE REBUILD  ← B7, CRITICAL, code lands INERT
   │                                    (restarts the system of record for every tenant)
  PR9b platform: EES + PA + CP pins   ← capability becomes reachable
   │
  Stage 2 DRY-RUN (zero writes) ──► B5 accounting decision ──► Stage 3/4 APPLY
   │
  Stage 5 readback → Stage 6 availability → Stage 7 QA (12 tests) → Stage 8 closeout
```

**Critical path:** `P1 → PR0 → P2 → P4 → PR1 → PR3 → P8a → P5 → P6 → PR2 → PR4 → P8b → P8c → PR9a → PR9b → dry_run → plan approval → apply → QA`
(P3 is on a shorter branch than P4 and is not critical-path-determining. **PR5–PR8 are off the critical path entirely** — they merge early, in parallel, and wait for a pin.)

**Parallelisable:** PR0 ∥ P1's B1 verification · P3 ∥ P4 authoring · P5 test authoring ∥ P4 · **PR5–PR8 authoring, review, AND merge ∥ P5/P6/P8** (disjoint repos and files; inert without pins) · runbooks ∥ any phase.
**Strictly sequential:** P1 → all · PR0 → P2 · P2 → P3/P4 · P8a → P5's verification · P5 → P6's flip · P6 → PR2 · **P8b (gate deployed AND verified) → PR9a → PR9b** · P8b → P8c · **P8c → apply** (enforced independently by CP's 409) · PR5→PR6→PR7→PR8 · **dry_run → B5 → plan approval → apply**.
**The timing rule (§13, authoritative):** merge early is fine; **deploy/reachability waits for the verified gate; apply waits for the verified pilot.**

---

## 7. Repository and ownership matrix

| Concern | Owner | Prohibited elsewhere |
|---|---|---|
| Tenant market **authority** | **control-plane** (`Tenant.operatingMarket`) | Never in FitDesk, ERPNext, local DB, or JWT claims |
| Tenant-scoped market **contract** | control-plane `GET /api/erp/tenant/market` | No FitDesk-side derivation; never via `CONTROL_PLANE_API_KEY` |
| Payment **catalog** (ids, labels, docnames) | **FitDesk** `lib/payments/methods.ts` | Never ERP-name-from-client; never duplicated in CP |
| Market **eligibility** logic | FitDesk `lib/payments/availability.ts` + write-side gate | Never client-side; never in ERPNext |
| ERP **reads** (payment probe) | FitDesk `lib/erpnext/` → CP ERP proxy → ERPNext | No direct Frappe calls; no ERP credentials in FitDesk |
| Operator **activation** (market) | control-plane `POST/DELETE /tenants/:id/operating-market` | **Never a direct DB edit**; never trainer-facing (MVP) |
| ERP payment-provisioning **orchestration** | **control-plane** — async operations API + BullMQ worker | Not FitDesk; not the operator's hands; not a DB console; **never a synchronous request** |
| ERP provisioning **operation state** (durable truth) | **control-plane** `PaymentCatalogOperation` + `PaymentCatalogMethodResult` | Not logs; not the ERP; not the caller's memory |
| ERP provisioning **approved plan** | **control-plane** `PaymentCatalogPlan` (immutable, hashed) | Never re-derived at apply time without a hash check |
| **Retries** | **control-plane worker only** (BullMQ + `retry-policy.ts`) | **Not** provisioning-agent; **not** erp-execution-service |
| ERP payment-provisioning **transport** | **provisioning-agent** (strict 1:1 relay) | **Zero business logic** — no defaults, no retries, no mapping, no accounting decisions, no orchestration (D10) |
| ERP payment-provisioning **execution** | **erp-execution-service** (allowlists, validation, timeout) | Not a generic writer; no core-REST access; no Docker; no bench spawn |
| ERP payment-provisioning **ORM work** | **provisioning_api** `@frappe.whitelist() ensure_payment_catalog` | No doctype parameter; only `Account` + `Mode of Payment`; never Payment Entry |
| ERP **writes** generally | The approved path above | **Never** the CP generic proxy (B6); **never** manual ERPNext config except as an owner-approved emergency exception |
| **Deployment** orchestration | fitdesk-platform (submodule pins) → Dokploy | No direct prod edits; no hand-edits of `services/*` |
| **Audit** records | control-plane `AuditEvent` (market) + FitDesk payment event log (payments) | No audit-only-in-logs for market grants |
| Product **documentation** | FitDesk `docs/` (authority map tiers) | Never `fitdesk-platform/services/fitdesk` |

**Untouched by this program:** bench-agent (source — image rebuilt only to keep its baked app set identical, B7) · fitdesk-app.

---

## 8. Data ownership matrix

| Field / record | Authoritative owner | Prohibited duplicates / uses |
|---|---|---|
| `Tenant.country` | control-plane (locale + **CoA template** seed) | **Never an authorization input.** Never returned by the market endpoint. Never the source of `operatingMarket`. |
| `operatingMarket` | control-plane `Tenant` | No FitDesk column, no local DB copy, no JWT claim, no client value. Cache ≤ TTL only. |
| verification **source** (`operatingMarketSource`) | control-plane | Only `'operator_verified'` today. Never inferred. |
| verification **actor** (`operatingMarketVerifiedBy`) | control-plane + `AuditEvent.payload.actor` | Never a system/service identity — a human. |
| verification **timestamp** (`operatingMarketVerifiedAt`) | control-plane | Never client-supplied. |
| **Mode of Payment** | **ERPNext** | Never created by FitDesk. Never a client-supplied name. |
| **Settlement account** | **ERPNext** | Never in FitDesk. One dedicated USD leaf per method (D5/B5). |
| **Company mapping** (`accounts[].company`) | ERPNext | Exactly one child row per company per MoP. |
| **Payment Entry** | **ERPNext** | Never duplicated in FitDesk (`CLAUDE.md`). **Never created during provisioning.** |
| payment **internal ID** (`methodId`) | FitDesk `PaymentMethod` union | Never an ERP name; `null` for unknown — **never coerced to `cash`**. |
| payment **display label** (`methodLabel`) | FitDesk catalog; raw ERP text when unknown | Never invented; never `'Cash'` as a fallback. |
| **exact ERP Mode of Payment** (`erpNextModeOfPayment`) | FitDesk catalog (the **join key**) | Must match ERPNext byte-for-byte. `OMT Pay` not `OMT`; ASCII hyphen in `Bank Transfer - Fresh USD`. |
| operational routing **provider** | *(none — no routing exists)* | `Payment.provider` (`mapPaymentProvider`) is **coarse and lossy** and still defaults unknown → `'cash'` (C10). **Not an identity.** Recorded, out of scope. |

---

## 9. API contract matrix

| # | Contract | Repo | Auth | Change | Consumer |
|---|---|---|---|---|---|
| 1 | `GET /api/erp/tenant/market` | control-plane | **Tenant JWT** (HS256, `tenantId` claim) | **NEW** (P3) | FitDesk `lib/tenant/market.ts` |
| 2 | `POST /tenants/:id/operating-market` | control-plane | **Admin key** (`Authorization: Bearer`) | **NEW** (P4) | Operator only |
| 3 | `DELETE /tenants/:id/operating-market` | control-plane | Admin key | **NEW** (P4) | Operator only |
| 4 | `resolveWorkspaceMarket()` | FitDesk | server-only | **NEW** (P5) | `actions/invoices.ts` |
| 5 | `ResolveAvailabilityParams` | FitDesk | internal | **CHANGED** — `+ market: string \| null` | `availability.ts` |
| 6 | `CatalogEntry` | FitDesk | internal | **CHANGED** — `+ market` (dropped today at `:111-117`) | `availability.ts` |
| 7 | availability cache key | FitDesk | internal | **CHANGED** — `+ market` (correctness, not perf) | `availability.ts:135` |
| 8 | `recordPayment` / `collectPayment` | FitDesk | session | **CHANGED** — market re-check before ERP write | `actions/invoices.ts` |
| 9 | `signTenantJwt()` | FitDesk | internal | **MOVED** private → `lib/tenant/cp-jwt.ts` | client + resolver |
| 10 | `getTenant` / `listTenants` | FitDesk | god key | **DELETED** (dead code) | none |
| 11 | `GET /api/erp/doctype/Mode of Payment/:name` | control-plane | Tenant JWT | **unchanged** | probe + P9 readback |
| 12 | `POST /tenants/:id/payment-catalog/operations` → **202 + operationId** | control-plane | **Admin key** + idempotency key | **NEW** (P9/PR8) | Operator only |
| 12b | `GET /tenants/:id/payment-catalog/operations/:operationId` → status | control-plane | Admin key | **NEW** (P9/PR8) | Operator polling |
| 12c | `POST /tenants/:id/payment-catalog/plans/:planId/approve` | control-plane | Admin key | **NEW** (P9/PR8) | Operator only — freezes the plan |
| 12d | BullMQ `PAYMENT_CATALOG_QUEUE` job | control-plane | internal | **NEW** (P9/PR8) | `control-plane-worker` |
| 13 | `POST /sites/payment-catalog/ensure` | provisioning-agent | `PROVISIONING_API_TOKEN` [PAIR C] | **NEW** (P9/PR7) — **pure relay** | control-plane |
| 14 | `POST /sites/payment-catalog/ensure` | erp-execution-service | `ERP_REMOTE_TOKEN` [PAIR D] | **NEW** (P9/PR6) | provisioning-agent |
| 15 | `provisioning_api.api.payment_methods.ensure_payment_catalog` | provisioning_api | `X-Provisioning-Token` (provisioning-scoped) | **NEW** (P9/PR5) | erp-execution-service via `FrappeClient.callMethod` |
| 16 | `FrappeClient.callMethod()` | erp-execution-service | internal | **unchanged** — newly wired beyond `ping`/`read_db_name` | the new route |
| 17 | `ProvisioningAdapter` port | control-plane | internal | **CHANGED** — `+ ensurePaymentCatalog()` | `payment-catalog.routes.ts` |

**Unchanged and out of scope:** every other `/api/erp/*` route · `POST /tenants` · `GET /tenants/:id` · `GET /tenants/:id/erp-credentials` · the 18 existing site-step routes · all bench-agent routes. **Explicitly NOT added:** any generic doctype/method write parameter at any layer.

---

## 10. Migration and production-mutation matrix

| # | Change | Type | Mutates prod data? | Rollback | Approval owner |
|---|---|---|---|---|---|
| M1 | `20260716000000_add_tenant_operating_market` (4 nullable cols) | **Schema, additive** | **No** — no `UPDATE`, no `DEFAULT`, no `NOT NULL` | **Do not drop.** Revert the app pin instead. | **Owner — CRITICAL** |
| M2 | `AuditEvent` indexes ×2 | **Schema, additive** | No (index build only) | `DROP INDEX` (safe) | Owner (with M1) |
| M3 | *(none)* Data backfill | — | — | — | **ADR-forbidden** |
| M4 | Migration **deployment** (`migrate deploy` in the api start command) | **Deployment** | No | Revert PR3 | Owner — **G-DEPLOY** |
| M5 | **Tenant activation** — `POST .../operating-market` | **Prod data mutation** (1 row, 4 cols) | **YES** | `DELETE` — instant, no deploy | **Owner — deliberate human act** |
| M6 | **ERPNext image rebuild + erpnext-\* restart** (PR9a, B7) | **Platform deployment** | **No data change** — but **restarts the system of record for every tenant** | Revert PR9a → prior image → another full restart | **Owner — CRITICAL (scheduled window)** |
| M7 | Capability deploy (PR9b: EES + PA + CP pins) | **Deployment** | No | Revert PR9b → route unreachable | Owner — **G-DEPLOY** |
| M8a | **`<ts>_add_payment_catalog_operations`** — 3 models + 2 enums (P9/PR8) | **Schema, additive** (`CREATE TABLE`/`CREATE TYPE` only) | **No** — no existing table altered | Drop the new tables (safe — nothing else references them) | **Owner — CRITICAL (schema)** |
| M8b | **Dry-run** operation (`mode: dry_run`) | **Read-only ERP**; writes only CP operation/plan rows | **No ERP change** — zero writes by construction | n/a | Owner (safe) |
| M8c | **Plan approval** (`POST .../plans/:planId/approve`) | **CP data write** (1 row) | Yes (CP only) | Plan rows are immutable; supersede with a new dry-run | Owner — **the durable gate** |
| M9 | ERP **settlement accounts** (P9 Stage 3, `mode: apply`) | **Prod ERP mutation** | **YES** — new GL accounts | Leave if any entry posted; **never delete an account with ledger entries** | **Owner — CRITICAL (accounting)** |
| M10 | ERP **Modes of Payment** ×6 (P9 Stage 4) | **Prod ERP mutation** | **YES** | Set `enabled = 0`. **Never delete** (breaks Payment Entry history) | **Owner — CRITICAL (accounting)** |
| M11 | FitDesk `enabled` flip (P6) | **Code** | No | Revert PR4 | Owner — CRITICAL (payment) |

**Never mutated by this program, at any phase:** Payment Entry · Journal Entry · GL Entry · Sales Invoice · Company base currency · existing account names/parents/types · tenant ERP credentials.

**M1–M4 are four distinct gates and must never be collapsed:** *generation → validation (disposable DB) → deployment → tenant activation.*
**Prohibited throughout:** direct production DB edits · direct server code edits · `docker system prune` · `docker volume rm` · `docker compose down -v` · database reset · force push · `--dangerously-skip-permissions`.

---

## 11. Test and verification matrix

| Requirement | Unit | Integration | Contract | Migration | E2E | Prod smoke |
|---|---|---|---|---|---|---|
| Market never derived from country/tz/locale/phone/IP/currency | code review + grep | — | — | — | — | — |
| No backfill; existing rows NULL | — | — | — | **P2: seeded row → NULL** | — | **P8a: every tenant `{null,false,false}`** |
| Supported-market allowlist enforced server-side | `markets.test.ts` | — | **P4: `"XX"`/`"lb"`/`""` → 422** | — | — | — |
| Tenant A cannot read B's market | — | — | **P3: scope = JWT claim; no forgeable input** | — | — | **P9 test 9** |
| Endpoint leaks no `country`/credentials | — | — | **P3: explicit key-set assertion** | — | — | P8a manual |
| Grant/change/revoke idempotent | — | **P4: `changed:false`** | P4 | — | — | **P8c** |
| **No false success event** (audit atomic) | — | **P4: audit failure ⇒ row unchanged** | — | — | — | **P8c: audit rows exist** |
| Operator auth required | — | — | **P4: 401 no key / 403 bad key** | — | — | — |
| Resolver fails closed (404/500/timeout/malformed/no-ctx) | **P5: each individually** | — | — | — | — | — |
| **Zero Lebanon probes when non-LB** | **P5: `getModeOfPaymentDoc` never called ×6** | — | — | — | — | **P9 test 10 (logs)** |
| Market filter precedes detail read | **P5 (`:155`)** | — | — | — | — | — |
| **Cache key includes market; revoke honoured** | **P5** | — | — | — | — | **P8c / P9 test 11** |
| **Write-side gate (§4.6 trap)** | **P5: non-LB POST `mymonty` rejected pre-ERP** | P6 | — | — | — | **P9 test 10** |
| Cash global + unaffected | P5/P6 | P6 | — | — | — | **P9 test 1** |
| Catalog byte-exact (7 rows, `OMT Pay`, ASCII hyphen) | **P6** | — | — | — | — | **P9 Stage 5** |
| No `mobile_wallet_other`, no `usdt` | **P6: absent from the union** | — | — | — | — | **P9 test 10** |
| Unknown ERP value → raw text, **never Cash** | **P6** | — | — | — | — | **P9 test 7** |
| Historical readback exact + market-independent | **P6** | — | — | — | — | **P9 tests 6 & 11** |
| **`_ensure_account` idempotent; rejects wrong currency / group parent** | **PR5 (pytest)** | — | — | — | — | P9 Stage 3 |
| **MoP ensure idempotent; no duplicate name or child row** | **PR5** | — | — | — | — | **P9 Stages 4–5** |
| **`dry_run=True` performs ZERO writes** | **PR5: row counts unchanged; no insert/save/commit** | — | — | — | — | **P9 Stage 2** |
| **Partial failure reported, not hidden** | PR5 | **PR6** | — | — | — | P9 Stage 4b |
| **No generic doctype/method passthrough at any layer** | **PR5: no doctype param** | **PR6: DocType allowlist `{Account, Mode of Payment}`** | — | — | — | — |
| **Relay contains zero logic** | — | **PR7: forwarded body byte-identical to received** | — | — | — | — |
| **ERP provisioning refused unless market verified `LB`** | — | — | **PR8: 409** | — | — | **P9 apply on a non-LB tenant → 409** |
| **Site/company/currency from the Tenant row, not the request** | — | **PR8: request-supplied values ignored** | — | — | — | P9 Stage 1 |
| **Submit returns 202 + operationId; never blocks** | — | **PR8** | — | — | — | P9 Stage 2 |
| **No Prisma transaction spans an HTTP call** | — | **PR8: code review + a test that the adapter is called outside `$transaction`** | — | — | — | — |
| **Durable state transitions** (pending→running→terminal) | — | **PR8: each transition committed; `dispatchedAt` recorded** | — | — | — | P9 `GET` |
| **Worker restart mid-operation resumes, skips completed** | — | **PR8: kill after method 3 ⇒ retry completes 4–7, re-runs none** | — | — | — | — |
| **Enqueue failure ⇒ `enqueue_failed`, persisted + retryable** | — | **PR8: never a silent no-op** | — | — | — | — |
| **Concurrent operations for one tenant ⇒ 409** | — | **PR8: Redis lock** | — | — | — | — |
| **`partial` is terminal, actionable, and not hidden** | — | **PR8** | — | — | — | P9 Stage 4b |
| **Apply without an approved plan ⇒ 409** | — | **PR8** | — | — | — | — |
| **`PLAN_DRIFT` ⇒ zero ERP writes** | — | **PR8: mutate ERP between approval and apply ⇒ fails, writes nothing** | — | — | — | P9 |
| **Cross-tenant plan reference rejected** | — | **PR8** | — | — | — | — |
| **Audit separates authenticated credential from asserted human** (D16) | — | **PR8 + P4: both assert the two fields are distinct and the human is never labelled authenticated** | — | — | — | P8c / P9 |
| **New models migration is additive** | — | — | — | **PR8: `CREATE TABLE`/`CREATE TYPE` only; no existing table altered** | — | P9 deploy |
| **Correlation ID propagates CP→PA→EES→Frappe** | — | PR6/PR8 | — | — | — | P9 (logs) |
| **Bounded timeout; 504 not a hang** | — | **PR6** | — | — | — | — |
| **No Payment Entry / Journal / GL ever created** | **PR5: asserted** | — | — | — | — | **P9 Stage 4 + test 4** |
| Full regression | **2,514 (FitDesk)** | — | — | — | — | — |
| Zero new type errors | `tsc --noEmit` vs **21 baseline** | — | — | — | — | — |

**Blocked until PR0:** every control-plane test above. `npm test` runs **4 of 19** files today (B2), and `src/modules/erp-proxy/*.test.ts` and `src/modules/tenants/*.test.ts` are both **in the excluded set** — i.e. *the natural home for every test this program adds*.

---

## 12. Security and threat model

| Threat | Control | Residual |
|---|---|---|
| **Cross-tenant access** | Scope is the JWT `tenantId` claim; **no route parameter exists** to name another tenant. Admin routes take `:id` but require the admin key. | None new. |
| **Forged tenant ID** | Requires `FITDESK_JWT_SECRET`. **Pre-existing systemic weakness**: one shared HS256 secret ⇒ anyone holding it can mint a token for any tenant across **every** `/api/erp/*` route. This program **adds no new capability** — the market route is read-only and returns 3 non-sensitive fields. | **Recorded, pre-existing.** Per-tenant secrets / asymmetric keys = separate hardening slice. |
| **Internal API-key leakage** | Market is read over the **tenant JWT**, never `CONTROL_PLANE_API_KEY`. P5 **deletes** the dead `getTenant`/`listTenants` god-key exports. | The god key still reaches `GET /tenants/:id/erp-credentials` (decrypted ERP keys). Pre-existing; this program **reduces** reliance on it. |
| **Stale market authorization** | Market in the cache key; TTL 60s bounded; revoke takes effect within one TTL — **proven in P8c and P9 test 11**. | ≤60s window after revoke. Accepted and documented. |
| **False LB activation** | Operator-only; server-side allowlist; written evidence standard; **the ADR's "not evidence" list**; full audit. | Only as good as the runbook — which is why the runbook is a deliverable, not a footnote. |
| **Operator identity is asserted, not authenticated** (D16) | Audit separates `authenticatedServiceIdentity` (the credential) from `assertedHumanOperator` (a claim). Schema comments say so. | **Anyone holding the shared admin key can write any human name into the audit.** The trail proves *a credential acted*, not *who acted*. Per-operator credentials = separate hardening slice. **Do not describe the recorded name as proof.** |
| **Approved-plan tampering / drift** | Plan is immutable + hashed; apply **recomputes from live ERP and compares** → `PLAN_DRIFT` fails before any write; unapproved or cross-tenant plans rejected. | A DB admin could edit a plan row. Same residual as audit tampering. |
| **Stuck / duplicated operations** | Redis lock per tenant (`src/jobs/lock.ts`); BullMQ stalled detection (15min lock / 2min interval); `attemptCount` bound; `enqueue_failed` persisted and retryable; `GET` exposes stuck state. | A crash between commit and enqueue lands `enqueue_failed` — visible and retryable, never a silent no-op. |
| **Audit tampering** | Audit written **inside** the grant transaction with `tx.auditEvent.create` (**not** the fail-open helper) ⇒ no grant without its row. Before/after + actor + requestId. | `AuditEvent` has no FK and survives tenant delete (by accident, but useful). No append-only enforcement — a DB admin could edit rows. Recorded. |
| **Replay / idempotency** | Re-grant = no-op + audit; revoke-when-NULL = no-op. MoP ensure-operations idempotent (`_upsert_mode_of_payment`). | None material. |
| **Partial migration** | Additive-only; single `ALTER` group; `migrate deploy` precedes `start:api` so a failed migration means the API never serves. | Worker doesn't migrate (`:145`) — irrelevant here (it doesn't read these columns). |
| **Partial deployment** | Two platform PRs, two deploys, each health-verified. FitDesk fails closed if CP is old/absent (404 ⇒ `{null,false}` ⇒ Cash). | Brief mixed-version window ⇒ Cash-only. **Safe by design.** |
| **Direct ERP bypass** | **All** ERP I/O on the approved path: reads via the CP proxy (`lib/erpnext/`), writes via `operator → CP → PA (relay) → EES → Frappe HTTP → provisioning_api`. No ERP credentials in FitDesk. Manual config and generic-proxy writes both **rejected** (D5). No direct DB. No Docker exec (EES lost the socket in Phase 1). | **B6: the *read* proxy still has no DocType allowlist and rides the System Manager credential.** Standing finding, unchanged by this program — separate slice. |
| **Privilege escalation via the new write path** | Three independent allowlists (CP catalog+market · EES operation+DocType+field · provisioning_api has **no doctype parameter**). Auth is the **provisioning-scoped** `X-Provisioning-Token`, not a System Manager key. Structurally cannot write Payment Entry / Journal Entry / GL Entry / Sales Invoice. | A compromised `CONTROL_PLANE_API_KEY` could create Accounts + MoPs on a verified-LB tenant. It could already read every tenant's decrypted ERP credentials (`GET /tenants/:id/erp-credentials`) — a strictly larger capability. **No net escalation.** |
| **Business logic leaking into the relay** | provisioning-agent test asserts the forwarded body is **byte-identical** to the received body — no computed fields, no defaults, no branching. | Enforced by test + review, not by the type system. |
| **Ungated ERP provisioning** | **CP returns 409 unless the tenant reads `operatingMarket === 'LB'` verified** — the market gate guards the ERP write path, not just the UI. | Requires P8c first (dependency, not a control). |
| **ERPNext image redeploy** (B7) | PR9a is split out so the new code deploys **inert** (no caller exists yet); a failure is unambiguously the image, not the feature. Scheduled window + owner approval. | Restarts the system of record for **every** tenant. Volumes (`erpnext_sites`, `erpnext_db_data`) are untouched and flagged CRITICAL in compose. |
| **False Cash identity** | `erpModeToPaymentMethod` → `null`; raw text preserved; audit identity exact; **explicitly tested**. | **C10: `mapPaymentProvider` still defaults unknown → `'cash'`** for `Payment.provider`. Not read by the statement path ⇒ no user-visible defect. Recorded, out of scope. |
| **Sensitive log leakage** | pino redaction configured (`logger.ts:6-22`) for authorization headers, keys, URLs. Logs scrubbed before sharing (`CLAUDE.md` §8). Market logs carry `{reqId, tenantId, verified}` only. | Verification **evidence** may contain personal data — store it outside the audit payload; reference it, don't inline it. |
| **Ungated Lebanon method via ERP config** | **C1 — the program's largest live risk.** P1's ERP freeze; P9 strictly after P8c. | **Until the freeze is acknowledged, any `setup-fitdesk` re-run can ship Whish Money ungated.** |

---

## 13. Git, PR, and submodule integration map

| | PR0 | PR1 | PR2 | PR3 | PR4 |
|---|---|---|---|---|---|
| **Repo** | control-plane | control-plane | FitDesk | fitdesk-platform | fitdesk-platform |
| **Branch** | `fix/cp-ci-test-glob` | `feat/workspace-operating-market-authority` | `feat/tenant-aware-payment-slice-2` | `chore/bump-control-plane-operating-market` | `chore/bump-fitdesk-payment-slice-2` |
| **Worktree** | *(new)* | `control-plane-operating-market` ✅ exists | `FitDesk-payment-slice2` ✅ exists | *(new)* | *(new)* |
| **Base** | `main` `abd2c4b` | `main` `abd2c4b` | `main` `ac4efa3` (after rebase) | `main` `96b7b92` | `main` (post-PR3) |
| **Title** | `fix(ci): run the full test suite` | `feat(tenants): workspace operating market authority` | `feat(payments): tenant-aware payment catalog with operating-market gate` | `chore(platform): bump control-plane for operating-market authority` | `chore(platform): bump fitdesk for tenant-aware payment slice 2` |
| **Risk** | LOW | MEDIUM | **HIGH** | MEDIUM | **HIGH** |

**Phase 9 capability PRs.**

> **The merge/deploy timing rule — one rule, stated once, authoritative.**
> **PR5–PR8 MAY be authored, reviewed, and merged early**, in parallel with P5/P6/P8 — *provided they remain unreachable without platform pins and callers.* Merging code is not shipping it: none of it is deployed until a platform pin moves, and each layer is inert until its caller exists.
> **PR9a/PR9b MUST NOT be deployed — and the capability must not be made reachable — until the operating-market gate is deployed and verified (P8b).**
> **The first `mode: apply` MUST NOT run until the pilot is verified `LB` (P8c)** — and CP enforces this independently with a **409**, so the gate is a control, not just a sequence.

| | PR5 | PR6 | PR7 | PR8 | PR9a | PR9b |
|---|---|---|---|---|---|---|
| **Repo** | provisioning_api | erp-execution-service | provisioning-agent | control-plane | fitdesk-platform | fitdesk-platform |
| **Branch** | `feat/erp-payment-catalog-provisioning` | `feat/erp-payment-catalog-provisioning` | `feat/relay-payment-catalog` | `feat/payment-catalog-orchestration` | `chore/bump-provisioning-api-payment-catalog` | `chore/bump-payment-catalog-services` |
| **Base** | `main` `5c324cd` | `main` (**fetch first** — local is 2 behind) | `main` (**local is 3 behind**) | `main` (post-PR1) | `main` (post-PR4) | `main` (post-PR9a) |
| **Contents** | whitelisted `ensure_payment_catalog` + `_ensure_account` + tests | narrow route + operation/DocType/field allowlists + `FrappeClient` wiring | **1:1 relay only** | admin orchestration + market 409 + in-tx audit | `provisioning_api` pin → **ERPNext image + bench-agent image rebuild** | `erp-execution-service` + `provisioning-agent` + `control-plane` pins |
| **Risk** | **HIGH** (ERP ORM) | MEDIUM | **LOW** (must stay trivial) | MEDIUM | **CRITICAL** (B7 — restarts the system of record) | MEDIUM |

**Full merge/deploy order:**
```text
MERGE (may overlap):  PR0 → PR1 → PR3 → PR2 → PR4          [the gate]
                      PR5 → PR6 → PR7 → PR8                 [the capability — early merge OK, inert]

DEPLOY (strict):      PR3 ⇒ P8a verify (CP healthy, migration applied, ALL tenants NULL)
                      PR4 ⇒ P8b verify (gate live; Cash-only for all; zero Lebanon probes)
                            └── the operating-market gate is now DEPLOYED AND VERIFIED ──┐
                      PR9a ⇒ ERPNext image + bench-agent rebuild ⇒ stack health  ◄───────┘  B7, CRITICAL
                      PR9b ⇒ capability reachable ⇒ smoke.sh hop checks
                      P8c  ⇒ pilot verified LB (deliberate human act)
                      dry_run ⇒ plan approval (B5) ⇒ apply ⇒ readback ⇒ QA
```
**Why bottom-up (PR5→PR8).** Each layer is additive and **inert until its caller ships**: the whitelisted method exists but nothing calls it; the EES route exists but nothing calls it; and so on. Every merge is independently revertable, and a failure is unambiguously attributable to one layer.
**Why PR9a is separate.** It rebuilds the ERPNext image and restarts every `erpnext-*` container plus bench-agent (B7). Splitting it means the risky restart happens while the new code is **inert** — if the stack comes back unhealthy, it is the image, not the feature. **This is the single highest-risk deploy in the program.**
**Why PR9a/PR9b sit after P8b, not before.** Deploying the capability makes an ERP write path reachable. It must not exist in production until the thing that gates it — the server-side market gate — is live and proven. The CP 409 is the enforcement; this ordering is the belt to its braces.

**Commit boundaries.** PR0: 2. PR1: 8 (P2 ×3, P3 ×1, P4 ×3, docs ×1). PR2: 8 (Slice2 verbatim ×1, P5 ×5, **flip+gate ×1 — inseparable**, docs ×1). PR3/PR4: 1 each. PR5: 3 (`_ensure_account`, `ensure_payment_catalog`, tests). PR6: 2 (allowlists, route). PR7: **1** (if PR7 needs more than one commit, it is doing too much). PR8: 3 (adapter port, route+audit, tests). PR9a/PR9b: 1 each.

**Submodule pointer updates.** PR3: `services/control-plane` `abd2c4b` → PR1 SHA. PR4: `services/fitdesk` `615e56b` → PR2 SHA (**carries the 2 docs-only commits `615e56b..ac4efa3` — verified harmless**). PR9a: `services/provisioning_api` `5c324cd` → PR5 SHA (**+ ERPNext image rebuild; bench-agent image rebuilt to keep the baked app set identical**). PR9b: `services/erp-execution-service` `28a53eb` → PR6 SHA · `services/provisioning-agent` `d8d8f68` → PR7 SHA · `services/control-plane` → PR8 SHA. **Every unlisted pin must remain byte-identical.** Verify with `git diff --cached` + `git submodule status`.
**Note:** local `erp-execution-service` (2 behind) and `provisioning-agent` (3 behind) must be **fetched and rebased onto real `origin/main`** before branching — the same staleness trap as C4.

**Cleanup timing.** **Only after P9 Stage 7 validation.** Remove `FitDesk-payment-slice2`, `control-plane-operating-market`, and the four Phase-9 worktrees; delete merged branches. **Do not prune the CP submodule worktree before PR1 is merged and deployed (C3).**

**Never:** force push · `reset --hard` on a shared branch · `git clean -fd` · rebase a public branch · amend a pushed commit · hand-edit `fitdesk-platform/services/*` (submodule policy).

---

## 14. Deployment and rollback runbook

**Forward (each arrow is an approval gate):**
```text
 1. PR0 merge (CP CI)                    → CI green, full suite actually runs
 2. PR1 merge (CP)                       → tests + build green
 3. PR3 merge (platform: CP pin)         → exactly one gitlink moved
 4. Dokploy deploys platform main        → deployed SHA == PR3 merge SHA
 5. Health: control-plane-api            → docker ps healthy; :4000/health = 200
 6. Migration status (read-only)         → 20260716000000 applied, no drift
 7. Market endpoint (real tenant JWT)    → {null,false,null}  ← NO-BACKFILL PROOF
 8. PR2 merge (FitDesk)                  → payment CRITICAL gate; B1 answered
 9. PR4 merge (platform: FitDesk pin)    → exactly one gitlink moved
10. Dokploy deploys platform main        → deployed SHA == PR4 merge SHA
11. Health: fitdesk + ERP proxy          → /api/health 200; /api/method/ping "pong"
12. QA: selector = Cash only, all tenants → gate proven; zero Lebanon probes in logs
13. P8c: operator grants LB to pilot     → DELIBERATE HUMAN ACT (evidence standard)
14. Read back via tenant contract        → {LB,true,<iso>}; non-LB tenant {null,false,null}
15. Prove revoke, then re-grant          → six vanish within one TTL, Cash remains
16. PR5→PR6→PR7→PR8 merged             → may have merged EARLY; still unreachable (no pins)
    (PR8 carries the additive CP migration M8a: operations/plan/result models)
17. PR9a: provisioning_api pin           → ERPNext IMAGE REBUILD + erpnext-* + bench-agent restart
                                           ← B7 CRITICAL. ONLY AFTER step 12 verified.
18. ERPNext stack health                 → all erpnext-* healthy; /api/method/ping "pong";
                                           bench list-apps agrees across containers
19. PR9b: EES + PA + CP pins             → capability reachable; smoke.sh hop checks green;
                                           CP migration M8a applied, no drift
    (P8c already granted LB at step 13 — CP's 409 enforces it independently below)
21. POST .../operations {dry_run}        → 202 + operationId; poll → succeeded;
                                           ZERO ERP writes; persists plan + planHash
22. B5 accounting decision               → owner/accountant reviews the matrix
23. POST .../plans/:planId/approve       → freezes plan: approvedAt + planHash +
                                           approvedByServiceIdentity + assertedHumanApprover
24. POST .../operations {apply,planId}   → 202; worker recomputes + hash-compares
                                           → PLAN_DRIFT ⇒ zero writes;
                                           else accounts (Stage 3) then MoPs (Stage 4)
25. Poll → succeeded | partial | failed  → partial is terminal + actionable, never hidden
26. Second dry_run                       → clean no-op; idempotency proven on real data
27. P9: E2E QA (12 tests)                → Cash first, isolation + negatives last
```

**Reverse (rollback), in order of increasing cost:**
```text
R1. DELETE /tenants/:id/operating-market   → instant, no deploy. THE PRIMARY LEVER.
                                             Also 409s any further ERP provisioning.
R2. ERP: set enabled = 0 on created MoPs   → never delete (breaks Payment Entry history)
R3. ERP accounts: leave in place           → never delete an account with ledger entries
R4. Revert PR9b → redeploy EES/PA/CP       → capability unreachable; nothing else changes
R5. Revert PR4 → redeploy FitDesk @615e56b → catalog returns to Slice 1
R6. Revert PR2                             → FitDesk main clean
R7. Revert PR3 → redeploy CP @abd2c4b      → contract gone; FitDesk 404s → fails closed → Cash
R8. Revert PR1                             → CP main clean
R9. Revert PR9a → prior ERPNext image      → ANOTHER full erpnext-* restart. Expensive.
                                             Prefer R1/R2/R4 — this is the last resort.
R10. Columns: LEAVE THEM                   → 4 unread nullable columns are inert;
                                             dropping is strictly riskier than keeping
```
**Anchors:** FitDesk `ac4efa3` · platform `96b7b92` · CP `abd2c4b` · Slice 2 base `615e56b`.
**Rollback triggers:** migration drift · any tenant non-NULL pre-activation (⇒ **stop the program**) · endpoint leaking `country`/credentials · any Lebanon method visible to an unverified tenant · Cash regression · unexpected Payment Entry.
**Never:** direct prod DB edit · direct server code edit · volume deletion · DB reset · force push · `docker system prune`.

---

## 15. Decision log

**Already approved — owner, 2026-07-17 (architecture correction round):** ERP I/O never bypasses the Control Plane execution architecture · manual/direct ERPNext configuration is **rejected** (emergency-exception only, separately owner-approved, never architecture-compliant by default) · the generic ERP proxy is **rejected as a write path** · **D10 RESOLVED — the Provisioning Agent remains in the path as a strict 1:1 relay: no defaults, no retries, no mapping, no accounting decisions, no orchestration** · provisioning is **durable and asynchronous** (202 + operationId + worker + status endpoint) · **no Prisma transaction may span an HTTP request** · the approved account plan is **immutable and hash-verified** before apply · audit must **not** present an asserted human name as authenticated · **PR5–PR8 may merge early while unreachable; nothing deploys or becomes reachable until the operating-market gate is deployed and verified.**

**Already approved (binding — ADR-MKT-001, 2026-07-16):** CP owns operating market · `country` never authorizes · separate nullable field · `operator_verified` only · **no backfill** · never infer from timezone/locale/language/phone/IP/nationality/customer country/currency/company name/site name · missing/unverified/revoked ⇒ **fail closed** · Cash global · LB methods only for verified `LB` · **server-side filtering before ERP probes** · historical identity global and market-independent · unknown ERP text never becomes Cash · ERPNext authoritative · ERP I/O via the approved proxy · no ERP credentials in FitDesk · no business logic in provisioning-agent · Git is truth · platform before Dokploy · every mutation phase atomic + reversible + gated.

**Inferred from repository evidence (recorded here; no owner decision needed):**

| ID | Decision | Evidence |
|---|---|---|
| **D1** | Reuse `resolveTenantFromAuth()` unchanged ⇒ market unreadable pre-ERP-provisioning (503 ⇒ fail closed) | `erp-proxy.routes.ts:78`. Alt: credential-free resolver — rejected (more surface, no benefit). |
| **D2** | **Audit inside the grant transaction** via `tx.auditEvent.create`, not the fail-open helper | `audit.ts:20-22` + `tenant.routes.ts:316-335`. Required by "no false success event". |
| **D3** | **No optimistic-locking column** | No `version` anywhere; operator writes rare + human-serialized; every write fully audited. Alt: CAS on `updatedAt`, or `version Int`. |
| **D4** | Invariants in the service, not a DB CHECK | A 4-column CHECK is a non-additive migration on a live table. |
| **D6** | **P5 + P6 = one PR** | Plan §4.6: flip and write-gate must be atomic; same worktree; avoids double rebase. |
| **D7** | **Two platform PRs / two deploys** | Independent verification + rollback granularity. Alt: one combined bump (safe, coarser). |
| **D8** | `SUPPORTED_MARKETS = ['LB']` only | An allowlist naming markets with no catalog is a lie. Additive later. |
| **D9** | **~~No ERP Execution Service change~~ — WITHDRAWN.** D5's revision requires EES, provisioning-agent, provisioning_api, and a second CP PR. | Superseded by the architecture correction. |
| **D11** | **Logic splits: EES owns the executor contract; provisioning_api owns the Frappe ORM work** | `FrappeClient.callMethod` (`client.ts:120`) can only invoke `@frappe.whitelist()` methods via the **provisioning-scoped** `X-Provisioning-Token` (`:9`). EES doing ORM work would need Frappe core REST + a System Manager key — reintroducing B6. Neither layer is a generic writer. |
| **D12** | **PR9a (ERPNext image) is split from PR9b (services)** | The new ERP code deploys **inert**; a failed restart is unambiguously the image, not the feature. |
| **D13** | **Bottom-up merge order PR5→PR6→PR7→PR8** | Each layer inert until its caller ships; independently revertable; failures attributable to one layer. |
| **D14** | **Durable async orchestration, not a synchronous request.** 202 + `operationId`; BullMQ worker; `GET` status; state transitions are the audit. **No Prisma transaction across an HTTP call.** | A Prisma transaction cannot include a downstream ERPNext write atomically. Mirrors the existing `ProvisioningJob`/`ProvisioningStepRun`/worker machinery (`schema.prisma:89-121`, `scripts/worker.ts`) — in-pattern, not novel. **Phase 4's in-transaction audit (D2) stays** — it is a pure local write with no downstream hop. Two different problems, two mechanisms; do not unify. |
| **D15** | **Immutable, hashed, approved plan gates every apply.** Apply recomputes from live ERP and hash-compares → `PLAN_DRIFT` ⇒ zero writes. | An approval of a stale matrix is not an approval. Makes drift between review and apply fatal rather than silent. |
| **D16** | **Audit separates `authenticatedServiceIdentity` from `assertedHumanOperator`.** The recorded human name is a **claim, never proof**. | `requireInternalApiKey` authenticates a **shared service credential**, not a person (`require-internal-api-key.ts:15-35`). Anyone holding the key can write any name. Applies to Phase 4's `operatingMarketVerifiedBy` **and** Phase 9's operations. Keeps the ADR's field spec intact — it never claimed authentication. Per-operator credentials = separate slice. |

**Require explicit owner approval before implementation:**

| ID | Decision | Recommended safe default |
|---|---|---|
| **B1** | Is `Whish Money` already live on the pilot tenant? | **Assume it may be. Freeze the ERP now.** Verify read-only in P1 before PR2 merges. |
| **B5** | **Which GL account does each method settle to?** (accounting) | **One dedicated USD leaf account per method** under the existing Bank/Cash parent — distinguishable per provider, reconcilable. **Never one shared account.** |
| **D5** | Phase 9 mechanism | **REVISED — narrow allowlisted capability on the approved path** (`operator → CP → PA relay → EES → Frappe HTTP → provisioning_api`). Manual config **rejected** (bypasses the execution architecture; emergency-exception only). CP generic-proxy writes **rejected** (B6). EES-via-core-REST **rejected** (reintroduces the System Manager key). |
| ~~**D10**~~ | ~~Does provisioning-agent stay in the ERP write path?~~ | **RESOLVED by the owner, 2026-07-17 — moved to the "already approved" tier above. No longer an open decision.** |
| **B7** | ERPNext image rebuild restarts the system of record for every tenant | **Scheduled window + owner approval.** PR9a isolated so the new code lands inert. Rebuild bench-agent's image in the same window to keep the baked app set identical. |
| **W1** | `whish_money` LB-gating is a **user-visible regression** if it is currently live | Answer B1 first. If live and in use: explicit sign-off, or verify the pilot `LB` (P8c) **before** PR4 deploys. |
| **B6** | CP ERP proxy has **no DocType allowlist**; tenant ERP user is System Manager | Out of scope. **Record as a standing security finding needing its own slice.** Do not normalize it via P9. |
| **B2/B3** | Fix CP CI (glob + Postgres) as PR0 | **Yes — prerequisite.** Triage any newly-surfaced failures separately. |
| **C11** | Bound `erpFetch` (probe fan-out 1 → 7 unbounded) | Add an optional timeout, generous default (~10s), own commit in PR2. |
| **F1** | `_create_mode_of_payment` aborts at Bank Transfer, silently skipping Whish Money | Recorded follow-up. **Not this program.** Fixing it *before* the gate ships would ship Whish Money ungated. |
| **F2** | Onboarding still writes a browser-timezone-guessed `country` (→ **CoA template**) | Out of scope (ADR §10.1). Real bug; own slice. |
| **F3** | `mapPaymentProvider` unknown → `'cash'` (C10) | Out of scope. No user-visible defect today. |

---

## 16. Master approval checklist

**Phase 1**
- [ ] All SHAs re-verified against `git ls-remote`
- [ ] **B1 answered with evidence** — does the pilot ERP have an enabled, company-mapped `Whish Money` MoP?
- [ ] **ERP FREEZE acknowledged by owner** (no MoP creation, no `setup-fitdesk` re-run, no leaf Bank account added)
- [ ] Slice 2 backed up (patch + full copy) and the patch verified re-appliable
- [ ] Rollback anchors recorded

**PR0** — [ ] CI glob fixed (19/19 files run) · [ ] Postgres service added · [ ] newly-surfaced failures triaged · [ ] merged

**Phase 2** — [ ] **G-MUT CRITICAL (schema)** · [ ] migration additive only (no `UPDATE`/`DEFAULT`/`NOT NULL`) · [ ] validated on a **disposable** DB · [ ] seeded row lands NULL · [ ] `country` untouched · [ ] G-COMMIT

**Phase 3** — [ ] G-MUT · [ ] three response fields only · [ ] **negative-leak assertion passes** (no `country`, no credentials) · [ ] no caller-supplied tenant selector · [ ] G-COMMIT

**Phase 4** — [ ] **G-MUT CRITICAL (authz)** · [ ] admin-key gated (401/403) · [ ] allowlist enforced server-side · [ ] **audit inside the transaction** · [ ] **audit-failure ⇒ no grant** proven · [ ] idempotent · [ ] revoke ships with grant · [ ] **runbook written** (evidence standard + "not evidence" list) · [ ] G-COMMIT

**Phase 5** — [ ] **G-MUT CRITICAL (payment)** · [ ] resolver fails closed on all 6 paths · [ ] filter precedes every detail read · [ ] **cache key includes market** · [ ] **write-side gate present** · [ ] probe bounded · [ ] god-key exports deleted

**Phase 6** — [ ] backup verified · [ ] **G-COMMIT** for the audited 868 lines · [ ] rebase conflict-free · [ ] catalog byte-exact (`OMT Pay`, ASCII hyphen) · [ ] no `mobile_wallet_other` · [ ] no `usdt` · [ ] **flip + write-gate in ONE commit** · [ ] 2,514 green · [ ] zero new `tsc` errors · [ ] **W1 resolved**

**Phase 7** — [ ] merge order honoured · [ ] G-PUSH ×5 · [ ] G-MERGE ×5 (PR1/PR2 CRITICAL) · [ ] each platform PR moves **exactly one** gitlink · [ ] all other pins unchanged · [ ] **no Dokploy action before platform main has the pointer**

**Phase 8** — [ ] **G-DEPLOY** (P8a) · [ ] deployed SHA matches · [ ] migration applied, no drift · [ ] CP health 200 · [ ] **every tenant reads `{null,false,null}` — no-backfill proof** · [ ] **G-DEPLOY** (P8b) · [ ] FitDesk health 200 · [ ] Cash-only confirmed for all · [ ] **G-DEPLOY / human act** (P8c) · [ ] evidence standard met · [ ] granted via the **operator contract, not a DB edit** · [ ] reads back `LB/true` via the **tenant** contract · [ ] non-LB proven fail-closed · [ ] **revoke proven, then re-granted** · [ ] audit rows verified

**Phase 9 — build the capability** *(D10 is RESOLVED — provisioning-agent stays a strict 1:1 relay; not a checklist item)*
- [ ] EES + provisioning-agent branches based on **fetched** `origin/main` (local are 2 / 3 behind)
- [ ] **PR5** merged — `_ensure_account` + whitelisted `ensure_payment_catalog`; **`dry_run` writes nothing** (tested); **no doctype parameter**; no Payment Entry ever
- [ ] **PR6** merged — operation + DocType + field allowlists; **no generic method passthrough**; bounded timeout; correlation ID; **no retries** (executor only)
- [ ] **PR7** merged — **relay is 1:1, byte-identical body, zero logic; no defaults, no retries, no mapping, no accounting, no orchestration** (if it needed >1 commit, it's doing too much)
- [ ] **PR8** merged — **G-MUT CRITICAL** for migration M8a (additive: operations/plan/result models) · **202 + operationId, never synchronous** · BullMQ worker + `GET` status · **no Prisma transaction across an HTTP call** · durable transitions + per-method results · Redis lock + idempotency key · **restart resumes and skips completed** · `enqueue_failed` persisted · **409 unless market verified `LB`** · **409 without an approved plan** · **`PLAN_DRIFT` ⇒ zero writes** · site/company/currency from the Tenant row · **audit separates authenticated credential from asserted human (D16)**
- [ ] *(PR5–PR8 may merge early — but confirm they are **unreachable**: no platform pin moved, no caller deployed)*
- [ ] **Operating-market gate deployed AND verified (P8b) — the precondition for everything below**
- [ ] **G-DEPLOY CRITICAL — PR9a** (B7): scheduled window; ERPNext image + bench-agent image rebuilt; **new code lands inert**
- [ ] erpnext-* stack healthy; `/api/method/ping` → `"pong"`; `bench list-apps` agrees across containers
- [ ] **G-DEPLOY — PR9b**; smoke.sh hop checks green; migration M8a applied, no drift

**Phase 9 — provision and prove**
- [ ] Stage 1 target resolved unambiguously (from the Tenant row)
- [ ] **`dry_run` operation → 202 → poll → succeeded; ZERO ERP writes confirmed; plan + planHash persisted**
- [ ] **B5 decided by the owner/accountant** (one dedicated USD account per method)
- [ ] **Plan approved** — `approvedAt`, `planHash`, `approvedByServiceIdentity`, `assertedHumanApprover` recorded
- [ ] **G-DEPLOY CRITICAL — `mode: apply` with `approvedPlanId`**; hash recomputed and matched (no `PLAN_DRIFT`)
- [ ] no duplicates · [ ] no wrong-currency reuse · [ ] no rename/merge/disable of existing accounts · [ ] **no Payment Entry created**
- [ ] terminal status recorded (`succeeded`/`partial`/`failed`); **`partial` triaged, not blindly retried**
- [ ] **second `dry_run` = clean no-op** (idempotency proven on real data)
- [ ] readback ×7 (`reused`, companyMapped, USD) · [ ] **Cash regression clean**
- [ ] each method ×6 · [ ] Paid Now · [ ] Pay Later · [ ] failed preflight · [ ] history exact · [ ] audit exact
- [ ] **tenant isolation** · [ ] **non-LB negative (zero probes + 409 on provisioning)** · [ ] **revoke negative (history survives)**
- [ ] closeout published · [ ] worktrees cleaned **after** validation

---

## 17. Final closeout checklist — evidence required to declare the program complete

1. **No-backfill proof** — a pre-activation reading showing every tenant `{operatingMarket: null, verified: false}`.
2. **Authority proof** — the pilot reads `LB/true` through the *tenant-scoped* contract, granted through the *operator* contract, with an `AuditEvent` carrying `requestId` + `authenticatedServiceIdentity` + `assertedHumanOperator` + before/after. **No DB edit anywhere in the trail.** The report must state plainly that the human name is an **asserted claim, not an authenticated identity** (D16) — a closeout that implies otherwise is not evidence, it is a misrepresentation.
3. **Fail-closed proof** — a non-LB tenant: zero Lebanon methods, **zero Lebanon ERP probes in the logs**, and a rejected direct POST of `mymonty` (pre-ERP).
4. **Revocation proof** — `DELETE` → the six vanish within one TTL → **historical Lebanon payments still read back exactly** → re-granted.
5. **Cash regression proof** — Cash records identically before and after, at every stage.
6. **Catalog join-key proof** — all seven ERP docnames byte-match the canonical table (`OMT Pay`; `Bank Transfer - Fresh USD` with an ASCII hyphen).
7. **Accounting proof** — the **dry-run matrix** and the **post-apply readback**, side by side: exactly seven MoPs, each enabled with exactly one company child row → a dedicated USD account; **no duplicates; no renamed/merged/disabled pre-existing accounts; no Payment Entry created during provisioning; no ledger movement**. Plus a **second dry-run showing a clean no-op** — idempotency proven on real data, not just in tests.
7b. **Approved-path proof** — every ERP write traversed `operator → CP → provisioning-agent → EES → Frappe HTTP → provisioning_api`, evidenced by one `requestId` appearing in all four services' logs **and persisted on the operation row**. **No manual ERPNext edit. No generic-proxy write. No direct DB access. No Docker exec.** If the emergency exception was invoked, it is recorded with its own owner approval and a reason.
7d. **Durability proof** — the `PaymentCatalogOperation` + `PaymentCatalogMethodResult` rows reconstruct the whole operation from persisted state alone: mode, approved plan hash, attempt count, dispatch time, per-method outcome, terminal status. **Plus a deliberate worker-restart drill** showing resume-and-skip. If the story only exists in logs, it isn't durable.
7e. **Plan-immutability proof** — the approved `planHash`, and an apply whose recomputed hash matched. Plus a **negative**: a deliberately drifted plan rejected with `PLAN_DRIFT` and **zero writes**.
7c. **Allowlist proof** — the capability is structurally incapable of writing outside `{Account, Mode of Payment}`: no doctype parameter in provisioning_api, DocType allowlist in EES, catalog + market allowlist in CP. Evidenced by the tests, plus a negative attempt showing a non-allowlisted DocType is rejected.
8. **Identity proof** — an unknown ERP mode reads back with raw text and `methodId: null`, **never Cash**; audit identity exact per method.
9. **Isolation proof** — tenant B unaffected throughout.
10. **Git proof** — eleven PRs merged in order (PR0–PR9b); platform `main` pins exactly the intended SHAs; every other pin byte-identical; **no force push, no direct prod edit**.
11. **Test proof** — FitDesk ≥2,514 green, zero new `tsc` errors vs the 21 baseline; CP suite green **and actually running all 19 files** (PR0); provisioning_api pytest green; EES + provisioning-agent suites green — including the **relay-is-byte-identical** test.
12. **Scope proof** — Other Mobile Wallet absent; USDT absent from the union; **bench-agent source and fitdesk-app untouched** (bench-agent's image rebuilt only to keep its baked app set identical, B7); no new DocType; no generic write parameter anywhere.
13. **Docs proof** — ADR-MKT-001 unchanged (architecture held); Slice 2 checkpoint closed; operator runbook merged; this plan's ledger complete.
14. **Cleanup proof** — worktrees removed and branches deleted **after** validation.
15. **Follow-ups recorded, not silently dropped** — B6 (proxy allowlist), F1 (`_create_mode_of_payment` ordering), F2 (onboarding `country` provenance → CoA), F3 (`mapPaymentProvider`), the shared-JWT-secret posture, and the god-key blast radius.

---

## 18. Proposed canonical deliverable

- **Filename:** `FITDESK_LEBANON_PAYMENT_PROGRAM_MASTER_EXECUTION_PLAN.md`
- **Directory:** `C:\Users\Lenovo\Dev\axis-erp\FitDesk\docs\plans\` — tier 5 in the Documentation Authority Map ("phase-based planning history… authoritative for *what phase of work this was and why*"). It must cross-reference `docs/adr/ADR-MKT-001-workspace-operating-market-authority.md` (binding) and `docs/plans/FITDESK_WORKSPACE_OPERATING_MARKET_AUTHORITY_PLAN.md` (architecture-approved), and record §3's corrections against the latter.
- **Table of contents:** §1 Context and the central finding · §2 Re-verified state · §3 Corrections · §4 Strategy and blockers · §5 Phases 1–9 · §6 Dependency graph · §7 Repository ownership · §8 Data ownership · §9 API contracts · §10 Migration/mutation · §11 Test matrix · §12 Threat model · §13 Git/PR/submodule map · §14 Deploy/rollback runbook · §15 Decision log · §16 Approval checklist · §17 Closeout checklist.
- **Why it is not in the repo:** this was a planning-only run in Plan mode, which forbids editing repository files. The plan lives at `C:\Users\Lenovo\.claude\plans\claude-code-model-elegant-elephant.md` — the only file this session was permitted to write. **Committing it to `FitDesk/docs/plans/` is itself a gated action** and should ride its own small docs PR (`docs(plans): add Lebanon payment program master execution plan`), not be smuggled into PR1 or PR2.

---

## 19. Git and environment confirmation

| | |
|---|---|
| Files edited | **None** — except this plan file, the only write Plan mode permits |
| Branch created | **None** |
| Worktree created | **None** |
| Dependency installed | **None** |
| Migration generated | **None** |
| DB-mutating test run | **None** |
| Staged | **Nothing** |
| Committed | **Nothing** |
| Pushed | **Nothing** |
| Merged | **Nothing** |
| Deployed | **Nothing** |
| ERP record provisioned | **None** |
| Production system accessed | **None** |
| Secret accessed / printed | **None** — env vars referenced by **name** only |

**Network:** three read-only `git ls-remote` calls (fitdesk, control-plane, fitdesk-platform) to confirm `origin/main`. `ls-remote` writes nothing locally — no fetch, no ref update, no `FETCH_HEAD`.
**Worktree integrity:** `FitDesk-payment-slice2` remains **17 modified + 1 untracked, uncommitted** — byte-identical to the start of this run. Only `git status`, `git diff`, `git show`, and file reads touched it.
