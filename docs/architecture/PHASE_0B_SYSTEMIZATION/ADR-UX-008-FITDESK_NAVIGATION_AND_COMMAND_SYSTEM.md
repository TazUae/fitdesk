# ADR-UX-008 — FitDesk Navigation & Command System

Status: Approved v1.1
Date: 2026


## Context

FitDesk is a Mobile-Primary + Desktop-Enhanced operating system for personal trainers.

Navigation must optimize for:
- One-handed gym-floor usage
- Fast task execution
- Reduced cognitive load
- High-frequency workflows
- Command-driven productivity

## Decision

FitDesk adopts a dual navigation model:

1. Mobile Command Navigation
2. Desktop Command Navigation

The goal is to minimize navigation effort while maximizing operational speed.

## Mobile Navigation

Bottom navigation is the primary mobile navigation pattern.

Approved tabs:
1. Dashboard
2. Clients
3. Schedule
4. Actions
5. More

Messages live under Actions or More until messaging becomes a first-class daily workflow.

## More Menu

The More tab acts as the expansion layer.

Examples:
- Invoices
- Packages
- Payments
- Reports
- Settings
- Help

Rarely used features must never occupy primary navigation.

## Thumb Zone Rule

Critical actions must remain reachable within natural thumb zones.

## Desktop Navigation

Desktop uses a persistent sidebar.

Primary items:
- Dashboard
- Clients
- Schedule
- Actions

Secondary items:
- Invoices
- Reports
- Settings

## Command System

Command Palette is mandatory.

Shortcut:
- Cmd + K
- Ctrl + K

Capabilities:
- Open client
- Create client
- Book session
- Create invoice
- Add payment
- Navigate screens
- Execute common actions

## FAB Strategy

### Mobile

FAB opens the universal create sheet.

Approved order:
1. Add Client
2. Book Session
3. Create Invoice
4. Add Payment

### Desktop

Desktop uses command actions and contextual buttons.

Persistent FABs should be avoided.

## v1.1 Engineering Amendment — Redefining Context Destruction

### Context-Preserving Navigation

The constraint "Fewer Routes / Avoid Route Changes" means:

> Avoid Context-Destroying Navigation.

It does not prohibit URL-backed overlays.

### Parallel and Intercepting Layout Routes

Deep triage panels, interactive overlays, and inspection sheets should use Next.js Parallel Routes and Intercepting Routes where appropriate.

Opening a right-side panel may update the browser URL.

Example:

```text
/dashboard/clients/123/triage/billing
```

The underlying workspace must remain mounted or visually preserved when possible.

## Navigation Laws

1. Fewer context-destroying routes.
2. Context preservation.
3. Command over menu.
4. Mobile priority.
5. FAB and Command Palette parity.
6. No dead ends.

## Governance

Navigation exists to accelerate work.

Any navigation pattern that increases friction must be challenged.
