> **Status:** Archived - stale migration plan
> **Replacement authority:** docs/plans/FITDESK_ACTIVE_ROADMAP_V3.md; a fresh repository audit is required
> **Archived date:** 2026-07-18
> **Instruction:** Do not execute this historical plan without a new current-state audit.
> **Note:** Relative link paths were depth-adjusted on 2026-07-19 for the archive location. No other content was modified.

---

# Phase 8A — Feature-Folder Migration Plan

- **Date:** 2026-07-04
- **Phase:** 8A (planning only — audit + incremental, shimmed migration map)
- **Author:** Claude Code (audit / docs-only)
- **Predecessor:** Phase 7A — `1d8a012` `docs(billing): plan PPS live ERP QA`
- **Scope:** Audit the current architecture and produce a safe, incremental `features/` migration plan that avoids breaking imports, routes, tests, and the ERP/proxy boundary. **No runtime code changed. No files moved. No imports changed.**

---

## Verdict: **PLAN READY**

The migration is low-risk to *start*: the `@/features/*` pattern is **already proven live**, a **CI gate already runs** the full test + lint + build on every push/PR, blast radius is quantified below, and a near-zero-risk pilot slice (onboarding — **1 inbound importer**) is identified. The plan proceeds one domain per commit, each behind re-export shims, with a type-check + full-suite gate after every move.

---

## Audited files / signals

| Signal | Source | Finding |
|---|---|---|
| Path alias | [`tsconfig.json:17-19`](../../../../tsconfig.json) | **Single** alias `@/* → ./*` (root-relative). `features/` resolves as `@/features/*` with no config change. |
| Test path resolution | [`package.json:66`](../../../../package.json) (`vite-tsconfig-paths`) | vitest already resolves `@/*` — proven by the existing `features/` component being testable. **No test-config change needed.** |
| CI gate | [`.github/workflows/ci.yml`](../../../../.github/workflows/ci.yml) | On push/PR to `main`: `npm test` → `npm run lint` → `npm run build:verify`. The tenant-isolation + source-invariant suites run inside `npm test`, so they **already gate merges**. |
| `features/` scaffold | `find features` | 8 domains (billing, clients, dashboard, goals, messaging, onboarding, scheduling) × `{components,hooks,types}`; **28 `.gitkeep` + exactly one real file**. |
| Proven pattern | [`app/dashboard/@overlay/(.)clients/[id]/page.tsx:3`](../../../../app/dashboard/@overlay/(.)clients/[id]/page.tsx) → [`features/clients/components/ClientWorkspaceOverlay.tsx`](../../../../features/clients/components/ClientWorkspaceOverlay.tsx) | A live Next route **already imports a feature component** via `@/features/...`. Alias + RSC-route→feature-component boundary is proven end-to-end. |
| Domain sizes | `find … -name '*.ts*'` | `app` 46 · `actions` 14 · `components` 87 · `lib` 124 · `types` 6 · `features` 1. |
| Roadmap Phase 8 | [`docs/plans/FITDESK_REMAINING_ROADMAP_V2.md:421-446`](./FITDESK_REMAINING_ROADMAP_V2.md) | Move one feature at a time behind shims; no big-bang rewrite; no behavior change. |
| Handbook cleanup | [`docs/architecture/FITDESK_2026_ARCHITECTURE_HANDBOOK/02_CLEANUP_ROADMAP.md:30-110`](../../../architecture/FITDESK_2026_ARCHITECTURE_HANDBOOK/02_CLEANUP_ROADMAP.md) | "No migration map, shim… exists yet." This plan is that map. |

---

## Current-state findings

### 1. Architecture truth
Domain code lives in four root buckets, addressed by one alias (`@/*`):
- **`app/`** — Next App Router routes (`page`/`layout`/`loading`/intercepting `@overlay`). Route files, not domain logic.
- **`actions/`** — 14 `'use server'` server-action modules (clients, packages, sessions, schedulingActions, invoices, messages, whatsapp…).
- **`components/`** — 87 files in 6 buckets; `components/modules` is the catch-all (31 inbound importers).
- **`lib/`** — 124 files in 17 domain subdirs (the real logic + repositories + services).
- **`types/`** — 6 shared type modules.

### 2. What `features/` contains today
An empty scaffold **plus one migrated, live component**: `features/clients/components/ClientWorkspaceOverlay.tsx`, consumed by the client-overlay intercepting route. Everything else is `.gitkeep`. **The migration is ~1% done and the plumbing is proven.**

### 3. Blast radius (inbound importers — higher = riskier to move)

**Stable-core `lib/` (must NOT move this phase):**
| Module | Importers | Why frozen |
|---|---|---|
| `lib/db` (schema/migrations) | 35 | DB schema is the highest-fan-in surface; migrations are hand-maintained. |
| `lib/auth` | 27 | Auth boundary. |
| `lib/billing` | 24 | Just hardened in Phase 6 (ledger/consumption/completion). Do not disturb. |
| `lib/business-data` | 23 | The `erp-adapter` re-export barrel — a boundary, not a feature. |
| `lib/erpnext` | 18 | ERP client/proxy boundary. |
| `lib/scheduling` (engine 5) | 17 | Scheduling engine + session completion service. |
| `lib/tenant` | 10 | Tenant context. |

**Component churn:** `components/modules` = 31 inbound (highest) → migrate piecemeal, never as one slice.

**Low-fan-in leaves (safe pilots):** `components/onboarding` = 1 · `components/account` = 1 · `lib/ui` = 2 · `lib/controlplane` = 4 · `lib/workspace` = 5 · `lib/invoices` = 6 · `lib/dashboard` = 8.

### 4. Domains ready vs frozen
- **Ready (UI-first, low risk):** onboarding, messaging, dashboard, goals, scheduling **UI**, billing **UI**, clients **UI** (already started).
- **Frozen (do not move this phase):** `lib/db/*`, `lib/auth/*`, `lib/tenant/*`, `lib/billing/*` **service layer**, `lib/erpnext/*`, `lib/scheduling/engine.ts` + `bookingService`/`sessionRepository`/`sessionCompletionService`, `lib/business-data/*`, and **all `app/` route files**.

---

## Proposed migration slices (one domain per commit, shimmed, reversible)

> **Principle:** move the file into `features/<domain>/…`, leave a **re-export shim** at the old path (`export * from '@/features/<domain>/…'`), then update importers opportunistically. The shim keeps every existing import working, so each slice is independently green and independently revertible. Move **UI first**; leave `lib/` service layers in place.

| Slice | Domain (UI only) | Move | Shim left at | Inbound risk |
|---|---|---|---|---|
| **0 (pilot)** | onboarding | `components/onboarding/{provisioning-status,workspace-setup-form}.tsx` → `features/onboarding/components/` | `components/onboarding/*` | **1 importer** (`app/onboarding/page.tsx`) — trivial |
| 1 | messaging | `components/modules/{MessagesView,WhatsAppView}.tsx` → `features/messaging/components/` | `components/modules/*` + barrel | modules barrel + 2 routes |
| 2 | dashboard | `components/modules/dashboard/*` → `features/dashboard/components/` | `components/modules/*` | dashboard routes |
| 3 | goals (UI) | goal chips/cards from `components/modules/*` → `features/goals/components/` | old paths | keep `lib/goals/*` in place |
| 4 | scheduling (UI) | `components/scheduling/*` → `features/scheduling/components/` | `components/scheduling/*` | **engine stays in `lib/scheduling`** |
| 5 | billing (UI) | `components/clients/PackageDetailsSheet.tsx` etc. → `features/billing/components/` | old paths | **service layer stays in `lib/billing`** |
| 6 | clients (UI) | remaining `components/clients/*` → `features/clients/components/` | `components/clients/*` | completes the started slice; **`lib/clients/*` stays** |

Each slice = **one commit**. Never run two domains in one commit. `types/` and `hooks/` for a domain migrate **with** their domain's slice only if they are domain-private; shared types stay in `types/`.

---

## Test plan (run after every single move, before committing)

1. `npx tsc --noEmit` — fast type gate; catches broken import specifiers immediately.
2. `npm test` — full vitest suite (includes tenant-isolation repository tests + source-invariant guards that assert ERP/proxy boundaries). **Must stay green.**
3. `npm run lint` — ESLint (next lint).
4. `npm run build:verify` — production build + RSC/route boundary check (catches `'use client'`/`'use server'` regressions and route breakage).
5. CI re-runs steps 2–4 on push/PR (`ci.yml`). **Rollback** = `git revert <slice-commit>` — clean because each slice is atomic and shimmed.

---

## Risks

- **R1 — Import-alias churn (single `@/*`).** Every consumer references the old path. **Mitigation:** re-export shim at the old path so no consumer edit is forced by the move itself; update importers lazily in later, separate commits. `isolatedModules: true` means pure type re-exports need `export type` — use `export *` only for value+type modules, `export type *` for type-only ones.
- **R2 — Barrel exports.** `components/modules/index.ts` and `lib/business-data/index.ts` are barrels; moving a member out breaks the barrel unless it re-exports from the new location. (The dead `SessionActions` barrel entry found in Phase 6D shows barrel fragility.) **Mitigation:** update the barrel to re-export from `@/features/...` in the same slice; keep the barrel's public surface identical.
- **R3 — Route files must stay in `app/`.** Next resolves routes by `app/` location; moving a `page.tsx`/`layout.tsx`/intercepting route into `features/` breaks routing. **Mitigation:** move only the *components/hooks/types* a route imports; the route stays in `app/` and imports `@/features/...` (proven by the overlay route).
- **R4 — Server/client directives + `server-only`.** A moved file must keep its `'use client'`/`'use server'` header; `server-only`-guarded modules must still resolve (there is a test stub at `test/stubs/server-only.ts`). **Mitigation:** move headers verbatim; `build:verify` catches violations.
- **R5 — Test relative paths.** `__tests__` use `../` relative imports; moving a module moves its test and can break `../foo`. **Mitigation:** move the test with the module and rewrite its relative imports to `@/` in the same slice.
- **R6 — Scope creep into frozen core.** The temptation to "also move `lib/billing`/`lib/erpnext` while here." **Mitigation:** frozen list is explicit below; UI-only slices; service layers untouched.

---

## Exact non-goals (this 8A run, and constraints for 8B)

- **No runtime code changes, no file moves, no import edits** in this planning run.
- **No move of the frozen core:** `lib/db/*` (schema/migrations), `lib/auth/*`, `lib/tenant/*`, `lib/billing/*` service layer, `lib/erpnext/*` (proxy/client), `lib/scheduling/engine.ts` + `bookingService`/`sessionRepository`/`sessionCompletionService`, `lib/business-data/*`.
- **No `app/` route file moves** — routes stay in `app/`.
- **No behavior change** — pure relocation behind shims; identical public surface.
- **No big-bang / multi-domain commit** — one domain per commit.
- **No ERP/proxy boundary change, no schema/migration/env/Dokploy/volume/sibling-service edits, no ERP credentials.**
- **No dependency changes, no `tsconfig`/alias changes** (single `@/*` already works).
- **No push** (commits are local; push is a separate, explicitly-instructed step).

---

## First implementation prompt (Phase 8B — pilot slice; do NOT execute here)

> **Task: execute Phase 8B — migrate the onboarding UI into `features/onboarding` behind shims (pilot slice).**
> Preconditions: branch `main`, clean tree, in sync with origin. Do not touch any frozen-core module (`lib/db`, `lib/auth`, `lib/tenant`, `lib/billing`, `lib/erpnext`, `lib/scheduling/engine`, `lib/business-data`) and do not move any `app/` route file.
> Steps: (1) Move `components/onboarding/provisioning-status.tsx` and `components/onboarding/workspace-setup-form.tsx` into `features/onboarding/components/`, preserving each file's `'use client'`/`'use server'` header verbatim. (2) Leave a re-export shim at each old path (`export * from '@/features/onboarding/components/<name>'`) so any current importer keeps working. (3) Update the single real importer `app/onboarding/page.tsx` to import from `@/features/onboarding/components/...`. (4) If `app/onboarding/actions.test.ts` or any test references the moved components by relative path, update those to `@/features/...`.
> Verify in order: `npx tsc --noEmit` → `npm test` → `npm run lint` → `npm run build:verify`. All must pass. Confirm `git status` shows only the two moved files, their shims, and the one importer edit.
> Commit (do not push): `refactor(features): begin shimmed feature migration`. Report the diff scope, test/lint/build results, and `git status --short`.

---

## Commit recommendation (this 8A run)

Docs-only. Stage exactly `docs/plans/PHASE_8_FEATURE_FOLDER_MIGRATION_PLAN.md` and commit:

```
docs(architecture): plan feature folder migration
```

Do not push. Phase 8B (the pilot slice) is a separate, code-touching run gated on this plan.
