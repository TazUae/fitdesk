> **Status:** Proposed v2.0 amendment — NOT authoritative.
> **Governing approved decision:** `docs/architecture/PHASE_0B_SYSTEMIZATION/ADR-UX-002-FITDESK_COMPONENT_TAXONOMY.md` (Status: Approved v1.1) remains binding.
> **Preserved:** 2026-07-19, from the uncommitted 2026-07-18 UI/UX modernization pass working tree.
> **Purpose:** This file exists so the proposed v2.0 content is not lost when the
> canonical filename is restored to its approved v1.1 body. It requires explicit
> product-owner approval before it can supersede v1.1.

---

# ADR-UX-002 — FitDesk Component Taxonomy

Status: Proposed v2.0 — product-owner direction incorporated; replaces v1.1 when adopted in the active repository
Date: 2026-07-18

## Context

FitDesk needs a component model that prevents visual drift, business-logic leakage, duplicate primitives, inaccessible one-off interactions, and broad refactors disguised as UI polish.

The active repository structure and working imports must be audited before moving components.

## Decision

FitDesk uses three component classes.

## 1. Primitive Components

Typical location:

```text
components/ui/
```

Examples:

- Button
- Input
- Badge or StatusChip
- Card or Surface
- EmptyState
- Skeleton or Spinner
- WorkspaceShell
- ConfirmDialog

Rules:

- no business logic;
- no data fetching;
- no tenant assumptions;
- no ERP terminology;
- no domain-specific payloads;
- no raw color, radius, spacing, typography, elevation, or motion values where a token exists;
- correct native button, link, dialog, and heading semantics;
- accessible focus and disabled/busy behavior.

Do not create a new modal, drawer, sheet, portal, confirmation, status, or loading primitive when the active repository already has an approved equivalent.

## 2. Composite Components

Preferred location:

```text
components/blocks/
features/<domain>/components/
app/<route>/_components/
```

Examples:

- OperationalRow
- MetricCluster
- AttentionItem
- EmptyStateBlock
- TimelineRow
- ActionGroup

Rules:

- may understand layout intent;
- must not fetch business data;
- must not own mutations;
- must remain reusable where practical;
- must use semantic tokens and approved primitives;
- must not turn generic containers into inaccessible clickable cards.

## 3. Domain Components

Preferred location:

```text
features/<domain>/
app/<route>/_components/
```

Examples:

- DashboardAttentionItem
- BusinessHealthPanel
- ClientPulsePanel
- SessionOutcomePanel
- PackageStatusPanel
- BillingLedger

Rules:

- may know FitDesk domain language;
- may compose primitives and composites;
- may consume approved server actions, repositories, and derived state;
- must not call ERP or the Control Plane directly;
- must not hide consequential mutations behind a dashboard click;
- must preserve package, pay-per-session, scheduling, tenant, and confirmation contracts.

## Compatibility Rule

Existing `components/modules/*` exports or other compatibility shims must not be removed as a standalone performance cleanup.

Removal requires the verified migration plan, complete consumer inventory, tests, and explicit approval.

## Slice-Local Rule

A UI task may touch:

- the explicitly named screen or component;
- its tests;
- an already-approved supporting primitive when necessary.

A broad taxonomy migration, folder move, or cross-module rewrite is a separate approved task.

## Dashboard Composition Rule

Repeated operational objects should prefer structured rows over isolated cards.

Large cards are reserved for genuinely distinct information groups. Hierarchy, spacing, and alignment should be used before adding another container.

## Claude Code Skill Interaction

- `frontend-design` may suggest hierarchy and composition, but cannot invent new palette, type, or primitive systems.
- `web-design-guidelines` may identify accessibility issues, but remediation must use existing primitives.
- `vercel-react-best-practices` may suggest rendering improvements, but cannot remove compatibility shims, move boundaries, or add dependencies without approval.
- `fitdesk-guardrail` performs the final classification.

## Governance

If a component needs business logic, it does not belong in `components/ui`.

If a change requires a new primitive, dependency, contract, or route behavior, classify it `Stop — needs approval`.
