# Phase 8 — Feature-Folder Migration Closeout

- **Date:** 2026-07-05
- **Phase:** 8Z (closeout — docs only, no runtime code touched)
- **Author:** Claude Code
- **Predecessor:** Phase 8Y — read-only closeout audit (passed)
- **Governing docs:** [`docs/plans/PHASE_8_FEATURE_FOLDER_MIGRATION_PLAN.md`](../plans/PHASE_8_FEATURE_FOLDER_MIGRATION_PLAN.md) (ADR-001), [`ADR-002-shared-ui-atom-ownership.md`](ADR-002-shared-ui-atom-ownership.md)

---

## Status: **Closed — safe-leaf migration complete.**

Phase 8's UI-leaf migration (slices 8B through 8X) is done, verified, and pushed. This document closes the phase and hands off the remaining, higher-risk work to dedicated future phases rather than letting it linger as unscoped "Phase 8 leftovers."

---

## Scope completed

Every slice defined as **safe** in the original 8A plan — a UI-only leaf with no business logic, no service-layer coupling, and a re-export shim at the old path — has been moved into its owning `features/<domain>/components/` folder or, for cross-cutting primitives, into `components/ui/` per ADR-002. Each slice was one commit, gated by `npm test` → `npm run lint` → `npm run build:verify`, fully green before commit.

---

## Migration summary by domain

### Onboarding
- `components/onboarding/{provisioning-status,workspace-setup-form}.tsx` → `features/onboarding/components/`
- Old paths are thin shims; the single real importer (`app/onboarding/page.tsx`) updated.

### Messaging
- `components/modules/{MessagesView,WhatsAppView}.tsx` → `features/messaging/components/`
- Old paths are thin shims. `app/dashboard/whatsapp/page.tsx` already imports the feature path directly; the `components/modules/WhatsAppView.tsx` shim is now unused (see Dead/orphaned code below).

### Dashboard
- Nine UI leaves — `QuickActions`, `QuickActionsFab`, `NeedsAttentionEmpty`, `TodayHero`, `ActionCenter`, `BusinessHealth`, `AiCopilotRail`, `DashboardSidebar`, `NextUpCard`, `UpcomingList`, `TodayTimeline` — live in `features/dashboard/components/`.
- `DashboardView` and `DashboardClientShell` remain in `components/modules/` **by design** — they are orchestrators (route-bound composition + nav/auth session shell), not primitives, and are explicitly out of scope for a leaf migration.

### Scheduling
- Safe UI leaves — `CalendarFilters`, `MiniCalendar`, `SchedulerErrorBoundary`, `NowLine`, `SessionCard`, `PlannerToolbar` — moved to `features/scheduling/components/`, shimmed at `components/scheduling/*`.
- `ScheduleView`, `PlannerShell`, `PlannerSidebar`, and `SchedulerXAdapter` remain in place **by design** — they sit on the scheduling-engine/booking-service boundary and are deferred (see below).

### Clients
- `DeactivateClientButton` moved to `features/clients/components/`, shimmed at `components/modules/DeactivateClientButton.tsx`.
- `ClientWorkspaceOverlay` already lived in `features/clients/components/` (the original pilot slice, pre-dating 8B).
- All remaining `components/clients/*` (forms, package assignment, goal workspace) are deferred — see below.

### Shared UI atoms (ADR-002)
| Atom | Old path | New path | Type export |
|---|---|---|---|
| `PilotBanner` | `components/modules/PilotBanner.tsx` | `components/ui/PilotBanner.tsx` | n/a |
| `LoadingSkeleton`, `CardSkeleton`, `StatSkeleton`, `Skeleton` | `components/modules/LoadingSkeleton.tsx` | `components/ui/LoadingSkeleton.tsx` | n/a |
| `Avatar` | `components/modules/Avatar.tsx` | `components/ui/Avatar.tsx` | n/a |
| `Badge` | `components/modules/Badge.tsx` | `components/ui/Badge.tsx` | `BadgeVariant` re-exported with explicit `export type` (required by `isolatedModules: true`) |

All four are real implementations in `components/ui/`, each with a thin re-export shim left at the old `components/modules/*` path, and all confirmed direct importers updated to `@/components/ui/<Name>`.

---

## Shims and import-leak status

- Every shim verified as a 1–2 line re-export with no logic (confirmed by direct read of each shim file in Phase 8Y).
- Repo-wide grep for old-path imports (`@/components/modules/*`, `@/components/scheduling/*`, `@/components/onboarding/*`, and relative `./` forms) for every migrated symbol found **zero leaks** outside the shim files themselves.
- `components/modules/index.ts` barrel confirmed pointing at correct new destinations for every migrated export (`Avatar`, `Badge` + `BadgeVariant` type, `LoadingSkeleton` family, `PilotBanner`, `DeactivateClientButton`, `MessagesView`).

---

## ADR-002 shared atom implementation status

**Fully implemented, matching the decision exactly.** `components/ui/` is confirmed as the correct, constitution-sanctioned home for cross-cutting primitives (ADR-UX-002). `components/ui/index.ts` was **intentionally not expanded** — direct-path import (`@/components/ui/<Name>`) remains canonical, consistent with the folder's pre-existing convention (only `WorkspaceShell` is barrelled). No `tsconfig`, alias, or dependency change was required or made.

---

## Explicitly deferred domains and why

| Domain | Why deferred |
|---|---|
| **Goals UI** (`GoalAccordion/`, `GoalWorkspace/` under `components/clients/`) | Never started (plan slice 3). `features/goals/components/` still contains only `.gitkeep`. Own domain, own future phase — not folded into this closeout. |
| **Billing/package UI** (`AssignPackageSheet`, `AssignPackageForm`, `PackageDetailsSheet`, `ClientHubPanel`) | Never started (plan slice 5). `features/billing/components/` still contains only `.gitkeep`. Billing-adjacent UI requires the same care CLAUDE.md applies to payment logic — deserves a dedicated, explicitly-approved phase, not a leaf-migration sweep. |
| **Client forms/workflows** (`AddClientForm`, `AddClientSheet`, `SmartClientPicker`) | Never started (remainder of plan slice 6). These are form/action UI wired to `actions/clients.ts`; moving them safely requires tracing server-action wiring, better scoped separately. |
| **Scheduling business-rule UI** (`BookingSheet` + `components/scheduling/booking/*`, `SessionCompletionSheet`) | Touches `lib/scheduling/draft.ts` and the booking/session-completion flow directly. CLAUDE.md keeps the scheduling engine frozen; the UI that orchestrates it carries meaningfully more risk than the atom/leaf moves already done. |
| **Domain orchestrators** (`DashboardView`, `DashboardClientShell`, `ClientsView`, `InvoicesView`, `ScheduleView`, `PlannerShell`, `PlannerSidebar`) | By design, not primitives — they compose leaves and own routing/nav/session concerns. ADR-002 and the 8A plan both exclude orchestrators from leaf migration. Any future move is a distinct, higher-risk architectural decision, not a leaf slice. |
| **`SchedulerXAdapter`** | Integration boundary wrapping the third-party `scheduler-x` library plus the scheduling engine. Highest-risk component in the scheduling domain to relocate; deferred pending a dedicated scheduling-architecture phase. |

---

## Dead/orphaned code candidates (found, not deleted)

Per CLAUDE.md's "no dead-code deletion in a relocation run" rule, the following were identified during the Phase 8Y audit and are **left untouched**, pending a separate, dedicated cleanup phase:

- `components/modules/SessionActions.tsx` — zero real importers (only referenced by the `components/modules/index.ts` barrel)
- `components/modules/EmptyState.tsx` — zero real importers (barrel-only)
- `components/modules/ErrorState.tsx` — zero real importers (barrel-only)
- `components/scheduling/TimeGrid.tsx` — orphaned; only referenced by `SessionBlock`
- `components/scheduling/SessionBlock.tsx` — orphaned; only consumer is `TimeGrid`
- `components/modules/WhatsAppView.tsx` — dead re-export shim; the real consumer (`app/dashboard/whatsapp/page.tsx`) already imports `@/features/messaging/components/WhatsAppView` directly, so this shim has no remaining callers

---

## Production safety notes

- No schema, migration, `.env`, or `package-lock.json` changes across any Phase 8 slice.
- No changes to `lib/db`, `lib/auth`, `lib/tenant`, `lib/billing` (service layer), `lib/erpnext`, or `lib/scheduling/engine` — all frozen-core boundaries from the 8A plan held for the entire phase.
- Every old import path remains resolvable via its shim — no consumer was forced to change as a condition of any move; opportunistic importer updates were applied on top for cleanliness, not correctness.
- Every slice passed `npm test` → `npm run lint` → `npm run build:verify` before commit; no phase was pushed without an explicit, separate push instruction.

---

## Recommended next phases

1. **Dead-code cleanup phase** — remove `SessionActions`, `EmptyState`, `ErrorState`, `TimeGrid`, `SessionBlock`, and the orphaned `WhatsAppView` shim, with barrel updates, as its own audited slice.
2. **Dedicated goals UI migration phase** — move `GoalAccordion`/`GoalWorkspace` into `features/goals/components/` (plan slice 3, never executed).
3. **Dedicated billing/package UI migration phase** — move `AssignPackageSheet`/`Form`, `PackageDetailsSheet`, `ClientHubPanel` into `features/billing/components/`, with explicit care around payment-adjacent logic per CLAUDE.md (plan slice 5, never executed).
4. **Dedicated scheduling booking UI architecture phase** — a scoped review of `BookingSheet`, `components/scheduling/booking/*`, `SessionCompletionSheet`, and `SchedulerXAdapter` before any relocation, given their coupling to the scheduling engine and booking service.
5. **Optional orchestrator migration** — only after all leaf and business-rule UI has a stable home; moving `DashboardView`, `ClientsView`, `InvoicesView`, `ScheduleView`, `PlannerShell`/`PlannerSidebar` is an architectural decision in its own right, not a continuation of leaf-migration mechanics.

---

## Final verdict

**Phase 8 safe-leaf migration is CLOSED.** The dependency graph is acyclic and correctly directed: features depend on `components/ui`; `components/ui` depends on nothing domain-specific; `components/modules` continues shrinking toward containing only orchestrators and the explicitly-deferred items listed above. No further leaf-migration work remains — everything left in `components/modules`, `components/clients`, and `components/scheduling` is either an orchestrator, an integration boundary, business-rule/form UI, or a named dead-code candidate, each routed to its own future phase rather than bundled into this one.
