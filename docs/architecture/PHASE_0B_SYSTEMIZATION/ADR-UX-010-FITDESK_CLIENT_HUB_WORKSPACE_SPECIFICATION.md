# ADR-UX-010 — FitDesk Client Hub Workspace Specification

Status: Approved v1.1
Date: 2026
Amended: 2026-07-19 — manual invoice creation removed from Quick Actions per
the brand/product-UI reconciliation audit; see
`docs/audits/FITDESK_IMPLEMENTATION_STATUS_RECONCILIATION_2026-07-19.md`.


## Context

The Client Hub is the trainer's primary workspace for managing an individual client.

It is not a CRM record.
It is not a customer profile page.
It is not a database view.

The Client Hub is a coaching workspace.

Every element must help the trainer understand:

1. Who is this client?
2. What needs attention?
3. What progress is being made?
4. What action should I take next?

## Decision

FitDesk adopts a Workspace-First Client Hub architecture.

The Client Hub becomes the operational center for all client-related activity.

## Workspace Structure

## 1. Client Snapshot

Purpose:
Provide immediate context.

Examples:
- Name
- Program
- Primary Goal
- Package Status
- Next Session
- Client Health

## 2. Needs Attention

Purpose:
Surface client-specific actions.

Examples:
- Package ending soon
- Missed session
- Outstanding payment
- Goal review needed

## 3. Progress Workspace

Purpose:
Track client outcomes.

Examples:
- Goal progress
- Milestones achieved
- Body measurements
- Adherence indicators

## 4. Session Timeline

Purpose:
Provide client history.

Examples:
- Completed sessions
- Upcoming sessions
- Session notes
- Outcomes

## 5. Billing Workspace

Purpose:
Provide financial awareness.

Examples:
- Package balance
- Outstanding invoices
- Payment history

## 6. Client Pulse

Purpose:
Summarize client health.

Examples:
- Healthy
- Watch
- At Risk

## 7. Quick Actions

Purpose:
Reduce workflow friction.

Examples:
- Book Session
- Add Note
- Record Outcome
- Log Payment
- Assign Package

Manual invoice creation is not a Client Hub Quick Action. It remains hidden
from the normal trainer workflow (2026-07-19 audit correction) — package
invoices are created through package assignment, and pay-per-session
invoices are created through confirmed session completion.

## Mobile-Primary Layout

Mobile uses a stacked workspace model.

Order:
1. Snapshot
2. Needs Attention
3. Progress
4. Timeline
5. Billing

## Desktop-Enhanced Layout

Desktop uses a split-workspace model.

Left:
- Snapshot
- Needs Attention
- Quick Actions

Right:
- Progress
- Timeline
- Billing

## Triage Rules

Client alerts follow ADR-UX-005.

Requirements:
- No forced context-destroying navigation
- Inline resolution preferred
- Bottom sheets on mobile
- Side drawers on desktop
- URL-backed state for primary workflows

## v1.1 Engineering Amendment — Responsive Panel Orchestration Engine

### Asymmetric Split Control

The split-workspace distribution matrix used on desktop views must layout fluidly via CSS grid frameworks and container queries.

### Independent Container Scaling

The multi-panel columns must run inside isolated `@container` blocks.

Examples:
- Left Snapshot column
- Right Progress block
- Timeline tracking block
- Billing ledger block

When a trainer expands a localized workspace view to complete detailed timeline logging, adjacent summary panels must adjust their presentation density independently.

Avoid:
- Broken alignment
- Truncated typography
- Viewport-only breakpoints
- Desktop table mirroring on mobile

## Information Hierarchy

Priority:
1. Needs Attention
2. Progress
3. Timeline
4. Billing
5. Historical Detail

## Workspace Laws

1. Coaching Over Administration
2. Action Before History
3. Progress Before Reporting
4. Triage In Place
5. Client Context Always Visible
6. Container-aware density

## Governance

The Client Hub exists to support coaching decisions.

Features that increase administrative complexity without improving coaching outcomes should be challenged.
