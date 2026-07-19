> **Status:** Target direction — adopted as canonical intent, NOT implemented state.
> **Adopted:** 2026-07-19 · **Source:** `FITDESK_PRODUCT_REQUIREMENTS_DOCUMENT_V1.md` (documentation pack) · **sha256 (source body):** `f8d35446eb61dd57cf43fd27b9f7c3361b4d12ee236af68a062e05467854bd91`
> **Implementation reality:** see `docs/audits/FITDESK_IMPLEMENTATION_STATUS_RECONCILIATION_2026-07-19.md`
> **Rule:** This document describes intended product direction. Do not cite it as evidence
> that a capability exists. Verify against code before planning or estimating work.
>
---

# FitDesk Product Requirements Document v1

```text
Product: FitDesk SaaS Platform
Document: Product Requirements Document
Version: v1.0
Status: Product baseline draft — repository verification required
Primary persona: Independent personal trainer
Architecture posture: ERP-authoritative, trainer-sovereign, confirmed-first, tenant-scoped
Generated: 2026-07-18
```

> **Adoption discipline**
>
> This draft is derived from `FITDESK_JOURNEY_MAP_V1` v1.12 and `FITDESK_APPLICATION_SITEMAP_V1_1` v1.1. Reconcile it against the active repository, branch, routes, schemas, feature flags, tests, and deployment configuration before adoption. Land it in a documentation-only commit.

## 1. Executive Summary

FitDesk is a mobile-first operating system for independent personal trainers. It centralizes clients, sessions, packages, billing, payments, progress, programs, and communication without exposing raw ERP complexity.

The product must answer five questions quickly:

1. What is happening today?
2. What needs attention?
3. Why does it matter?
4. What is the safest next action?
5. Was the authoritative result confirmed?

North star:

```text
Detect meaningful operational risk
→ explain why it matters
→ prepare the next safe action
→ let the trainer review and confirm
→ reflect the verified result
```

## 2. Problem Statement

Independent trainers commonly operate across calendars, WhatsApp, notes, spreadsheets, payment records, and memory. This creates fragmented client context, unresolved session outcomes, missed billing consequences, duplicate work, and uncertain follow-up.

FitDesk solves this with:

- one daily command center;
- one Client Hub per client;
- one canonical workflow per consequential objective;
- ERP-authoritative financial truth;
- conflict-aware, DST-safe, recurrence-aware scheduling;
- trainer-confirmed communication;
- explicit partial, stale, unavailable, and uncertain states;
- bounded AI assistance that prepares but does not execute consequential actions.

## 3. Users and Jobs

### 3.1 Primary user

**Independent personal trainer** operating alone or with minimal administrative support.

Primary jobs:

- understand the day within seconds;
- create and activate clients;
- manage goals, safety, schedules, packages, and payments;
- complete sessions quickly on the gym floor;
- follow up through WhatsApp;
- protect revenue without becoming an accountant;
- recover safely from interruptions and integration failures.

### 3.2 Other actors

- **Client — MVP:** receives trainer-confirmed bookings, reminders, invoices/payment links, and messages; does not sign into FitDesk.
- **Internal support:** handles provisioning, tenant mapping, integration incidents, and controlled correction outside trainer navigation.
- **Future portal user:** accesses a separate secure client boundary only after privacy, identity, consent, and ownership decisions are approved.

## 4. Product Principles

### 4.1 Trainer sovereignty

```text
AI prepares.
Trainer reviews.
Trainer decides.
System executes only after explicit confirmation.
Outcome is recorded.
```

### 4.2 Confirmed-first mutations

The UI must not claim success before authoritative confirmation for client creation, booking, session outcomes, package assignment or consumption, invoices, payments, or WhatsApp sending.

### 4.3 ERP authority

ERPNext remains authoritative for ERP Customer identity, invoices, payments, credits, and accounting-facing records. FitDesk owns trainer UX, goals and safety, workflow state, drafts/intents, notes/events, duplicate audit, programs, and derived operational summaries.

### 4.4 One canonical action contract

Multiple entry points may open a workflow, but validation, preview, mutation, audit, recovery, and success must reuse one contract.

### 4.5 Honest operational state

Loading, empty, sparse, partial, stale, unavailable, failed, blocked, pending, reconciling, and uncertain states must be explicit. Unknown financial data must never be shown as zero.

### 4.6 Mobile-first work

Mobile uses focused full-height or bottom-sheet workflows. Desktop may use drawers, dialogs, split workspaces, or contextual rails. Critical actions always have visible controls.

### 4.7 Offline intent, not offline authority

Offline FitDesk may preserve read context, progress drafts, and completion intent. Package, invoice, payment, booking, message, and program consequences remain pending until online reconciliation.

## 5. Goals

1. Reduce trainer administrative time during and between sessions.
2. Ensure every completed session resolves progress and financial consequences safely.
3. Keep complete client context in one Client Hub.
4. Make unresolved work visible and recoverable.
5. Prevent duplicate, cross-tenant, and optimistic financial or scheduling mutations.
6. Provide communication continuity without becoming a separate CRM.
7. Establish a controlled foundation for AI-assisted extraction, summarization, drafting, and read-only questions.

## 6. Non-Goals

The MVP does not include:

- a client login or client-operated app;
- unrestricted inbound automation;
- autonomous booking, cancellation, package, invoice, payment, safety, or program mutation;
- raw ERP administration for trainers;
- general AI memory, raw SQL, shell/browser access, ERP credentials, or write tools;
- Programs as a primary destination;
- manual invoice creation in the normal trainer workflow;
- a generic configurable rules engine;
- opaque risk scores or character labels.

## 7. Information Architecture

### Desktop

```text
Dashboard · Schedule · Clients · Inbox · Billing · Settings
```

### Mobile

```text
Home · Schedule · Clients · Inbox · More
```

Persistent mobile utilities:

```text
Search · Profile/account · Global action · Connectivity/sync state
```

Programs remain client-contextual. Program templates and the exercise catalog live under Settings.

## 8. Functional Requirements

### FR-1 Authentication and workspace activation

- Register, sign in, and route new users to `/onboarding`.
- Provide one **Start Workspace** action.
- Request idempotent provisioning through the Control Plane.
- Show waiting, blocked, failed, completed, and safe-retry states from authoritative truth.
- Prevent duplicate provisioning and cross-tenant mapping.
- Continue successful users to Dashboard and first-client activation.

### FR-2 Dashboard command center

- Show Daily Brief, Today, Needs Attention, Business Health, activation guidance, Resume Work, and sync attention.
- Distinguish ready, empty, sparse, partial, stale, unavailable, and error states.
- Surface unresolved sessions, overdue financial work, missing next sessions, and recovery items.
- Open focused resolvers, not passive dead-end detail pages.
- Derived dashboard logic must not mutate scheduling or financial state.

### FR-3 Clients and Add Client

- Create clients through the approved ERP Customer path and tenant-scoped local projection.
- Normalize contact data and perform tenant-scoped duplicate checks.
- Capture billing mode: Package, Pay per session, or Decide later.
- Capture goals and safety while separating client-stated and trainer-assessed information.
- Do not create invoice, payment, package, session, message, or program during identity creation.
- On success, open Client Hub and offer the next safe action.

### FR-4 Client Hub

The Client Hub includes:

- Today / Next Safe Action;
- Overview;
- Goals and Safety;
- Sessions and Recurring Schedule;
- Progress;
- Program / Workout behind pilot controls;
- Package and Billing;
- Statement of Account;
- Attendance;
- Communication;
- Unified Activity;
- lifecycle actions.

It is read-first. Actions launch canonical workflows rather than duplicating mutation logic.

### FR-5 Scheduling

- Support one-off and bounded recurring bookings.
- Remain conflict-aware, DST-safe, package-aware, recurrence-aware, and version-aware.
- Return structured conflict responses.
- Distinguish hard overlaps from soft buffer or working-hours exceptions.
- Require reason, scope, review, and audit for soft exceptions.
- Use one BookingSheet for booking and rescheduling from all entry points.

### FR-6 Session completion

- Support Completed, No Show, Cancelled, and Rescheduled.
- For Completed, keep quick progress and applicable financial decisions in one contextual flow.
- Package clients see before/after package balance and no routine payment form.
- Pay-per-session clients see invoice preview and choose Paid Now or Pay Later.
- Trial clients see a no-charge state.
- Unset billing fails closed or creates a visible follow-up.
- Require one coherent review and explicit confirmation.
- Report step-level success, failure, or uncertainty without duplicating effects.

### FR-7 Packages and billing

- Assign packages from Client Hub using reusable templates.
- Create package invoices only during package assignment or renewal.
- Create pay-per-session invoices only on confirmed session completion.
- Hide manual invoice creation.
- Prevent negative package balances and silent billing-mode changes.
- Show balance, expiry, usage, and runway context.

### FR-8 Payments and statements

- Reuse one Record Payment contract from completion, Billing, invoice detail, Client Hub, and Statement.
- Persist through the approved ERP Payment Entry path.
- Support authoritative allocation and remaining balance.
- Show Balance due, Overdue, Invoiced, Paid, Credits, and a chronological ledger.
- Support loading, empty, stale, partial, unavailable, and uncertain states.
- Route corrections, credits, and refunds through controlled ERP-authoritative flows.

### FR-9 Inbox and communication

- Provide one MessageComposer and one conversation/message model.
- Support trainer-reviewed outbound drafts, native WhatsApp handoff or approved direct sending, sent/failed states, and client history.
- Hardening adds inbound events, unread, needs reply, waiting, unmatched sender, identity matching, deduplication, replay protection, and recovery.
- Inbound text may prepare intent but never execute a consequential mutation.
- Consent and identity requirements fail closed.

### FR-10 Search

- Provide persistent mobile Search and desktop command access.
- Search clients, sessions, conversations, invoices, payments, locations, and commands.
- Enforce tenant and permission scope before returning results.
- Deep-link into canonical records and workflows.

### FR-11 Program and Workout pilot

- Keep client programs inside Client Hub.
- Keep templates and exercise catalog under Settings.
- Preserve immutable approved versions.
- Require goal, safety, equipment, duration, catalog, and policy validation.
- AI may prepare catalog-constrained drafts only; trainer approval remains required.

### FR-12 Offline and reconciliation

- Cache selected Today and preparation context with freshness timestamps.
- Save progress drafts and intended completion state locally.
- Mark Saved on device, Waiting to sync, Reconciling, Review required, or Uncertain.
- Re-read authoritative session, package, invoice, payment, and billing state before execution.
- Auto-apply only when consequences remain unchanged.

### FR-13 AI-assisted workflows

Pilot candidates:

- Quick Add from Text;
- Text-to-Structured Completion;
- Pre-Session Brief;
- Contextual Message Copilot;
- Natural-Language Booking Draft;
- constrained Workout Builder;
- Client Pulse Lite as deterministic logic;
- limited read-only Ask FitDesk.

Every AI output uses tenant-scoped context, strict schemas, source references, deterministic validation, bounded budgets, human review, and no write tools.

## 9. Non-Functional Requirements

### Security and tenant isolation

- Resolve tenant before every entity read or write.
- Block cross-tenant routes, actions, search, webhooks, cache, and AI context.
- Store no ERP credentials in FitDesk or client-side code.
- Verify webhook authenticity and prevent replay.

### Reliability and idempotency

- Use operation IDs, expected versions, and idempotency keys.
- Treat uncertain results as first-class state.
- Re-query authority before retry.
- Preserve drafts and valid progress across recoverable failures.

### Accessibility

- Keyboard operation, visible focus, semantic controls, screen-reader announcements, focus trapping/return, contrast, touch targets, and readable financial cards/tables.
- Never rely on color alone.

### Performance

- Prioritize Dashboard, Today, Client Hub, Search, Booking, and Completion on mobile networks.
- Use stable shells and truthful skeletons.
- Never block manual workflows on optional AI generation.

### Observability

- Correlate request, tenant, actor, operation, domain result, ERP request, provider delivery, reconciliation, and AI run IDs.
- Report capability health, not endpoint-only health.

### Privacy

- Minimize client identity, safety, home-location, financial, communication, and AI-trace data.
- Prevent trainer-private notes from entering client messages automatically.

## 10. Source-of-Truth Summary

| Domain | Authoritative source | FitDesk role |
|---|---|---|
| Tenant/workspace provisioning | Control Plane | Request, display, and recover |
| ERP customer identity | ERPNext | Trainer workflow and local projection |
| Invoices, payments, credits | ERPNext | Contextual UX and approved commands |
| Sessions/scheduling | FitDesk domain, exact ERP coupling to verify | Validate and orchestrate |
| Goals and safety | FitDesk | Structured trainer-owned truth |
| Programs | FitDesk | Versioned trainer-approved truth |
| Messages | FitDesk + provider evidence | Context, consent, draft, delivery normalization |
| AI output | Never authoritative | Proposal or draft only |

## 11. Release Acceptance Criteria

The MVP is acceptable only when:

1. Workspace activation cannot duplicate provisioning.
2. Client creation and billing-mode selection have no hidden side effects.
3. Booking is conflict-aware, DST-safe, recurrence-aware, and idempotent.
4. Completion produces the correct package or PPS consequence.
5. Paid Now and Pay Later preserve authoritative financial truth.
6. Unresolved sessions remain visible and recoverable.
7. Retries cannot duplicate package, invoice, payment, session, or message effects.
8. Financial unavailability never renders as zero.
9. Cross-tenant tests pass for high-risk reads and writes.
10. Mobile workflows survive interruption and partial connectivity.
11. Outbound messages require trainer review.
12. AI features fail safely with complete manual fallback.
13. Repository-confirmed tests, lint, typecheck, build, migrations, rollback, and smoke checks pass.

## 12. Adoption Questions

The repository audit must confirm:

- active branch and modernization diff;
- current routes and aliases;
- session-progress persistence;
- session-completion orchestration;
- package, invoice, and payment contracts;
- Messages/Inbox and Invoices/Billing routes;
- mobile navigation, Search, FAB, and More;
- Evolution API capabilities;
- offline libraries;
- AI, program, catalog, and feature flags;
- actual test and deployment commands.
