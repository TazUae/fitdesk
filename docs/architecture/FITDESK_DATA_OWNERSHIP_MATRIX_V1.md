> **Status:** Target direction — adopted as canonical intent, NOT implemented state.
> **Adopted:** 2026-07-19 · **Source:** `FITDESK_DATA_OWNERSHIP_MATRIX_V1.md` (documentation pack) · **sha256 (source body):** `0625dbcdfd1f232c371cb27e589856de07e59df6a6d9e178f802f193cdac5f36`
> **Implementation reality:** see `docs/audits/FITDESK_IMPLEMENTATION_STATUS_RECONCILIATION_2026-07-19.md`
> **Rule:** This document describes intended product direction. Do not cite it as evidence
> that a capability exists. Verify against code before planning or estimating work.
>
---

# FitDesk Data Ownership Matrix v1

```text
Product: FitDesk SaaS Platform
Document: Data Ownership and Source-of-Truth Matrix
Version: v1.0
Status: Ownership baseline — repository/schema verification required
Generated: 2026-07-18
```

> **Adoption discipline:** This matrix prevents duplicate truth. Verify actual models, constraints, identifiers, and synchronization paths before adoption.

## 1. Terms

| Term | Meaning |
|---|---|
| **Authoritative owner** | The system whose confirmed record determines business truth. |
| **Operational owner** | The service that validates, orchestrates, or presents the workflow. |
| **Projection/cache** | Derived representation that exposes freshness and never replaces authority. |
| **Draft/intent** | Reversible state with no authoritative effect. |
| **Provider evidence** | External delivery/event evidence that informs FitDesk but does not own core business state. |

## 2. Core Ownership Matrix

| Object | Authoritative owner | FitDesk role | Control Plane/provider role | Primary rule |
|---|---|---|---|---|
| User identity/session | Better Auth/configured store | UI session and auth entry | Identity provider if configured | Never infer tenant only from client input |
| Tenant/workspace metadata | Control Plane | Display and request operations | Own mapping/state | Cross-tenant mapping is critical incident |
| Provisioning state | Control Plane state machine | Start/display/retry | Locks, jobs, retries, ERP step results | No duplicate jobs/rows or fake timer success |
| ERP credentials | ERP executor infrastructure | No storage/access | Executor owns secure use | Never in FitDesk DB, browser, prompts, or logs |
| ERP Customer | ERPNext | Client workflow and local projection | Control Plane proxies | Repair projection after partial success |
| FitDesk client profile | FitDesk | Own trainer-facing local attributes | — | Tenant-scoped and linked to ERP identity where required |
| Normalized phone/email | FitDesk | Dedup/search representation | Provider supplies raw sender | Never auto-merge weak matches |
| Communication consent | FitDesk | Own purpose/channel/source/revocation | Provider delivery is not consent | Phone exists ≠ WhatsApp consent |
| Goals | FitDesk | Structured coaching truth | — | Preserve primary/additional and client/trainer layers |
| Safety state | FitDesk | Trainer-reviewed truth | AI may only flag | AI never diagnoses or clears safety |
| Session record | FitDesk domain, exact ERP coupling to verify | Scheduling truth/orchestration | ERP/calendar may receive approved projection | Version/idempotency required |
| Recurrence | FitDesk | Scheduling rule | Calendar export is projection | Bounded, DST/timezone aware |
| Working hours/buffers | FitDesk | Workspace policy | — | One-off exception does not rewrite global policy |
| Dated availability | FitDesk | Exception truth | — | Existing sessions become review items |
| Session outcome | FitDesk domain | Outcome orchestration | ERP effects proxied if required | Immutable/version/idempotency guards |
| Session progress | FitDesk | Trainer-authored truth | AI may structure draft | Verify current persistence path |
| Next-session focus | FitDesk | Bounded coaching handoff | — | Keep source/age; no indefinite carry-forward |
| Package template | FitDesk | Reusable catalog | — | Not a client assignment |
| Client package assignment | FitDesk operational + ERP financial linkage | Terms/units/read model as verified | ERP owns invoice/payment | Verify exact balance ownership |
| Package consumption | FitDesk package domain | Exactly-once orchestration | — | No negative/duplicate consumption |
| Invoice | ERPNext | Contextual UX/projection | Control Plane/ERP executor | PPS only after completion; package at assignment/renewal |
| Payment Entry | ERPNext | Record Payment UX | Control Plane/ERP executor | Never substitute method or claim optimistic success |
| Credit/refund/correction | ERPNext | Controlled resolver | Approved ERP path | No silent edit of submitted/paid history |
| Statement of Account | Derived from ERPNext | Normalized read/cache | ERP source records | Show as-of/partial/unavailable; never false zero |
| Message draft | FitDesk | Reversible draft | — | Draft ≠ sent |
| Conversation | FitDesk | Operational grouping | Provider events contribute evidence | Same records power Inbox and Client Hub |
| Outbound decision | FitDesk | Recipient/content/actor/consent snapshot | Provider sends | Trainer confirmation required in MVP |
| Provider message/event | Provider evidence + FitDesk immutable record | Normalize and persist | Evolution/WhatsApp evidence | Deduplicate/replay-protect; delivery ≠ client confirmation |
| Inbound message | Provider evidence + FitDesk record | Match/classify/display | Evolution source | Text never mutates core domains directly |
| Sender-match decision | FitDesk | Explicit link/create/leave decision | Provider supplies sender | No automatic client creation/merge |
| Program template | FitDesk | Reusable versioned program | — | Archive/version, do not silently rewrite |
| Exercise catalog | FitDesk | Approved exercise IDs/metadata | — | AI may reference approved IDs only |
| Client program | FitDesk | Trainer-approved version | — | Approved versions immutable |
| Attention item | Derived FitDesk read | Display and link to resolver | — | Not a second authoritative status |
| Client Pulse Lite | Derived FitDesk read | Clear/Needs review/Unknown | — | No score, prediction, or mutation |
| Resume Work | FitDesk workflow state | Incomplete/recovery pointer | — | Distinguish saved/authoritative/uncertain |
| Offline read cache | Local device, non-authoritative | Minimal selected cache | — | Tenant/logout/expiry cleanup; as-of required |
| Offline completion intent | Local draft/intent | Preserve progress/outcome/versions | Reconciliation later | No authority until online confirmation |
| Audit event | FitDesk and/or Control Plane | Domain evidence | Orchestration/job evidence | Link to same operation identity |
| AI context snapshot | FitDesk AI run record | Authorized minimal sources/hash | Model provider processes | No cross-tenant retrieval; minimize raw text |
| AI output/proposal | FitDesk draft/run | Reviewable proposal | Provider generated | Never authoritative; expire on stale sources |
| AI versions | FitDesk AI registry | Prompt/schema/policy/model metadata | Provider model snapshot | Regression on relevant change |
| Search index | FitDesk projection | Tenant/permission scoped results | — | Avoid sensitive note indexing initially |
| Analytics | FitDesk telemetry | Product/operational measurement | Approved provider only | Minimize PII; never source of truth |

## 3. Approved Read/Write Rules

### ERP read

```text
FitDesk surface
→ server read service
→ approved ERP client/proxy
→ Control Plane
→ ERP Execution Service
→ ERPNext
→ normalized response with freshness/status
```

### ERP write

```text
Trainer confirms
→ authenticated action
→ tenant authorization
→ domain validation
→ operation ID + expected version
→ Control Plane command
→ ERP execution
→ authoritative result
→ FitDesk refresh
```

### AI

```text
AI proposal
≠ source-of-truth record
≠ domain-valid result
≠ trainer approval
≠ authoritative mutation
```

### Offline

```text
Local draft/intent
≠ completed action
≠ package deduction
≠ invoice
≠ payment
≠ sent message
```

## 4. Privacy Classes

| Class | Examples | Rule |
|---|---|---|
| Trainer private | Preparation notes, coaching reminders | Never inserted into client messages automatically |
| Client visible when approved | What to bring, public directions | Included only after trainer review |
| Operational | Readiness, sync, payment context | Derived and role-limited |
| Shared booking | Date/time/location label/session type | Approved communication only |
| Sensitive identity | Phone, email, home address | Purpose-limited and tenant-scoped |
| Safety/health-adjacent | Pain, recovery, safety state | Minimal access; no diagnosis |
| Financial | Invoices, balances, allocations | ERP-authoritative and role-limited |
| AI governance | Sources, prompts, outputs, traces | Minimized/redacted and retention-controlled |

## 5. Reconciliation Rules

- ERP and FitDesk values are never silently merged.
- Partial/unavailable ERP reads remain partial/unavailable.
- ERP success plus local projection failure triggers repair/reconcile.
- Uncertain external write triggers authoritative query before retry.
- Stale offline versions trigger consequence recalculation and review.
- Provider events are immutable evidence; conversation state may be recomputed.
- Duplicate-client consolidation preserves ERP financial lineage and never copies invoices/payments.

## 6. Schema Audit Requirements

For every object, identify:

```text
model/table · primary key · tenant key · ERP/provider foreign key
unique constraints · status values · version field · idempotency field
audit timestamps · archive/delete behavior · retention · indexes · migrations
```

## 7. Prohibited Ownership Moves

Do not move:

- ERP financial authority into FitDesk local tables;
- tenant truth into UI state;
- provisioning state into the Provisioning Agent;
- delivery state into client-confirmation truth;
- AI suggestions into safety, billing, schedule, or program authority;
- offline intent into completed authority;
- trainer-private notes into client-visible messages;
- cross-tenant identity matching into unrestricted global search.
