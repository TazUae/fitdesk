> **Status:** Proposed v2.0 amendment — NOT authoritative.
> **Governing approved decision:** `docs/architecture/PHASE_0B_SYSTEMIZATION/ADR-UX-008-FITDESK_NAVIGATION_AND_COMMAND_SYSTEM.md` (Status: Approved v1.1) remains binding.
> **Preserved:** 2026-07-19, from the uncommitted 2026-07-18 UI/UX modernization pass working tree.
> **Purpose:** This file exists so the proposed v2.0 content is not lost when the
> canonical filename is restored to its approved v1.1 body. It requires explicit
> product-owner approval before it can supersede v1.1.

---

# ADR-UX-008 — FitDesk Navigation and Command System

Status: Proposed v2.0 — product-owner direction incorporated; replaces v1.1 when adopted in the active repository
Date: 2026-07-18

## Context

FitDesk navigation must support one-handed mobile work, fast desktop operation, and clear separation between destinations and consequential actions.

The previous shell consumed too much desktop width and the dashboard right rail remained visible even when idle.

## Decision

FitDesk uses:

1. mobile bottom navigation;
2. compact desktop navigation;
3. contextual actions inside the active workspace;
4. a dashboard-local right rail only when useful.

## Mobile Navigation

Preferred primary tabs:

1. Home
2. Schedule
3. Clients
4. Invoices
5. More

Messages, settings, reports, and lower-frequency tools live under More until usage evidence justifies first-class placement.

Mobile actions open focused `WorkspaceShell` bottom sheets.

## Desktop Navigation

Desktop uses a compact persistent sidebar.

Primary destinations:

- Dashboard;
- Schedule;
- Clients;
- Invoices;
- Messages, when part of the active product navigation.

Secondary destinations:

- Reports;
- Settings;
- Help.

The normal target width is approximately 240–280px, subject to existing shell constraints and visual QA.

## Destination vs Action Law

Navigation moves to a destination.

Buttons and contextual commands perform or prepare an action.

Do not make a generic card clickable when a clear link or button better expresses the behavior.

## Dashboard Right Rail

The right rail is contextual, not permanent decoration.

It may show:

- relevant Copilot suggestions;
- Client Pulse;
- Business Health explanation;
- selected-item context.

When it has no useful content, it collapses or yields space to the main workspace.

This rule applies to the dashboard slice. A route-persistent or resizable global AI rail is a separate architecture decision.

## Command System

A command palette is optional for MVP unless already implemented and validated.

Adding a new command palette, keyboard system, route-backed overlay, or dependency requires approval.

Approved command concepts include:

- open client;
- add client;
- book session;
- open schedule;
- prepare reminder;
- review session outcome;
- message client.

Generic Create Invoice and Add Payment commands are not part of the normal trainer workflow.

## URL and Route Rule

Preserve browser behavior and context when the current architecture already supports URL-backed state.

Adding or changing search params, parallel routes, intercepting routes, redirects, or persistence is `Stop — needs approval`.

## Mobile Rules

- critical controls remain in natural thumb zones;
- no desktop three-pane inspector is mirrored onto mobile;
- no stacked modal chains;
- bottom sheets restore focus and preserve context.

## Claude Code Skill Interaction

External design skills may recommend shell patterns, but a global shell redesign, new persistent rail, or routing model is approval-gated.

## Governance

Navigation exists to reduce effort.

It must not create manual financial workflows that FitDesk intentionally hides.
