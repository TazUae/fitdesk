# ADR-001: Client Management ERP-Authoritative Hybrid

```text
Status: Approved
Date: 2026-06-12
Project: FitDesk SaaS Platform
Scope: Client Management v1.2.1 MVP
Decision Type: Architecture / Data Ownership / ERP Boundary
```

## Context

FitDesk currently treats clients as ERPNext `Customer` records. The product app reads and writes clients through the existing ERP adapter and Control Plane proxy. Invoices, payments, and message logs depend on the ERP Customer docname as the business client identifier.

The Client Management v1.2 plan originally proposed local client tables such as `client_index`, `client_goal`, `client_action_intent`, and `client_event`. The Phase 0 audit found that no local client tables currently exist and that moving directly to a local-first identity model would risk breaking billing, payments, messages, and future ERP-backed flows.

Current project constraints:

- ERPNext remains the financial/business system of record.
- All ERP I/O must pass through the existing ERP client/proxy path.
- FitDesk must not store ERP credentials.
- Add Client must not create invoices, payment entries, WhatsApp sends, sessions, or programs.
- The current data is testing data, but destructive resets/deletions are still not part of this decision.

## Decision

For the MVP, ERPNext `Customer` remains the canonical customer/client identity.

FitDesk local client tables are enrichment/read-model tables only.

```text
ERPNext Customer = canonical business client identity
FitDesk local tables = fast UX layer + goals + action queue + hub state + audit enrichment
```

### Approved identity model

```text
client_index.id = local FitDesk row id
client_index.tenantId = WorkspaceProvisioning.tenantId
client_index.erpCustomerId = ERPNext Customer docname
```

For MVP, `erpCustomerId` is required for active/billable clients.

### Approved create flow

The Add Client create flow is synchronous end-to-end for MVP:

```text
1. Validate input.
2. Run tenant-scoped duplicate check.
3. Trainer confirms.
4. Create ERPNext Customer through the approved ERP proxy path.
5. Receive ERP Customer docname.
6. Create local FitDesk rows:
   - client_index
   - client_goal
   - client_action_intent
   - client_event
7. Return success and open/hydrate the Client Hub.
```

No early success response is allowed before local rows are created.

## Approved ERP boundary

ERP Customer creation must use the existing client creation path:

```text
actions/clients.ts:addClient()
  -> existing ERP adapter createClient()
  -> lib/erpnext/client.ts:erpFetch()
  -> Control Plane ERP proxy
  -> ERPNext Customer DocType
```

Do not create a new direct ERPNext client. Do not store ERP credentials in FitDesk. Do not bypass `erpFetch()`. Do not bypass the Control Plane proxy.

If implementation discovers that the exact wrapper chain differs, Claude Code must report the exact existing function chain before implementation and preserve the same boundary.

## What belongs in ERPNext Customer

Keep ERP Customer minimal:

- Customer name
- Mobile number
- Customer group / territory / required ERP fields
- Disabled/active state
- ERP fields needed for invoices and receivables
- Minimal existing FitDesk custom fields required for current compatibility

## What belongs in FitDesk local tables

Do not overload ERP Customer with FitDesk UX state.

Local FitDesk tables own:

- Structured goals
- AI parse confidence/source
- Safety flags
- Duplicate override audit
- Action queue
- Client Hub overview state
- Notes/events
- Onboarding state
- UI placeholders
- Future training/program metadata

## Failure behavior

### ERP Customer creation fails

```text
Do not create local rows.
Show a recoverable error.
Trainer can retry.
```

### ERP Customer creation succeeds but local row creation fails

```text
Do not delete ERP Customer automatically.
Log the error.
Return a recoverable error.
Run repair/backfill to create the missing local rows from ERP.
```

### Local projection fails later

```text
Log the error.
Do not roll back the completed domain action.
Repair with backfill/reconcile.
```

## Backfill decision

For MVP pilot, backfill is a manually triggered CLI/script run once per tenant before that tenant's Client Directory goes live.

```text
Backfill source: ERPNext Customer records through the existing ERP proxy path.
Backfill target: client_index, client_goal when cleanly parseable, client_event.
```

Backfill must be idempotent:

- Check `tenantId + erpCustomerId` before insert.
- If row exists, update safe summary fields only.
- Do not create duplicate `client_index` rows.
- Do not delete ERP Customers.
- Do not reset databases.

## Consequences

### Benefits

- Preserves current invoice/payment/message dependencies on ERP Customer docname.
- Avoids introducing local-first identity before outbox/event infrastructure exists.
- Allows a fast local Client Directory and Client Hub.
- Keeps Add Client compatible with current ERP-backed business flows.
- Keeps future local-first architecture possible later.

### Trade-offs

- Add Client still depends on ERP availability for MVP.
- Fully offline client creation is deferred.
- A backfill/repair utility is required.
- Local tables must enforce tenant filtering because they live in shared local app storage.

## Deferred decisions

The following are explicitly deferred:

- Local-first client identity.
- Outbox/event bus.
- Background ERP sync worker.
- Offline client creation.
- Cross-tenant client portability.
- Full domain-event projection system.

## Code review checklist

Any Client Management implementation must verify:

- ERP Customer remains canonical for MVP.
- `erpCustomerId` is stored for active/billable clients.
- Add Client uses the approved ERP proxy path.
- No direct ERP credentials are introduced.
- No invoices, payment entries, WhatsApp sends, sessions, or programs are created during Add Client.
- Every local client query is tenant-scoped.
- Duplicate detection is tenant-scoped only.
- Local row failure after ERP success is recoverable through backfill/repair.

## Final status

Approved.

This ADR is the controlling architecture decision for Client Management v1.2.1 MVP.
