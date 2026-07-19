> **Status:** Target direction — adopted as canonical intent, NOT implemented state.
> **Adopted:** 2026-07-19 · **Source:** `FITDESK_CLIENT_HUB_PRODUCT_SPECIFICATION_V1.md` (documentation pack) · **sha256 (source body):** `58f141907d45c1afbac690159e7aed395cc69f333fa2135204f9cdde91ccb84b`
> **Implementation reality:** see `docs/audits/FITDESK_IMPLEMENTATION_STATUS_RECONCILIATION_2026-07-19.md`
> **Rule:** This document describes intended product direction. Do not cite it as evidence
> that a capability exists. Verify against code before planning or estimating work.
>
---

# FitDesk Client Hub Product Specification v1

```text
Product: FitDesk SaaS Platform
Document: Client Hub Product Specification
Version: v1.0
Status: Product specification — repository verification required
Primary route direction: /clients/{clientId}
Generated: 2026-07-18
```

> **Adoption discipline:** Reconcile views, loaders, actions, routes, and data ownership against the active repository before adoption.

## 1. Intent

The Client Hub is the trainer's complete operating context for one client. It answers:

```text
What is true now?
What matters next?
Why does it matter?
What is the safest action?
```

It is not a dashboard clone or a collection of duplicate embedded mutation forms.

## 2. Experience Doctrine

```text
Understand current state
→ explain why it matters
→ show one next-safe action
→ preserve relevant alternatives
→ launch the canonical workflow
→ return to refreshed client context
```

## 3. Route and Responsive Model

Canonical direction:

```text
/clients/{clientId}
```

Illustrative URL-backed views:

```text
?view=today
?view=overview
?view=goals
?view=sessions
?view=progress
?view=program
?view=billing
?view=attendance
?view=communication
?view=activity
?panel=statement
```

Mobile:

- full-screen Client Hub;
- contextual full-height sheets;
- one visible primary action;
- no squeezed desktop tables.

Desktop:

- stable client workspace;
- drawers/dialogs for actions;
- optional wide statement/program surfaces;
- contextual rail only when useful.

Exact query names and aliases require audit.

## 4. Header

Show:

- client identity;
- lifecycle state;
- billing mode;
- safety indicator;
- current package or session rate;
- next-session summary;
- one primary action and limited secondary actions.

Primary-action priority:

```text
Safety prerequisite → Review safety
Uncertain mutation → Verify or recover
Unresolved session → Complete session
Explicit financial hold → Resolve hold
Package exhausted → Renew or choose billing resolution
Payment overdue → Record payment or send reminder
No next session → Book session
Otherwise → No urgent action
```

The rule is deterministic. AI may explain or draft but does not choose or execute the mutation.

## 5. Information Architecture

```text
Client Hub
├─ Today / Next Safe Action
├─ Overview
├─ Goals and Safety
├─ Sessions and Recurring Schedule
├─ Progress
├─ Program / Workout
├─ Package and Billing
├─ Statement of Account
├─ Attendance
├─ Communication
├─ Unified Activity
└─ Lifecycle
```

## 6. Today / Next Safe Action

Purpose: prepare the trainer for the current or next session without searching.

Show when available:

- session date/time/state;
- session type;
- location/access instructions;
- next-session focus;
- trainer preparation;
- primary goal;
- safety concern or required review;
- recent progress;
- current program/workout context;
- package units or PPS rate;
- balance/payment context;
- readiness and source freshness.

Example:

```text
Today with Sarah
5:00–6:00 PM · Standard training · ABC Gym
Next focus: Review hip mobility
Preparation: Bring resistance bands
Primary goal: Fat loss
Recent concern: Mild knee discomfort
Package: 3 sessions remaining
Payment: Clear
```

Rules:

- safety/recovery outrank commercial recommendations;
- structured fields render if optional AI summary fails;
- missing information is explicit;
- generated summary is source-linked or labelled AI-prepared;
- no direct mutation from the summary card.

## 7. Overview

Provide a calm summary of:

- identity/contact status;
- billing mode;
- lifecycle state;
- primary goal;
- safety state;
- next session;
- active package/rate;
- balance due;
- recent activity;
- next safe action.

## 8. Goals and Safety

Requirements:

- exactly one primary goal when goals exist;
- additional goals;
- client-stated and trainer-assessed sub-goals kept separate;
- urgency: Urgent, Warm, Background;
- hard and soft conflict resolution;
- visible safety state and review action;
- assessment/consultation alternate path when setup is incomplete;
- no AI diagnosis or silent safety clearance.

Actions:

- add/edit goals;
- resolve conflict;
- review safety;
- book assessment where allowed.

## 9. Sessions and Recurring Schedule

Show:

- upcoming sessions;
- past sessions;
- unresolved outcomes;
- active recurring series;
- location/type/duration context;
- change history where available.

Actions reuse canonical flows:

- Book session;
- Complete/resolve;
- Reschedule;
- Change occurrence/future/series;
- Pause, skip, or end recurrence after revalidation.

Scope:

```text
This occurrence only — default
This and selected future occurrences
Entire series
```

Future/series changes rerun overlap, buffer, working hours, DST, location, package, billing, and version checks.

## 10. Progress

Structured current state:

- measurements;
- current next-session focus;
- goal-related context.

Chronological history:

- session progress;
- measurements/milestones;
- recovery/safety observations;
- trainer notes/follow-ups.

Rules:

- quick progress belongs to one completed session;
- formal period-based Progress Report remains future;
- client report, trainer observation, trainer interpretation, and AI-prepared summary remain distinct;
- source session and timestamp remain visible.

## 11. Program / Workout — Pilot

Show:

- current program;
- upcoming workout;
- program history;
- trainer notes;
- template source/version;
- goals, safety, equipment, duration, assumptions.

Actions:

- Assign from template;
- Create client-specific program;
- Swap exercise;
- Propose section/program revision;
- Compare versions;
- Approve new version.

Rules:

- assignment happens inside Client Hub;
- templates/exercise catalog live under Settings;
- approved client versions are immutable;
- later template changes do not alter active client programs;
- AI uses approved exercise IDs and deterministic validation;
- trainer approval is required for publication.

## 12. Package and Billing

Answer:

```text
What package or rate is active?
How many sessions remain?
When does it expire?
What has been consumed?
What is owed?
What should happen next?
```

Show:

- billing mode;
- package or rate;
- balance/expiry;
- usage;
- package runway when hardened;
- payment state;
- balance due/overdue.

Actions:

- Assign/Renew/Replace package;
- Review usage;
- Record payment;
- Send reminder;
- Open Statement.

Manual invoice creation is absent.

## 13. Statement of Account

Read-first financial workspace.

Header:

```text
Statement of account · Client · Period · Currency · As of
```

Summary hierarchy:

```text
Balance due — dominant
Overdue
Invoiced
Paid
Credits
```

Ledger may include:

- package invoices;
- PPS invoices;
- payments;
- partial payments when supported;
- credits/refunds/corrections when supported;
- due/overdue states.

States:

- loading;
- confirmed empty;
- current;
- stale;
- partial;
- unavailable;
- uncertain after mutation.

Statement actions reuse Record Payment and MessageComposer.

## 14. Attendance

Use factual, neutral language and show period/denominator.

```text
Last 90 days
12 of 15 scheduled sessions completed
Completed 12 · Cancelled 2 · No-show 1 · Rescheduled 3
```

Do not label clients as reliable/unreliable or good/bad.

## 15. Communication

Global Inbox and Client Hub Communication are views of the same records.

Show:

- conversation;
- inbound/outbound timeline when enabled;
- unread/waiting state;
- sent/failed delivery;
- consent/channel;
- prepared reply/draft;
- related session/package/invoice context only when useful;
- Open full Inbox conversation.

MVP may be outbound-focused. Inbound hardening does not grant messages mutation authority.

## 16. Unified Activity

May include:

- sessions/outcome changes;
- progress;
- goals/safety;
- program versions;
- package/billing events;
- payments/corrections;
- messages/delivery;
- trainer notes.

Rules:

- timeline explains how current state changed;
- structured current state remains authoritative;
- events deep-link to canonical source/resolver;
- timeline rows do not duplicate business logic.

## 17. Lifecycle

### Pause

Review pause dates, future sessions/series, package expiry, outstanding balance, and prepared messages. Each consequence is explicit. Pause does not cancel invoices, clear safety, or silently extend packages.

### Resume / Reactivate

Derived checklist:

```text
Goals/safety current?
Package active?
Outstanding balance?
Billing mode valid?
Next session booked?
Communication prepared?
```

No separate onboarding-state store unless later evidence proves it necessary.

### Deactivate

Review future sessions, recurrence, invoices, package balance, drafts, and messages. Preserve history. Delete nothing silently.

## 18. Canonical Actions

| Objective | Workflow |
|---|---|
| Book/reschedule | BookingSheet |
| Complete/resolve | SessionCompletionSheet |
| Assign/renew package | Package workflow family |
| Record payment | RecordPaymentSheet |
| Send/reply | MessageComposer |
| Review account | Statement of Account |
| Manage recurrence | Recurring Schedule Manager |
| Lifecycle change | Lifecycle Resolver |
| Financial correction | Financial Correction Resolver |
| Missing truth | Data Quality Resolver |
| Duplicate identity | Duplicate Identity Resolver |
| Program | Program picker / Workout Builder |

## 19. State and Recovery

Each section supports appropriate subsets of:

```text
loading · ready · confirmed empty · partial · stale · unavailable
failed · blocked · pending · uncertain · recovered
```

Every consequential failure explains:

```text
what happened
what succeeded
what remains authoritative
what was preserved
what is uncertain
what the trainer can do next
```

## 20. Accessibility

- Semantic headings/landmarks.
- Keyboard-accessible views and actions.
- Visible focus and correct focus return.
- Screen-reader announcements for loading/refresh/error/success.
- No color-only status.
- Visible currency and financial labels.
- Mobile cards instead of squeezed tables.
- One-handed touch targets.

## 21. Acceptance Criteria

1. The trainer understands the client state without another primary destination.
2. One deterministic next safe action is shown with reason.
3. Actions launch canonical workflows.
4. Financial state is ERP-authoritative and honest when unavailable.
5. Package/session/payment consequences are visible.
6. Goals, safety, progress, and programs preserve role/source distinctions.
7. Communication and Inbox share records.
8. URL-backed state survives refresh/back/forward.
9. Lifecycle changes preview unresolved consequences.
10. Cross-tenant tests pass for every view/action.

## 22. Repository Audit Items

- `/clients/{clientId}` route and views.
- Existing tabs/sections/deep links.
- Data loaders and ERP reads.
- Program/package/statement components.
- Communication history and message route.
- Lifecycle model.
- Activity/timeline sources.
- Mobile/desktop overlay primitives.
- Accessibility/E2E coverage.
