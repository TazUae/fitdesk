# ADR-UX-008 — FitDesk Navigation & Command System

Status: Approved v1.1
Date: 2026
Amended: 2026-07-19 — mobile/desktop navigation corrected to match the
canonical Application Sitemap (Home/Schedule/Clients/Inbox/More;
Dashboard/Schedule/Clients/Inbox/Billing/Settings); manual invoice creation
removed from Command Palette and FAB. Current-implementation gaps are noted
inline rather than presented as already built. See
`docs/audits/FITDESK_IMPLEMENTATION_STATUS_RECONCILIATION_2026-07-19.md`.


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

Approved tabs (target — corrected 2026-07-19 to match the canonical
Application Sitemap):
1. Home
2. Schedule
3. Clients
4. Inbox
5. More

**Current implementation** (as of the 2026-07-19 implementation-status
audit) uses `Home, Clients, Schedule, Invoices, More` — Clients/Schedule
order and the Invoices tab both differ from the target above. `/invoices`
remains a fully operational compatibility route and must not be removed
blindly when navigation is migrated toward the target; see
`docs/audits/FITDESK_IMPLEMENTATION_STATUS_RECONCILIATION_2026-07-19.md`.
Global Search is persistent and is never demoted into More.

## More Menu

The More tab acts as the expansion layer for secondary/settings-adjacent
destinations, not for Search, Inbox, or frequent client actions — those stay
in primary navigation or remain globally reachable.

Examples:
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

Primary items (target — corrected 2026-07-19):
- Dashboard
- Schedule
- Clients
- Inbox
- Billing
- Settings

**Current implementation** uses `Home, Clients, Schedule, Invoices` inline,
with Settings reachable via a footer/menu link rather than the primary list.
`Billing` is the target destination name; `/invoices` is the current,
fully operational route and is preserved as a compatibility path — it is not
deleted or hard-renamed by this correction. `Inbox` does not exist as a
route yet; do not present it as implemented in any UI built against this
ADR until it is verified in code.

Secondary items:
- Reports
- Help

## Command System

Command Palette is mandatory.

Shortcut:
- Cmd + K
- Ctrl + K

Capabilities:
- Open client
- Create client
- Book session
- Record payment
- Navigate screens
- Execute common actions

Manual invoice creation is not a command-palette capability. It remains
hidden from the normal trainer workflow (2026-07-19 audit correction).

## FAB Strategy

### Mobile

FAB opens the universal create sheet.

Approved order:
1. Add Client
2. Book Session
3. Record Payment

Manual invoice creation is not a FAB action. It remains hidden from the
normal trainer workflow (2026-07-19 audit correction) — package invoices are
created through package assignment, and pay-per-session invoices are created
through confirmed session completion.

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
