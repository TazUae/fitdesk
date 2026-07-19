> **Status:** Proposed v2.0 amendment — NOT authoritative.
> **Governing approved decision:** `docs/architecture/PHASE_0B_SYSTEMIZATION/ADR-UX-010-FITDESK_CLIENT_HUB_WORKSPACE_SPECIFICATION.md` (Status: Approved v1.1) remains binding.
> **Preserved:** 2026-07-19, from the uncommitted 2026-07-18 UI/UX modernization pass working tree.
> **Purpose:** This file exists so the proposed v2.0 content is not lost when the
> canonical filename is restored to its approved v1.1 body. It requires explicit
> product-owner approval before it can supersede v1.1.

---

# ADR-UX-010 — FitDesk Client Hub Workspace Specification

Status: Proposed v2.0 — product-owner direction incorporated; replaces v1.1 when adopted in the active repository
Date: 2026-07-18

## Context

The Client Hub is the trainer's operational workspace for one client.

It must support coaching, scheduling, package awareness, financial context, and safe follow-up without becoming a CRM record or ERP form.

## Decision

FitDesk adopts a workspace-first Client Hub.

## Priority Questions

1. Who is this client?
2. What needs attention?
3. What is the next session or next safe action?
4. What progress is being made?
5. What package or payment context matters?

## Workspace Structure

### 1. Client Snapshot

Include:

- name;
- primary goal;
- status;
- package or pay-per-session mode;
- package balance or session rate context;
- next session;
- client-health status when verified.

### 2. Needs Attention

Examples:

- package ending soon;
- missing next session candidate;
- unresolved session outcome;
- outstanding invoice;
- goal review.

Each item explains reason, consequence, and safe next action.

### 3. Progress

Show verified goal progress, milestones, measurements, and adherence evidence.

### 4. Session Timeline

Use compact rows for completed and upcoming sessions, notes, and outcomes.

### 5. Billing Context

Show:

- package balance;
- pay-per-session rate;
- existing invoices;
- payment history;
- unavailable or incomplete ERP state.

Do not expose generic manual invoice creation.

Package invoices are generated through package onboarding. Pay-per-session invoices are generated only after confirmed session completion.

### 6. Client Pulse

Use Healthy, Watch, and At Risk only when rules and data support the label.

Color is not the only indicator.

## Quick Actions

Preferred:

- Book Session;
- Add Note;
- Record or Review Outcome;
- Prepare Reminder;
- Message Client;
- View Existing Invoice.

Payment recording is contextual to an existing invoice or approved workflow and uses `ConfirmDialog`.

## Mobile Layout

Single-column order:

1. Snapshot
2. Needs Attention
3. Next Session / actions
4. Progress
5. Timeline
6. Billing context

Use `WorkspaceShell` bottom sheets for focused create, edit, and review actions.

## Desktop Layout

Use a balanced split only when it improves comprehension.

The main client context remains visible. Secondary panels adapt or collapse when empty.

Do not create a permanent third inspector merely to fill space.

## Interaction Rules

- protected actions are confirmed-first;
- no direct ERP access;
- no hidden financial mutation;
- no route changes that destroy context;
- new URL-backed state requires approval;
- focus and context restore after overlays.

## Responsive Rule

Use existing responsive mechanisms first. Container queries are optional for verified local panel problems, not a mandate for broad refactoring.

## Claude Code Skill Interaction

External design skills may improve hierarchy and density, but may not introduce manual invoice workflows, optimistic financial behavior, new dependencies, or a new global shell.

## Governance

The Client Hub supports coaching decisions.

Administrative detail is included only when it changes a safe trainer decision.
