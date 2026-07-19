# ADR-UX-005 — FitDesk Interaction Model

Status: Approved v1.1
Date: 2026
Amended: 2026-07-19 — manual invoice creation removed from Pattern 1 per the
brand/product-UI reconciliation audit; see
`docs/audits/FITDESK_IMPLEMENTATION_STATUS_RECONCILIATION_2026-07-19.md`.


## Context

FitDesk must avoid pattern soup.

The same interaction principles must govern Add Client, Dashboard triage, Client Hub, Schedule, billing, and future program workflows.

## Approved Patterns

## Pattern 1 — Smart Progressive Workspace

Used for:
- Add Client
- Create Program
- Goal setup

Manual invoice creation is not part of this pattern. It remains hidden from
the normal trainer workflow (2026-07-19 audit correction) — package invoices
are created through package assignment, and pay-per-session invoices are
created through confirmed session completion. See
`ADR-UX-013-FITDESK_BRAND_AND_PRODUCT_UI_FOUNDATION.md` §9 for the current
authority on unimplemented-feature mockups vs. verified implementation.

Rule:
Operational workflows remain in one context. Complexity expands inline.

## Pattern 2 — Dashboard Inline Triage

Used for:
- AI alerts
- Client risk
- Payment follow-up
- Session outcomes

Rule:
Alerts are reviewed and resolved where discovered.

## Pattern 3 — Client Workspace

Used for:
- Client Hub
- Billing
- Progress
- Session history

Rule:
Client context must remain visible.

## Pattern 4 — Command Actions

Used for:
- FAB
- Command palette
- Quick actions
- Keyboard shortcuts

Rule:
Frequent actions should be commandable.

## Pattern 5 — Mobile Sheets

Used for:
- Create
- Edit
- Review
- Quick triage

Rule:
Mobile sheets preserve route context and avoid modal stacks.

## Pattern 6 — Search-Param State Orchestration

Contextual sheet overlays, active selection panels, and multi-stage triage cards must serialize their open/close states into the address bar via URL search parameters.

Example:

```text
?pane=goal_inspector&id=fat_loss
?triage=invoice&id=INV-0001
```

Relying strictly on localized component state for major triage view structures is prohibited.

This ensures deep workspaces remain:
- Bookmarkable
- Shareable
- Resilient to refresh
- Compatible with browser back/forward behavior

## Pattern 7 — Optimistic Action & Error Boundary Policy

When a user triggers an active triage step, the local UI must update immediately with optimistic indicators.

The interface must never block with a modal spinner while an ERP or background sync handshake runs.

If sync fails:
- Keep the active layout state.
- Surface an inline warning block.
- Allow manual retry.
- Do not destroy the current workspace.

## Constitutional Rules

- Single Context Rule
- Triage Proximity Rule
- 80/20 Operator Rule
- URL-Driven Context Law
- Optimistic Local UI Rule

## Mobile-Primary + Desktop-Enhanced

Mobile is the operational environment.

Desktop is the deep-work environment.

## Governance

If an interaction pattern requires a route change that destroys context, it must be redesigned.
