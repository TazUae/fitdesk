# FitDesk Sitemap Route Matrix

```text
Phase: 0 — Zero-Drift Traceability
Source: docs/product/FITDESK_APPLICATION_SITEMAP_V1_1.md (v1.1, frozen — see FITDESK_ZERO_DRIFT_SOURCE_MANIFEST.md)
Source SHA-256 (full file): 131e28e313dc73e429e67b6858d0cb438a3ce338d857ef4451453a76c7f25954
Generated: 2026-07-20
Rule: "Node (exact sitemap wording)" is verbatim from the frozen source.
Rule: Every route, destination, filter, panel, resolver, drawer, sheet, contextual workflow,
      nav item, Settings destination, Client Hub section, and compatibility alias has one row.
```

## Conventions

- **Status values:** `existing` (route/surface present at HEAD 75e8b2b), `alias-needed` (exists at a different path; alias/redirect required), `planned` (absent; in an MVP batch), `hardening` (sitemap marks it [hardening] — post-B15 unless PO pulls forward), `pilot` (sitemap marks [pilot] — PO-decision gated), `future` (separate boundary/approval), `internal` (outside trainer navigation — no trainer UI work).
- **Batches** `B0`–`B15` per FITDESK_ZERO_DRIFT_IMPLEMENTATION_SEQUENCE.md. **JR-x** links per FITDESK_JOURNEY_REQUIREMENT_MATRIX.md. **A-x** assets per manifest.
- **Migration doctrine (Sitemap IA principle 10, verbatim):** "Existing working routes win: Prefer aliases and incremental migration over route rewrites that risk current production behavior." Canonical (unprefixed) routes vs the current `/dashboard/*` nesting is recorded as conflict CR-16; the mechanical default below records both and requires alias/redirect work in each surface batch.

---

## 1. Canonical navigation (binding, verbatim)

### 1.1 Desktop primary navigation — exact labels and order

| # | Node (exact wording) | Canonical route | Existing @HEAD | Alias req | Placement | Status | Linked JR | Assets | Batch | Test |
|---|---|---|---|---|---|---|---|---|---|---|
| N1 | Dashboard | /dashboard | /dashboard ("Home" label) | relabel | Desktop sidebar pos 1 | alias-needed (label) | JR-5.1-01 | A10,A11 | B5 | nav label+order assert |
| N2 | Schedule | /schedule | /dashboard/schedule ("Schedule") | route alias | Desktop sidebar pos 2 | alias-needed | JR-14-01 | A25–A27 | B5 | same |
| N3 | Clients | /clients | /dashboard/clients ("Clients") | route alias | Desktop sidebar pos 3 | alias-needed | JR-17.1-01 | A09 | B5 | same |
| N4 | Inbox | /inbox | — (only /dashboard/messages/[clientId]) | new + reconcile /messages | Desktop sidebar pos 4 | planned | JR-5.9-01, JR-17.14-01 | A13 | B5+B10 | same |
| N5 | Billing | /billing | /dashboard/invoices ("Invoices") | new + reconcile /invoices | Desktop sidebar pos 5 | planned (route) / alias-needed (content) | JR-12.x | A03,A04 | B5+B11 | same |
| N6 | Settings | /settings | /dashboard/settings (not in nav) | route alias + nav add | Desktop sidebar pos 6 | alias-needed | JR-18.2-01 | A29 | B5+B12 | same |

Current desktop nav at HEAD (`components/modules/DashboardClientShell.tsx:29-32`): `Home, Clients, Schedule, Invoices` — **non-compliant**: wrong labels (Home/Invoices), wrong order (Clients before Schedule), missing Inbox/Billing/Settings.

### 1.2 Mobile bottom navigation — exact labels and order

| # | Node (exact wording) | Maps to (sitemap 4.2 verbatim) | Existing @HEAD | Status | Batch | Test |
|---|---|---|---|---|---|---|
| N7 | Home | Dashboard — "Understand today and resolve the next important item." | "Home" tab exists | existing (label) / order check | B5 | label+order |
| N8 | Schedule | Schedule — "View, book, reschedule, and complete sessions." | exists (pos 3, wrong order) | alias-needed (order) | B5 | order |
| N9 | Clients | Clients / Client Hub — "Manage each client in context." | exists (pos 2, wrong order) | alias-needed (order) | B5 | order |
| N10 | Inbox | Inbox — "See unread conversations and reply without losing context." | missing | planned | B5+B10 | presence |
| N11 | More | Billing, Settings, Help, Account — "Secondary administration only." | missing (Invoices tab instead) | planned | B5 | presence |

### 1.3 Persistent mobile controls (sitemap §1, verbatim)

| # | Node | Existing @HEAD | Status | Batch |
|---|---|---|---|---|
| N12 | Header Search | none | planned | B5 (affordance) + B13 (function) |
| N13 | Profile / account control | account menu exists in shell | existing (restyle) | B5 |
| N14 | Global action button | none | planned | B5 |
| N15 | Connectivity / sync state when relevant | none | planned | B5 (slot) |

### 1.4 Mobile More menu (sitemap 4.3, verbatim structure)

| # | Node | Target | Status | Batch |
|---|---|---|---|---|
| N16 | More ├─ Billing | /billing | planned | B5 |
| N17 | More ├─ Settings | /settings | planned | B5 |
| N18 | More ├─ Help and support | /settings/help | planned (current /dashboard/help → alias) | B5 |
| N19 | More ├─ Account | account surface (current /dashboard/account → alias) | planned | B5 |
| N20 | More └─ Sign out | auth sign-out | existing (relocate) | B5 |

Guardrail (verbatim): "Search, Inbox, Programs, and frequent client actions must not be placed in More."

### 1.5 Global action button (sitemap 4.4, verbatim)

| # | Node | Canonical workflow | Status | Batch |
|---|---|---|---|---|
| N21 | + ├─ Book session | BookingSheet | planned | B5 (button) + B7 |
| N22 | + ├─ Add client | AddClientSheet | planned | B5 + B8 |
| N23 | + ├─ Record payment | RecordPaymentSheet | planned | B5 + B11 |
| N24 | + └─ Draft message | MessageComposer | planned | B5 + B10 |

Rule (verbatim): "Each entry opens the same canonical workflow used elsewhere. The button is not a second navigation drawer."

---

## 2. Public and authentication

| # | Node (exact wording) | Canonical route | Existing @HEAD | Alias req | Status | Linked JR | Assets | Batch | Test |
|---|---|---|---|---|---|---|---|---|---|
| R1 | Product entry | / | app/page.tsx | none | existing (restyle per marketing assets) | JR-10-01 | A35,A36,A37,A48,A49 | B1/B2 | render |
| R2 | Sign in | /sign-in | /auth/login | alias both ways | alias-needed | JR-10-01 | A30,A31,A32,A68,A69 | B2 | auth flow |
| R3 | Sign up | /sign-up | /auth/register | alias | alias-needed | JR-10-01 | A30–A32 | B2 | auth flow |
| R4 | Verify email | /verify-email | none | new | planned (Better Auth capability check — CR-17) | JR-10-01 | — | B2 | flow |
| R5 | Forgot password | /forgot-password | none | new | planned (CR-17) | JR-10-01 | — | B2 | flow |
| R6 | Reset password | /reset-password | none | new | planned (CR-17) | JR-10-01 | — | B2 | flow |
| R7 | Privacy | /privacy | none | new | planned (content: PO-supplied) | — | — | B2 | render |
| R8 | Terms | /terms | none | new | planned (content: PO-supplied) | — | — | B2 | render |
| R9 | Auth state: Session expired | state (any route) | partial | — | planned | JR-24-01 | — | B2 | forced state |
| R10 | Auth state: Access denied | state | partial | — | planned | JR-24-01 | — | B2 | forced state |
| R11 | Auth state: Account unavailable | state | none | — | planned | JR-24-01 | — | B2 | forced state |

## 3. Workspace activation

| # | Node (exact wording) | Canonical route/state | Existing @HEAD | Status | Linked JR | Assets | Batch | Test |
|---|---|---|---|---|---|---|---|---|
| R12 | Onboarding | /onboarding | /onboarding | existing (rebuild per assets) | JR-10-01/02 | A16–A19, A54–A59, A72 | B3 | flow |
| R13 | ├─ Workspace introduction | onboarding step | partial | planned | JR-10-02 | A18,A58 | B3 | step |
| R14 | ├─ Start Workspace | primary action | exists | existing (verbatim label check) | JR-10-02 | A17,A56 | B3 | label |
| R15 | ├─ Provisioning progress | state | exists | partial | JR-10-01 | A22,A62 | B4 | state |
| R16 | ├─ Waiting / blocked / failed / completed | 4 states | partial | planned | JR-10-01 | A20–A24, A60–A64 | B4 | all four |
| R17 | ├─ Safe retry and recovery | action | exists (api/workspace/retry) | existing (UI restyle) | JR-10-01 | A21,A61 | B4 | retry |
| R18 | └─ Continue to Dashboard | action | exists | existing | JR-10-01 | A34,A71 | B4 | nav |

## 4. Dashboard

| # | Node (exact wording) | Canonical route/state | Existing @HEAD | Status | Linked JR | Assets | Batch | Test |
|---|---|---|---|---|---|---|---|---|
| R19 | Dashboard | /dashboard | /dashboard | existing (rebuild per assets) | JR-5.1-01 | A10,A11,A45,A46,A76 | B6 | render |
| R20 | ├─ Daily Brief | section | missing | planned | JR-5.1-01 | A11 | B6 | presence |
| R21 | ├─ Today | section | exists | partial | JR-5.2-01 | A11,A46 | B6 | content classes |
| R22 | ├─ Needs Attention | section | exists (Action Center) | partial | JR-5.3-01 | A10,A11 | B6 | resolver grammar |
| R23 | ├─ Business Health | section | exists | partial | JR-5.1-01 | A10 | B6 | honest states |
| R24 | ├─ First-client activation | contextual state | partial | planned | JR-9-01/02/03 | A10,A45 | B6 | 3 states |
| R25 | ├─ Resume Work | section | missing | planned (surfacing slot; queue itself CR-09) | JR-17.7-01 | A81 | B6/B14 | admissibility |
| R26 | ├─ Sync / reconciliation attention | section | missing | planned (slot; offline intents MVP baseline per §11) | JR-24-01 | — | B6/B14 | state |
| R27 | ├─ Weekly Planning Brief [hardening] | section | missing | hardening | JR-18.11-01 | — | post-B15 | — |
| R28 | ├─ Client Pulse Lite [pilot] | section | missing | pilot | JR-5.10-01 | — | none | — |
| R29 | ├─ Trainer Focus Mode [pilot] | mode | missing | pilot | JR-18.17-01 | — | none | — |
| R30 | └─ Prepared Actions [pilot / gated] | section | missing | pilot | JR-5.11-01 | — | none | — |

## 5. Schedule

| # | Node (exact wording) | Canonical route/state | Existing @HEAD | Status | Linked JR | Assets | Batch | Test |
|---|---|---|---|---|---|---|---|---|
| R31 | Schedule | /schedule | /dashboard/schedule | alias-needed | JR-14-01 | A25,A26,A27,A65,A66,A78 | B7 | render |
| R32 | ├─ Day view | view | exists | partial | JR-14-01 | A25,A65 | B7 | view |
| R33 | ├─ Week view | view | verify | partial | JR-14-01 | A26 | B7 | view |
| R34 | ├─ Session cards | component | exists | partial (location-label privacy per JR-14.10-01) | JR-14.7-01 | A27,A66 | B7 | card content |
| R35 | ├─ Empty / partial / unavailable states | states | partial | planned | JR-24-01 | — | B7 | forced |
| R36 | ├─ Dated availability | entry | missing | planned | JR-18.2-01 | A29 | B7/B12 | flow |
| R37 | ├─ Time-off and disruption review [hardening] | resolver | missing | hardening | JR-18.3-01 | — | post-B15 | — |
| R38 | └─ Open-slot recovery [future experiment] | flow | missing | future | JR-18.4-01 | — | none | — |

## 6. Session context

| # | Node (exact wording) | Canonical route | Existing @HEAD | Status | Linked JR | Assets | Batch | Test |
|---|---|---|---|---|---|---|---|---|
| R39 | Session context | /sessions/{sessionId} | none (no session detail route) | planned | JR-14.12-01 | A27 | B7 | route+deep link |
| R40 | ├─ Session summary | section | n/a | planned | JR-14.12-01 | A27 | B7 | content |
| R41 | ├─ Client goals and safety | section | n/a | planned | JR-5.4-01 | — | B7 | content |
| R42 | ├─ Location and preparation | section | n/a | planned | JR-14.7/14.11 | — | B7 | privacy classes |
| R43 | ├─ Package / rate context | section | n/a | planned | JR-14.13-01 | — | B7 | read-only |
| R44 | ├─ Communication state | section | n/a | planned | JR-14.12-01 | — | B7 | family separation |
| R45 | ├─ Client arrival [pilot] | action | n/a | pilot | JR-14.14-01 | — | none | — |
| R46 | ├─ Complete / no-show / cancel / reschedule | actions | actions exist (no detail route) | planned (placement) | JR-13.1-01 | A80 | B7/B9 | four outcomes |
| R47 | ├─ Offline completion state | state | missing | planned (MVP baseline per §11) | JR-24-01 | — | B9/B14 | forced |
| R48 | └─ Session change summary | component | missing | planned | JR-18.16-01 | A81 | B14/B7 | content |

## 7. Clients

| # | Node (exact wording) | Canonical route/state | Existing @HEAD | Status | Linked JR | Assets | Batch | Test |
|---|---|---|---|---|---|---|---|---|
| R49 | Clients | /clients | /dashboard/clients | alias-needed | JR-17.1-01 | A09,A43,A44,A75 | B8 | render |
| R50 | ├─ All clients | list | exists | partial | JR-17.1-01 | A09,A44 | B8 | list |
| R51 | ├─ Search and filters | controls | partial | partial | JR-18.10-01 | A09 | B8 | URL state |
| R52 | ├─ Smart view: Training today | ?view/filter | missing | planned | JR-18.10-01 | A09 | B8 | inclusion rule |
| R53 | ├─ Smart view: No next session | filter | missing | planned | JR-18.10-01 | A09 | B8 | rule |
| R54 | ├─ Smart view: Package low | filter | missing | planned | JR-18.10-01 | A09 | B8 | rule |
| R55 | ├─ Smart view: Package exhausted | filter | missing | planned | JR-18.10-01 | A09 | B8 | rule |
| R56 | ├─ Smart view: Payment overdue | filter | missing | planned | JR-18.10-01 | A09 | B8 | rule |
| R57 | ├─ Smart view: Paused | filter | missing | planned | JR-18.10-01 | A09 | B8 | rule |
| R58 | ├─ Smart view: Recently inactive | filter | missing | planned | JR-18.10-01 | A09 | B8 | rule |
| R59 | ├─ Smart view: Safety review needed | filter | missing | planned | JR-18.10-01 | A09 | B8 | rule |
| R60 | ├─ Smart view: Setup needs attention | filter | missing | planned | JR-18.10-01 | A09 | B8 | rule |
| R61 | └─ Add Client entry | entry → AddClientSheet | /dashboard/clients/new + @overlay intercept | existing (recast as sheet; alias) | JR-12.1-01 | A09 | B8 | entry |

## 8. Client Hub

| # | Node (exact wording) | Canonical route/state | Existing @HEAD | Status | Linked JR | Assets | Batch | Test |
|---|---|---|---|---|---|---|---|---|
| R62 | Client Hub | /clients/{clientId} | /dashboard/clients/[id] | alias-needed | JR-17.1-01 | A05,A08,A40,A41,A75 | B8 | render |
| R63 | ├─ Today / Next Safe Action | ?view=today | missing | planned | JR-17.3-01, JR-17.4-01 | A05,A40 | B8 | state+URL |
| R64 | ├─ Overview | ?view=overview | exists (default hub view) | partial | JR-17.2-01 | A05,A08 | B8 | URL |
| R65 | ├─ Goals and Safety | ?view=goals | exists (section) | partial | JR-16.1-01 | A05,A40 | B8 | URL+layers |
| R66 | ├─ Sessions and Recurring Schedule | ?view=sessions | partial | partial | JR-17.6-01 | A05 | B8 | URL |
| R67 | ├─ Progress | ?view=progress | partial | partial | JR-17.8-01 | A07,A41 | B8 | URL |
| R68 | ├─ Program / Workout [pilot] | ?view=program | missing | pilot | JR-16.7-01 | — | none | — |
| R69 | ├─ Package and Billing | ?view=billing | exists (section) | partial | JR-17.5-01 | A05,A07 | B8 | URL |
| R70 | ├─ Statement of Account | ?panel=statement | statement exists; URL-backing verify | partial | JR-12.5→12.17 | A05,A07 | B8/B11 | URL restore |
| R71 | ├─ Attendance | ?view=attendance | missing | planned | JR-17.9-01 | A07,A41 | B8 | content |
| R72 | ├─ Communication | ?view=communication | missing (messages page separate) | planned | JR-17.14-01 | A06,A12 | B8/B10 | URL |
| R73 | ├─ Unified Activity | ?view=activity | partial | partial | JR-17.8-01 | A07 | B8 | event classes |
| R74 | └─ Lifecycle ├─ Pause | sheet=lifecycle&action=pause | missing | planned (per CR-09 scope: basic honesty B8; resolver hardening) | JR-17.10-01 | A05 | B8 | consequence list |
| R75 | Lifecycle ├─ Resume | lifecycle action | missing | planned | JR-17.10-01 | — | B8 | checklist |
| R76 | Lifecycle ├─ Reactivate | lifecycle action | missing | planned | JR-17.10-01 | — | B8 | checklist |
| R77 | Lifecycle └─ Deactivate | lifecycle action | basic archive exists | partial | JR-17.10-01 | — | B8 | unresolved-state |

Client Hub header (sitemap §6, verbatim): "Client identity / Lifecycle state / Billing mode / Safety indicator / Current package / rate / Primary actions" — one row each required in B8 header build (R62 sub-scope).

## 9. Inbox

Product rule (sitemap 5.1, verbatim): "Global Inbox answers: Who needs a reply? Client Hub Communication answers: What is the complete client context?" Delivery staging (5.6): MVP = "canonical MessageComposer; outbound logging; sent and failed delivery state; native WhatsApp deep-link handoff when direct sending is unavailable; client-level communication history; draft preserved when leaving and returning." Inbound webhooks + global Inbox filters = production-hardening. See CR-10.

| # | Node (exact wording) | Canonical route/state | Existing @HEAD | Status | Linked JR | Assets | Batch | Test |
|---|---|---|---|---|---|---|---|---|
| R78 | Inbox | /inbox | none (/dashboard/messages/[clientId] only) | planned — MVP scope: Sent / Failed delivery / Drafts + composer; inbound filters hardening | JR-5.9-01, JR-17.14-01, JR-19.1-01 | A06,A12,A13,A50,A51,A77 | B10 | render |
| R79 | ├─ Unread | ?filter=unread | none | hardening (inbound-dependent) | JR-19.2-01 | A13 | post-B15 | — |
| R80 | ├─ Needs reply | ?filter=needs-reply | none | hardening | JR-19.2-01 | A13 | post-B15 | — |
| R81 | ├─ Waiting for client | ?filter=waiting | none | hardening | JR-19.2-01 | — | post-B15 | — |
| R82 | ├─ Failed delivery | ?filter=failed | none | planned (outbound failures are MVP-visible) | JR-19-01, JR-25-01 | A13 | B10 | forced fail |
| R83 | ├─ Unmatched sender | ?filter=unmatched | none | hardening (inbound-dependent) | JR-19.2-01 | — | post-B15 | — |
| R84 | ├─ Sent | ?filter=sent | none | planned (global Sent Messages log is MVP per JR-5.9-01) | JR-5.9-01 | A13 | B10 | log |
| R85 | ├─ Drafts / Resume Work | ?filter=drafts | none | planned (message drafts) | JR-17.7-01 | — | B10 | drafts |
| R86 | ├─ All conversations | ?filter=all | none | planned (outbound-era: per-client threads) | JR-17.14-01 | A13 | B10 | list |
| R87 | └─ Conversation | ?conversation={conversationId} | /dashboard/messages/[clientId] | alias-needed (reconcile /messages → /inbox, checklist item 3) | JR-17.14-01 | A12,A50,A51 | B10 | deep link |

## 10. Billing

Sitemap §9 (verbatim): "`Billing` replaces `Invoices` as the global destination because the trainer's actual job is broader than invoice browsing." … "Manual invoice creation remains hidden from the normal trainer workflow."

| # | Node (exact wording) | Canonical route/state | Existing @HEAD | Status | Linked JR | Assets | Batch | Test |
|---|---|---|---|---|---|---|---|---|
| R88 | Billing (Overview) | /billing | /dashboard/invoices (list only) | planned + reconcile /invoices (checklist item 4) | JR-12.x | A03,A04,A38,A39,A74 | B11 | render |
| R89 | ├─ Balance due | ?filter=outstanding | none | planned | JR-12.9-01 | A03 | B11 | filter |
| R90 | ├─ Overdue | ?filter=overdue | none | planned | JR-12.12-01 | A03 | B11 | filter |
| R91 | ├─ Recently paid | ?filter=paid | none | planned | JR-12.12-01 | A03 | B11 | filter |
| R92 | ├─ Payment recovery | ?filter=recovery | none | planned | JR-25-01 | — | B11 | states |
| R93 | ├─ Invoices | /billing/invoices | /dashboard/invoices | alias-needed | JR-12.x | A03 | B11 | list |
| R94 | ├─ Payments [hardening] | /billing/payments | none | hardening | JR-17.12-01 | — | post-B15 | — |
| R95 | ├─ Credits and corrections [hardening] | section | none | hardening | JR-17.13-01 | — | post-B15 | — |
| R96 | └─ Financial exceptions [hardening] | section | none | hardening | JR-15.7-01 | — | post-B15 | — |
| R97 | Invoice detail | /billing/invoices/{invoiceId} | /dashboard/invoices/[id] | alias-needed | JR-12.14-01 | A03 | B11 | render |
| R98 | ├─ Authoritative invoice state | section | exists | partial | JR-3.2-01 | — | B11 | states |
| R99 | ├─ Payment history | section | partial | partial | JR-12.10-01 | — | B11 | content |
| R100 | ├─ Record payment | sheet=record-payment | /dashboard/invoices/[id]/pay (route) | alias-needed (recast as RecordPaymentSheet) | JR-12.14-01 | — | B11 | round-trip |
| R101 | ├─ Receipt / proof [hardening] | section | none | hardening | JR-17.12-01 | — | post-B15 | — |
| R102 | ├─ Send reminder | sheet=message | partial (messages page) | planned (composer reuse) | JR-12.12-01 | — | B11 | reuse |
| R103 | └─ Financial correction [hardening] | resolver=correction | none | hardening | JR-17.13-01 | — | post-B15 | — |
| R104 | Payment detail [hardening] | /billing/payments/{paymentId} | none | hardening (all 5 subsections: ERP reference / Invoice allocation / Remaining balance / Receipt / Correction resolver) | JR-17.12/13 | — | post-B15 | — |
| R105 | Payment methods | deep-link to Settings | /dashboard/whatsapp n/a; none | planned | JR-12.14-01 | — | B11→B12 | link |

Guardrail: manual invoice creation (`/dashboard/invoices/new` at HEAD) must be removed from normal-flow navigation → CR-06.

## 11. Global Search

| # | Node (exact wording) | Canonical route/state | Existing @HEAD | Status | Linked JR | Assets | Batch | Test |
|---|---|---|---|---|---|---|---|---|
| R106 | Global Search | /search | none | planned | JR-18.13-01 | A33,A47,A67 | B13 | route+shortcut |
| R107 | ├─ Recent records | group | none | planned | JR-18.13-01 | A47 | B13 | group |
| R108 | ├─ Clients | group | none | planned | JR-18.13-01 | A33,A47 | B13 | group |
| R109 | ├─ Sessions | group | none | planned | JR-18.13-01 | A33 | B13 | group |
| R110 | ├─ Invoices | group | none | planned | JR-18.13-01 | A33 | B13 | group |
| R111 | ├─ Payments | group | none | planned | JR-18.13-01 | — | B13 | group |
| R112 | ├─ Locations | group | none | planned | JR-18.13-01 | — | B13 | group |
| R113 | ├─ Conversations | group | none | planned (sitemap §8.1 includes it; §18.13 journey groups lack it → included per sitemap authority for navigation) | JR-18.13-01 | — | B13 | group |
| R114 | ├─ Canonical commands | group | none | planned ("commands and record search remain visually distinct") | JR-18.13-01 | A33 | B13 | distinct render |
| R115 | └─ Ask FitDesk [limited pilot] | ?panel=ask-fitdesk | none | pilot | JR-20.8-01 | — | none | — |

## 12. Settings

| # | Node (exact wording) | Canonical route | Existing @HEAD | Status | Linked JR | Assets | Batch | Test |
|---|---|---|---|---|---|---|---|---|
| R116 | Settings | /settings | /dashboard/settings | alias-needed | — | A29,A79 | B12 | render |
| R117 | ├─ Trainer profile | /settings/profile | /dashboard/account (partial) | alias-needed | — | A29 | B12 | render |
| R118 | ├─ Workspace / business | /settings/workspace | partial (onboarding-owned data) | planned | — | A29 | B12 | render |
| R119 | ├─ Working hours | /settings/working-hours | partial (in settings page) | planned | JR-18.2-01 | A29 | B12 | render |
| R120 | ├─ Dated availability | /settings/availability | none | planned (MVP per JR-18.2-01; sitemap §13 lists under hardening → CR-18) | JR-18.2-01 | A29 | B12 | flow |
| R121 | ├─ Scheduling rules | /settings/scheduling (Time buffers / Default duration / Timezone / Cancellation / no-show policy) | partial | planned | JR-14.1-01 | A29 | B12 | fields |
| R122 | ├─ Package catalog | /settings/packages (Package templates / Default expiry rules / Archived templates) | /dashboard/settings/packages | alias-needed | JR-9-03 | A29 | B12 | render |
| R123 | ├─ Program library [pilot] | /settings/program-library | none | pilot | JR-16.7-01 | — | none | — |
| R124 | ├─ Exercise catalog [pilot] | /settings/exercise-catalog | none | pilot | JR-16.7-01 | — | none | — |
| R125 | ├─ Payment methods | /settings/payment-methods | none | planned | JR-12.14-01 | A29 | B12 | render |
| R126 | ├─ Locations | /settings/locations | none | planned | JR-14.7-01 | A29 | B12 | render |
| R127 | ├─ Session types and defaults [hardening] | /settings/session-types | none | hardening | JR-14.8-01 | — | post-B15 | — |
| R128 | ├─ Communications | /settings/communications (Message templates / Reminder defaults / Communication Consent Center / WhatsApp handoff settings / Inbound channel settings [hardening]) | /dashboard/whatsapp (partial) | planned (alias /dashboard/whatsapp; Consent Center content per CR-11 schema gate; inbound settings hardening) | JR-18.15-01 | A29 | B12 | render |
| R129 | ├─ Integrations | /settings/integrations (ERP capability health / WhatsApp / Evolution API health / Calendar integration [when enabled] / Integration recovery) | /dashboard/whatsapp (partial) | planned (full Health Center hardening per JR-18.14-01; basic status MVP) | JR-18.14-01 | A29 | B12 | states |
| R130 | ├─ Offline and sync [hardening] | /settings/offline | none | hardening | — | — | post-B15 | — |
| R131 | ├─ AI and automation [pilot / gated] | /settings/ai | none | pilot | JR-20-01 | — | none | — |
| R132 | ├─ Security and sessions | /settings/security | none | planned | — | A29 | B12 | render |
| R133 | ├─ Data and privacy | /settings/data | none | planned (sitemap §13 lists under hardening → minimal MVP page, CR-18) | — | — | B12 | render |
| R134 | └─ Help and support | /settings/help | /dashboard/help | alias-needed | — | — | B12 | render |

Settings guardrails (sitemap §13, verbatim): "Client-specific program assignment does not belong in Settings. Client-specific package assignment does not belong in Settings. Payment recording does not belong in Settings. Manual invoice creation remains hidden. One-time scheduling exceptions do not rewrite global policy. Configure-in-context returns the trainer to the interrupted workflow."

## 13. Shared contextual workflows — not primary navigation

| # | Node (exact wording) | Canonical surface (verbatim) | Existing @HEAD | Status | Linked JR | Batch |
|---|---|---|---|---|---|---|
| W1 | Add Client | AddClientSheet | route-based form + overlay | partial | JR-12.1-01 | B8 |
| W2 | Quick Add from Text [pilot] | inside Add Client | parse path exists, UI gated | pilot | JR-12.1-01 note | none |
| W3 | Book / reschedule | BookingSheet | BookingSheet exists | partial | JR-14-01 | B7 |
| W4 | Complete / resolve session | SessionCompletionSheet | completion surfaces exist | partial | JR-13.2-01 | B9 |
| W5 | Offline completion reconciliation | SyncConflictResolver | none | planned (MVP baseline per §11.4) | JR-24-01 | B14/B9 |
| W6 | Record payment | RecordPaymentSheet | pay route (not sheet) | planned | JR-12.14-01 | B11 |
| W7 | Assign / renew / replace package | Package workflow family | AssignPackageSheet exists | partial | JR-12.2-01 | B8/B11 |
| W8 | Compose / reply | MessageComposer | per-client page | partial | JR-19-01 | B10 |
| W9 | Match unmatched sender | SenderMatchingResolver | none | hardening (inbound-dependent) | JR-19.2-01 | post-B15 |
| W10 | Resolve attention item | AttentionResolver | none (list without resolver grammar) | planned | JR-5.3-01 | B6/B14 |
| W11 | Statement of Account | Statement drawer/full-height sheet | exists (verify surface form) | partial | JR-12.6-01 | B8/B11 |
| W12 | Recurring Schedule Manager | recurrence resolver | none | planned-read / hardening-mutations (CR-09) | JR-17.6-01 | B8 |
| W13 | Client lifecycle resolver | pause/resume/reactivate/deactivate | basic archive only | planned (scope per CR-09) | JR-17.10-01 | B8 |
| W14 | Duplicate Identity Resolver | data-quality resolver | detection exists; consolidation none | hardening | JR-18.9-01 | post-B15 |
| W15 | Missing Client Truth Resolver | contextual data-quality resolver | none | hardening | JR-18.8-01 | post-B15 |
| W16 | Dated Availability Sheet | scheduling exception | none | planned | JR-18.2-01 | B7/B12 |
| W17 | Day Disruption Resolver | operational recovery | none | hardening | JR-18.3-01 | post-B15 |
| W18 | Financial Correction Resolver | controlled ERP correction | none | hardening | JR-17.13-01 | post-B15 |
| W19 | Explanation panel | Why This Happened | none | planned | JR-18.5-01 | B14 |
| W20 | Session Change Summary | before/after result | none | planned | JR-18.16-01 | B14 |
| W21 | Program template picker | inside Client Hub | none | pilot | JR-16.7-01 | none |
| W22 | Workout Builder [pilot] | client-contextual review | none | pilot | JR-16.7-01 | none |
| W23 | Pre-Session Brief [pilot] | source-linked card | none | pilot | JR-5.4-01 note | none |
| W24 | Structured Progress Draft [pilot] | completion helper | none | pilot | JR-5.5-01 note | none |
| W25 | Ask FitDesk panel [limited pilot] | read-only | none | pilot | JR-20.8-01 | none |

## 14. Shared application and connectivity states

One row per state (sitemap §3 + §15, verbatim list): Loading; Ready; Confirmed empty; Sparse / activation; Partial data; Stale data; Unavailable; Failed; Blocked; Unauthorized; Not found; Saved on this device [MVP baseline]; Waiting to sync [MVP baseline]; Reconciling [MVP baseline]; Review required [MVP baseline]; Uncertain authoritative result.

| # | Node | Existing @HEAD | Status | Linked JR | Batch |
|---|---|---|---|---|---|
| S1–S11 | Loading / Ready / Confirmed empty / Sparse / Partial / Stale / Unavailable / Failed / Blocked / Unauthorized / Not found | ad-hoc per surface | planned (shared library) | JR-24-01 | B14 |
| S12–S15 | Saved on this device / Waiting to sync / Reconciling / Review required [MVP baseline] | none | planned (offline-intent baseline; §11.5 trainer-facing copy verbatim) | JR-24-01 | B14 |
| S16 | Uncertain authoritative result | partial (payment paths) | planned | JR-24-01 | B14 |

§15 consequence contract (verbatim): every consequential state explains "What happened / Why it happened / Which records are affected / What was safely preserved / What succeeded / What remains authoritative / What is uncertain / What the trainer can safely do next." "Unknown or unavailable financial data is never displayed as zero."

## 15. Internal operational surfaces — outside trainer navigation

| # | Node (verbatim) | Status | Batch |
|---|---|---|---|
| I1–I9 | Provisioning operations and recovery / Tenant mapping audit / Job and idempotency inspection / Integration incident review / Webhook/event replay inspection / Message identity-matching audit / Offline intent and reconciliation audit / AI run audit and evaluation review [pilot governance] / Support-led controlled correction | internal — no trainer UI in any batch; existing Control Plane/ops tooling unaffected (protected) | none |

## 16. Future client-facing boundary — separate portal/app

| # | Node (verbatim) | Route | Status |
|---|---|---|---|
| F1–F9 | Secure portal entry /portal · Identity verification /portal/verify · Deferred onboarding /portal/onboarding · Profile and communication preferences /portal/profile · Upcoming sessions /portal/sessions · Approved client instructions /portal/preparation · Statements and receipts /portal/statements · Approved progress summary /portal/progress [future] · Dedicated PWA/native client app (decision-gated) | as listed | future — excluded (JR-21-01); guard against invention |

## 17. Compatibility aliases (explicit register)

| # | Existing route @HEAD | Canonical target | Action | Batch |
|---|---|---|---|---|
| AL1 | /auth/login | /sign-in | alias/redirect both directions during migration | B2 |
| AL2 | /auth/register | /sign-up | alias/redirect | B2 |
| AL3 | /dashboard/schedule | /schedule | alias/redirect | B7 |
| AL4 | /dashboard/schedule/new | /schedule?sheet=booking | redirect into URL-backed sheet | B7 |
| AL5 | /dashboard/clients | /clients | alias/redirect | B8 |
| AL6 | /dashboard/clients/new | /clients?sheet=add | redirect | B8 |
| AL7 | /dashboard/clients/[id] | /clients/{clientId} | alias/redirect | B8 |
| AL8 | /dashboard/clients/[id]/edit | /clients/{clientId}?sheet=edit | redirect | B8 |
| AL9 | /dashboard/messages/[clientId] | /inbox?conversation={id} (and /clients/{clientId}?view=communication) | reconcile per checklist item 3 | B10 |
| AL10 | /dashboard/invoices | /billing/invoices | reconcile per checklist item 4 (deep links preserved) | B11 |
| AL11 | /dashboard/invoices/[id] | /billing/invoices/{invoiceId} | alias/redirect | B11 |
| AL12 | /dashboard/invoices/[id]/pay | /billing/invoices/{invoiceId}?sheet=record-payment | redirect into sheet | B11 |
| AL13 | /dashboard/invoices/new | (hidden from normal flow) | remove from nav; direct-URL policy per CR-06 PO decision | B11 |
| AL14 | /dashboard/settings | /settings | alias/redirect | B12 |
| AL15 | /dashboard/settings/packages | /settings/packages | alias/redirect | B12 |
| AL16 | /dashboard/account | /settings/profile (+ More → Account) | alias/redirect | B12 |
| AL17 | /dashboard/help | /settings/help | alias/redirect | B12 |
| AL18 | /dashboard/whatsapp | /settings/communications + /settings/integrations | split + redirect | B12 |
| AL19 | /dashboard (shell) | /dashboard | unchanged (canonical) | — |

Rules (sitemap §12, verbatim): "URLs restore context but never encode sensitive authoritative payloads. Reloading an unconfirmed flow never executes it. Completed, pending, or uncertain operations re-query authoritative state before retry. Old working routes should redirect or alias safely during migration."

## 18. Recommended URL-backed states (sitemap §12 — adopted as canonical query-state targets)

All 34 illustrative states from §12 are adopted as the target URL-state vocabulary, subject to per-batch repository reconciliation (the sitemap itself says "Exact query names are illustrative and require repository reconciliation"): `/clients?sheet=add`, `/clients?sheet=add&mode=quick-text` [pilot], `/schedule?sheet=booking`, `/schedule?sheet=availability`, `/schedule?resolver=day-disruption` [hardening], `/sessions/{sessionId}?sheet=complete`, `/sessions/{sessionId}?sheet=reschedule`, `/sessions/{sessionId}?resolver=sync-conflict`, `/clients/{clientId}?view=program...` [pilot ×4], `/clients/{clientId}?view=communication`, `?view=communication&conversation={id}`, `?sheet=assign-package`, `?sheet=message`, `?panel=statement`, `?sheet=recurring-schedule`, `?sheet=lifecycle&action=pause`, `?sheet=data-quality` [hardening], `?sheet=duplicate` [hardening], `/inbox?filter=needs-reply` [hardening], `/inbox?filter=unmatched` [hardening], `/inbox?conversation={id}`, `/billing?filter=overdue`, `/billing/invoices/{invoiceId}?sheet=record-payment`, `?sheet=message`, `?resolver=correction` [hardening], `/dashboard?resolver=attention&item={id}`, `/dashboard?resolver=resume&item={id}`, `/search`, `/search?panel=ask-fitdesk` [pilot], `/settings/program-library` [pilot], `/settings/exercise-catalog` [pilot].

## 19. Mobile surface rules (sitemap 8.3 — binding per-surface form factors)

| Experience | Mobile (verbatim) | Desktop (verbatim) | Batch |
|---|---|---|---|
| Search | Full-screen | Command palette / overlay | B13 |
| Inbox thread | Full-height route/sheet | Split inbox/thread workspace | B10 |
| Add Client | Full-height stepped sheet | Drawer/dialog | B8 |
| Booking | Full-height bottom sheet | Drawer/dialog with schedule context | B7 |
| Session completion | Full-height sheet | Right drawer | B9 |
| Statement | Full-height route/sheet | Wide drawer or full page | B11 |
| Program template picker | Full-height sheet | Wide drawer/dialog | pilot |
| Message Composer | Bottom/full-height sheet | Drawer/dialog | B10 |
| Record Payment | Bottom/full-height sheet | Drawer/dialog | B11 |
| Attention resolver | Focused full-height flow | Contextual drawer | B6/B14 |
| Day disruption | Full-screen resolver | Wide workspace | hardening |

"Critical actions always have visible controls. Gestures may accelerate but never replace them."

## 20. Routes that must not become primary navigation (sitemap §14, verbatim guard)

Programs · Program drafts · Exercise catalog · Goals · Safety · Progress · Attendance · Client packages · Payments · Receipts · Data Quality · Duplicate Clients · Needs Attention · Resume Work · Client Pulse · Prepared Actions · AI Runs · Availability Exceptions · Day Disruption · Financial Corrections · Integration Health · Consent Center · Offline Sync Queue — "They remain contextual because they belong to a client, session, invoice, setting, or specific operational problem." Binding on B5 nav build and all batches.

## 21. Coverage summary

- Nav items (desktop 6, mobile 5, persistent controls 4, More 5, FAB 4): **24 rows** (N1–N24)
- Routes/destinations/filters/panels/sections: **134 rows** (R1–R134)
- Contextual workflows: **25 rows** (W1–W25)
- Shared states: **16 rows** (S1–S16)
- Internal surfaces: **9** (I1–I9, no trainer UI)
- Future portal boundary: **9** (F1–F9, excluded)
- Compatibility aliases: **19 rows** (AL1–AL19)
- URL-backed states adopted: 34 (§18)
- **Total mapped nodes: 236** — zero sitemap nodes unmapped. Canonical desktop nav = Dashboard, Schedule, Clients, Inbox, Billing, Settings (verbatim). Canonical mobile nav = Home, Schedule, Clients, Inbox, More (verbatim). Search persistent (never in More).
