# FitDesk — Billing & Package ERP Architecture Decision

> **Purpose:** Define the canonical billing, package, and ledger architecture for FitDesk MVP and
> beyond — the ERPNext accounting boundary, the Add Client billing-mode contract, the strict domain
> taxonomy, and the guardrails that keep money correct. This document **decides vocabulary and
> boundaries**; it does **not** implement them.
>
> **Status:** PROPOSED · documentation-only · no runtime code, schema, or migration changes.
> **Date:** 2026-06-25 · **Scope:** FitDesk billing/package/ledger architecture.
> **Authority:** `FitDesk/CLAUDE.md`, workspace `CLAUDE.md`, `ADR-001`, Handbook `08` / `09` / `10` / `14`.

---

## 0. Document status & repo state

This is a **decision/planning document**. It changes no runtime logic, creates no migration, and
touches none of the approval-gated areas (auth, tenant isolation, payments, WhatsApp, DocTypes, ERP
proxy internals, scheduling, deployment).

Repo state at authoring time (verified `git status -sb`):

```text
## main...origin/main [ahead 2]
  bf62ec9 fix(clients): align whatsapp toggle thumb
  fc1c1c8 fix(dashboard): make quick action navigation reliable
```

- These two commits are **local-only and must not be pushed** as part of this work.
- No Dokploy/VPS deployment may be triggered by this task.
- Every implementation item below is **deferred and approval-gated**; nothing here authorizes a code,
  schema, or DocType change. Implementation begins only after this document is approved **and** each
  gated step receives its own approval per `CLAUDE.md §4`.

### Relationship to existing records

| Concern | Authoritative source today | This document |
|---|---|---|
| Client identity / ERP boundary | `ADR-001`, Handbook `08` | Reaffirms; adds billing/package boundary detail |
| Session billing contract | Handbook `09` ("Billing & Session Outcome Contract") | Formalizes the taxonomy and idempotency preconditions |
| Client model / `billingMode` | Handbook `10`, `types/clients.ts` | Extends with package + ledger vocabulary |
| Missing ADR | `14` lists gaps | Recommends promoting this to **`ADR-BILL-001`** once confirmed |

> **Recommendation:** after product-owner confirmation, promote this document to a numbered ADR
> (`ADR-BILL-001 — Billing & Package Architecture`) and index it in Handbook `14`. Until then, the
> `CLAUDE.md` rules and this document govern.

---

## 1. ERPNext accounting boundary

**Binding. ERPNext is the system of record for all financial documents.** FitDesk is a UX/projection
layer over ERP money; it never owns financial truth.

### Verified current boundary (read 2026-06-25)

```text
UI (server action)
  → actions/* (e.g. addClient, addInvoice, recordPayment)
  → lib/business-data/erp-adapter.ts   (re-exports lib/erpnext/client.ts)
  → lib/erpnext/client.ts:erpFetch()   [signs short-lived HMAC-HS256 JWT carrying tenantId]
  → Control Plane ERP proxy            [sole keeper of per-tenant api_key/api_secret]
  → ERPNext / Frappe
```

- 🟩 FACT — `DOCTYPE` map in `lib/erpnext/client.ts`: `Customer`, `Sales Invoice`, `Payment Entry`
  (standard Frappe DocTypes).
- 🟩 FACT — `FITDESK_JWT_SECRET` is the shared signing secret, **server-side only**; absent → proxy
  returns `503`.
- 🟩 FACT — FitDesk holds **no** ERP `api_key`/`api_secret`. The Control Plane does.

### Rules (binding)

1. **ERPNext remains the system of record** for Customer, Sales Invoice, Payment Entry, Credit Note,
   and Journal Entry. No monetary financial total, accounts receivable balance, payment status, or accounting status may be computed outside the ERP path. Package service-unit balances may be derived locally only from the approved append-only ledger and must never replace ERP financial truth.
2. **FitDesk must not store ERP credentials** — not in code, client-reachable env, or logs.
3. **All ERP I/O passes through the existing client/proxy path** (`erp-adapter` → `erpFetch()` →
   Control Plane proxy). No new ERP HTTP client, no second path, no proxy bypass.
4. **No direct ERP/Frappe calls from app code** outside the approved proxy chain. A client component
   never calls ERP, payments, or WhatsApp directly (`FitDesk/CLAUDE.md`).
5. **Normalize at the boundary** — raw ERP payloads are validated/normalized into app types before
   the UI sees them (`normalizeClient`, `normalizeInvoice`, `normalizePayment`).
6. **No duplicate financial truth** — local SQLite tables (`client_index.paymentSummary`,
   `billingMode`, future package projections) are read-model/UX state only. They must never be used to
   compute financial totals, statements of account, or payment status.

---

## 2. Add Client billing-mode rule

**Binding (extends `ADR-001`).** Add Client establishes identity and *captures intent only*. It must
never move money or create downstream side effects.

### What Add Client does (verified — `actions/clients.ts:addClient`)

1. Creates the canonical **ERP Customer** through the approved proxy path (`createClient()`).
2. Synchronously writes the **local client projection** (`client_index` + `client_goal` +
   inert `client_action_intent` rows + a `client.created` `client_event`) via
   `ClientRepository.createClientRow()`.
3. Maps the app `billingMode` to the ERP Customer `custom_billing_mode` Select
   (`'package'` → `'Package'`, `'pay_per_session'` → `'Pay Per Session'`), and stores `billingMode`
   on the local `client_index` row.

### What Add Client must NOT do (binding)

Add Client must **not**, under any billing mode:

- create a **Sales Invoice** or any invoice draft;
- create a **Payment Entry** or record any payment;
- grant, activate, or deduct **package credits**;
- write any **ledger entry**;
- create or schedule a **session**, program, or any scheduling side effect;
- send a **WhatsApp** message.

> Add Client may capture the billing **preference** (mode) and, optionally, a default session rate
> carried to the ERP Customer. Capturing a preference is not a financial event.

---

## 3. Pay-per-session (PPS) — MVP behavior

```text
billing_mode = pay_per_session
```

1. **No prepaid credits.** PPS clients never carry a package balance.
2. **No invoice on client creation.** Add Client for a PPS client produces zero financial documents.
3. **Future invoice only after a persisted session reaches `completed`.** A Sales Invoice is generated
   automatically **only after session completion** — never before, never at booking.
4. **Completion invoicing is deferred until session persistence + idempotency exist.**

### Why deferred (verified — Handbook `09`, `actions/sessions.ts`, `lib/erpnext/client.ts`)

- 🟩 FACT — The **PT Session DocType is absent** in this ERP instance. All session mutation stubs
  (`createSession`, `markSessionComplete`, `cancelSession`, `markSessionMissed`) throw
  `ERPNextError(503)`; `getSessionById` throws `404`. No session can persist or complete today.
- 🟩 FACT — `completeSession` is **status-only** ("Option B — deferred PPS invoicing"). It performs no
  invoicing and no decrement, by design, because PT Session carries no `custom_billing_mode` /
  `invoice_id` fields to make completion-invoicing idempotent.

**Decision:** PPS completion-invoicing is implemented **only** once (a) a session persists with a
stable identity and (b) an idempotency key prevents a repeated "complete" from creating a duplicate
invoice. Until both exist, PPS completion stays status-only. See `§5` (`session_consumed`),
`§6` (idempotency), and Handbook `09` Open Decisions 1, 4, 5.

---

## 4. Package mode — MVP behavior

```text
billing_mode = package
```

1. **Package assignment is a separate, post-client-creation workflow.** Add Client never assigns a
   package. The trainer assigns a package from the client workspace as a distinct, explicit action.
2. **Package invoices are created only after explicit trainer confirmation.** The package Sales
   Invoice is generated when the package is **sold/assigned** and the trainer confirms — not silently,
   not on Add Client, not on session completion.
3. **No automatic deduction during Add Client.** Creating a package-mode client grants no credits and
   deducts nothing.
4. **No package counters as source of truth.** The remaining-session balance is **derived** from the
   append-only ledger and reconciled against ERP financial documents — never a free-standing mutable
   integer that the UI increments/decrements.

> Session completion *decrement* for package clients (the `session_consumed` event) is **target
> behavior, deferred** to the same preconditions as PPS invoicing: persisted session + idempotent
> ledger (`§5`, `§6`). Over-spend must warn, never silently go negative (Handbook `09`).

---

## 5. Strict Domain Taxonomy (canonical vocabulary)

These enums are the **canonical domain vocabulary** for billing, packages, and the ledger. They are
defined here as the single source of truth; implementation must derive TypeScript types and database
CHECK constraints from these exact strings (`§6`).

### 5.1 `billing_mode`

| Value | Status | Meaning |
|---|---|---|
| `pay_per_session` | MVP-active | Invoice generated after a completed session (`§3`). |
| `package` | MVP-active | Prepaid block of sessions, invoiced on assignment (`§4`). |
| `subscription` | **Reserved / deferred** | Recurring billing. **Not MVP-active.** No code path may treat it as active. |

### 5.2 `template_type` (package template classification)

| Value | Meaning | Accounting rule |
|---|---|---|
| `standard_block` | Normal paid package (e.g. 10-session block). | Normal revenue. |
| `complimentary` | Free/gifted sessions (comp). | **Zero-value, accounting-safe** — must never create non-zero revenue. |
| `promotional` | Discounted/promo block. | May be discounted but must remain accounting-consistent; **zero-value promos must be accounting-safe** like `complimentary`. |

### 5.3 `ledger_event_type` (append-only package ledger)

| Value | Meaning | Precondition |
|---|---|---|
| `purchase_activation` | Package purchased/activated → credits granted. | Confirmed Sales Invoice reference. |
| `bonus_granted` | Extra/comp credits granted. | Zero-value accounting-safe (`complimentary`). |
| `refund_credit` | Credits returned (refund/correction). | Paired with ERP Credit Note. |
| `session_consumed` | One credit consumed by a completed session. | **Requires idempotency** (`§6`); requires persisted session. |
| `late_cancel_penalty` | Credit consumed by a late cancellation. | **Requires idempotency** (`§6`); requires `cancelled_late` + ledger. |
| `expiration_sweep` | Credits expired (breakage). | **Deferred** — automated sweep is future-platform (`§10`). |

### 5.4 `session_status` (billing/domain lifecycle)

| Value | Meaning | Revenue rule |
|---|---|---|
| `draft` | Unconfirmed/placeholder session. | No financial effect. |
| `scheduled` | Confirmed, future session. | No financial effect. |
| `completed` | Session delivered. | PPS → invoice (deferred, `§3`); package → `session_consumed` (deferred, `§4`). |
| `cancelled_early` | Cancelled within the no-penalty window. | **Must never create revenue recognition** and never consume a credit. |
| `cancelled_late` | Cancelled inside the penalty window. | **May** consume one package credit via `late_cancel_penalty` — **only after the idempotent ledger exists**. Otherwise no financial effect. |

### 5.5 Taxonomy rules (binding)

1. `subscription` is **reserved/deferred** — never MVP-active.
2. `complimentary` and `promotional` templates must be **zero-value accounting-safe** when their value
   is zero; they must never inject phantom revenue.
3. `session_consumed` and `late_cancel_penalty` **require idempotency before implementation** (`§6`).
4. `cancelled_early` **must never create revenue recognition** and never consumes a credit.
5. `cancelled_late` **may consume a package credit only after the idempotent, append-only ledger
   exists** — never before.
6. **Do not invent additional enum states** (new billing modes, template types, ledger events, or
   session statuses) without documenting the change as an ADR amendment to this document.

### 5.6 Mapping to current code (fidelity note — these do NOT yet match)

> The canonical vocabulary above is **target architecture**. The live code uses narrower enums.
> Adopting the canonical set is an **ADR-gated future migration**, not a claim about current state.

| Canonical (this doc) | Live today | Gap / migration note |
|---|---|---|
| `billing_mode`: `pay_per_session` \| `package` \| `subscription` | `types/clients.ts`: `BillingMode = 'package' \| 'pay_per_session' \| 'unset'` | Add `subscription` (reserved). `'unset'` is **kept** as a persistence-layer "not chosen yet" sentinel, distinct from the three business modes — see below. |
| ERP `custom_billing_mode` | `'Package' \| 'Pay Per Session' \| 'Trial'` (per `lib/erpnext/types.ts`) | ERP Select also exposes `'Trial'`; reconcile `Trial` ↔ `complimentary`/comp template before relying on it. Approval-gated (DocType field). |
| `session_status`: `draft \| scheduled \| completed \| cancelled_early \| cancelled_late` | `types/index.ts`: `SessionStatus = 'scheduled' \| 'completed' \| 'missed' \| 'cancelled'`; ERP raw `Scheduled/Completed/Missed/Cancelled` | Splits `cancelled` → `cancelled_early` / `cancelled_late`; reconciles `missed` (no-show) with the no-show flow (Handbook `09`). New fields on PT Session — approval-gated. |
| `template_type`, `ledger_event_type` | **None on disk** (greenfield — verified 2026-06-25) | Net-new vocabulary; introduced only with approved schema + tables. |

> **`unset` sentinel:** the live `client_index.billing_mode` defaults to `'unset'`
> (`lib/db/schema.ts`). This document treats `unset` as an internal **null-state**, not a fourth
> business billing mode. Canonical business vocabulary remains the three values in `§5.1`; `unset`
> means "trainer has not chosen," and any financial logic must treat it as "no mode selected."

---

## 6. TypeScript + SQLite/Drizzle guardrail

**Binding.** Enum safety must exist at **two layers**: TypeScript at the app layer, and database CHECK
constraints at the disk layer. Neither alone is sufficient.

### Facts (verified — `lib/db/schema.ts`)

- 🟩 FACT — SQLite has **no native enum type**.
- 🟩 FACT — Today's status-like columns are plain `text()` with `.default(...)` and **no CHECK
  constraints** (e.g. `billingMode: text('billing_mode').notNull().default('unset')`). Drizzle enum
  typing is **not** used. So nothing on disk prevents an out-of-vocabulary string today.

### Rules (binding)

1. **App layer:** define each enum as a TypeScript `const` array (single source) and derive the union
   type from it. The const array is also the allow-list used by validators/type-guards.

   ```ts
   // PROPOSED — not yet on disk. Illustrative only.
   export const BILLING_MODES = ['pay_per_session', 'package', 'subscription'] as const
   export type BillingMode = typeof BILLING_MODES[number]
   // (subscription is reserved/deferred — guarded out of active code paths)

   export const LEDGER_EVENT_TYPES = [
     'purchase_activation', 'bonus_granted', 'refund_credit',
     'session_consumed', 'late_cancel_penalty', 'expiration_sweep',
   ] as const
   export type LedgerEventType = typeof LEDGER_EVENT_TYPES[number]
   ```

2. **Disk layer:** every persisted enum column gets a database **CHECK constraint** restricting it to
   the canonical strings (e.g. `CHECK (billing_mode IN ('pay_per_session','package','subscription','unset'))`).
   The disk constraint is the real guardrail; it protects against migration/backfill drift and
   non-app writers.
3. **Drizzle enum-style typing alone is not a database guardrail.** Compile-time types do not constrain
   what an external writer, a migration, or a raw SQL statement can insert. CHECK constraints do.
4. **Future migrations must preserve backwards compatibility and rollback safety:** additive columns,
   nullable or defaulted; never a destructive rewrite of `billing_mode`/status columns; every enum-
   widening migration must be paired with a tested down-migration (`§14`).
5. Keep the TS const array and the DB CHECK constraint **in sync** — a single review item whenever the
   vocabulary changes (`§5.5` rule 6).

---

## 7. Package Template model

A trainer-facing, reusable **package template**. Greenfield — **no such model exists on disk**
(verified 2026-06-25).

### Properties (decision)

- **Trainer-facing reusable template** — defines a sellable package (name, session count, price,
  validity window, `template_type` from `§5.2`).
- **Tenant-scoped** — every row carries `tenantId`; every query is tenant-filtered (no ambient
  isolation in shared local storage — Handbook `10`).
- **Versioned or immutable once used in sales** — once a catalog template has been used in a
  `client_package_purchase`, it must not be mutated in place. Either version it (new row, prior row
  frozen) or treat it as immutable and supersede. This protects historical invoices from drift.
- **Maps to an ERPNext Item / item code** — the catalog template references an ERP `item_code`
  (`CreateInvoiceItem.item_code` already exists, e.g. `"PT-SESSION"`). The Sales Invoice line for a
  package sale uses that item code.
- **No automatic ERP Item creation** — FitDesk must **not** auto-create ERPNext Items from the catalog
  unless separately approved (`CLAUDE.md §4` — DocType/ERP change). For MVP, the ERP Item is assumed to
  pre-exist or is created by an approved, out-of-band provisioning step.

---

## 8. Client Package Purchase model (contract)

A client-specific **package contract** — the instance of a catalog template sold to one client.
Greenfield — **no such model exists on disk** (verified 2026-06-25).

### Properties (decision)

- **Client-specific package contract** — one row per package a client buys.
- **Links:** `clientIndexId` / `erpCustomerId` (canonical client identity, `ADR-001`),
  `packageTemplateId` (+ version), the **ERP Sales Invoice reference** (Sales Invoice docname),
  payment state, and activation/expiration timestamps.
- **Read-only after financial confirmation** — once the linked Sales Invoice is submitted/confirmed,
  the purchase row is immutable **except** for validated status transitions (e.g. `active` →
  `expired`, `active` → `refunded`) that are themselves ledger/ERP-backed.
- **No direct balance counter as source of truth** — the purchase row does **not** store a mutable
  `remaining_sessions` integer that the app increments/decrements. Remaining balance is **derived**
  from the append-only `package_ledger` (`§5.3`) and reconciled with ERP. A denormalized balance may
  exist only as a **cached projection**, clearly marked non-authoritative, rebuildable from the ledger.

---

## 9. ERPNext documents used

| ERP document | Role in FitDesk billing | Status in code |
|---|---|---|
| **Customer** | Canonical business identity for the client (`ADR-001`). | Live — `createClient` / `updateClient`. |
| **Sales Invoice** | Package sale / accounts receivable; PPS post-completion invoice. | Live primitives — `createInvoice`, `submitSalesInvoice`. |
| **Payment Entry** | Payment reconciliation against an invoice (Paid Now / Pay Later). | Live — `createAndSubmitPaymentEntry`, `recordPayment`. |
| **Credit Note** | Refund / correction **after a submitted invoice** (ERPNext return). | **Not implemented** — refund path is deferred (`§10`). |
| **Journal Entry** | Future **revenue recognition** / breakage adjustments only. | **Deferred + approval-gated** — never in MVP. |

Rules:
- Package sale → **Sales Invoice** (after trainer confirmation, `§4`).
- Payment → **Payment Entry** reconciled against that invoice (existing `recordPayment` flow).
- Refund/correction after submit → **Credit Note** (deferred; never an in-place edit of a submitted
  invoice).
- Deferred-revenue recognition / breakage → **Journal Entry**, only after explicit approval; out of
  MVP scope.

---

## 10. Explicitly deferred

The following are **out of MVP scope** and must not be implemented without separate planning and
approval:

- Automatic credit deduction (auto-decrement on completion without idempotency).
- Automated revenue recognition (deferred-revenue → earned schedules; Journal Entry automation).
- Breakage / expiration sweep (`expiration_sweep` automation).
- Wallet / stored-value balance (client cash balance).
- Subscriptions (`billing_mode = subscription`).
- Package sharing / family / corporate / shared credits.
- Direct ERP **Item** creation from FitDesk.
- Production deployment of any of the above.

---

## 11. Required guardrails (binding checklist)

- [ ] **No direct ERP calls** — all ERP I/O via `erp-adapter` → `erpFetch()` → Control Plane proxy.
- [ ] **No ERP credentials in FitDesk** — none in code, client-reachable env, or logs.
- [ ] **No package counters as source of truth** — balance is ledger-derived; any counter is a cache.
- [ ] **No invoice / payment / package side effects during Add Client.**
- [ ] **No automated deduction without a persisted booking + idempotency key.**
- [ ] **Ledger is append-only** when implemented (no in-place edits/deletes; corrections are new rows).
- [ ] **All financial writes are idempotent** — a repeated submit/complete creates no duplicate
      invoice, payment, or ledger entry.
- [ ] **Zero-value templates stay accounting-safe** — `complimentary`/zero `promotional` create no
      phantom revenue.
- [ ] **No production deployment** as part of this work.
- [ ] **No push** — the two local commits stay local.

---

## 12. File-level implementation phases (after approval)

> All items below are **proposed and approval-gated**. Schema/migration/DocType items each require
> their own approval per `CLAUDE.md §4`. Listed for sequencing only.

### Phase A — MVP / pilot-safe now (no schema change)

- `lib/billing/taxonomy.ts` *(new)* — canonical `const` arrays + union types for `billing_mode`,
  `template_type`, `ledger_event_type`, `session_status` (`§5`, `§6`). Pure constants; no I/O.
- `types/clients.ts` — extend `BillingMode` to include `subscription` (reserved, guarded off);
  keep `unset` sentinel. Type-only.
- Confirm `actions/clients.ts:addClient` already honors `§2` (it does — verified). No behavior change.
- This document + (recommended) promotion to `ADR-BILL-001`, indexed in Handbook `14`.

### Phase B — Production-hardening soon (schema + ERP, each approval-gated)

- `lib/db/schema.ts` — add **CHECK constraints** to existing enum columns (`billing_mode`, statuses);
  add `package_template` and `client_package_purchase` tables (tenant-scoped) — `§7`, `§8`.
- `package_ledger` table — **append-only**, with an **idempotency key** column; balance is a derived
  view/projection, never an authoritative counter (`§5.3`, `§6`, `§8`).
- Package assignment workflow (server action) — creates the **Sales Invoice on explicit trainer
  confirmation** (`§4`), through the existing `addInvoice` / `submitSalesInvoice` path.
- PT Session DocType resolution (Handbook `09` Open Decisions 1/4/5) is a **precondition** for any
  completion-driven billing (`session_consumed`, PPS invoice-on-completion).
- Refund path via **Credit Note** (`§9`).

### Phase C — Future platform later (separate planning + approval)

- Subscriptions; automated revenue recognition (Journal Entry); breakage/`expiration_sweep`; wallet;
  package sharing/family/corporate; webhook-based ERP→local reconciliation; direct ERP Item creation.

---

## 13. Acceptance criteria

Plain-English and Gherkin-style criteria for the MVP-relevant behaviors. (Gherkin describes target
behavior; `completed`/`session_consumed` scenarios assume the deferred preconditions in `§3`/`§4`.)

### 13.1 Add Client — `pay_per_session`

Plain: Adding a PPS client creates an ERP Customer and a local projection, captures the billing mode,
and creates **no** financial documents.

```gherkin
Scenario: Add a pay-per-session client creates no money
  Given a trainer adds a client with billing_mode "pay_per_session"
  When the Add Client action completes successfully
  Then an ERP Customer is created via the approved proxy path
  And a local client_index row is created with billing_mode "pay_per_session"
  And no Sales Invoice is created
  And no Payment Entry is created
  And no package credit is granted
  And no ledger entry is written
  And no session is created
```

### 13.2 Add Client — package preference

Plain: Adding a package-mode client captures the preference only; no package is assigned, invoiced, or
credited at creation.

```gherkin
Scenario: Add a package client captures preference only
  Given a trainer adds a client with billing_mode "package"
  When the Add Client action completes successfully
  Then an ERP Customer is created via the approved proxy path
  And the local client_index row records billing_mode "package"
  And no package is assigned to the client
  And no Sales Invoice is created
  And no package credit is granted
  And no ledger entry is written
```

### 13.3 Package assignment creates an ERP Sales Invoice only after confirmation

Plain: A package invoice exists only after the trainer explicitly confirms the assignment.

```gherkin
Scenario: Package assignment is confirmation-gated
  Given a package-mode client with no assigned package
  And the trainer selects a catalog template to assign
  When the trainer has not yet confirmed
  Then no Sales Invoice exists for the package
  When the trainer explicitly confirms the assignment
  Then exactly one ERP Sales Invoice is created via the approved proxy path
  And the client_package_purchase row references that Sales Invoice docname
```

### 13.4 No package counter mutation

Plain: Assigning or consuming never writes an authoritative mutable balance counter.

```gherkin
Scenario: Balance is ledger-derived, not a counter
  Given a client with an assigned package
  When credits are granted or consumed
  Then the remaining balance is derived from the append-only package_ledger
  And no authoritative remaining_sessions counter is incremented or decremented
  And any cached balance is rebuildable from the ledger
```

### 13.5 No duplicate invoice on repeated submit

Plain: Submitting/assigning twice (double-click, retry) yields one invoice, not two.

```gherkin
Scenario: Idempotent invoice submission
  Given a package assignment that created Sales Invoice "SINV-A"
  When the same assignment submit is repeated with the same idempotency key
  Then no second Sales Invoice is created
  And the operation resolves to the existing "SINV-A"
```

### 13.6 No credit deduction before an idempotent ledger exists

Plain: Until the append-only, idempotent ledger exists, completion/late-cancel deduct nothing.

```gherkin
Scenario: Consumption is blocked without an idempotent ledger
  Given the append-only idempotent package_ledger is not yet implemented
  When a package client's session reaches "completed"
  Then no package credit is consumed
  And no session_consumed ledger event is written
  And the session completion remains status-only

Scenario: Early cancellation never recognizes revenue
  Given a scheduled session for any billing mode
  When the session transitions to "cancelled_early"
  Then no Sales Invoice is created
  And no package credit is consumed
  And no revenue is recognized
```

---

## 14. Rollback strategy

### 14.1 This task (documentation-only)

- **Rollback = delete the file** `docs/architecture/FITDESK_BILLING_PACKAGE_ERP_DECISION.md`
  (and revert its index entry if one is later added). No runtime, schema, or data effect.
- **No data-destructive rollback** is involved — this task writes no data and no migration.
- **No production rollback** — this task must not deploy, so there is nothing deployed to roll back.
- The two local commits (`bf62ec9`, `fc1c1c8`) are untouched and remain unpushed.

### 14.2 Later implementation rollback expectations (for Phases A–C)

- **Additive, reversible migrations only.** Every enum-widening or table-adding migration ships with a
  tested **down-migration**; no destructive rewrite of existing `billing_mode`/status columns.
- **Append-only ledger** means corrections are new rows (`refund_credit`, reversing entries), never
  deletes — so "rollback" of a financial mistake is a compensating entry, preserving the audit trail.
- **ERP documents are never hard-deleted.** A submitted Sales Invoice is corrected via **Credit Note**
  (`§9`), never edited or deleted in place.
- **No data-destructive rollback** of tenant financial data; **no production rollback** without
  explicit approval and a read-only-first diagnosis (`CLAUDE.md §7`, `§9`).

---

## Open decisions

1. **Promote to `ADR-BILL-001`?** Recommended; pending product-owner confirmation of this document.
2. **PT Session DocType identity (PT vs FD Session)** — blocks all completion-driven billing
   (`session_consumed`, PPS invoice-on-completion). Owned by Handbook `09` (Open Decisions 1/4/5).
3. **`Trial` ERP option** ↔ `complimentary`/comp template reconciliation (`§5.6`).
4. **Idempotency key shape** for invoice submission and ledger consumption (`§6`, `§13.5`).
5. **Catalog versioning vs immutability** — pick one strategy before first sale (`§7`).
6. **When to flip from `unset`** — UX for requiring a billing mode before any billable action.

## Verification checklist (for any future billing implementation)

- [ ] All ERP I/O via `erp-adapter` → `erpFetch()` → proxy; no new ERP client; no creds; no proxy bypass.
- [ ] Add Client creates no invoice/payment/credit/ledger/session/WhatsApp side effect.
- [ ] Enum columns have both a TS const-array union **and** a DB CHECK constraint.
- [ ] Ledger is append-only; all financial writes carry an idempotency key.
- [ ] No authoritative mutable balance counter; balance derives from the ledger.
- [ ] `cancelled_early` recognizes no revenue; `cancelled_late` consumes only via the idempotent ledger.
- [ ] Zero-value `complimentary`/`promotional` templates inject no revenue.
- [ ] Migrations are additive with tested down-migrations; no destructive rewrites.

## Related files (read-only references)

- `lib/erpnext/client.ts` (`erpFetch`, `DOCTYPE`, `createClient`, `createInvoice`,
  `submitSalesInvoice`, `createAndSubmitPaymentEntry`, session stubs `372–416`),
  `lib/erpnext/types.ts` (`CreateClientPayload.custom_billing_mode`, `CreateInvoiceItem.item_code`).
- `actions/clients.ts:addClient`, `lib/clients/create-draft.ts`, `lib/clients/repository.ts`,
  `types/clients.ts` (`BillingMode`, `PaymentSummary`), `lib/db/schema.ts` (`client_index.billing_mode`).
- `actions/invoices.ts`, `actions/sessions.ts`, `lib/payments/methods.ts`, `lib/invoices/status.ts`,
  `types/index.ts` (`SessionStatus`, `InvoiceStatus`).

## Related ADRs / docs

- `ADR-001` (ERP-authoritative client model — controlling).
- Handbook `08` (ERP integration boundary), `09` (Scheduling — Billing & Session Outcome Contract),
  `10` (Client Management), `14` (ADR index — recommends `ADR-BILL-001`).

## Next actions

- Obtain product-owner confirmation of this document; then (recommended) promote to `ADR-BILL-001`.
- Resolve the PT Session DocType decision (Handbook `09`) before any completion-driven billing.
- Sequence Phase A (no-schema) work; gate Phases B/C on explicit per-step approval.
