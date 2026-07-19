> **Status:** Proposed v2.0 amendment — NOT authoritative.
> **Governing approved decision:** `docs/architecture/PHASE_0B_SYSTEMIZATION/ADR-UX-011-FITDESK_2026_FRONTEND_ARCHITECTURE_AMENDMENTS.md` (Status: Approved v1.1) remains binding.
> **Preserved:** 2026-07-19, from the uncommitted 2026-07-18 UI/UX modernization pass working tree.
> **Purpose:** This file exists so the proposed v2.0 content is not lost when the
> canonical filename is restored to its approved v1.1 body. It requires explicit
> product-owner approval before it can supersede v1.1.

---

# ADR-UX-011 — FitDesk 2026 Frontend Architecture Amendments

Status: Proposed v2.0 — product-owner direction incorporated; replaces v1.1 when adopted in the active repository
Date: 2026-07-18

## Context

FitDesk runs on Next.js 14 App Router, TypeScript, Tailwind CSS, Better Auth, and ERP-authoritative services reached through the existing FitDesk client/proxy path.

Frontend modernization must preserve working routes, server actions, tenant isolation, billing hooks, scheduling behavior, and deployment safety.

## Decision

FitDesk uses the active repository's existing architecture as the baseline.

New work is feature-owned, server-first where appropriate, and minimal. This ADR does not authorize a broad folder migration.

## Layer Boundaries

### UI primitives

Typical location:

```text
components/ui/
```

Rules:

- no business logic;
- no direct data access;
- no ERP or tenant assumptions;
- token-driven;
- accessible.

### Feature and route components

Typical locations:

```text
features/<domain>/
app/<route>/_components/
existing components/modules/* compatibility locations
```

Rules:

- compose approved primitives;
- consume approved actions and derived state;
- do not call ERP or Control Plane directly;
- preserve current routes and contracts.

### Domain and repository services

Typical locations:

```text
lib/<domain>/
actions/
```

Rules:

- own derivation, repositories, adapters, and orchestration;
- testable without UI;
- no JSX;
- preserve existing scheduling paths:
  - `lib/scheduling/engine.ts`
  - `lib/scheduling/bookingService.ts`
  - `lib/scheduling/sessionRepository.ts`
  - `actions/schedulingActions.ts`

## ERP Boundary

Approved direction:

```text
UI / Route
→ approved server action or route service
→ repository/domain service
→ existing ERP client/proxy
→ Control Plane
→ ERPNext/Frappe
```

Forbidden:

```text
UI → ERP
UI → direct Control Plane calls
FitDesk storing ERP credentials
Control Plane executing Docker
Provisioning Agent owning business logic
```

## Server and Client Components

Use Server Components by default where they fit the existing route.

Client Components are used for actual interaction needs.

Moving a server/client boundary is not a cosmetic refactor. It requires contract, hydration, auth, and tenant review.

## State Strategy

Preferred order:

1. authoritative server state;
2. URL state for already-approved bookmarkable workspace context;
3. local state for slice-local presentation.

Do not add global client stores, SWR, caches, or new state libraries without approval.

## Protected Flow Rule

Do not use optimistic success for billing, payment, invoice, package, booking, completion, cancellation, no-show, rescheduling, or WhatsApp.

Immediate loading and reversible presentation feedback are allowed.

## Existing Dependencies

An installed library is not blanket permission for all use.

- Recharts may be used only when already installed and the metric contract is approved.
- Motion may be used only for state-explaining transitions under ADR-UX-003.
- Magic UI may not drive core navigation, critical workflows, financial state, or decorative dashboard drift.
- TanStack Table may be used where already installed and where a table is the correct interaction model.

Adding or upgrading any dependency requires explicit approval.

## Canonical Interaction Primitives

Use existing:

- `WorkspaceShell` for approved sheets and contextual overlays;
- `ConfirmDialog` for consequential confirmation;
- shared Button, status, loading, focus, and empty-state primitives.

Do not introduce parallel overlay systems.

## Accessibility Requirements

Applicable UI work must verify:

- heading and landmark structure;
- keyboard order;
- focus visibility and restoration;
- target sizes;
- contrast;
- non-color status;
- reduced motion;
- loading, empty, error, and unavailable states;
- responsive and zoom behavior.

## Performance Requirements

Target:

```text
Initial dashboard route < 2 seconds under the agreed environment
Common interaction response < 100ms for local presentation
Sheet visible < 200ms where data is already available
```

These budgets do not authorize optimistic success or hidden background mutation.

## Claude Code Skills

### Required gate

Load `fitdesk-guardrail` first for styling, accessibility, responsive, React, or frontend-performance work.

### Advisory skills

- `frontend-design`
- `web-design-guidelines`
- `vercel-react-best-practices`

Their output is proposal input only.

### Stop conditions

Stop for approval when a suggestion:

- changes dependencies;
- expands beyond the current slice;
- changes routing, payloads, actions, persistence, auth, tenancy, or hydration boundaries;
- introduces protected optimistic behavior;
- changes brand, type, navigation, density, or motion doctrine;
- relies on unclear documentation authority.

## Validation

Before staging:

- verify the active repository;
- inspect the diff;
- run the narrowest relevant tests, lint, typecheck, build, accessibility, and visual checks;
- confirm no protected contract changed unintentionally;
- stage explicit paths only;
- do not use `git add -A`.

## Governance

The safest working implementation outranks a theoretical best practice.

External skills advise. FitDesk owner decisions, active ADRs, repository contracts, and tests decide.
