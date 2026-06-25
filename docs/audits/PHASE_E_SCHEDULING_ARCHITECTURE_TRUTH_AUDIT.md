# Phase E — Scheduling Architecture Truth Audit

```text
Project: FitDesk SaaS Platform
Phase: E — Scheduling Architecture Truth Audit
Mode: Audit/documentation only
Status: Approved audit finding — no behavior patch in this phase
```

## 1. Executive Summary

Phase E confirmed that FitDesk has a strong pure scheduling engine, but does not currently have production session persistence.

The correct Phase E decision is:

```text
Do not patch scheduling behavior yet.
Do not create placeholder orchestration files.
Do not wire billing/package session outcome behavior yet.
Choose the persistence architecture first.
```

## 2. Current Truth

### Existing scheduling core

```text
lib/scheduling/engine.ts
lib/scheduling/__tests__/engine.test.ts
actions/sessions.ts
components/modules/ScheduleView.tsx
components/modules/SessionActions.tsx
components/scheduling/*
app/dashboard/schedule/*
```

The pure scheduling engine exists and is well covered by tests for timezone, DST, conflict, buffer, and recurrence behavior.

### Missing target architecture files

The architecture handbook target names do not exist yet on current `main`:

```text
lib/scheduling/bookingService.ts
lib/scheduling/sessionRepository.ts
actions/schedulingActions.ts
```

These should not be added as empty shells. They should only be introduced when the persistence source and orchestration boundary are approved.

## 3. ERP Session Persistence Truth

The current ERP adapter explicitly states that the `PT Session` DocType does not exist in this ERP instance.

Current behavior:

```text
getSessions() returns an empty list
getSessionById() throws Not Found
createSession() throws Not Implemented
markSessionComplete() throws Not Implemented
cancelSession() throws Not Implemented
markSessionMissed() throws Not Implemented
```

This means scheduling UI can exist, but confirmed booking/session lifecycle cannot be treated as production-functional yet.

## 4. Risk Classification

| Risk | Area | Finding | Decision |
|---|---|---|---|
| LOW | Pure scheduling engine | Engine and tests exist | Preserve; do not rewrite |
| HIGH | Persistence boundary | PT Session DocType unavailable; writes throw | Choose persistence architecture first |
| MEDIUM | Target architecture files | bookingService/sessionRepository/schedulingActions absent | Do not create placeholders |
| MEDIUM | Ownership / IDOR gate | Actions call `getSessionById(sessionId, resolved.trainerId)` before by-id mutations | Keep gate; true closure requires persisted ownership |
| HIGH | Billing/package hooks | Completion intentionally does not invoice PPS or decrement package balances | Wait for idempotent session outcome persistence |
| LOW | Conflict / DST / recurrence | Tests cover DST, conflicts, buffer, recurrence | Future orchestration must call engine |
| MEDIUM | UI expectations | Schedule UI exists while persistence is unavailable/stubbed | Keep calm unavailable/empty states |

## 5. Billing and Package Guardrail

Current `actions/sessions.ts` documents Option B — deferred pay-per-session invoicing:

```text
No invoice is created on completion regardless of billing mode.
No package balance is decremented.
```

This is intentional because the current session persistence layer lacks the fields required for safe idempotency, such as billing mode and invoice linkage.

Future implementation must preserve:

```text
Pay-per-session: invoice only after completed persisted session
Package: decrement only through idempotent package/session consumption record
No-show: explicit trainer decision before charge/deduct
```

## 6. Required Decision Before Implementation

Before any scheduling behavior patch, FitDesk must choose one persistence model:

```text
Option A — ERPNext PT Session DocType through Control Plane proxy
Option B — local FitDesk session table with ERP financial projection
Option C — Control Plane-owned scheduling state with FitDesk projection
```

No option may bypass the existing ERP client/proxy path for ERP I/O.

## 7. MVP-Safe Now

For the current cleanup phase:

```text
Preserve the engine.
Preserve current server action boundary.
Preserve calm unavailable/empty scheduling states.
Do not alter invoice/payment/package behavior.
Do not alter ERP adapter behavior.
Do not introduce placeholder architecture files.
```

## 8. Production-Hardening Soon

After persistence architecture approval:

```text
Introduce sessionRepository only with real storage.
Introduce bookingService only as orchestration over the existing engine.
Move actions/sessions.ts or wrap it with schedulingActions only if the route boundary is approved.
Persist session outcome idempotency keys.
Add package consumption records.
Add pay-per-session invoice linkage.
Add ownership tests against persisted sessions.
```

## 9. Verification Evidence

```text
E.1 audit:
- Scheduling files found: 20
- Scheduling test files: 2
- Pure engine exists
- Current server-action boundary is actions/sessions.ts
- Target architecture files are absent

E.2 classification:
- Risk rows: 7
- High risks: 2
- Medium risks: 3
- Low risks: 2
- Scheduling targeted tests passed: 86/86
```

## 10. Final Phase E Decision

```text
Phase E should close with documentation only.
No runtime scheduling patch is approved in this phase.
```
