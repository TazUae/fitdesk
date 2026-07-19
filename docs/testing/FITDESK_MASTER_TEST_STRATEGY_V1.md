> **Status:** Target direction — adopted as canonical intent, NOT implemented state.
> **Adopted:** 2026-07-19 · **Source:** `FITDESK_MASTER_TEST_STRATEGY_V1.md` (documentation pack) · **sha256 (source body):** `e9328beb7f4f2aea82c2c7fb93e4e608437492ef6067a1c423c73b2e4929e837`
> **Implementation reality:** see `docs/audits/FITDESK_IMPLEMENTATION_STATUS_RECONCILIATION_2026-07-19.md`
> **Rule:** This document describes intended product direction. Do not cite it as evidence
> that a capability exists. Verify against code before planning or estimating work.
>
---

# FitDesk Master Test Strategy v1

```text
Product: FitDesk SaaS Platform
Document: Master Test Strategy
Version: v1.0
Status: Quality strategy — repository command/coverage audit required
Generated: 2026-07-18
```

> **Adoption discipline:** The repository audit must replace command placeholders with proven scripts and record existing coverage before this becomes canonical.

## 1. Quality Objective

Prove FitDesk is safe under real trainer conditions: mobile use, interruptions, stale data, partial integrations, duplicate submissions, tenant boundaries, distributed financial steps, and optional AI variability.

## 2. Principles

1. Test authoritative outcomes, not only UI success.
2. Financial, scheduling, tenancy, and provisioning receive strongest negative testing.
3. Every consequential mutation is tested for duplicate submit, stale version, timeout, and uncertainty.
4. Manual workflows remain complete when AI, messaging, or ERP is unavailable.
5. Cross-tenant denial tests are mandatory.
6. Accessibility/mobile ergonomics are release criteria.
7. Test data is disposable and isolated.
8. Do not invent repository commands.

## 3. Test Layers

| Layer | Purpose | Examples |
|---|---|---|
| Static | Types, lint, format, dependency/config | TypeScript, schema, build config |
| Unit | Pure rules/derivations | scheduling engine, attention, package runway |
| Component | Responsive interaction/states | sheets, forms, statement, Inbox |
| Integration | Services/repos/external clients | completion, ERP normalization, messaging |
| Contract | Cross-service schemas | FitDesk/Control Plane/ERP/provider |
| E2E | Critical trainer journeys | onboarding through payment/recovery |
| Security | Isolation/attack resistance | IDOR, replay, injection, cache |
| Accessibility | Keyboard/screen reader/touch | WCAG-oriented validation |
| Performance | Budgets/resilience | Dashboard, Search, booking, webhooks |
| AI evaluation | Schema/grounding/safety | Quick Add, parser, copilot, Ask FitDesk |
| Manual pilot | Real workflow truth | gym-floor interruption/mobile/provider |

## 4. Environments

### Local

- disposable local data;
- mocks/fakes for deterministic tests;
- controlled sandbox integration where required;
- never destructive production tests.

### CI

- isolated database/services;
- deterministic seeds;
- no shared mutable tenant data;
- migration validation from clean and representative prior states.

### Staging/pilot

- production-like non-production tenants;
- explicit provider instances/accounts;
- rollback and observability enabled;
- no real client data without approval.

### Production smoke

- read-only or safely reversible checks;
- dedicated approved test tenant for any writes;
- verify health, auth, routes, capability state, deployment version.

## 5. Test Data

Factories/fixtures:

- tenants/users/roles;
- Package, PPS, Trial, Unset clients;
- active/low/exhausted/expired packages;
- future/live/unresolved/completed/cancelled/no-show/recurring sessions;
- outstanding/overdue/partial/paid/credited invoices;
- allocated/partial/uncertain/replayed payments;
- allowed/unknown/revoked consent;
- draft/sent/delivered/failed/unknown/duplicate/unmatched messages;
- clear/ambiguous/missing/injection/stale/cross-tenant AI cases.

Every fixture has explicit tenant ownership.

## 6. Static and Build Verification

Audit exact commands for:

```text
format · lint · typecheck · unit · integration · E2E
schema validation · migration validation · production build · security audit
```

Release fails on type/build/schema errors, critical test failure, unreviewed high/critical security issues, route regression, or missing required integration configuration.

## 7. Unit Coverage

### Scheduling

- overlap boundaries and adjacency;
- buffer conflicts;
- working-hours exceptions;
- location confidence;
- recurrence cap/expansion;
- timezone/DST gap/fold;
- occurrence/future/series scope;
- structured conflict shape.

### Dashboard

- Today ordering;
- unresolved-session attention;
- overdue/missing-next-session attention;
- partial/unavailable behavior;
- Pulse Clear/Needs review/Unknown;
- priority ordering.

### Package/billing

- before/after balance;
- no negative balance;
- exactly-once consumption;
- PPS invoice eligibility;
- Trial no-charge;
- Unset fail-closed;
- package runway.

### Messaging

- unread/needs-reply/waiting;
- consent decisions;
- provider-status normalization;
- sender matching without automatic merge.

### AI validators

- strict schema accept/reject;
- source completeness;
- prohibited actions;
- catalog/policy validation;
- budget/exit conditions.

## 8. Component Tests

- sheet/drawer open/close;
- URL state restores on refresh/back/forward;
- focus trap/return;
- progressive billing disclosure;
- complete review summaries;
- no false zero/success in partial/unavailable/uncertain states;
- readable mobile financial cards;
- Inbox keyboard behavior;
- Search outside More;
- reviewed destructive/correction actions.

## 9. Integration Suites

### Client creation

- ERP failure creates no local authority;
- ERP success/local projection failure creates repair state;
- duplicate warning/audited continue;
- tenant isolation.

### Booking

- service/repository/ERP boundary;
- stale version;
- duplicate operation key;
- recurrence partial conflict;
- soft-exception audit;
- uncertain-result re-query.

### Completion matrix

| Outcome | Package | PPS Paid Now | PPS Pay Later | Trial | Unset |
|---|---:|---:|---:|---:|---:|
| Completed | Required | Required | Required | Required | Required |
| No Show | Policy | Policy | Policy | Required | Required |
| Cancelled | Policy | Policy | Policy | Required | Required |
| Rescheduled | Scheduling contract | Scheduling contract | Scheduling contract | Scheduling contract | Scheduling contract |

Assert outcome, progress, package/invoice/payment, audit, and derived refresh separately.

### Payments

- valid allocation;
- partial when supported;
- unavailable method;
- duplicate submit;
- ERP timeout/re-query;
- receipt from confirmed state;
- correction routing.

### Messaging/webhooks

- outbound success/failure/unknown;
- signed inbound;
- invalid signature;
- duplicate event;
- out-of-order event;
- unmatched sender;
- cross-tenant sender collision;
- idempotent replay.

### Offline reconciliation

- unchanged state executes once;
- package exhausted while offline;
- billing mode changed;
- session completed elsewhere;
- invoice/payment already exists;
- auth expired;
- multi-device conflict;
- uncertain prior result.

## 10. Contract Tests

Versioned fixtures for:

- FitDesk ↔ Control Plane provisioning;
- FitDesk ↔ Control Plane ERP commands;
- Control Plane ↔ ERP executor;
- ERP Customer/Invoice/Payment/Credit/errors;
- Evolution outbound/result;
- Evolution inbound events;
- AI provider adapter.

Verify required fields/enums, normalized errors, operation IDs, timestamps/timezones, partial/unavailable representation, and backward compatibility during migration.

## 11. Critical E2E Journeys

1. Sign up → onboarding → Start Workspace → Dashboard.
2. Add client → billing mode → goals/safety → Client Hub → first booking.
3. Package assignment → booking → complete + progress → one-unit consumption.
4. PPS completion → invoice → Paid Now → payment confirmed.
5. PPS Pay Later → outstanding invoice → Statement → Record Payment.
6. Unresolved past session → Needs Attention → completion.
7. Recurring booking with one conflict → correct → confirm series.
8. Buffer exception → reason/scope/review/audit.
9. Contextual message → consent → review → handoff/send → history.
10. Offline progress/intent → reconnect → revalidate → confirm/review conflict.
11. Cross-tenant route/action/search/message/invoice/session/AI denial.
12. Old `/messages` and `/invoices` links safely resolve to canonical routes.

## 12. Security Testing

- Session expiry and authorization.
- Tenant checks at route/action/service/repo/search/webhook/offline/AI layers.
- IDOR with foreign IDs.
- CSRF/replay on mutations.
- Webhook signature/timestamp/replay.
- Rate limiting/abuse.
- Prompt injection via notes/messages/catalog.
- Sensitive leakage in logs/errors/analytics.
- ERP credentials absent from FitDesk/client bundle.
- Cache inaccessible after logout/tenant switch/revocation.
- Dependency/container scanning per deployment tooling.

## 13. Accessibility Testing

- semantic structure;
- keyboard-only critical journeys;
- labels/live regions;
- focus trap/return;
- zoom/reflow;
- contrast;
- non-color status;
- touch targets;
- reduced motion where applicable;
- financial table/card semantics;
- mobile sheets/nested dialogs.

## 14. Performance and Resilience

Measure and set budgets for:

- Dashboard first/full state;
- Search;
- Client Hub;
- booking/recurrence preview;
- completion/authoritative refresh;
- Statement pagination;
- Inbox list/thread;
- webhook bursts;
- offline hydration;
- AI timeout/manual fallback.

Resilience:

- ERP unavailable;
- Control Plane timeout;
- Redis/job delay;
- provider outage;
- database restart;
- duplicate delivery;
- deployment during in-flight operation.

## 15. AI Evaluation

Each AI feature requires:

- golden dataset;
- schema-validity target;
- precision/recall targets;
- hallucination/harmful-error ceiling;
- cross-tenant and prompt-injection cases;
- stale-source expiration;
- latency/token/cost budget;
- human-edit/rejection measurement;
- deterministic manual fallback.

Feature focus:

- Quick Add: field precision, invented fields, safety recall.
- Progress parser: role separation/safety recall.
- Message Copilot: fact integrity/prohibited claims.
- Booking parser: absolute interpretation/ambiguity.
- Workout Builder: catalog/equipment/duration/policy/safety.
- Ask FitDesk: tool choice, sources, freshness, unavailable handling, no writes.

## 16. Observability Assertions

Critical operations emit correlated tenant, actor, operation, idempotency key, expected version, domain result, ERP/provider reference, step-level result, uncertainty state, audit event, and AI versions/stop reason. Sensitive raw values are minimized.

## 17. Severity

| Severity | Definition | Release effect |
|---|---|---|
| Critical | Cross-tenant leak, duplicate financial effect, credential exposure, corruption | Immediate no-go |
| High | Incorrect billing/outcome, unsafe retry, broken provisioning, inaccessible critical flow | No-go |
| Medium | Recoverable workflow defect, misleading state, major responsive/a11y issue | Triage before release |
| Low | Cosmetic/low impact with safe workaround | May defer with owner/date |

## 18. Entry/Exit

### Entry

- scope/criteria approved;
- commands/environments verified;
- isolated test data;
- sandbox contracts available;
- migration/rollback documented.

### Exit

- critical/high tests pass;
- no unresolved critical/high defects;
- tenant and financial-integrity suites pass;
- critical accessibility journeys pass;
- build/migration validation passes;
- observability/rollback smoke passes;
- enabled AI gates pass;
- founder manual test/sign-off recorded.

## 19. Audit Output Required

- command matrix;
- test inventory by domain;
- coverage gaps/flaky tests;
- CI workflows;
- environment dependencies;
- migration method;
- browser/device matrix;
- staging/provider accounts;
- next atomic test additions.
