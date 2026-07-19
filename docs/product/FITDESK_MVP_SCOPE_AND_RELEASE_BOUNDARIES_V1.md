> **Status:** Target direction — adopted as canonical intent, NOT implemented state.
> **Adopted:** 2026-07-19 · **Source:** `FITDESK_MVP_SCOPE_AND_RELEASE_BOUNDARIES_V1.md` (documentation pack) · **sha256 (source body):** `b90b6e9ad340df78935082696cc16b22e0e4ff7d03ec969dce02354c6cc2da38`
> **Implementation reality:** see `docs/audits/FITDESK_IMPLEMENTATION_STATUS_RECONCILIATION_2026-07-19.md`
> **Rule:** This document describes intended product direction. Do not cite it as evidence
> that a capability exists. Verify against code before planning or estimating work.
>
---

# FitDesk MVP Scope and Release Boundaries v1

```text
Product: FitDesk SaaS Platform
Document: MVP Scope and Release Boundaries
Version: v1.0
Status: Product scope baseline — repository verification required
Generated: 2026-07-18
```

> **Adoption discipline:** Derived from the Journey Map v1.12 and Application Sitemap v1.1. Reconcile against repository truth before adoption. Commit documentation separately from code, schema, dependency, or deployment changes.

## 1. Purpose

Define what FitDesk must deliver now, what requires controlled pilot treatment, what must be hardened before broad production use, and what remains future or rejected.

## 2. Classification

| Class | Meaning |
|---|---|
| **MVP / pilot-safe now** | Required or permitted in the first usable trainer release, subject to verification and release gates. |
| **Pilot feature-flagged** | Controlled rollout with manual fallback, evaluation, usage limits, and kill switch. |
| **Production-hardening soon** | Required before scale, high financial volume, imports, multi-device use, or inbound messaging. |
| **Future platform architecture later** | Valuable but separately approved after the MVP is proven. |
| **Rejected / separate approval** | Must not appear implicitly. |
| **Verify at adoption** | Product direction is approved, but current implementation is not proven. |

## 3. MVP Outcome

```text
Sign up
→ start workspace
→ add client
→ choose billing mode
→ capture goals and safety
→ assign package or store session rate
→ book safely
→ prepare for the session
→ complete with progress
→ apply correct package/invoice/payment result
→ send trainer-approved communication
→ see verified result and next safe action
```

## 4. MVP / Pilot-Safe Now

### Access and activation

- Authentication and `/onboarding`.
- Idempotent Start Workspace.
- Waiting, blocked, failed, completed, and safe-retry states.
- First-client activation derived from existing state.

### Navigation

Desktop:

```text
Dashboard · Schedule · Clients · Inbox · Billing · Settings
```

Mobile:

```text
Home · Schedule · Clients · Inbox · More
```

- Search remains persistent and outside More.
- Global action opens canonical workflows.
- Programs are not primary navigation.

### Dashboard

- Daily Brief, Today, Needs Attention, Business Health.
- Empty, sparse, partial, stale, unavailable, and error states.
- Activation guidance.
- Resume Work and sync attention when supporting state exists.

### Clients and Client Hub

- Client list, search, deterministic filters, Add Client.
- Tenant-scoped duplicate warning.
- Billing mode, goals, and safety.
- Client Hub: Today, Sessions, Progress, Package/Billing, Statement, Attendance, Communication, Activity, lifecycle entry points.
- Program / Workout behind pilot controls.

### Scheduling

- Day/week views.
- Canonical BookingSheet.
- One-off and bounded recurrence.
- Conflict-aware, DST-safe, package-aware, recurrence-aware validation.
- Structured conflicts.
- Version and idempotency protection.
- Dated availability foundation and explicit one-off exceptions where implemented.

### Session completion

- Completed, No Show, Cancelled, Rescheduled.
- Quick progress inside completion.
- Package deduction preview and confirmed consumption.
- PPS invoice preview and confirmed creation.
- Paid Now / Pay Later in the same PPS completion flow.
- Trial no-charge.
- Billing-unset fail-closed behavior.
- Unresolved-session recovery.
- Step-level result truth and duplicate-effect prevention.

### Packages, billing, and payments

- Package templates.
- Client package assignment from Client Hub.
- Package invoice at assignment/renewal.
- Billing overview and invoice list/detail.
- Canonical Record Payment.
- ERP-authoritative Statement of Account.
- Honest financial states.
- Manual invoice creation hidden.

### Communication bridge

- Canonical MessageComposer.
- Trainer-reviewed recipient and message.
- Native WhatsApp handoff and/or approved outbound path.
- Sent and failed states.
- Client-level communication history.
- Draft preservation where persistence exists.

### Search

- Persistent mobile Search.
- Desktop command/search access.
- Tenant-scoped clients, sessions, conversations, invoices, payments, locations, and commands.

### Offline baseline

- Limited cached Today and preparation context with freshness.
- Local progress and completion intent.
- Visible pending/reconciling states.
- Authoritative revalidation before consequences.
- Auto-apply only when consequences are unchanged.

### Pilot AI

Feature-flagged:

- Quick Add from Text.
- Text-to-Structured Completion.
- Pre-Session Brief.
- Message Copilot.
- Natural-Language Booking Draft.
- Client Pulse Lite as deterministic logic.
- constrained Workout Builder after catalog/safety gates.
- limited read-only Ask FitDesk last.

## 5. Mandatory MVP Guardrails

The MVP must not:

- bypass the ERP client/proxy and Control Plane path;
- store ERP credentials in FitDesk;
- execute direct Docker operations from the Control Plane;
- claim success before confirmation;
- create package invoices during identity creation;
- create PPS invoices before confirmed completion;
- expose manual invoice creation;
- show package clients irrelevant routine payment fields;
- show unavailable financial data as zero;
- let client text or AI mutate consequential state;
- use generic AI write tools;
- treat offline intent as completed authority;
- use manual production-server edits as source of truth.

## 6. Production-Hardening Soon

### Inbox and communication

- Authenticated Evolution API inbound webhooks.
- Global Inbox with unread, needs reply, waiting, failed, unmatched, sent, and drafts.
- Ordering, deduplication, replay safety, reconnect handling.
- Sender matching and controlled linking.
- Client Hub inbound/outbound timeline.
- Delivery/read-state normalization.
- Communication Consent Center.

### Financial integrity

- Partial payments.
- Receipts from confirmed ERP state.
- Credits, refunds, and correction resolver.
- Allocation and uncertain-result recovery.
- Statement filters, pagination, download, and trainer-confirmed sharing.
- Package Runway and package-exhausted resolver.

### Scheduling and lifecycle

- Recurring Schedule Manager with occurrence/future/series scope.
- Time-Off and Day Disruption Manager.
- Cancellation/no-show waiver with structured reason.
- Buffer and working-hours exception hardening.
- Pause, Resume, Reactivate, Deactivate resolver.
- Session Change Summary.

### Identity and data quality

- Duplicate Client Identity Resolver before imports/high-volume adoption.
- Just-in-Time Data Quality Resolver.
- Source freshness and provenance.
- Controlled support correction.

### Offline and device security

- Encrypted selective storage.
- Cache expiry and tenant/logout cleanup.
- Background sync.
- Multi-device conflict handling.
- Device revocation.
- Dedicated reconciliation audit and tooling.

### Operational quality

- Integration Health Center.
- Policy Change Impact Preview.
- Full accessibility validation.
- Performance budgets and monitoring.
- Complete audit/idempotency/uncertainty testing.

## 7. Future Platform Architecture Later

- Secure no-install client portal.
- Dedicated client PWA/native app after separate decision.
- AI WhatsApp Concierge with bounded autonomy and trainer takeover.
- Formal progress reports.
- Voice-to-structured progress.
- Adaptive progression proposals.
- Gap optimization, travel-aware suggestions, and delay orchestration.
- Predictive scheduling recommendations that remain trainer-confirmed.
- Advanced analytics and forecasting.
- Multi-seat approval thresholds.
- Generic rules platform only after multiple production rules prove the abstraction.

## 8. Rejected / Separate Approval Required

- autonomous booking, rescheduling, cancellation, completion, package, invoice, payment, refund, safety clearance, or program publication;
- unrestricted autonomous WhatsApp agent;
- multi-agent business operations;
- opaque client risk scores or character labels;
- automatic movement of sessions from inferred flexibility;
- silent policy overrides;
- silent package-expiry extension;
- negative package balances;
- raw accounting administration for trainers;
- unrestricted client access to trainer-private or ERP-internal data.

## 9. Release Gates

### Functional

- Critical journeys pass end to end.
- Every consequential flow has preview, confirmation, authoritative result, and recovery.
- All entry points reuse canonical domain contracts.

### Data and financial

- Tenant isolation verified.
- ERP authority verified.
- Idempotency and uncertain-result handling verified.
- No duplicate package, invoice, payment, session, or message effects.

### UX

- Mobile works one-handed and survives interruption.
- Search is not hidden in More.
- Empty/partial/stale/unavailable/blocked states are honest.
- Accessibility checks pass.

### Operational

- Tests, lint, typecheck, build, migration validation, and security checks pass.
- Backup/rollback is verified before high-risk mutations.
- Monitoring and integration health are available.
- Git remains source of truth; Dokploy deploys from Git.

### Pilot AI

- Feature flag and kill switch.
- Golden dataset and regression suite.
- Cross-tenant and prompt-injection tests.
- Strict schema and deterministic validator.
- Manual fallback.
- No write tools.
- Latency and cost budget.

## 10. Scope Change Control

Every proposed change states:

```text
Problem
User/workflow
Current workaround
Scope class
Authority affected
Mutation/recovery impact
Security/privacy impact
Test impact
Migration/rollback impact
Decision owner
```

UI presence alone does not make a feature MVP-complete.
