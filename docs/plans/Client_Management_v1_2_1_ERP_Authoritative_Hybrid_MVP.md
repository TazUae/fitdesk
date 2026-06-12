# Client Management v1.2.1 - ERP-Authoritative Hybrid MVP

```text
Document status: Approved build plan with final architecture patch
Product: FitDesk SaaS Platform
Module: Client Management
Version: v1.2.1
Architecture: ERP-authoritative hybrid MVP
Mode: Plan for Claude Code Phase 1 implementation planning
```

## 1. Executive Summary

FitDesk should implement Client Management v1.2.1 as an **ERP-authoritative hybrid**.

In plain English:

```text
ERPNext Customer = official customer/client identity for billing and ERP-backed business flows
FitDesk local tables = fast trainer UX layer for directory, goals, safety, duplicate audit, actions, notes, and Client Hub state
```

This avoids a dangerous source-of-truth inversion. The Phase 0 audit found that FitDesk currently stores zero client data locally and that current clients are ERPNext `Customer` documents read and written through the existing Control Plane proxy. The audit also found that invoices, payments, and messages key off the ERP Customer docname. Therefore, making a local-only client UUID the main client ID during MVP would risk breaking billing, payments, messages, and future scheduling links.

The approved implementation keeps ERPNext Customer canonical for MVP while adding FitDesk local enrichment tables around it.

## 2. Final Architecture Decision

### Approved decision

```text
ERPNext Customer remains canonical for MVP.
client_index is a tenant-scoped local read model and enrichment layer.
Add Client creates ERP Customer through the existing approved proxy path, then writes local FitDesk rows.
```

### Meaning

ERPNext owns:

- Official customer identity.
- ERP Customer docname.
- Invoice/customer linkage.
- Payment/customer linkage.
- Customer active/disabled state where financially relevant.
- ERP accounting-facing customer data.

FitDesk local tables own:

- Fast Client Directory.
- Structured goals.
- Goal confidence/source.
- Safety flags.
- Duplicate override audit.
- Action queue.
- Client Hub overview state.
- Notes/events.
- Onboarding state.
- UI placeholders.
- Trainer-facing workflow state.

### Core rule

```text
Do not make client_index.id the business client ID during MVP.
Use erpCustomerId for all ERP-backed business flows.
```

## 3. ERPNext Best-Practice Boundary

ERPNext Customer should remain the official ERP customer record. FitDesk should not overload ERP Customer with trainer-UX workflow state.

### Store in ERPNext Customer

- Customer name.
- Mobile number.
- ERP Customer docname.
- Customer group / territory / ERP-required fields.
- Disabled/active state where it affects financial operations.
- Minimal custom fields that are already required by existing FitDesk ERP flows.

### Store in FitDesk local tables

- Action queue.
- AI parsing confidence.
- Duplicate override history.
- Client Hub UI state.
- Structured training goals.
- Safety flags.
- Trainer notes/events timeline.
- Program/progress placeholders.
- Onboarding state.

### ERP I/O rule

```text
All ERP I/O must go through the existing ERP client/proxy path.
Do not store ERP credentials in FitDesk.
Do not bypass erpFetch().
Do not bypass the Control Plane proxy.
```

## 4. Exact ERP Proxy Path

ERP Customer creation must use the existing client creation path.

Approved path:

```text
actions/clients.ts:addClient()
  -> existing ERP adapter createClient()
  -> lib/erpnext/client.ts:erpFetch()
  -> Control Plane ERP proxy
  -> ERPNext Customer DocType
```

If Claude Code finds the exact wrapper import or function name differs, it must report the exact function chain before implementation. The final boundary remains:

```text
FitDesk server action
  -> existing adapter
  -> lib/erpnext/client.ts erpFetch
  -> Control Plane proxy
  -> ERPNext
```

Do not create a new direct ERPNext client for this flow.

## 5. Corrected Add Client Rule

The earlier v1.2 plan said Add Client should not mutate ERP. That is corrected for v1.2.1 because current FitDesk billing and message flows depend on ERP Customer docname.

### Correct MVP rule

```text
Add Client MAY create the ERP Customer through the approved ERP proxy path.
Add Client MUST NOT create invoices, payment entries, WhatsApp sends, sessions, or programs.
```

This keeps the ERP identity available immediately without allowing financial or automation side effects during client creation.

## 6. MVP Create Flow - Synchronous End-to-End

The Add Client create flow is synchronous end-to-end for MVP.

ERP Customer creation and local FitDesk row creation must both complete before the success response returns.

### Sequence

```text
1. Trainer opens Add Client sheet/drawer.
2. Trainer fills manual form or uses optional AI assist.
3. Validate required fields: full name + phone.
4. Normalize phone to E.164.
5. Run tenant-scoped duplicate check against client_index.
6. Trainer reviews warnings/conflicts.
7. Trainer confirms.
8. Create ERP Customer through approved proxy path.
9. Receive ERP Customer docname.
10. Create local FitDesk rows:
    - client_index
    - client_goal
    - client_action_intent
    - client_event
11. Return success.
12. Hydrate/open Client Hub.
```

No early success response is allowed before local rows are created.

## 7. Failure Behavior

### Case A - ERP Customer creation fails

```text
Do not create local rows.
Show a recoverable error.
Trainer can retry.
```

Suggested UI copy:

```text
Client could not be created because the workspace is still connecting or ERP is unavailable. Please try again.
```

### Case B - ERP Customer succeeds but local rows fail

```text
Do not delete ERP Customer automatically.
Log the error.
Return a recoverable error.
Run repair/backfill to create the missing local row from ERP.
```

Reason: deleting ERP records automatically can be more dangerous than a stale or missing local read model.

### Case C - Local projection fails later

```text
Log the error.
Do not roll back the completed domain action.
Repair with backfill/reconcile.
```

## 8. Data Is Testing Data - Migration Posture

The current client data is testing data, so the implementation can be pragmatic. But it should still avoid destructive habits.

### Approved posture

```text
Do not delete ERP Customers.
Do not reset databases.
Do not assume all legacy goal blobs are valid.
Do not preserve legacy hacks longer than needed.
```

### Backfill strategy

```text
Backfill client_index from ERP Customers once per tenant.
Normalize phone numbers into phoneE164.
Create client_goal rows only when goal JSON parses cleanly.
For messy or unknown goal blobs:
  primaryGoalLabel = formatted display string
  client_goal.confidence = "unknown"
  client_goal.source = "system_inferred"
Write client_event: client.backfilled
```

## 9. Backfill Trigger

For MVP pilot, backfill is a manually triggered CLI/script run once per tenant before that tenant's Client Directory goes live.

### Backfill source

```text
ERPNext Customer records through the existing ERP proxy path.
```

### Backfill target

```text
client_index
client_goal only when goals parse cleanly
client_event: client.backfilled
```

### Backfill must be idempotent

```text
Check tenantId + erpCustomerId before insert.
If row exists, update safe summary fields only.
Do not create duplicate client_index rows.
Do not delete ERP Customers.
```

### Future hardening

```text
Wire backfill/sync into workspace provisioning or a scheduled reconcile job once a real job host exists.
```

## 10. Canonical Tenant Key

Use this as the canonical tenant isolation key:

```text
tenantId = WorkspaceProvisioning.tenantId from getTenantContext()
```

Do not use `trainerId` or `userId` as the table isolation key. They may be metadata, but not tenant isolation keys.

Every local client query must force a tenant filter.

```text
No raw local client SQL from UI actions.
All access goes through a tenant-scoped repository.
```

## 11. MVP Data Model

### client_index

Purpose: fast local read model and enrichment layer linked to ERP Customer.

```ts
type ClientIndex = {
  id: string;                         // local row id
  tenantId: string;                   // WorkspaceProvisioning.tenantId
  erpCustomerId: string;              // ERP Customer docname, required for MVP

  fullName: string;
  phoneE164: string;
  whatsappEnabled: boolean;
  status: "active" | "inactive" | "archived";

  primaryGoalLabel: string | null;
  primaryGoalId: string | null;
  safetyState: "clear" | "needs_review" | "blocked_downstream";

  onboardingState: "not_started" | "sent" | "in_progress" | "completed";
  billingMode: "package" | "pay_per_session" | "unset";
  paymentSummary: "paid" | "to_collect" | "overdue" | "unset";

  nextSessionAtUtc: string | null;    // placeholder for MVP
  lastActivityAtUtc: string | null;

  possibleDuplicateClientId: string | null;
  duplicateOverrideReason: string | null;

  createdAtUtc: string;
  updatedAtUtc: string;
};
```

Recommended indexes:

```sql
unique (tenantId, erpCustomerId)
index (tenantId, phoneE164)
index (tenantId, status)
index (tenantId, updatedAtUtc)
```

### client_goal

Purpose: structured goal storage for FitDesk UX and future Program Design.

```ts
type ClientGoal = {
  id: string;
  tenantId: string;
  clientIndexId: string;
  erpCustomerId: string;

  goalId: string;
  subGoalIds: string[];
  urgency: "urgent" | "active_focus" | "background";
  confidence: "high" | "medium" | "low" | "unknown";
  source: "ai_parse" | "trainer_manual" | "system_inferred";
  safetyFlags: string[];
  notes: string | null;
  status: "active" | "archived";

  createdAtUtc: string;
  updatedAtUtc: string;
};
```

### client_action_intent

Purpose: suggested next actions that do not execute automatically.

```ts
type ClientActionIntent = {
  id: string;
  tenantId: string;
  clientIndexId: string;
  erpCustomerId: string;

  type:
    | "send_whatsapp_welcome"
    | "send_intake_form"
    | "book_first_session"
    | "setup_billing"
    | "create_program"
    | "review_safety_note";

  status: "pending" | "in_progress" | "completed" | "dismissed" | "expired";
  priority: "low" | "normal" | "high";
  source: "system" | "ai_parse" | "trainer_manual";
  reason: string | null;

  dueAtUtc: string | null;
  completedAtUtc: string | null;
  dismissedAtUtc: string | null;
  expiresAtUtc: string | null;

  createdAtUtc: string;
  updatedAtUtc: string;
};
```

### client_event

Purpose: local audit trail for client workflows.

```ts
type ClientEvent = {
  id: string;
  tenantId: string;
  clientIndexId: string | null;
  erpCustomerId: string | null;
  type: string;
  payloadJson: Record<string, unknown>;
  createdByUserId: string | null;
  createdAtUtc: string;
};
```

## 12. ClientIndexProjectionService

Purpose: update local summary fields after known changes.

```ts
ClientIndexProjectionService.refreshClientSummary(ctx, erpCustomerId)
```

### MVP behavior

Update only fields with reliable local or ERP-backed sources:

- `primaryGoalLabel`
- `primaryGoalId`
- `safetyState`
- `lastActivityAtUtc`
- `onboardingState` if local onboarding exists
- `billingMode` only if a reliable client billing source exists

### Failure contract

```text
If refreshClientSummary() fails:
- log the error
- do not roll back the completed domain action
- rely on repair/backfill/reconcile to fix stale summary
```

## 13. nextSessionAtUtc Rule

`nextSessionAtUtc` is a placeholder for MVP.

Reason: the audit found no persisted session source yet.

### MVP behavior

```text
nextSessionAtUtc = null
Directory shows: No next session
Client Hub shows: No session booked yet / Schedule coming soon
Do not build a session projection trigger yet
```

### Future

Wire `nextSessionAtUtc` only after a real session store exists.

## 14. AI Add Client Assist

AI is optional. Manual creation must work without it.

### Endpoint location

For MVP:

```text
Next.js server-side API route or server action calls selected AI provider.
Timeout enforced server-side at 3 seconds.
API keys stay server-side only.
```

If AI orchestration becomes larger later, move it behind the Control Plane.

### Parse states

```ts
type AiParseState =
  | "idle"
  | "parsing"
  | "partial_success"
  | "low_confidence"
  | "failed"
  | "timeout";
```

### Field model

```ts
type ParsedField<T> = {
  value: T | null;
  confidence: "high" | "medium" | "low" | "unknown";
  source: "ai_parse" | "trainer_manual";
};
```

### Rule

```text
AI prepares a draft.
Trainer reviews.
Trainer confirms.
AI never creates client records directly.
```

## 15. Duplicate Detection and Override

### MVP duplicate detection

```text
Normalize phone to E.164.
Search same tenant only.
Match against client_index.phoneE164.
Do not expose cross-tenant matches.
```

### Duplicate match type

```ts
type DuplicateClientMatch = {
  clientIndexId: string;
  erpCustomerId: string;
  fullName: string;
  phoneE164: string;
  status: "active" | "inactive" | "archived";
  matchType: "exact_phone" | "possible_name";
  confidence: "high" | "medium" | "low";
};
```

### UI behavior

If exact phone match exists:

```text
Possible duplicate found:
Sarah Ahmad - +96170123456

[Open existing client]
[Continue anyway]
[Cancel]
```

### Continue anyway behavior

```text
Require optional reason or quick reason choice.
Create the new client.
Set possibleDuplicateClientId.
Set duplicateOverrideReason.
Write client_event: duplicate.override.
Show saved-with-warning notice.
```

## 16. ClientHubOverview

Purpose: one clean payload for the Client Hub MVP.

```ts
type ClientHubOverview = {
  client: {
    clientIndexId: string;
    erpCustomerId: string;
    fullName: string;
    phoneE164: string;
    whatsappEnabled: boolean;
    status: "active" | "inactive" | "archived";
    safetyState: "clear" | "needs_review" | "blocked_downstream";
    onboardingState: "not_started" | "sent" | "in_progress" | "completed";
    billingMode: "package" | "pay_per_session" | "unset";
    paymentSummary: "paid" | "to_collect" | "overdue" | "unset";
    primaryGoalLabel: string | null;
    nextSessionAtUtc: string | null;
    lastActivityAtUtc: string | null;
  };

  goals: ClientGoalSummary[];
  pendingActions: ClientActionIntentSummary[];
  recentNotes: ClientNoteSummary[];

  placeholders: {
    trainingProgram: {
      status: "not_started" | "available_later";
      label: string;
    };
    progress: {
      status: "not_started" | "available_later";
      label: string;
    };
  };
};
```

### Hydration rule

```text
Read client_index for summary.
Read client_goal for goals.
Read client_action_intent for pending actions.
Read client_event/notes for recent notes.
Keep ERP invoice/session sections separate and existing.
No raw ERP N+1 reads for hub summary.
```

## 17. UI/UX Plan

### Client Directory

- Fast search/filter list from `client_index`.
- Feature-flag fallback to live ERP reads if needed during rollout.
- Badges instead of hidden urgency score:
  - Needs review.
  - No next session.
  - Billing not set.
  - Onboarding not sent.
  - Payment to collect.

### Add Client Sheet / Drawer

- Mobile: bottom sheet.
- Desktop: right drawer, or one responsive sheet if cheaper for pilot.
- Required fields: full name + phone.
- Optional fields: WhatsApp toggle, goals, notes, billing intent.
- AI assist is optional and never blocking.
- Review/confirm before create.

### Client Hub MVP

- Client summary.
- Goals.
- Safety warning.
- Action queue.
- Next session placeholder.
- Payment summary placeholder.
- Onboarding/forms section.
- Training program placeholder.
- Progress placeholder.

## 18. Forbidden During Add Client

The Add Client flow must not create or execute:

```text
Invoices
Payment Entries
WhatsApp messages
Bookings/sessions
Training programs
Direct ERP mutations outside approved proxy
Cross-tenant duplicate checks
```

## 19. Implementation Phases

### Phase 0 - Commit docs and decisions

Objective:

```text
Commit approved plan and audit reports into docs/ for traceability.
```

Acceptance:

```text
Client_Management_v1_2_1_ERP_Authoritative_Hybrid_MVP.md exists in docs/plans/.
Phase 0 audit and gap reports exist in docs/audits/.
```

### Phase 1 - Data contracts and schema

Objective:

```text
Add local ERP-linked enrichment tables and types.
```

Likely files:

```text
types/clients.ts
lib/db/schema.ts
scripts/migrate-app.mjs
lib/clients/repository.ts
lib/clients/phone.ts
```

Acceptance:

```text
Tables create idempotently.
Repository requires tenantId.
No UI behavior changes yet.
```

### Phase 2 - Backfill from ERP Customers

Objective:

```text
Create a manual, idempotent per-tenant backfill script.
```

Acceptance:

```text
Existing ERP Customers create/update client_index rows.
Clean goal JSON creates client_goal rows.
Messy goals become unknown/system_inferred.
No ERP records are deleted.
```

### Phase 3 - Client Directory from client_index

Objective:

```text
Point Client Directory to local read model behind a feature flag.
```

Acceptance:

```text
Directory loads fast.
Feature flag can restore current ERP live read.
No N+1 ERP calls for directory list.
```

### Phase 4 - Manual Add Client sheet/drawer

Objective:

```text
Consolidate Add Client into one manual-first sheet/drawer.
```

Acceptance:

```text
Name + phone required.
Client creates ERP Customer through approved path.
Local rows are created before success response.
Row is immediately visible in directory.
No invoice/payment/WhatsApp/session/program side effect.
```

### Phase 5 - Optional AI assist

Objective:

```text
Add AI parse draft with 3-second timeout.
```

Acceptance:

```text
AI timeout does not block manual creation.
Trainer text is preserved.
API key is server-side only.
```

### Phase 6 - Duplicate detection and override

Objective:

```text
Add tenant-scoped duplicate phone detection.
```

Acceptance:

```text
Exact phone match shows warning.
Continue anyway writes duplicate.override event.
No cross-tenant match visibility.
```

### Phase 7 - Client Hub MVP and action queue

Objective:

```text
Add Hub overview and action intent lifecycle.
```

Acceptance:

```text
Hub hydrates from approved local sources.
Action intents can be completed/dismissed.
Existing ERP invoice/session sections remain separate.
```

### Phase 8 - Tests and verification

Objective:

```text
Add unit, integration, and E2E coverage.
```

Acceptance:

```text
Created client -> client_index row immediately visible in directory.
Tenant isolation test passes.
Duplicate override test passes.
No side-effect test passes.
Lint/build pass.
```

## 20. Test Plan

### Unit tests

- Phone normalization to E.164.
- AI draft validation.
- ParsedField mapping.
- Goal confidence/source rules.
- Safety state derivation.
- Action intent transitions.
- Duplicate matching helpers.

### Integration tests

- ERP success + local row success returns one complete client.
- ERP failure creates no local rows.
- ERP success + local failure logs recoverable error.
- Client created -> immediately visible in directory query.
- Duplicate phone guard.
- Duplicate override event.
- Tenant A cannot read tenant B client rows.
- Client Hub hydration uses approved local sources.
- Add Client creates no invoice/payment/WhatsApp/session/program.

### E2E tests

- Open Clients page.
- Add client manually.
- Add client with AI assist.
- AI timeout fallback.
- Resolve duplicate warning.
- Open Client Hub after save.
- Complete/dismiss action intent.

## 21. Verification Commands

Run after implementation, before staging:

```bash
npm test
npm run lint
npm run build
npx vitest run lib/clients
```

Also verify:

```text
Active repo is FitDesk product app.
No direct ERP I/O was added.
No ERP credentials were introduced.
ERP proxy path still goes through erpFetch.
Invoice/payment code was not modified.
Scheduling engine was not modified.
WhatsApp sends are not triggered by Add Client.
Tenant filter exists on every local client query.
```

## 22. Claude Code Routing

### Phase 1 planning prompt header

```text
Claude Code model:
- Model: opusplan
- Effort: xhigh
- Mode: Plan
```

### Implementation prompt header

```text
Claude Code model:
- Model: sonnet
- Effort: high
- Mode: Implement
```

### Verification prompt header

```text
Claude Code model:
- Model: sonnet
- Effort: medium
- Mode: Verify
```

## 23. Final Approval Status

```text
APPROVED TO BUILD AFTER DOC PATCH
```

Approved build target:

```text
ERP-authoritative Client Management MVP
Client Directory
Manual-first Add Client Sheet/Drawer
Optional AI parse
ERP Customer creation through approved proxy
Local client_index enrichment row
client_goal
client_action_intent
client_event
Duplicate detection and override audit
Client Hub MVP
Action queue
Tenant-scoped repository
Backfill script for test data
Tests
```

Not approved in this phase:

```text
Local-first client identity
Outbox/event bus
Automatic invoices
Automatic payment entries
Automatic WhatsApp sends
Session booking during Add Client
Program generation during Add Client
Direct ERP access
Cross-tenant duplicate matching
Full client portal
Wearable integrations
Full Program Design engine
```

## 24. Final Recommendation

```text
GO
```

Proceed with Phase 1 only after this document and the Phase 0 audit reports are committed into the repo.

Phase 1 should be a plan/contract implementation step first, not a large UI rewrite.

Start small, keep the ERP boundary intact, and make every local client query tenant-scoped.
