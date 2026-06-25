# FitDesk 2026 Handbook — Full Code Gap Audit

> **Status:** Complete  
> **Date:** 2026-06-25  
> **Branch:** main (synced — 0 ahead / 0 behind origin/main)  
> **HEAD:** f7adeb3 docs(scheduling): document architecture truth audit  
> **Auditor:** Claude Code (Sonnet 4.6)  
> **Mode:** Read-only. No code changes. No commits.

---

## 1. Executive Verdict

**The codebase is in substantially good shape for development / pilot use.**

Core architecture rules are being followed: ERP I/O goes through the approved proxy, no credentials leak to client code, auth and tenant isolation are correct, billing guardrails are in place, design tokens are repaired, tests pass, lint is clean, build succeeds.

No P0 blockers were found. Three P1 items require attention before production:
one dead dependency, one undocumented env var with a misleading name, and one
action that bypasses the `resolveTrainerId()` ownership pattern. None are
runtime security failures in the current single-tenant model, but all should
be addressed during the next hardening cycle.

**Recommendation:** FitDesk may safely return to onboarding validation with
the P1 items tracked as work items.

---

## 2. Repo State (pre-audit snapshot)

| Item | Value |
|---|---|
| Branch | `main` |
| HEAD | `f7adeb3 docs(scheduling): document architecture truth audit` |
| Working tree | Clean — `git status -sb` output: `## main...origin/main` |
| Stash | Empty |
| Ahead of origin | 0 |
| Behind origin | 0 |
| Handbook dir | `docs/architecture/FITDESK_2026_ARCHITECTURE_HANDBOOK/` — 17 files present |
| Prior audit docs | `CLIENT_MANAGEMENT_PHASE_0_AUDIT.md`, `CLIENT_MANAGEMENT_V1_2_FINAL_IMPLEMENTATION_PLAN.md`, `CLIENT_MANAGEMENT_V1_2_GAP_ANALYSIS.md`, `PHASE_B0_GRAPHIFY_KNOWLEDGE_GRAPH_AUDIT.md`, `PHASE_E_SCHEDULING_ARCHITECTURE_TRUTH_AUDIT.md` |

---

## 3. Handbook Coverage Map

| Handbook doc | Audit coverage | Status |
|---|---|---|
| 00 Architecture Constitution | ERP proxy, no-credentials, server-side actions, auth | ✅ Passing |
| 01 Architecture Truth Audit | Verified claims against current code | ✅ Consistent |
| 02 Cleanup Roadmap | Source control clean (Phase A done), Graphify done (Phase B0) | ✅ Consistent |
| 03 Execution Plan | Phase gates verified | ✅ Consistent |
| 04 Source Control Strategy | main synced; branches classified | ✅ Consistent |
| 05 Repository Architecture | Minor stale "ahead 17" note — see F-DOC-01 | ⚠️ Minor drift |
| 06 Frontend / UI Architecture | App Router, server actions, client component boundary | ✅ Passing |
| 07 Design System & Tokens | OKLCH/HSL defect fixed; tailwind.config uses `oklch(var(...))` | ✅ Fixed |
| 08 ERP Integration Architecture | `erpFetch()` proxy; JWT signing; CONTROL_PLANE_URL | ✅ Passing |
| 09 Scheduling Architecture | Engine exists; stubs correct; no placeholder files | ✅ Passing |
| 10 Client Management Architecture | ERP-authoritative hybrid; local projection; backfill | ✅ Passing |
| 11 Dashboard Architecture | No fake data; session widgets gated; honest empty states | ✅ Passing |
| 12 Multi-Tenant SaaS Blueprint | TenantContext scopes local queries; single ERP per tenant | ✅ Passing |
| 13 CI/CD & Deployment Standards | Graphify gitignored; no pipeline mutation; build:verify script | ✅ Passing |
| 14 Coding Standards & ADR Index | Core ADRs present; several still missing (known) | ⚠️ Known gap |
| 15 Production Readiness Checklist | Key items verified; 3 items need update — see drift section | ⚠️ Minor drift |

---

## 4. Findings Table

| ID | Sev | Category | Finding | Action |
|---|---|---|---|---|
| F-P1-01 | P1 | Dependencies | Prisma dead dependency | Patch now |
| F-P1-02 | P1 | Config / Env | `NEXT_PUBLIC_FRAPPE_URL` undocumented and misnamed | Patch now |
| F-P1-03 | P1 | Auth / Ownership | `addInvoice()` bypasses `resolveTrainerId()` pattern | Patch now |
| F-P2-01 | P2 | Billing / UX | Manual invoice page accessible — checklist vs. code | Needs architecture decision |
| F-P2-02 | P2 | Data Model | `normalizeClient()` returns `trainerId: ''` | Document only |
| F-P2-03 | P2 | Tests / Build | `vite-tsconfig-paths` deprecation warning in test run | Defer |
| F-P3-01 | P3 | Scheduling | PT Session DocType absent — session lifecycle stubbed | Defer (known) |
| F-P3-02 | P3 | Billing | Package billing lifecycle incomplete | Defer (guarded) |
| F-P3-03 | P3 | ADRs | ADR-SCH-001, ADR-SRC-001, ADR-TOK-001, ADR-DEP-001, ADR-PROG-001 missing | Defer |
| F-DOC-01 | P3 | Docs drift | `05` says "main, ahead 17" — now synced | Document only |
| F-DOC-02 | P3 | Docs drift | `15` checklist "ahead-17 intentionally pushed" — done; box unchecked | Document only |
| F-DOC-03 | P3 | Docs drift | `15` checklist "Manual '+ Invoice' hidden" — ambiguous vs. current code | Needs architecture decision |

---

## 5. P1 Blockers — Detail

### F-P1-01 — Prisma dead dependency

**Handbook expectation (`CLAUDE.md`):** "No Prisma, no Supabase, no paid auth services."

**Current code evidence:**
- `package.json:dependencies["@prisma/client"] = "^6.17.1"`
- `package.json:devDependencies["prisma"] = "^6.17.1"`
- `prisma/schema.prisma` — contains a `WorkspaceProvisioning` model mirroring `lib/db/schema.ts:workspaceProvisioning`
- `prisma/migrations/` directory exists
- Grep for Prisma import across all `.ts`/`.tsx` source files: **0 matches** — Prisma is never actually imported or instantiated

**Risk:** Contradicts `CLAUDE.md`. Adds ~2.5 MB to node_modules. Creates confusion for future contributors. The duplicate `WorkspaceProvisioning` model in `prisma/schema.prisma` could mislead someone into migrating via Prisma instead of Drizzle.

**Recommendation:** Remove `@prisma/client` and `prisma` from `package.json`. Delete `prisma/schema.prisma` and `prisma/migrations/`. The live migration path is `scripts/migrate.mjs` + `scripts/migrate-app.mjs` using Drizzle.

**Business risk if skipped:** Low at runtime. Medium for developer confusion. Violates stated constraint.

**MVP-safe now?** Yes — Prisma is never called.

---

### F-P1-02 — `NEXT_PUBLIC_FRAPPE_URL` undocumented and misnamed

**Handbook expectation (`08`, `15`, `.env.example`):** All ERP access via `CONTROL_PLANE_URL`. `.env.example` documents all required env vars.

**Current code evidence:**
- `app/dashboard/page.tsx:37` — `const isLocalBackend = (process.env.NEXT_PUBLIC_FRAPPE_URL ?? '').includes('localhost')`
- `components/dev/LocalBackendWarning.tsx` — "NEXT_PUBLIC_FRAPPE_URL contains 'localhost'" comment
- `.env.example` — `NEXT_PUBLIC_FRAPPE_URL` is **absent**
- No other references in source

**Risk:** The name `NEXT_PUBLIC_FRAPPE_URL` implies direct Frappe access, contradicting the proxy model. Operators following `.env.example` would never set it, so `isLocalBackend` would always be `false` — benign in production, but the dev-environment warning would never fire. More importantly, a future operator may infer the wrong architecture from the variable name.

**Recommendation:** Either (a) replace with `NEXT_PUBLIC_CONTROL_PLANE_URL` (rename the check), or (b) remove the local-backend warning entirely since it adds no actionable value. If kept, add `NEXT_PUBLIC_FRAPPE_URL` to `.env.example` with a clear comment.

**Business risk if skipped:** None at runtime in production. Dev UX confusion.

**MVP-safe now?** Yes — warning just won't fire.

---

### F-P1-03 — `addInvoice()` bypasses `resolveTrainerId()` pattern

**Handbook expectation (`08`, `00`):** All ERP write actions must use the trainer-ownership auth pattern. Session actions explicitly use `resolveTrainerId()` before any ERP call.

**Current code evidence (`actions/invoices.ts:addInvoice`):**
```ts
export async function addInvoice(payload: CreateInvoicePayload): Promise<ActionResult<Invoice>> {
  const session = await auth.api.getSession({ headers: headers() })
  if (!session?.user) return { success: false, error: 'Not authenticated.' }
  // No resolveTrainerId() — no trainer account existence check
  // No validation that payload.customer belongs to this trainer
  const data = await createInvoice(payload)
```

Compare with all other write actions (`addClient`, `editClient`, `completeSession`, `noShowSession`, `cancelSession`) — all use `resolveTrainerId()` which additionally ensures the Trainer account is set up in ERPNext.

**Risk in current single-tenant model:** Low — each ERP tenant belongs to exactly one workspace, so all Customers in the ERP belong to the authenticated trainer. However, the inconsistency means:
1. If the trainer's ERP account is not yet configured, `addInvoice` will succeed at the auth check but fail at the ERP level with a less helpful error than `resolveTrainerId()`'s "Trainer account not configured."
2. The invoice payload's `customer` field is caller-controlled with no validation that the customer is one of this trainer's clients.

**Recommendation:** Replace `auth.api.getSession()` with `resolveTrainerId()` in `addInvoice()`. As a separate step (production hardening), add a validation that `payload.customer` belongs to this trainer's client list.

**Business risk if skipped:** Low now (single-tenant). IDOR-adjacent for multi-trainer scenarios.

---

## 6. P2 — Production Hardening Soon

### F-P2-01 — Manual invoice page accessible; checklist item ambiguous

**Handbook expectation (`15_PRODUCTION_READINESS_CHECKLIST.md`):**
```
- [ ] Manual "+ Invoice" remains hidden per UX decision; no duplicate financial store.
```

**Current code evidence:**
- `app/dashboard/invoices/new/page.tsx` — full manual invoice creation page exists and is routed
- `components/modules/InvoicesView.tsx:630` — "New Invoice" sheet rendered inside the invoices list
- Bottom nav links to `/dashboard/invoices` from which the "New Invoice" button is one tap
- Handbook `11` lists "Create Invoice" as an accepted Quick Action

**Assessment:** The checklist item is ambiguous. The code's "New Invoice" UX is accessible but not prominent in the main flow. The `11` handbook explicitly includes "Create Invoice" in Quick Actions. The checklist likely means: manual invoice creation should remain a deliberate flow, not appear on the client add screen or be auto-triggered. Not that the route should be deleted.

**Recommendation:** Update `15_PRODUCTION_READINESS_CHECKLIST.md` to clarify: "Manual invoice creation is a deliberate trainer action via /dashboard/invoices (acceptable); it must not be triggered automatically by client creation or session completion." Then check the box if that condition holds (it does).

---

### F-P2-02 — `normalizeClient()` returns `trainerId: ''`

**Current code evidence (`lib/erpnext/client.ts:normalizeClient`):**
```ts
function normalizeClient(raw: ERPCustomer): Client {
  return {
    ...
    trainerId: '',  // ERP Customer has no trainer field
    sessionCount: 0,
  }
}
```

**Risk:** Any code that reads `client.trainerId` for ownership logic will get an empty string. In the single-tenant per-workspace model this is safe (ownership is implicit in the ERP tenant), but it violates the `Client` interface contract. `sessionCount: 0` is also always hardcoded.

**Recommendation:** Document the intentional empty values in the `Client` type or change the type to make `trainerId` and `sessionCount` optional. Low priority. Does not affect runtime safety.

---

### F-P2-03 — `vite-tsconfig-paths` deprecation warning

**Current evidence:** Running `npm test` prints:
```
The plugin "vite-tsconfig-paths" is detected. Vite now supports tsconfig paths
resolution natively via the resolve.tsconfigPaths option.
```

**Recommendation:** In the next dependency update cycle, remove `vite-tsconfig-paths` from `vitest.config.ts` and set `resolve: { tsconfigPaths: true }`. Zero functional impact.

---

## 7. MVP-Safe Now (Verified ✅)

These items were explicitly verified against current code — not assumed.

| Area | Verification |
|---|---|
| ERP proxy enforced | `erpFetch()` signs HMAC JWT → `CONTROL_PLANE_URL`; no direct Frappe URLs anywhere |
| No ERP credentials in FitDesk | Only `FITDESK_JWT_SECRET` (signing key) and `CONTROL_PLANE_URL` present; verified `.env.example` |
| Server-only ERP calls | Grep confirmed: zero client components (`'use client'`) import `erpFetch`, `lib/erpnext/client`, or `erp-adapter` |
| Auth: Better Auth + Drizzle | `lib/auth.ts` — `drizzleAdapter(db, { provider: 'sqlite' })`, email+password + optional Google |
| Route protection | `middleware.ts` — blocks unauthenticated `/dashboard/*`; redirects unprovisioned to `/onboarding` |
| Tenant context | `lib/tenant/context.ts` — `server-only`; reads from local SQLite only; no ERP calls |
| Billing C0 gate | `components/clients/AddClientForm.tsx:419` — `if (billingMode === 'package')` blocks submission with clear message |
| `addClient` zero side effects | `actions/clients.ts:addClient` — creates ERP Customer + local enrichment rows only; `createInvoice` is not called (verified by 668 tests including explicit `expect(erp.createInvoice).not.toHaveBeenCalled()` assertions) |
| Session stubs correct | `lib/erpnext/client.ts` — `getSessions()` returns `[]`; all mutations throw `503 Not Implemented`; `getSessionById` throws `404` |
| No bookingService / sessionRepository placeholders | `lib/scheduling/bookingService.ts`, `sessionRepository.ts`, `actions/schedulingActions.ts` — **do not exist** (correct per Phase E audit) |
| Scheduling engine exists | `lib/scheduling/engine.ts` — Luxon-based, DST detection, timezone-aware, series patterns, conflicts |
| Design token defect fixed | `tailwind.config.ts` — all shadcn semantic tokens use `oklch(var(--token))` not `hsl(var(...))` |
| `lib/errors/is-unavailable-error.ts` refactored | Canonical at `lib/errors/`; `lib/erpnext/is-unavailable-error.ts` re-exports from it |
| `.env.example` present and complete | All runtime env vars documented; no secrets; explicit proxy / no-direct-ERP comment |
| Health endpoint safe | Only exposes boolean `configured` flags; no actual secret values |
| No fake dashboard data | `BusinessHealth` comment: "No Sessions/Week. No deltas. No fake data."; sessions `[]` = honest empty |
| Dashboard resilient to partial failure | `Promise.allSettled` — ERP failure does not blank the dashboard |
| Onboarding → Control Plane only | `components/onboarding/provisioning-status.tsx` polls `/api/controlplane/jobs/[jobId]`; no Docker calls |
| Payment provider abstraction | `PaymentProvider` type; `isEnabledPaymentMethod()`; Cash/Bank Transfer/Whish all supported |
| Invoice ownership gate (read path) | `getInvoiceByIdForTrainer()` documented: single-tenant = all invoices belong to workspace trainer |
| Graphify output gitignored | `graphify-out/` in `.gitignore` (commit `c9afead`); Phase B0 audit committed in `docs/audits/` |
| Tests green | 668 tests / 27 files — all passing |
| Lint green | `next lint` — "No ESLint warnings or errors" |
| Build green | `npm run build:verify` — all routes build clean |

---

## 8. Production Hardening Soon

| Item | Effort | Risk if skipped |
|---|---|---|
| Remove Prisma dependency (F-P1-01) | Small: remove from package.json, delete prisma/ | Dev confusion; CLAUDE.md violation |
| Fix `NEXT_PUBLIC_FRAPPE_URL` (F-P1-02) | Small: rename or remove env var + component | Dev UX confusion; no runtime impact |
| Add `resolveTrainerId()` to `addInvoice` (F-P1-03) | Small: 3-line change | Low risk now; IDOR-adjacent at scale |
| Clarify "Manual '+ Invoice' hidden" checklist (F-P2-01) | Documentation only | Misleading checklist |
| Document `trainerId: ''` in Client type (F-P2-02) | Documentation / type change | Developer confusion |
| Fix `vite-tsconfig-paths` deprecation (F-P2-03) | Small: update vitest.config | No functional impact |

---

## 9. Future Platform Items

| Item | Phase | Notes |
|---|---|---|
| PT Session DocType | Phase F0/E | All session mutations intentionally stubbed. Unblock after choosing persistence architecture (Phase E). |
| Package billing lifecycle | Phase C1 | C0 gate in place. Requires ERP DocType changes (sell_package, session decrement). |
| Write missing ADRs | Phase H | ADR-SCH-001, ADR-SRC-001, ADR-TOK-001, ADR-DEP-001, ADR-PROG-001 |
| Multi-trainer IDOR hardening | Phase E3 | Invoice and session ownership gates need explicit customer-to-trainer validation when multi-trainer exists |
| `sessionCount` from real ERP data | Post-F0 | Currently always 0; needs PT Session once DocType exists |
| CI per-repo pipelines | Phase H | Tests run locally; no automated CI yet |

---

## 10. Documentation Drift

| ID | Doc | Current claim | Actual state | Recommended fix |
|---|---|---|---|---|
| F-DOC-01 | `05_REPOSITORY_ARCHITECTURE.md` | "FitDesk `main`, ahead 17" | main is synced (0 ahead/behind) | Update table to "ahead 0; synced via Phase A" |
| F-DOC-02 | `15_PRODUCTION_READINESS_CHECKLIST.md` | "FitDesk `main` reconciled with origin (the ahead-17 intentionally pushed under instruction)" unchecked | main is pushed and synced | Check this box |
| F-DOC-03 | `15_PRODUCTION_READINESS_CHECKLIST.md` | "Manual '+ Invoice' remains hidden per UX decision" | Manual invoice page exists and is accessible — may be intentional | Clarify intent; update or qualify the checklist item |

---

## 11. Verification Commands Run

```bash
# Repo state
git branch --show-current         # → main
git log --oneline -1              # → f7adeb3
git status -sb                    # → clean
git rev-list --count origin/main..main  # → 0 (ahead)
git rev-list --count main..origin/main  # → 0 (behind)

# Source inventory
find app lib actions components -type f -name "*.ts" -o -name "*.tsx"

# ERP proxy — no client component imports ERP server modules
grep -r "'use client'" --include="*.tsx" -l | xargs grep -l "erpFetch\|CONTROL_PLANE\|erp-adapter" 2>/dev/null
# → (no output — confirmed safe)

# Prisma usage in source
grep -r "prisma\|Prisma" --include="*.ts" --include="*.tsx" -l | grep -v node_modules
# → (exit 1 — no matches)
ls prisma/     # → auth.db  migrations  schema.prisma

# Design tokens
cat app/globals.css | head -120   # OKLCH triplets — confirmed
cat tailwind.config.ts            # oklch(var(--token)) — confirmed

# Billing C0 gate
grep -n "Package\|handleSubmit\|billingMode === 'package'" components/clients/AddClientForm.tsx
# → line 419: if (billingMode === 'package') ...

# Session stubs
cat lib/erpnext/client.ts | grep -A 3 "getSessions\|getSessionById\|createSession\|markSessionComplete"
# → all throw / return []

# Scheduling engine
cat lib/scheduling/engine.ts | head -60   # Luxon-based, DST detection — confirmed

# Test suite
npm test       # 668 tests / 27 files — all passing

# Lint
npm run lint   # No ESLint warnings or errors

# Build
npm run build:verify   # All routes compile — confirmed
```

---

## 12. Final GO / NO-GO for Returning to Onboarding Validation

### GO WITH CAUTIONS ✅

**Safe to proceed with onboarding validation because:**
- Core architecture rules hold: ERP proxy enforced, no credential leaks, auth correct, tenant isolation correct
- Billing guardrails in place: Package mode blocked, `addClient` no invoice side effects
- Design system repaired: OKLCH tokens working
- Tests, lint, and build all green
- Session lifecycle is honestly stubbed (not fake)
- Graphify audit complete

**Track these before production merge:**
1. Remove Prisma (F-P1-01) — CLAUDE.md violation, easy fix
2. Fix `NEXT_PUBLIC_FRAPPE_URL` naming (F-P1-02) — documentation gap, easy fix
3. Add `resolveTrainerId()` to `addInvoice()` (F-P1-03) — ownership consistency, 3-line fix
4. Clarify "Manual '+ Invoice' hidden" checklist item (F-DOC-03) — ambiguous documentation

**Do NOT block onboarding validation on:**
- PT Session lifecycle (intentionally deferred, Phase E)
- Package billing (intentionally deferred, Phase C1)
- Missing ADRs (Phase H)
- `vite-tsconfig-paths` deprecation (next dep update cycle)
