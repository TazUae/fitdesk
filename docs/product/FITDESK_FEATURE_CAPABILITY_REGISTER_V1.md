> **Status:** Target direction — adopted as canonical intent, NOT implemented state.
> **Adopted:** 2026-07-19 · **Source:** `FITDESK_FEATURE_CAPABILITY_REGISTER_V1.md` (documentation pack) · **sha256 (source body):** `036ab3105057f8c23486abd9644e346c563f98ffd5b63a3f189caa2ff6431dc7`
> **Implementation reality:** see `docs/audits/FITDESK_IMPLEMENTATION_STATUS_RECONCILIATION_2026-07-19.md`
> **Rule:** This document describes intended product direction. Do not cite it as evidence
> that a capability exists. Verify against code before planning or estimating work.
>
---

# FitDesk Feature Capability Register v1

```text
Product: FitDesk SaaS Platform
Document: Feature Capability Register
Version: v1.0
Status: Product-declared register — repository verification required
Generated: 2026-07-18
```

> **Adoption discipline:** This inventory records intended scope and verification needs. It does not claim the active repository has already been audited.

## 1. Status Legend

| Status | Meaning |
|---|---|
| **MVP** | Required in the first usable release. |
| **MVP — verify** | Approved or materially described, but exact implementation must be checked. |
| **Pilot** | Feature-flagged and evaluation-gated. |
| **Hardening** | Required before broad production scale or higher-risk use. |
| **Future** | Deferred capability. |
| **Rejected** | Explicitly not approved. |

## 2. Capability Register

| ID | Area | Capability | Status | Authority/owner | Verification focus |
|---|---|---|---|---|---|
| CAP-001 | Auth | Sign up/sign in/recovery | MVP | Better Auth/FitDesk | Routes/providers |
| CAP-002 | Provisioning | `/onboarding` Start Workspace | MVP — verify | Control Plane | Actions, rows, retries |
| CAP-003 | Provisioning | Idempotent workspace provisioning | MVP | Control Plane | Locks, keys, states |
| CAP-004 | Dashboard | Daily Brief | MVP — verify | FitDesk derived read | Component/data path |
| CAP-005 | Dashboard | Today | MVP — verify | FitDesk sessions | Live/past/unresolved behavior |
| CAP-006 | Dashboard | Needs Attention | MVP — verify | Deterministic derive layer | Rules/resolvers |
| CAP-007 | Dashboard | Business Health | MVP — verify | FitDesk derived state | Partial/unavailable behavior |
| CAP-008 | Dashboard | First-client activation | MVP | Derived state | Copy/entry points |
| CAP-009 | Dashboard | Resume Work | Hardening | Workflow/draft state | Existing persistence |
| CAP-010 | Dashboard | Client Pulse Lite | Pilot | Deterministic FitDesk logic | No score/prediction |
| CAP-011 | Navigation | Desktop six-destination nav | MVP — verify | UI | Current nav/aliases |
| CAP-012 | Navigation | Mobile five-tab nav | MVP — verify | UI | Tabs/More |
| CAP-013 | Search | Persistent mobile Search | MVP — verify | FitDesk search | Current access |
| CAP-014 | Search | Desktop command palette | Hardening | Search/commands | Existing implementation |
| CAP-015 | Clients | Client list/search/filters | MVP — verify | FitDesk | Routes/queries |
| CAP-016 | Clients | Smart deterministic views | MVP/Hardening | Derived filters | Rules/URLs |
| CAP-017 | Clients | Add Client | MVP — verify | ERP Customer + FitDesk | Partial-failure repair |
| CAP-018 | Clients | Duplicate warning | MVP — verify | FitDesk | Normalization/audit |
| CAP-019 | Clients | Quick Add from Text | Pilot | AI proposal only | Flag/schema |
| CAP-020 | Clients | Billing mode | MVP — verify | FitDesk client record | Package/PPS/Unset |
| CAP-021 | Client Hub | Today/Next Safe Action | MVP/Hardening | Deterministic read model | Current surface |
| CAP-022 | Client Hub | Goals and Safety | MVP — verify | FitDesk | Taxonomy/conflicts |
| CAP-023 | Client Hub | Sessions/recurrence | MVP/Hardening | Scheduling domain | Views/manager |
| CAP-024 | Client Hub | Progress | MVP — verify | FitDesk | Persistence/event path |
| CAP-025 | Client Hub | Program/Workout | Pilot | FitDesk programs | Flags/catalog/versioning |
| CAP-026 | Client Hub | Package and Billing | MVP/Hardening | ERP + FitDesk | Read model/actions |
| CAP-027 | Client Hub | Statement of Account | MVP — verify | ERPNext | Authoritative read/states |
| CAP-028 | Client Hub | Attendance | MVP | FitDesk derivation | Period/denominator |
| CAP-029 | Client Hub | Communication | MVP outbound/Hardening inbound | FitDesk + provider | Records/routes |
| CAP-030 | Client Hub | Unified Activity | Hardening | Event/read model | Timeline sources |
| CAP-031 | Client Hub | Lifecycle resolver | Hardening | FitDesk orchestration | Existing states |
| CAP-032 | Scheduling | Day/week schedule | MVP — verify | FitDesk | Routes/components |
| CAP-033 | Scheduling | Canonical BookingSheet | MVP — verify | Scheduling stack | Entry-point reuse |
| CAP-034 | Scheduling | One-off booking | MVP — verify | Scheduling domain | Idempotency/version |
| CAP-035 | Scheduling | Bounded recurrence | MVP — verify | Scheduling engine | Cap/DST/expansion |
| CAP-036 | Scheduling | Structured conflicts | MVP — verify | Scheduling engine | Response type/UI |
| CAP-037 | Scheduling | Buffer exception | MVP/Hardening | Engine + audit | Rule classification |
| CAP-038 | Scheduling | Working-hours exception | MVP/Hardening | Engine + audit | Scope/preview |
| CAP-039 | Scheduling | Dated availability | MVP/Hardening | Scheduling domain | Model/route |
| CAP-040 | Scheduling | Day Disruption Manager | Hardening | Orchestration | Planned unless present |
| CAP-041 | Sessions | Session detail | MVP — verify | FitDesk | Route/actions |
| CAP-042 | Sessions | Completed outcome | MVP — verify | FitDesk + ERP effects | Service/hooks |
| CAP-043 | Sessions | No Show | MVP — verify | FitDesk | Consequences |
| CAP-044 | Sessions | Cancelled | MVP — verify | FitDesk | Branch/audit |
| CAP-045 | Sessions | Rescheduled | MVP — verify | Booking contract | Action path |
| CAP-046 | Sessions | Quick progress | MVP — verify | FitDesk | Schema/persistence |
| CAP-047 | Sessions | Next-session focus | MVP/Hardening | FitDesk | Bounded carry-forward |
| CAP-048 | Sessions | Unresolved recovery | MVP/Hardening | Attention + completion | Deep link/guards |
| CAP-049 | Sessions | Offline completion intent | MVP baseline/Hardening | Local state | Storage/security |
| CAP-050 | Packages | Template catalog | MVP — verify | FitDesk | Route/model |
| CAP-051 | Packages | Assign from Client Hub | MVP — verify | FitDesk + ERP invoice | Canonical flow |
| CAP-052 | Packages | Paid Now/Pay Later at assignment | MVP — verify | ERP invoice/payment | Shared payment contract |
| CAP-053 | Packages | Consume on completion | MVP — verify | Package domain | Exactly-once/balance |
| CAP-054 | Packages | Exhausted resolver | Hardening | Orchestration | Planned unless present |
| CAP-055 | Packages | Package Runway | Hardening | Deterministic read | Planned unless present |
| CAP-056 | Billing | Billing overview | MVP — verify | ERP reads | `/invoices` vs `/billing` |
| CAP-057 | Billing | Invoice list/detail | MVP — verify | ERPNext | Routes/statuses |
| CAP-058 | Billing | PPS invoice on completion | MVP — verify | ERPNext | Exactly-once link |
| CAP-059 | Billing | Manual invoice hidden | MVP guardrail | Product rule | No trainer entry point |
| CAP-060 | Payments | Record payment | MVP — verify | ERP Payment Entry | Allocation/action |
| CAP-061 | Payments | Paid Now in completion | MVP — verify | Shared payment contract | Placement/recovery |
| CAP-062 | Payments | Partial payment | Hardening | ERP Payment Entry | Support before enablement |
| CAP-063 | Payments | Receipt | Hardening | Confirmed ERP state | Planned unless present |
| CAP-064 | Financial | Credit/refund/correction | Hardening | ERPNext | Controlled resolver |
| CAP-065 | Communication | MessageComposer | MVP — verify | FitDesk/provider | Entry-point reuse |
| CAP-066 | Communication | Native WhatsApp handoff | MVP | Device/WhatsApp | Draft preservation |
| CAP-067 | Communication | Direct outbound send | MVP when configured | Evolution API | Status semantics |
| CAP-068 | Communication | Sent/failed history | MVP — verify | Provider evidence | Route/data |
| CAP-069 | Communication | Global inbound Inbox | Hardening | Evolution webhooks | Not MVP authority |
| CAP-070 | Communication | Unread/needs reply/waiting | Hardening | Conversation state | Planned unless present |
| CAP-071 | Communication | Unmatched sender resolver | Hardening | Identity resolver | Planned unless present |
| CAP-072 | Communication | Consent Center | Hardening | FitDesk | Existing fields |
| CAP-073 | Communication | AI WhatsApp Concierge | Future | Bounded agent | Separate approval |
| CAP-074 | Programs | Program Library in Settings | Pilot | FitDesk | Route/nav absence |
| CAP-075 | Programs | Exercise Catalog | Pilot | FitDesk | Metadata/versioning |
| CAP-076 | Programs | Assign template in Client Hub | Pilot | FitDesk | Contextual picker |
| CAP-077 | Programs | Workout Builder | Pilot | AI + deterministic validators | No publication authority |
| CAP-078 | AI | Shared AI kernel | Pilot foundation | FitDesk server | Existing code first |
| CAP-079 | AI | Structured completion parser | Pilot | AI proposal | Schema/evidence |
| CAP-080 | AI | Pre-Session Brief | Pilot | Deterministic + optional summary | Manual fallback |
| CAP-081 | AI | Message Copilot | Pilot | Grounded draft | Fact/consent separation |
| CAP-082 | AI | Booking parser | Pilot | Draft → BookingSheet | Absolute dates |
| CAP-083 | AI | Ask FitDesk read-only | Pilot last | Narrow tools | No generic query/write |
| CAP-084 | Offline | Cached Today/preparation | MVP baseline/Hardening | Local cache | Encryption/expiry |
| CAP-085 | Offline | Sync conflict resolver | Hardening | Reconciliation | Planned unless present |
| CAP-086 | Reliability | Idempotency/expected version | MVP | Domain/Control Plane | Audit each path |
| CAP-087 | Reliability | Uncertain-result state | MVP | Cross-cutting | UI/re-query |
| CAP-088 | Security | Tenant isolation | MVP | All layers | Mandatory tests |
| CAP-089 | Security | ERP credentials excluded | MVP guardrail | Executor infrastructure | Environment ownership |
| CAP-090 | Accessibility | Keyboard/screen reader/touch | MVP | UI | Full validation |
| CAP-091 | Operations | Integration Health Center | Hardening | FitDesk read model | Planned unless present |
| CAP-092 | Operations | Audit events | MVP/Hardening | FitDesk + Control Plane | Coverage |
| CAP-093 | Future | Secure client portal | Future | Separate boundary | Decision-gated |
| CAP-094 | Future | Dedicated PWA/native client app | Future | Separate app | Decision-gated |
| CAP-095 | Rejected | Autonomous financial/scheduling/program writes | Rejected | — | Must remain absent |
| CAP-096 | Rejected | Raw ERP admin for trainers | Rejected | — | Must remain absent |
| CAP-097 | Rejected | Multi-agent operations | Rejected | — | Separate evidence/approval |

## 3. Verification Record Required

For each capability, capture:

```text
route/entry point
component
server action
service/repository
schema/model
feature flag
source of truth
tests
observability
failure/recovery
current classification
smallest safe change
```

## 4. Change Rules

- Existing working logic wins over redesign.
- UI presence alone does not prove completion.
- Financial/scheduling completion requires authority and idempotency evidence.
- Pilot features require kill switch and manual fallback.
- Route modernization uses aliases/redirects before removal.
- Changes remain atomic, reversible, and Git-driven.
