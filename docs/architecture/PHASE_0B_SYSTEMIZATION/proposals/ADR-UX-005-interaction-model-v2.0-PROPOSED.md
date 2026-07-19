> **Status:** Proposed v2.0 amendment — NOT authoritative.
> **Governing approved decision:** `docs/architecture/PHASE_0B_SYSTEMIZATION/ADR-UX-005-FITDESK_INTERACTION_MODEL.md` (Status: Approved v1.1) remains binding.
> **Preserved:** 2026-07-19, from the uncommitted 2026-07-18 UI/UX modernization pass working tree.
> **Purpose:** This file exists so the proposed v2.0 content is not lost when the
> canonical filename is restored to its approved v1.1 body. It requires explicit
> product-owner approval before it can supersede v1.1.

---

# ADR-UX-005 — FitDesk Interaction Model

Status: Proposed v2.0 — product-owner direction incorporated; replaces v1.1 when adopted in the active repository
Date: 2026-07-18

## Context

FitDesk must provide consistent, trustworthy interactions across dashboard triage, client management, scheduling, billing, payments, packages, and messaging.

The prior optimistic-action doctrine was too broad for authoritative financial and operational workflows.

## Decision

FitDesk adopts a **confirmed-first interaction model for consequential state** and immediate feedback for reversible presentation state.

## Pattern 1 — Smart Progressive Workspace

Used for:

- Add Client;
- goal setup;
- package or pay-per-session configuration;
- future program creation.

Rules:

- keep the user in one understandable context;
- expand complexity only when needed;
- preserve entered data on recoverable errors;
- do not expose manual invoice creation in the normal trainer workflow.

## Pattern 2 — Dashboard Inline Triage

Used for:

- attention items;
- client follow-up;
- overdue invoice review;
- unresolved session outcomes;
- package risks.

Rules:

- explain reason and consequence;
- open the approved workflow;
- do not execute a hidden mutation from the card or row;
- preserve dashboard context where the existing architecture supports it.

## Pattern 3 — Client Workspace

Client identity, next session, package/rate state, and current attention must remain understandable while reviewing details.

## Pattern 4 — Contextual Commands

Frequent commands may include:

- Add Client;
- Book Session;
- Prepare Reminder;
- Review Session Outcome;
- Open Schedule;
- Message Client.

Generic manual invoice creation is not a normal trainer command.

## Pattern 5 — WorkspaceShell Overlays

Use the existing `WorkspaceShell` contract for mobile sheets and desktop contextual overlays.

Required behavior:

- accessible title and description;
- focus containment;
- focus restoration;
- Escape handling;
- scroll lock;
- mobile bottom-sheet behavior;
- no nested modal stacks.

## Pattern 6 — ConfirmDialog Consequence Review

Use `ConfirmDialog` for consequential actions, including:

- recording payment;
- invoice-affecting completion;
- package deduction;
- no-show charging;
- cancellation;
- external message sending;
- destructive removal.

## URL-State Rule

URL-backed state is appropriate when the active repository already supports a major, bookmarkable workspace state.

A new search-param, intercepting route, parallel route, redirect, or persistence contract is a structural change and requires approval.

Local presentation state remains valid for non-bookmarkable, slice-local UI.

## Confirmed-First Policy

### May respond immediately

- accordion open/close;
- tab or filter selection;
- rail collapse;
- local sorting;
- focus and hover feedback;
- draft text entry;
- loading indication.

### Must wait for authoritative confirmation

- billing and payment outcomes;
- invoice creation or status;
- package consumption;
- booking and rescheduling;
- session completion;
- cancellation and no-show;
- WhatsApp or other external message success;
- ERP-backed state.

The UI may show progress immediately, but must not show success early.

If confirmation fails:

- preserve user context;
- keep the action available for retry where safe;
- show a specific inline error;
- do not erase authoritative state;
- do not claim success.

## Empty-State Rule

Every empty or sparse state must explain:

1. what is absent;
2. what that means;
3. one relevant next action, when appropriate.

Do not communicate “all clear” when data is unavailable or eligibility rules have not been evaluated.

## Claude Code Skill Interaction

Any `useOptimistic`, eager-success, SWR mutation, client cache, transition, or performance suggestion that changes protected-flow semantics is `Stop — needs approval`.

## Governance

A fast-looking interface is not correct if it gets ahead of authoritative state.
