# ADR-UX-009 — FitDesk Dashboard Command Center Specification

Status: Approved v1.1
Date: 2026
Amended: 2026-07-19 — manual invoice creation removed from Quick Actions per
the brand/product-UI reconciliation audit; see
`docs/audits/FITDESK_IMPLEMENTATION_STATUS_RECONCILIATION_2026-07-19.md`.


## Context

The Dashboard Command Center is the primary operating surface of FitDesk.

It is not an analytics dashboard.
It is not a reporting dashboard.
It is not an ERP homepage.

It is the trainer's command center.

Every element on the dashboard must help answer one of four questions:

1. What requires my attention now?
2. What should I do next?
3. Which clients need me?
4. How healthy is my business?

## Decision

FitDesk adopts an Action-First Dashboard architecture.

Actions always appear before analytics.

## Dashboard Structure

## 1. Daily Brief

Purpose:
Provide immediate operational awareness.

Examples:
- Sessions today
- Revenue collected today
- New clients
- Open attention items

## 2. Needs Attention

Purpose:
Surface work that requires action.

Examples:
- Unpaid invoices
- Expiring packages
- Missed sessions
- AI risk alerts

Requirements:
- Sorted by urgency
- Actionable from dashboard
- Triage in place

## 3. Today Timeline

Purpose:
Anchor the trainer's day.

Examples:
- Upcoming sessions
- Client appointments
- Availability gaps

## 4. AI Copilot

Purpose:
Provide recommendations.

Rule:
AI suggests. Trainer decides.

AI may never perform actions automatically.

## 5. Business Health

Purpose:
Provide operational insight.

Examples:
- Revenue trends
- Client growth
- Package utilization

## 6. Client Pulse

Purpose:
Monitor coaching health.

Examples:
- At-risk clients
- Progress milestones
- Engagement changes

## 7. Quick Actions

Purpose:
Reduce navigation.

Examples:
- Add Client
- Book Session
- Record Payment

Manual invoice creation is not a dashboard Quick Action. It remains hidden
from the normal trainer workflow (2026-07-19 audit correction).

## Triage Architecture

Dashboard triage follows ADR-UX-005.

Desktop:
- Right-side drawer

Mobile:
- Bottom sheet

The dashboard remains visible.

## v1.1 Engineering Amendment — URL-Backed Dashboard Overlays

### Deep-Linked Operations

Dashboard triage frames must map directly to:
- Intercepting layout routes, or
- URL search parameter hooks

### Workspace Synchronization

When an item like an unpaid invoice alert is tapped, the app must register that state change in the URL.

The main dashboard view remains active in the background, allowing instant dismissal transitions without a complete refresh or full data reload.

## Information Hierarchy

Priority order:
1. Needs Attention
2. Timeline
3. Actions
4. AI Guidance
5. Analytics

Analytics may never outrank action.

## Mobile-Primary Rules

The first viewport must contain:
- Daily Brief
- Needs Attention
- Timeline preview

The trainer should understand the day's priorities within 3 seconds.

## Dashboard Laws

1. Action Before Analytics
2. No Dead Cards
3. Triage In Place
4. Context Preservation
5. AI Is Advisory
6. URL-backed triage state

## Governance

If a dashboard widget does not answer one of the four dashboard questions, it should be removed.
