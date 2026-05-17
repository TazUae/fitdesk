# FitDesk Client Billing + Invoice/Payment UX Master Plan

## 1. Executive Summary

FitDesk is moving to a **trainer-first, business-event-driven billing model**. The agreed product direction:

- **Trainers never manually create invoices.** The "create invoice" mental model and the ERPNext vocabulary (Sales Invoice, Payment Entry, Payment Request, Mode of Payment) disappear from the normal trainer flow.
- **Invoices are created automatically from real business events** — selling a package, or completing a pay-per-session session. The trainer's action is "sell a package" or "complete a session," not "issue an invoice."
- **Client creation must capture the commercial agreement.** Today a new client is just an ERPNext Customer with no billing intent. Going forward, every client is created with an explicit `custom_billing_mode` (Package / Pay Per Session / Trial) and the agreed commercial terms (package balance or agreed session price).
- **ERPNext remains the financial/accounting engine in the background.** Every invoice and payment still becomes a real ERPNext Sales Invoice / Payment Entry. FitDesk is the trainer-facing experience layer; ERPNext stays the source of truth for money. FitDesk never writes directly to ERPNext databases and never bypasses the Control Plane / adapter layer.
- **Messaging stays preview-and-approval gated.** Payment links and WhatsApp reminders are always previewed; nothing is sent without an explicit trainer tap. Pilot-mode allowlisting remains in force.

The outcome: a trainer can onboard a client and have correct money state (package balance set, package invoice raised, or pay-per-session rate stored) in the **same flow as creating the client**, with zero accounting vocabulary.

---

## 2. Current State Summary

### 2.1 Client creation
- Route: `/dashboard/clients/new` — `app/dashboard/clients/new/page.tsx`. It is a **full-page form**, not a bottom sheet.
- Entry point: the "Add" button in `components/modules/ClientsView.tsx` links to that route.
- Fields collected today: `customer_name`, `mobile_no`, `custom_fitness_goals`, age/DOB (folded into notes), `custom_blood_type`, `custom_emergency_contact_name`, `custom_emergency_contact_phone`, `custom_trainer_notes`.
- **No billing-mode choice exists.** The form creates only an ERPNext Customer.
- Submit calls `addClient()` (`actions/clients.ts:58`) → `createClient()` (`lib/erpnext/client.ts:338`) → `POST /api/resource/Customer`.
- `CreateClientPayload` (`lib/erpnext/types.ts:124`) **does** support `custom_package_type`, but the new-client form never sends it. Only the edit form (`app/dashboard/clients/[id]/edit/page.tsx`) exposes it.
- Success view already deep-links to "Book a session" and "Send payment link" (`/dashboard/invoices/new`).

### 2.2 Customer fields
- Provisioned on Customer today (via `provisioning_api/provisioning_api/api/fitdesk_setup.py`, `_CUSTOM_FIELDS` ~lines 171–184): `custom_fitness_goals`, `custom_trainer_notes`, `custom_package_type` (Select: Per Session / Monthly / Package), `custom_remaining_sessions` (Int).
- **Do not exist:** `custom_billing_mode`, `custom_default_session_rate`, `custom_package_name`, `custom_package_expiry_date`.

### 2.3 Package fields
- `custom_package_type` exists and is read/written by the edit form only.
- `custom_remaining_sessions` exists and is **read-only in FitDesk** — surfaced by the `PackageBalanceGate` component. FitDesk **cannot currently write or decrement it**; no `decrementRemainingSessions` logic exists; `updateClient()` is never called with a balance patch.

### 2.4 Invoice / session completion behavior
- `completeSession()` (`lib/scheduling/sessionService.ts:210`) **unconditionally creates a draft Sales Invoice** on completion (unless the session already has an `invoiceId`, in which case it reuses it). Item code `TRAINING-SESSION`, `rate = session.rate`.
- It is wrapped by `completeSessionAction()` (`actions/schedulingActions.ts:295`).
- FD Session is a custom doctype (`provisioning_api/.../doctype/fd_session/fd_session.json`) with `rate` (Currency, required), `session_type`, `invoice_id`, `version`, `status`.
- `rate` is set at booking time from trainer input with **no validation** — it can be `0`.
- `issueInvoice()` (`actions/invoices.ts:400`) creates a draft then finalizes it. Manual invoice page exists at `/dashboard/invoices/new` (`app/dashboard/invoices/new/page.tsx`) with a default line item rate of `0`.
- Invoice list (`components/modules/InvoicesView.tsx`) has tabs: **Outstanding / Paid / All**.
- Session→invoice link: `invoice_id` on FD Session. Invoice→session link: **none** — only a `remarks` string `FitDesk session {id}`. Sales Invoice does have `custom_session_date`/`custom_session_time`/`custom_no_show` custom fields provisioned, but no session-id link field.

### 2.5 Payment actions
- `collectPayment()` (`actions/invoices.ts:328`) finalizes a draft if needed, then records a Payment Entry via `createAndSubmitPaymentEntry()` (`lib/erpnext/client.ts:571`).
- `PaymentMethod` (`lib/payments/methods.ts:12`): `'cash' | 'whish_money' | 'omt'`; enabled = cash + whish_money; omt disabled pending provisioning.
- `PaymentProvider` (`lib/whish.ts:28`, `types/index.ts:20`): `'whish' | 'cash' | 'bank_transfer'`. **PaymentMethod and PaymentProvider are separate, not unified** — bridged ad hoc by `modeToProvider()`.
- Whish link generation (`lib/whish.ts:96`) is a **mock**, not production-ready; gated by a documented pilot-mode contract.
- ERPNext **Payment Request is not used anywhere.**

### 2.6 WhatsApp / message approval behavior
- `generateDraftMessage()` (`actions/messages.ts:84`) produces a previewable draft; `sendMessage()` (`actions/messages.ts:151`) sends only on explicit trainer action.
- Preview banner + confirmation modal in `components/modules/MessagesView.tsx`. Financial drafts always require confirmation; pilot mode requires confirmation for all.
- Pilot allowlist check blocks non-allowlisted numbers before reaching Evolution API. **No auto-send anywhere.**

### 2.7 Current risks
- **0-rate sessions**: a session booked with `rate = 0` silently produces a 0-value invoice on completion.
- **Package balance never decremented**: package clients' `custom_remaining_sessions` only goes down if edited manually in ERPNext — FitDesk shows a stale balance.
- **Unconditional invoicing**: package clients get a *new* draft Sales Invoice every completed session even though the session is already pre-paid via the package — double billing.
- **No billing intent on clients**: every existing client lacks `custom_billing_mode`, so the system cannot tell a package client from a pay-per-session client.

---

## 3. Target UX Principles

1. **Trainer language, not ERPNext language.** "Sell a package," "Agreed price per session," "Mark paid," "Send reminder." Never "Sales Invoice," "Payment Entry," "Mode of Payment."
2. **Minimum clicks.** Onboarding a client + setting up billing is one continuous flow. Completing a session is one tap for the common case.
3. **Business-event-driven invoicing.** Invoices are a side effect of selling a package or completing a paid session — never a thing the trainer "makes."
4. **Bottom sheet where appropriate.** Use the existing portal-based sheet pattern (`UserMenuSheet`, `BookingSheet`) for fast, focused decisions: billing setup, payment status, sell-package, complete-session. Keep full pages for list/detail surfaces.
5. **Progressive disclosure.** Show the simple path first (paid now / pay later). Reveal payment links, partial payments, references, and method-specific fields only when chosen.
6. **No auto-send WhatsApp.** Every reminder/link is preview → explicit tap. Pilot allowlist stays.
7. **No accounting terminology in the normal trainer flow.** Accounting surfaces (raw invoice list, manual invoice creation) are de-emphasized, not central.

---

## 4. Improved Client Creation Flow

The new-client experience becomes a short multi-step flow. Recommended: keep a route for deep-linkability but render it as a stepped bottom sheet on the clients list using the existing portal sheet pattern (mirrors `BookingSheet`). Two steps for trial, three for package/pay-per-session.

### 4.1 Add Client — Basic Info Step
Fields (mostly unchanged from today):
- Name (required)
- Phone (required)
- Email (optional)
- Goals (optional)
- Notes (optional)
- Emergency / medical optional fields (collapsed by default — already exists)

No accounting fields here. Continue → Billing Setup.

### 4.2 Add Client — Billing Setup Step
A single, three-option choice — large tappable cards:

| Choice | Meaning to trainer |
|---|---|
| **Package** | "Client bought a block of sessions." |
| **Pay Per Session** | "Client pays each time." |
| **Trial / Decide Later** | "Just trying it out — set this up later." |

This selection sets `custom_billing_mode`. The next step is conditional on this choice.

### 4.3 Package Client Flow
Step 3 fields:
- Package name / type
- Number of sessions
- Package price
- Optional expiry date (only if recommended — see §15 open question)
- Payment status: **Paid now** / **Pay later** / **Send payment link**

System behavior:
1. Create Customer.
2. Set `custom_billing_mode = "Package"`.
3. Set `custom_remaining_sessions` = number of sessions; set `custom_package_name` (and keep/replace `custom_package_type`).
4. **Create the package invoice automatically** (one Sales Invoice for the whole package, item e.g. `TRAINING-PACKAGE`, qty/rate per the package price).
5. If **Paid now** → record a Payment Entry against that invoice (reuse `collectPayment`/`recordPayment`).
6. If **Pay later** → invoice stays outstanding; appears in the Money tab "To Collect."
7. If **Send payment link** → generate link, open WhatsApp preview (no auto-send).
8. Show success state with remaining-sessions badge and quick actions ("Book a session").

### 4.4 Pay-Per-Session Client Flow
Step 3 fields:
- Agreed session price (required — this closes the 0-rate gap)
- Optional default payment method

System behavior:
1. Create Customer.
2. Set `custom_billing_mode = "Pay Per Session"`.
3. Store `custom_default_session_rate` = agreed price; optionally `custom_default_payment_method`.
4. **No invoice created at client creation.**
5. Future booked sessions inherit `custom_default_session_rate` as their `rate` (trainer can still override per session, but the field is pre-filled, never blank/zero).
6. Completed sessions create the session invoice automatically (see §6.2).

### 4.5 Trial / Decide Later Flow
System behavior:
1. Create Customer.
2. Set `custom_billing_mode = "Trial"`.
3. No invoice, no package balance, no default session price.
4. **Guard:** before a *paid* session can be completed for a Trial client, FitDesk must require the trainer to run Billing Setup first (see §6.3). A genuinely free trial session can be completed with no invoice.

---

## 5. Existing Client Billing Changes

These flows live on the **client detail page** (`app/dashboard/clients/[id]/page.tsx`) as a "Billing" section, opening the same billing-setup sheet from §4.2.

1. **Trial → Package** — Run Package setup: set `custom_billing_mode = "Package"`, set `custom_remaining_sessions`, create package invoice, handle paid/later/link. Identical to §4.3 minus customer creation.
2. **Trial → Pay Per Session** — Set `custom_billing_mode = "Pay Per Session"`, store `custom_default_session_rate`. No invoice. Future sessions inherit the rate.
3. **Pay Per Session → Package** — Switch `custom_billing_mode` to Package, set balance, create package invoice. Any already-outstanding pay-per-session invoices remain as-is (they were real, separate sessions). Future sessions consume the package balance instead of invoicing.
4. **Package renewal / new package purchase** — A "Sell package" action: creates a new package invoice and **adds** to `custom_remaining_sessions` (top-up, not overwrite). Handle paid/later/link as §4.3.
5. **Package depleted → renew or switch** — When balance hits 0, the package-balance gate prompts: "Renew package" (→ flow 4) or "Switch to Pay Per Session" (→ set mode + default rate). The trainer is never silently allowed to keep completing free sessions.
6. **Client-specific price change** — Editing `custom_default_session_rate` changes the inherited rate for *future* sessions only. Already-booked sessions keep their stored `rate` unless individually edited. No retroactive invoice changes.

Principle for all six: **changing billing mode never mutates existing invoices.** Past invoices are accounting history. Only future sessions/balances change behavior.

---

## 6. Session Completion Flows

`completeSession()` (`lib/scheduling/sessionService.ts:210`) gains a **billing branch keyed on the client's `custom_billing_mode`**, replacing today's unconditional invoice creation.

### 6.1 Package Client Completes Session
- Trainer taps **Complete**.
- FitDesk **decrements `custom_remaining_sessions` by 1** via a dedicated balance-decrement service (see §11).
- **No new invoice** — the package invoice already covered this session.
- Success state shows remaining sessions (e.g. "4 sessions left").
- Low balance (e.g. ≤2) → show a gentle "Time to renew?" hint.
- Zero/over-draw balance → block completion as a package session; prompt renew or switch (§5 flow 5).
- **Concurrency:** decrement must use optimistic concurrency (FD Session already has a `version` field; the Customer balance write needs an analogous guard — see §12).

### 6.2 Pay-Per-Session Client Completes Session
- Trainer taps **Complete**.
- FitDesk **creates the session invoice automatically** (reusing today's `createInvoice` path, item `TRAINING-SESSION`, `rate` from the session, which is now guaranteed non-zero because it inherited `custom_default_session_rate`).
- Trainer then picks payment status in the same sheet: **Paid now** / **Pay later** / **Send payment link**.
  - **Paid now** → record Payment Entry (`collectPayment`/`recordPayment`).
  - **Pay later** → invoice stays outstanding → Money tab.
  - **Send link** → generate link → WhatsApp preview (no auto-send).
- Idempotency preserved: if the session already has `invoiceId`, reuse it.

### 6.3 Trial Client Completes Session
- **Free trial session** → mark complete, no invoice, no balance change.
- **Paid session for a Trial client** → **block completion** and surface "Set up billing first," opening the §4.2 billing-setup sheet. Once the client has a real billing mode, completion proceeds down the package or pay-per-session branch.

A session needs an explicit "is this a free trial session?" signal so 6.3 can distinguish the two cases — see §9 / §15.

---

## 7. Invoice and Payment UX

### 7.1 Tab name
Rename the trainer-facing surface from **Invoices** to **Money**. "Money" matches trainer mental model ("what do I need to collect / what have I collected"); "Invoices" is accounting language. The route can stay `/dashboard/invoices` internally; only the label changes.

### 7.2 Manual invoice page
**Keep, but hide from the normal trainer flow** (do not delete). Recommendation:
- Remove the "Add invoice" entry point from the Money tab and the client success screen's "Send payment link" deep-link to `/dashboard/invoices/new`.
- Keep `/dashboard/invoices/new` reachable as an **admin/fallback** route (e.g. behind a settings/advanced area) so support can still raise a one-off invoice during the pilot.
- This is a UI-only change — the `issueInvoice` action stays intact.

### 7.3 Tabs within Money
- **To Collect** (outstanding: sent / partially paid / overdue — overdue first) — the default tab.
- **Drafts** (status `draft`) — recovery surface for invoices whose finalize/payment step failed; should be near-empty in healthy operation.
- **Paid**.
- **All**.

(Today's tabs are Outstanding / Paid / All; this adds an explicit Drafts recovery tab.)

### 7.4 Cards
- Invoice/payment card: client avatar + name, amount, due date, status badge, and — new — a small label distinguishing **Package** vs **Session** invoices (see §9 invoice-type field).
- Outstanding cards keep the existing "Record payment" + "Send" actions, relabeled to trainer language ("Mark paid", "Send reminder").

### 7.5 Payment chips
Replace the method dropdown in `RecordPaymentForm` with tappable chips: **Cash · Whish · OMT · Bank Transfer · Payment Link**.
- For MVP only **Cash** and **Whish** are enabled (matches current `enabledPaymentMethods()`); OMT and Bank Transfer are shown disabled/"coming soon"; Payment Link routes to the link/preview flow.
- This requires unifying `PaymentMethod` and `PaymentProvider` (see §11) so one chip set drives both recording and link generation.

### 7.6 Partial payment
- The chip flow allows entering an amount less than the balance; ERPNext already reports `partially_paid`. The card shows "owed {remaining}" (already supported). No new accounting logic — just clear UX for entering a smaller amount.

### 7.7 Failed / needs-review states
- If finalize succeeds but payment fails (or vice versa), the invoice lands in **Drafts** or **To Collect** with a "Needs review" badge. The trainer gets a retry affordance; FitDesk never silently double-charges (idempotency via existing `invoiceId` reuse).

### 7.8 Receipts and reminders
- After a payment is recorded, offer "Send receipt" → WhatsApp preview (reuses `generateDraftMessage` type `invoice`).
- Reminders for outstanding invoices reuse the `reminder` draft type, preview-gated.

---

## 8. WhatsApp and Payment Link UX

- **Payment reminder preview**: trainer picks an outstanding invoice → "Send reminder" → `generateDraftMessage('reminder')` → editable preview in `MessagesView`.
- **Copy link**: when a payment link exists, offer "Copy link" so the trainer can paste it anywhere.
- **Send WhatsApp**: explicit tap → `sendMessage()` → Evolution API. Confirmation modal for financial drafts (already enforced).
- **Later**: every preview sheet has a "Later" / dismiss option; nothing is sent.
- **Approval-gated send**: unchanged — no message leaves FitDesk without a trainer tap.
- **Pilot-mode constraints**: pilot allowlist (`matchAllowlist`) keeps blocking non-allowlisted destinations; future external Whish POSTs stay behind `isExternalPaymentsAllowed()`.
- **No auto-send rule**: package-sale links, session-completion links, and reminders are all preview-first. The system may *prepare* a draft automatically, but never sends it.

---

## 9. Required Data Model Enhancements

### Customer fields
| Field | Status | Recommendation |
|---|---|---|
| `custom_billing_mode` | **New** | Select. Required. Drives all branching. |
| `custom_default_session_rate` | **New** | Currency. Pay-per-session agreed price. |
| `custom_default_payment_method` | **New (optional)** | Data/Select. Nice-to-have; low priority — can defer. |
| `custom_remaining_sessions` | Exists (read-only) | **Add write support** in FitDesk (decrement + top-up). |
| `custom_package_name` | **New** | Data. Human label for the active package. |
| `custom_package_expiry_date` | **New (optional)** | Date. Recommend **defer to Later** unless trainers ask. |
| `custom_package_type` | Exists | **Keep** as descriptive label; `custom_billing_mode` is the new authoritative branching field. Do not remove yet (existing edit form + provisioning depend on it). |

`custom_billing_mode` values — recommend exactly: **`Package` / `Pay Per Session` / `Trial`** (see §15 for approval).

### Session (FD Session) fields
- `rate` — keep, but it must always be populated. For pay-per-session it inherits `custom_default_session_rate` at booking. Add a non-zero guard before completion-invoicing.
- **Source of rate**: pre-filled from client default; trainer override allowed.
- **Package consumption link**: optional `custom_consumed_package` / boolean — not strictly required for MVP if completion simply decrements the Customer balance. Recommend a lightweight boolean `session_consumed_package` for auditability/idempotency (so re-completing doesn't double-decrement).
- **Free-trial marker**: add `is_trial_session` (Check) so §6.3 can tell a free trial session from a billable one.
- `invoice_id` — keep; only set for pay-per-session completions now.

### Invoice / payment fields
- **Invoice→session link**: add a `custom_fd_session` field on Sales Invoice (currently only a `remarks` string). Improves reconciliation.
- **Package vs session invoice distinction**: add `custom_invoice_kind` (Select: `Package` / `Session`) on Sales Invoice — drives the card label in §7.4 and prevents package clients getting session invoices.
- **Paid date accuracy**: rely on the Payment Entry `payment_date` (already passed through `collectPayment`).
- **Payment method tracking**: already on Payment Entry via `mode_of_payment`.
- **Payment provider / link tracking**: `custom_payment_link` and `custom_payment_reference` already exist on Sales Invoice — reuse them; no new fields needed.

### Package model
**MVP: use Customer fields only** (`custom_billing_mode`, `custom_remaining_sessions`, `custom_package_name`, optional expiry). Do **not** introduce a separate Package/Subscription doctype now — it is overbuild for the pilot. Revisit a package-catalog doctype only when multiple named packages with fixed pricing and renewals/subscriptions are needed (Later phase).

---

## 10. ERPNext and Provisioning Implications

- **Required new Customer custom fields**: `custom_billing_mode`, `custom_default_session_rate`, `custom_package_name` (and optionally `custom_default_payment_method`, `custom_package_expiry_date`).
- **Already exist**: `custom_package_type`, `custom_remaining_sessions`, `custom_fitness_goals`, `custom_trainer_notes` (Customer); `custom_session_date`, `custom_session_time`, `custom_no_show`, `custom_whatsapp_sent`, `custom_payment_link`, `custom_payment_reference` (Sales Invoice).
- **Need provisioning via `fitdesk_setup.py`**: all new fields above must be added to the `_CUSTOM_FIELDS` list in `provisioning_api/provisioning_api/api/fitdesk_setup.py`, and the expected count + `verify_fitdesk_schema()` updated (today it expects 10). New Sales Invoice fields `custom_fd_session` and `custom_invoice_kind` go here too. **This is approval-gated** (ERPNext DocType/field changes per CLAUDE.md §4).
- **FD Session field additions** (`is_trial_session`, `session_consumed_package`) modify the FD Session doctype JSON in `provisioning_api/.../doctype/fd_session/` — also **approval-gated**.
- **Payload types / adapters that must change**: `CreateClientPayload` (`lib/erpnext/types.ts:124`) and the `Client` normalizer/`clientFields()` in `lib/erpnext/client.ts` to carry the new fields; `addClient` (`actions/clients.ts`); a new `updateClient`-based balance writer; `completeSession` billing branch.
- **Approval-gated areas**: all ERPNext field/doctype changes, provisioning script changes, anything touching payment writes, WhatsApp send behavior.
- **Safe UI-only changes**: the billing-setup step UI, the Money tab rename, payment chips, hiding the manual-invoice entry point, preview sheets.
- **Accounting-isolated changes**: automatic package-invoice creation and session-invoice gating change *when* invoices are created — these must be carefully isolated, tested against a test tenant, and never run against production data without approval. ERPNext stays the source of truth; FitDesk only triggers documented create/submit calls.

---

## 11. Backend / Action Architecture

Recommended actions/services — favor **composition over new monoliths**, reusing existing pieces:

| Proposed | Verdict | Notes |
|---|---|---|
| `createClientWithBillingSetup` | **Yes** — thin orchestrator | Composes existing `addClient` + (conditionally) `sellPackageToClient`. Keeps client creation atomic-ish. |
| `sellPackageToClient` | **Yes** | Sets billing mode + balance + creates package invoice. Reuses `createInvoice`/`issueInvoice`. Used by both new-client and existing-client renewal. |
| `activatePackage` | **Merge into `sellPackageToClient`** | A separate "activate" step is unnecessary for MVP. |
| `completeSession` billing branch | **Yes** | Extend existing `completeSession` (`sessionService.ts:210`) with the mode switch — do not fork a new function. |
| `recordPackagePayment` | **Reuse `collectPayment`/`recordPayment`** | A package invoice is just a Sales Invoice; existing payment recording works. No new action. |
| `recordSessionPayment` | **Reuse `collectPayment`** | Same. |
| Unified payment registry | **Yes** | Unify `PaymentMethod` (`lib/payments/methods.ts`) and `PaymentProvider` (`lib/whish.ts`) into one registry so the §7.5 chips drive both recording and link generation. Do this before building final chips. |
| `decrementRemainingSessions` service | **Yes** | New, small, single-purpose. Reads balance, decrements, writes via `updateClient` with concurrency protection. |
| Concurrency/locking strategy | **Yes** | See §12. |

**Reuse map**: `addClient`, `issueInvoice`/`createInvoice`, `collectPayment`/`recordPayment`, `createAndSubmitPaymentEntry`, `generateDraftMessage`, `sendMessage`, the portal sheet pattern (`BookingSheet`), `PackageBalanceGate`. The only genuinely new building blocks are `sellPackageToClient`, `decrementRemainingSessions`, the `completeSession` branch, and the unified payment registry.

---

## 12. Concurrency, Accounting, and Safety Risks

| Risk | Mitigation |
|---|---|
| **Double-spending package sessions** (two completions decrement past 0) | Optimistic concurrency on the Customer balance write: read `custom_remaining_sessions` + a version/modified token, decrement, write conditionally; retry on conflict. Also gate on `session_consumed_package` so a session can only consume once. |
| **Lost balance updates** (concurrent writes overwrite) | Same conditional write; never blind-set the balance. Top-ups (renewals) use read-add-write under the same guard. |
| **Invoice created but payment entry fails** | Invoice stays as draft/outstanding in the Drafts/Needs-review tab; trainer retries payment. Never auto-retry. |
| **Session completed but invoice fails** | Today's order (invoice before status flip) is preserved — session stays mutable/retryable. Keep that. |
| **Payment recorded but invoice still outstanding** | Re-fetch invoice after payment (already done by `recordPayment`); surface "Needs review" if not reconciled. |
| **0-rate session** | Fixed at source: pay-per-session sessions inherit non-zero `custom_default_session_rate`; add a guard that refuses to auto-invoice a 0-rate session and prompts the trainer. |
| **Existing clients missing billing mode** | Backfill (see below); until backfilled, treat null `custom_billing_mode` as "needs setup" and prompt before any paid completion. |
| **Migration / backfill** | One-off, approval-gated backfill: infer mode from existing data — clients with `custom_remaining_sessions > 0` → Package; others default to a safe "needs review" state rather than guessing Pay Per Session. Run against a test tenant first. |
| **Idempotency** | Package invoice creation keyed so re-running a sale doesn't double-invoice; session completion reuses existing `invoiceId`; balance decrement gated by `session_consumed_package`. |
| **Rollback / recovery** | Each phase is a small commit boundary (§13). The Drafts/Needs-review tab is the human recovery surface. No destructive operations; ERPNext records are append-only history. |

---

## 13. Recommended Phased Roadmap

### Phase A — Planning / Decisions
- **Goal**: finalize §15 open questions; sign off field names, billing-mode values, MVP scope.
- **Files**: none (this document).
- **Risks**: none.
- **Tests**: none.
- **Approval gates**: product sign-off on data model + UX.
- **Commit boundary**: docs only (this report).

### Phase B — Data Model / Provisioning
- **Goal**: add the new Customer / Sales Invoice / FD Session custom fields; update payload types and adapters; backfill existing clients.
- **Files**: `provisioning_api/.../fitdesk_setup.py`, `provisioning_api/.../doctype/fd_session/*`, `lib/erpnext/types.ts`, `lib/erpnext/client.ts`, `actions/clients.ts`.
- **Risks**: ERPNext schema change; backfill correctness.
- **Tests**: schema verification (`verify_fitdesk_schema` updated count); adapter unit tests; backfill dry-run on a test tenant.
- **Approval gates**: **Required** — ERPNext DocType/field changes, provisioning, migration/backfill.
- **Commit boundary**: one commit for provisioning + schema, one for adapter/type changes, one for backfill script.

### Phase C — Client Creation UX
- **Goal**: add the billing-setup step (Basic Info → Billing Setup → mode-specific step); write `custom_billing_mode` and `custom_default_session_rate`. **No payment-link integration yet** — paid-now/pay-later only.
- **Files**: `app/dashboard/clients/new/page.tsx`, new billing-setup sheet component, `actions/clients.ts` (`createClientWithBillingSetup`).
- **Risks**: regression in existing client creation.
- **Tests**: client-creation flow tests for all three modes; lint + build.
- **Approval gates**: none beyond Phase B (UI-only once fields exist).
- **Commit boundary**: one commit.

### Phase D — Package Sale + Automatic Package Invoice
- **Goal**: `sellPackageToClient` — set balance, auto-create package invoice, support paid-now / pay-later.
- **Files**: new `sellPackageToClient` action, `actions/invoices.ts` reuse, client detail page "Sell package".
- **Risks**: accounting — auto invoice creation.
- **Tests**: package-sale tests against test tenant; idempotency test; paid/later branches.
- **Approval gates**: **Required** — payment/accounting behavior.
- **Commit boundary**: one commit.

### Phase E — Session Completion Billing Branch
- **Goal**: `completeSession` branches on `custom_billing_mode` — package decrements balance (no invoice); pay-per-session auto-invoices; trial guarded.
- **Files**: `lib/scheduling/sessionService.ts`, `actions/schedulingActions.ts`, new `decrementRemainingSessions` service.
- **Risks**: concurrency on balance; behavior change to a core flow.
- **Tests**: completion tests for each mode; concurrency/double-decrement test; 0-rate guard test.
- **Approval gates**: **Required** — changes accounting + core flow.
- **Commit boundary**: one commit (balance service), one commit (completion branch).

### Phase F — Payment UX Polish
- **Goal**: Money tab rename, Drafts tab, payment chips, unified payment registry, reminders, partial payment UX; hide manual-invoice entry point.
- **Files**: `components/modules/InvoicesView.tsx`, `RecordPaymentForm.tsx`, `lib/payments/methods.ts` + `lib/whish.ts` unification, `MessagesView.tsx`.
- **Risks**: payment registry refactor touching two abstractions.
- **Tests**: payment recording per chip; partial payment; lint + build.
- **Approval gates**: payment-method changes — confirm with user.
- **Commit boundary**: one commit registry unification, one commit UI.

### Phase G — Real Payment Link / Whish Integration
- **Goal**: replace the Whish mock with the real API; webhook/status sync; pilot gating.
- **Files**: `lib/whish.ts`, webhook handler, `lib/pilot.ts` gates.
- **Risks**: external payment provider; production money flow.
- **Tests**: sandbox Whish; webhook signature verification; pilot allowlist.
- **Approval gates**: **Required** — external payment integration, pilot gating.
- **Commit boundary**: separate commits for link generation, webhook, gating.

---

## 14. MVP vs Later

**MVP now:**
- `custom_billing_mode` (Package / Pay Per Session / Trial)
- `custom_default_session_rate` on the client
- Package balance stored + **decremented** by FitDesk
- Package invoice auto-created on package sale
- Session invoice auto-created on pay-per-session completion
- Manual paid-now / pay-later
- WhatsApp preview only (links/reminders previewed, never auto-sent)

**Later:**
- Real Whish webhook + status sync
- ERPNext Payment Request (only if ever justified — currently not)
- Package catalog doctype
- Subscriptions
- Package expiry automation
- Advanced reconciliation
- Auto-reminders (scheduled)
- Financial dashboards

---

## 15. Open Questions for Approval

1. **Exact field names** — confirm: `custom_billing_mode`, `custom_default_session_rate`, `custom_package_name`. Optional: `custom_default_payment_method`, `custom_package_expiry_date`.
2. **Billing-mode values** — recommend `Package` / `Pay Per Session` / `Trial`. Approve exact strings (they become ERPNext Select options and are hard to change later).
3. **Package model** — MVP uses Customer fields only; no separate package doctype. Approve.
4. **Keep vs replace `custom_package_type`** — recommend keep as a label, make `custom_billing_mode` authoritative. Approve.
5. **Manual invoice creation** — recommend hide the trainer entry point now, keep the route as admin/fallback; delete later. Approve "hide now, don't delete."
6. **Payment methods for MVP** — recommend Cash + Whish enabled; OMT + Bank Transfer shown disabled. Approve.
7. **Package decrement locking** — recommend optimistic concurrency (version/modified token) + `session_consumed_package` guard. Approve approach.
8. **Migration / backfill** — recommend infer Package from `custom_remaining_sessions > 0`, mark everyone else "needs review" rather than guessing. Approve approach and approve running it (approval-gated).
9. **Package expiry** — recommend **defer to Later** unless trainers explicitly want it. Confirm.
10. **Free-trial session marker** — adding `is_trial_session` to FD Session. Approve (FD Session doctype change is approval-gated).
11. **`completeSession` behavior change** — it currently invoices unconditionally; the new branch changes that for package clients. Confirm this is the intended product change.

---

## 16. Final Recommendation

**Recommended path — one route, no menu of options:**

Build the billing model on **Customer custom fields only** (no package doctype), driven by a new authoritative `custom_billing_mode` field with values `Package` / `Pay Per Session` / `Trial`. Make client creation a short stepped flow (Basic Info → Billing Setup → mode-specific step) rendered as a bottom sheet using the existing portal sheet pattern. Capture the commercial agreement at creation time: package balance for package clients, `custom_default_session_rate` for pay-per-session clients — this directly closes the 0-rate gap.

Make invoicing a **side effect of business events**: `sellPackageToClient` auto-creates the package invoice; `completeSession` gains a mode branch — package completions **decrement the balance with no invoice**, pay-per-session completions **auto-create the session invoice**, trial completions are guarded. Reuse `addClient`, `issueInvoice`/`createInvoice`, `collectPayment`/`recordPayment`, `generateDraftMessage`, `sendMessage` — the only new building blocks are `sellPackageToClient`, `decrementRemainingSessions`, the `completeSession` branch, and a unified payment registry.

Keep the manual invoice page intact but **hidden from the trainer flow** (admin/fallback only) — do not delete it during the pilot. **Do not introduce ERPNext Payment Request** — the Payment Entry workflow already in place is sufficient and simpler. Treat real Whish integration, package catalogs, subscriptions, and expiry automation as explicitly Later. ERPNext stays the financial source of truth throughout; FitDesk only triggers documented create/submit calls and never bypasses the adapter/Control Plane layer.

Sequence the work as Phases A–G, each a small, reversible commit boundary, with **explicit approval gates** before any ERPNext field/doctype change, provisioning change, accounting-behavior change, migration/backfill, and external payment integration. Phase A is this document — finalize §15 before any code is written.

---

## 17. Files Inspected / Files Changed / Tests Run / Recommended Next Step

**Files inspected:**
- `FitDesk/app/dashboard/clients/new/page.tsx`, `FitDesk/app/dashboard/clients/page.tsx`, `FitDesk/app/dashboard/clients/[id]/page.tsx`, `FitDesk/app/dashboard/clients/[id]/edit/page.tsx`
- `FitDesk/components/modules/ClientsView.tsx`, `FitDesk/components/modules/InvoicesView.tsx`, `FitDesk/components/modules/MessagesView.tsx`
- `FitDesk/actions/clients.ts`, `FitDesk/actions/invoices.ts`, `FitDesk/actions/messages.ts`, `FitDesk/actions/schedulingActions.ts`
- `FitDesk/lib/erpnext/client.ts`, `FitDesk/lib/erpnext/types.ts`, `FitDesk/lib/scheduling/sessionService.ts`, `FitDesk/lib/scheduling/sessionRepository.ts`
- `FitDesk/lib/payments/methods.ts`, `FitDesk/lib/whish.ts`, `FitDesk/lib/claude.ts`, `FitDesk/lib/evolution.ts`
- `FitDesk/types/index.ts`, `FitDesk/types/scheduling.ts`
- `FitDesk/app/dashboard/invoices/page.tsx`, `FitDesk/app/dashboard/invoices/new/page.tsx`, `FitDesk/app/dashboard/invoices/[id]/page.tsx`, `FitDesk/app/dashboard/invoices/[id]/pay/RecordPaymentForm.tsx`
- `provisioning_api/provisioning_api/api/fitdesk_setup.py`, `provisioning_api/provisioning_api/api/doctype/fd_session/fd_session.json`, `provisioning_api/provisioning_api/api/doctype/fd_session/fd_session.py`

**Files changed:** none — this is a planning/audit document; no code, ERPNext, provisioning, components, or tests were modified.

**Tests run:** none — planning task only.

**Recommended next step:** Review §15 Open Questions and approve the field names, billing-mode values, and MVP scope (Phase A). Once approved, the ERPNext field additions and provisioning changes in Phase B can be planned in detail — note these are approval-gated per CLAUDE.md before any implementation begins.
