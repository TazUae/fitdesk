# ADR-002 — Shared UI Atom Ownership

- **Status:** Accepted
- **Date:** 2026-07-05
- **Phase:** 8T (decision/ADR only — no runtime code moved)
- **Author:** Claude Code
- **Predecessor:** Phase 8S — `f71ee81` `refactor(clients): migrate client action leaf to feature folder`
- **Governing parent:** [ADR-UX-002 — FitDesk Component Taxonomy](PHASE_0B_SYSTEMIZATION/ADR-UX-002-FITDESK_COMPONENT_TAXONOMY.md) (Approved v1.1)

> **Numbering note.** The existing ADRs are numbered `ADR-UX-NNN` under `PHASE_0B_SYSTEMIZATION/`. This document is filed at the requested top-level path `docs/architecture/ADR-002-shared-ui-atom-ownership.md` as the second decision in the **Phase 8 feature-folder migration** series (ADR-001 being the migration plan itself, [`docs/plans/PHASE_8_FEATURE_FOLDER_MIGRATION_PLAN.md`](../archive/plans/2026-07-18-consolidation-20260718-170652/PHASE_8_FEATURE_FOLDER_MIGRATION_PLAN.md)). It **applies**, and does not supersede, the constitution-level taxonomy in ADR-UX-002.

---

## Context

Phases 8A–8S of the feature-folder migration moved **22 domain UI components** out of the `components/modules` catch-all into their owning `features/<domain>/components/` folders, each behind a re-export shim, with the full `npm test → lint → build:verify` gate green after every slice.

The Phase 8R audit identified the next candidates as a distinct class: **cross-cutting UI atoms** that are consumed by *multiple* domains rather than owned by one:

| Atom | File today | What it is |
|---|---|---|
| `Avatar` | `components/modules/Avatar.tsx` | Initials-in-a-circle badge; deterministic colour hash. Only dependency: `cn` from `@/lib/utils`. |
| `Badge` | `components/modules/Badge.tsx` | Status pill with a `BadgeVariant` union. Only dependency: `cn`. |
| `LoadingSkeleton` (+ `CardSkeleton`, `StatSkeleton`, `Skeleton`) | `components/modules/LoadingSkeleton.tsx` | Pulse placeholders for Suspense fallbacks. Only dependency: `cn`. |
| `PilotBanner` | `components/modules/PilotBanner.tsx` | Stateless "pilot mode" banner. Only dependency: a lucide icon. |

Moving any of these into a single domain's feature folder (e.g. `features/dashboard/components/`) would force **unrelated** domains (messaging, clients, scheduling, billing, app routes) to import from that domain's folder — the exact cross-domain coupling the migration exists to remove. Their home therefore has to be decided **before** they move, not slice-by-slice.

**Decisive existing signals:**

1. **`components/ui/` already exists** and is chartered by ADR-UX-002 as the **primitive-component** home ("Global location: `/components/ui`"). Its own `index.ts` documents it as the shadcn/ui primitive folder and lists **Badge** among the suggested primitives.
2. It already holds live, cross-cutting, zero-business-logic primitives — `WorkspaceShell`, `MobileShell`, `PhoneInput`, `AgeInput`, `GoalSelect`, `GoalMultiSelect`.
3. The direction we want is **already live**: `features/dashboard/components/QuickActionsFab.tsx` imports `@/components/ui/WorkspaceShell`. Features depend on `components/ui`; `components/ui` depends on no feature. That is the dependency arrow this ADR preserves.
4. The four atoms satisfy every ADR-UX-002 **primitive** rule: no business logic, no data fetching, no ERP terminology, no feature-specific assumptions. They are leaf presentational components (a `div`, a `span`, a banner), not composites.

---

## Decision

**Shared, stateless UI atoms move to `components/ui/`** — the existing, constitution-sanctioned primitive folder — behind re-export shims at their old `components/modules/*` paths, one atom per commit, using the same proven Phase 8 pattern.

Canonical import form is the **direct path** (`@/components/ui/Avatar`), matching the folder's existing convention (only `WorkspaceShell` is barrelled today; `PhoneInput`/`AgeInput`/etc. are imported directly). The `components/ui/index.ts` barrel is **not** expanded as part of these moves.

This ADR is an **application** of ADR-UX-002's already-approved taxonomy to four named components; it introduces no new taxonomy, no new folder, and no config change.

---

## Alternatives considered

| Option | Verdict | Why |
|---|---|---|
| **1. Keep atoms in `components/modules/`** | Rejected | `components/modules` is the catch-all being actively dismantled by Phase 8 (it still holds orchestrators like `DashboardView`, `ScheduleView`, `ClientsView`, `InvoicesView`). Leaving primitives mixed with orchestrators perpetuates the god-folder and contradicts ADR-UX-002, which places primitives in `/components/ui`. |
| **2. Move atoms to `components/ui/` ✅** | **Accepted** | The folder already exists, is chartered by ADR-UX-002 for exactly this class, already hosts cross-domain primitives that features depend on, needs zero config/alias change, and keeps the dependency arrow features → ui (never feature → feature). |
| **3. Move atoms to `components/common/`** | Rejected | Invents a new folder that semantically duplicates the existing `components/ui`. Two homes for primitives = ambiguity and drift, with no benefit over `components/ui`. Not sanctioned by ADR-UX-002. |
| **4. Move atoms to `features/shared/components/`** | Rejected | "shared" is not a domain. This invents a pseudo-domain, implies the atoms are feature components (they are not), and fragments primitives across two locations (`components/ui` + `features/shared`). Contradicts ADR-UX-002's primitive rule. |

---

## Consequences

**Positive**
- Primitives live where the constitution says they live; `components/modules` shrinks toward containing only orchestrators (its remaining legitimate residents until they too are addressed).
- The dependency graph stays acyclic and correctly-directed: every feature may depend on `components/ui`; `components/ui` depends on nothing domain-specific.
- Zero blast radius from the decision itself — every existing import keeps working via the shim; importers are updated opportunistically, exactly as in Phases 8B–8S.
- No `tsconfig`, alias, dependency, or lockfile change. `@/components/ui/*` already resolves.

**Neutral / follow-ups (do NOT block, do NOT bundle into a move commit)**
- **Token purity:** `Avatar` (its `COLORS` hex palette) and `Badge` (a few `#E6F4EA` / `#FCE8E6` literals) contain hardcoded colours, a minor deviation from ADR-UX-002's "colours via tokens" rule. This is pre-existing and consistent with the folder's as-built reality (`WorkspaceShell`/`PhoneInput` already use raw `rgba(...)`). Relocation must be **verbatim**; a token pass is a separate, later concern tracked against ADR-UX-004/006 — never inside a relocation commit.
- **`Badge` exports a type.** `BadgeVariant` is a type alongside the `Badge` value. Under `isolatedModules: true`, the shim and the barrel must re-export it with `export type { BadgeVariant }` (not a bare `export`). This is the R1 risk from the migration plan; the slice that moves `Badge` must handle it explicitly.
- **`Avatar` has one relative importer.** `components/modules/UserMenuSheet.tsx` imports `./Avatar`. The shim at `components/modules/Avatar.tsx` keeps that working after the move; `UserMenuSheet` itself is not migrated by this decision.

---

## Migration rules (per-atom slice, mirroring Phases 8B–8S)

1. Move the file **verbatim** into `components/ui/<Name>.tsx`. Preserve any directive header exactly (note: all four atoms are currently directive-free — no `'use client'` to add or remove).
2. Leave a thin re-export shim at the old `components/modules/<Name>.tsx` path:
   - value-only: `export { X } from '@/components/ui/X'`
   - value **+ type** (`Badge`): add a second line `export type { BadgeVariant } from '@/components/ui/Badge'`.
3. Update the `components/modules/index.ts` barrel entry to re-export from `@/components/ui/<Name>` (same edit shape used in Phases 8C and 8S). Keep the barrel's public surface identical.
4. Update direct importers to `@/components/ui/<Name>` opportunistically (consistent with prior phases; optional because the shim covers correctness).
5. **Do not** expand `components/ui/index.ts`; direct-path import is canonical for this folder.
6. **Do not** edit component internals — no token refactor, no prop changes, no restyle in a relocation commit.
7. **One atom per commit.** Verify in order: `npm test` → `npm run lint` → `npm run build:verify`. No push without an explicit, separate instruction.
8. Frozen-core untouched: `lib/db`, `lib/auth`, `lib/tenant`, `lib/billing`, `lib/erpnext`, `lib/scheduling/engine`, `lib/business-data`, and all `app/` route *logic* (only a route's one-line import specifier may change).

---

## Components covered by this ADR

Move to `components/ui/`, in recommended risk order (lowest fan-in first):

| Order | Atom(s) | Importer files | Notes |
|---|---|---|---|
| 1 (pilot) | `PilotBanner` | 1 (`app/dashboard/layout.tsx`) | No type export, no relative importer. Safest pilot. |
| 2 | `LoadingSkeleton`, `CardSkeleton`, `StatSkeleton`, `Skeleton` | 8 (all `app/dashboard/**/loading.tsx`) | Uniform route-fallback importers; no type export. |
| 3 | `Avatar` | 13 (features ×6, modules ×4, app routes ×3) | Highest fan-in; one relative importer (`UserMenuSheet`) covered by the shim. |
| 4 | `Badge` (+ `BadgeVariant` type) | 7 files / 11 import lines (features ×1, modules ×3, app routes ×3) | Requires `export type` in shim + barrel (`isolatedModules`). |

Total fan-in across the four: **29 import sites across ~24 files**, spanning four feature domains, app routes, and `components/modules` — confirming these are cross-cutting primitives, not a domain slice.

---

## Components explicitly excluded

**Dead / orphaned — do NOT move and do NOT delete in the atom slices** (separate cleanup task):
- `components/modules/EmptyState.tsx` — no real importers (barrel-only).
- `components/modules/ErrorState.tsx` — no real importers (barrel-only).
- `components/modules/SessionActions.tsx` — no real importers (known dead barrel entry).
- `components/scheduling/TimeGrid.tsx` — orphaned pre-Schedule-X grid renderer.
- `components/scheduling/SessionBlock.tsx` — orphaned; only consumer is `TimeGrid`.

> If revived, `EmptyState`/`ErrorState` are **composites** (ADR-UX-002 lists `EmptyStateCard`), destined for `components/blocks`, not `components/ui`. That is out of scope here.

**Not primitives — stay in `features/<domain>` or `components/modules` (business/auth/nav logic):**
- `UserMenuSheet`, `DashboardClientShell` (auth/session/nav), `ClientHubPanel`, `ClientsView`, `InvoicesView`, `DashboardView`, `ScheduleView`, `PendingPaymentNotifications`, and all client/billing/booking/goal components.

---

## Next safe implementation slice — Phase 8U

**Migrate `PilotBanner` into `components/ui/`** (1 importer, no type export, no relative-import consumer, purely presentational). This pilots the `components/ui` destination with the smallest possible blast radius, exactly as Phase 8B piloted the whole migration with the 1-importer onboarding slice.

Recommended subsequent order: **8U** PilotBanner → **8V** LoadingSkeleton family → **8W** Avatar → **8X** Badge (with `BadgeVariant` `export type` care).
