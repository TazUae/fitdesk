# FitDesk Client Billing Data Model Decision Note

> Planning document — Phase A of the FitDesk Client Billing roadmap. No code, ERPNext, or provisioning changes are made here. This note exists to lock the data model **before** any implementation begins.

---

## 1. Purpose

The approved [FitDesk Client Billing Invoice Payment UX Master Plan](./FitDesk%20Client%20Billing%20Invoice%20Payment%20UX%20Master%20Plan.md) sets the product direction: invoices become a side effect of business events (selling a package, completing a paid session), and every client carries an explicit commercial agreement from creation.

That direction requires **new persisted fields** on ERPNext Customer, the FD Session custom doctype, and Sales Invoice. ERPNext field/doctype changes and provisioning changes are **approval-gated** (workspace `CLAUDE.md` §4) and **hard to reverse once tenants are provisioned** — field names and Select option strings become part of every tenant's schema.

This note exists so that, before a single field is provisioned:

- The exact field names, types, and Select values are agreed.
- MVP scope vs. Later scope is explicit (avoid overbuilding).
- The semantics of each billing mode are unambiguous.
- Concurrency, idempotency, and backfill behavior are decided up front.
- The user has one concrete list (§15) to approve.

It is a **decision note**, not an implementation plan. The implementation is Phases B–G of the Master Plan and stays approval-gated.

---

## 2. Approved Product Rules

Confirmed product decisions this model must satisfy:

1. **Trainers do not manually create invoices** in the normal MVP flow.
2. **Invoices are created automatically from business events** — package sold, or pay-per-session session completed.
3. **Client creation captures the commercial agreement** — billing intent and terms are set when the client is created.
4. A **new Customer field `custom_billing_mode`** is the authoritative billing-intent field.
5. The **pay-per-session agreed price is stored on the client**.
6. **Package invoices are created automatically when a package is sold.**
7. **Session invoices are created automatically only when a pay-per-session session is completed.**
8. **Package session completion deducts the package balance and creates no new invoice.**
9. **Manual invoice creation is hidden/de-emphasized, not deleted** (yet).
10. **ERPNext remains the financial source of truth** — FitDesk only triggers documented create/submit calls via the adapter layer.
11. **WhatsApp and payment-link sends remain preview-and-approval gated** — nothing auto-sends.
12. **Real Whish / payment-link integration is a later phase** — MVP uses the existing mock + manual payment recording.

---

## 3. Existing Data Model Summary

Verified against the current working tree (commit `43f8671`).

### 3.1 Customer fields

Provisioned today by `provisioning_api/provisioning_api/api/fitdesk_setup.py` (`_CUSTOM_FIELDS`, lines 171–184):

| Field | Type | Options | Notes |
|---|---|---|---|
| `custom_fitness_goals` | Long Text | — | — |
| `custom_trainer_notes` | Long Text | — | — |
| `custom_package_type` | Select | `Per Session` / `Monthly` / `Package` | Read+written only by the **edit** form |
| `custom_remaining_sessions` | Int | — | **Read-only in FitDesk today** |

**Gaps:** no `custom_billing_mode`, no `custom_default_session_rate`, no `custom_package_name`, no `custom_package_expiry_date`, no `custom_default_payment_method`.

**Pre-existing inconsistency (not in scope here, noted only):** `lib/erpnext/types.ts` declares `custom_blood_type`, `custom_emergency_contact_name`, `custom_emergency_contact_phone` and the new-client/edit forms reference them, but they are **not provisioned** in `fitdesk_setup.py` and **not projected** by `clientFields()` (`lib/erpnext/client.ts:256`, which fetches `name, customer_name, mobile_no, custom_fitness_goals, custom_trainer_notes, custom_package_type, custom_remaining_sessions, creation`). A code comment states the target tenant intentionally does not provision them. This note does **not** change that — flagged for awareness only.

### 3.2 FD Session fields

Custom doctype `provisioning_api/.../doctype/fd_session/fd_session.json`. Full field list:

`trainer_id` (Data, reqd), `client_id` (Link→Customer, reqd), `client_name` (Data, fetch_from), `series_id` (Data), `start_at` / `end_at` (Datetime, reqd), `duration_minutes` (Int, reqd), `timezone` (Data, reqd), `status` (Select: `scheduled`/`confirmed`/`completed`/`cancelled`/`no_show`/`skipped`, reqd, default `scheduled`), `occurrence_key` (Data), `occurrence_index` (Int), `is_override` (Check), **`rate` (Currency, reqd)**, `session_type` (Data), **`invoice_id` (Data)**, **`version` (Int, default 1 — optimistic lock)**, `notes` (Text).

`fd_session.py` `validate()` only enforces occurrence uniqueness — **no rate validation**.

**Gaps:** no trial-session marker, no package-consumption marker. `rate` has no non-zero guard at any layer (HTML `min="0"` only, bypassable).

### 3.3 Sales Invoice fields

Provisioned custom fields: `custom_session_date` (Date), `custom_session_time` (Time), `custom_no_show` (Check), `custom_whatsapp_sent` (Check), `custom_payment_link` (Data), `custom_payment_reference` (Data).

**Gaps:** no invoice→session link field; no package-vs-session invoice-kind field. Session→invoice direction exists via FD Session `invoice_id`; the reverse is only a free-text `remarks` string `FitDesk session {id}`.

### 3.4 Payment method / link fields

- `PaymentMethod` (`lib/payments/methods.ts:12`): `'cash' | 'whish_money' | 'omt'`. Enabled: `cash` + `whish_money`; `omt` disabled.
- `PaymentProvider` (`lib/whish.ts:28`): `'whish' | 'cash' | 'bank_transfer'`. **Separate enum, not unified** with `PaymentMethod`.
- Whish link generation (`lib/whish.ts:96`) is a **mock**. ERPNext **Payment Request is not used**.
- Payment method is tracked on the Payment Entry via `mode_of_payment`; link/reference reuse `custom_payment_link` / `custom_payment_reference` on Sales Invoice.

### 3.5 Existing `custom_package_type` and `custom_remaining_sessions` behavior

- `custom_package_type` — descriptive Select; written **only** by the client edit form (`app/dashboard/clients/[id]/edit/page.tsx`). Not used for any system branching today.
- `custom_remaining_sessions` — Int; surfaced read-only via `PackageBalanceGate` (a presentational component that **writes nothing**). FitDesk **cannot decrement or top-up it** — `UpdateClientPayload` (`lib/erpnext/types.ts`) does not include it, so `updateClient()` cannot patch it. There is no `decrementRemainingSessions` logic.
- `packageOptIn` — a per-booking **client-side draft flag** (`types/scheduling.ts:231`, `BookingSheet.tsx`). It is **not persisted** on FD Session; it only toggles the booking-time `PackageBalanceGate` preview and an overdraw block. Today's package "consumption" is purely a UI preview — nothing is ever written back.

**Net:** the system cannot today tell a package client from a pay-per-session client, cannot decrement a package, and unconditionally creates a Sales Invoice on every session completion (`completeSession()`, `lib/scheduling/sessionService.ts:228`).

---

## 4. Recommended MVP Data Model

Field names use the ERPNext `custom_` convention. Select values are exact strings (they become provisioned options).

### 4.1 Customer

#### `custom_billing_mode` — **new, MVP required**
- **Type:** Select.
- **Values (exact):** `Package` / `Pay Per Session` / `Trial`.
- **Provisioned reqd flag:** `0` (NOT mandatory at ERPNext level) — see rationale below.
- **Required behavior:** FitDesk-layer required. The client-creation flow always writes one of the three values. Existing/externally-created Customers may have `null`.
- **Default:** no DB default. `null` is meaningful: it means **"needs billing setup"** and FitDesk treats it like `Trial` for *guarding* purposes (blocks paid completion until set).
- **Why reqd=0 at ERPNext level:** a mandatory field would break the existing edit form, the backfill, and any non-FitDesk Customer save. Treating `null` as "needs setup" is safer and reversible.
- **Meaning of each value:**
  - `Package` — client pre-bought a block of sessions; sessions consume the package balance; no per-session invoice.
  - `Pay Per Session` — client pays each session; each completed session auto-creates a Sales Invoice at the agreed rate.
  - `Trial` — no billing configured yet; free trial sessions allowed, paid completion blocked until a real mode is set.

#### `custom_default_session_rate` — **new, MVP required**
- **Type:** Currency.
- **Validation:** must be **> 0** when `custom_billing_mode = Pay Per Session`. Enforced in the FitDesk action layer (not as an ERPNext mandatory field — conditional requiredness is brittle to provision). Ignored/blank for `Package` and `Trial`.
- **When required:** at creation/setup of a Pay Per Session client; editable later (affects future sessions only).

#### `custom_default_payment_method` — **new, defer to Later**
- **Type:** Select (if added later).
- **MVP:** **not provisioned.** It is a convenience pre-fill only; the payment-method chip flow (§10) already lets the trainer pick per payment. Adding it now is overbuild. Revisit if trainers ask.

#### `custom_remaining_sessions` — **existing field, add write support (MVP required)**
- **Type:** Int (unchanged).
- **Change:** FitDesk must be able to **write** it. Add it to `UpdateClientPayload` / a dedicated balance writer so it can be **decremented** (package session completion) and **incremented/topped-up** (package sale/renewal).
- **Write rule:** never blind-set. Decrement and top-up are **read-modify-write under optimistic concurrency** (§13). Set absolute value only on a brand-new package sale to a client with no active package.

#### `custom_package_name` — **new, MVP (recommended; low cost)**
- **Type:** Data.
- **Use:** human label for the active package (e.g. "10-Session Strength Pack"). Drives the Money-tab card label and the success state.
- It is a single trivial Data field; including it in MVP avoids a second provisioning round. Could be deferred without breaking anything if the user prefers a smaller MVP.

#### `custom_package_expiry_date` — **defer to Later**
- **Type:** Date (if added later).
- **MVP:** **not provisioned.** Expiry automation, reminders, and enforcement are a Later phase. Adding the field now with no logic behind it is dead schema. Revisit only if trainers explicitly want package expiry.

#### `custom_package_type` — **keep, deprecate-in-place**
- **Decision:** **keep** the field and its current edit-form behavior. Do **not** remove it.
- `custom_billing_mode` becomes the **authoritative** branching field. `custom_package_type` is demoted to a descriptive label with no system behavior.
- **Why not remove:** the edit form, `fitdesk_setup.py`, the `verify_fitdesk_schema()` count, and `CreateClientPayload`/`ERPClient` types all reference it. Removal is a separate, riskier change. Deprecate-in-place; delete in a Later cleanup if ever justified.

### 4.2 FD Session

#### `rate` — **keep; populate and guard**
- Stays `Currency, reqd`.
- For `Pay Per Session` clients, `rate` is **pre-filled at booking from `custom_default_session_rate`** (trainer may override, but the field is never blank/zero).
- Add a **non-zero guard before completion-invoicing**: `completeSession()` refuses to auto-create an invoice for a `rate = 0` Pay Per Session session and surfaces a fix-the-rate prompt instead of silently issuing a $0 invoice.

#### `invoice_id` — **keep; narrow its meaning**
- Stays `Data` (Sales Invoice docname).
- **New rule:** only set for **Pay Per Session** completions. Package and free-trial completions leave it `null`. Its existing role as the completion idempotency key is preserved.

#### `session_consumed_package` — **new, MVP required (idempotency marker)**
- **Type:** Check (boolean), default `0`.
- **Use:** set to `1` exactly when a Package-mode completion successfully decrements `custom_remaining_sessions`. Re-completing or retrying a session that already has `session_consumed_package = 1` **must not decrement again**.
- This is the package-side analogue of `invoice_id` — without it, a retry double-decrements the balance.

#### `is_trial_session` — **new, MVP required**
- **Type:** Check (boolean), default `0`.
- **Use:** marks a session as a **free trial** session. Lets completion distinguish "free trial → complete, no invoice, no balance change" from "billable session for a client who still has no billing mode → block and prompt setup" (§5, §8).

#### Package-consumption audit field — **none beyond `session_consumed_package` for MVP**
- The boolean marker is sufficient for idempotency and audit ("did this session consume the package?"). Storing balance-before/after on the session is overbuild for MVP — ERPNext document history and the marker are enough. Revisit only if reconciliation needs it.

### 4.3 Sales Invoice

#### `custom_fd_session` — **new, MVP (recommended)**
- **Type:** Data (stores the FD Session docname). Recommended Data, not Link — FD Session↔Invoice is already a Data link in the other direction (`invoice_id`), and a Link field couples invoice validation to the custom doctype. Keep it symmetric and loose.
- **Use:** closes the missing invoice→session direction (today only a `remarks` string). Improves reconciliation and the Drafts/Needs-review recovery surface.
- Could be MVP-optional if a strictly minimal first cut is preferred, but it is cheap and directly aids §13 recovery.

#### `custom_invoice_kind` — **new, MVP required**
- **Type:** Select.
- **Values (exact):** `Package` / `Session`.
- **Use:** distinguishes the two automatic invoice types. Drives the Money-tab card label, and lets the system assert that Package clients never receive `Session` invoices.

#### Payment link / reference fields — **reuse existing, no new fields**
- `custom_payment_link` and `custom_payment_reference` already exist on Sales Invoice — reuse them for payment-link MVP. Payment method stays on the Payment Entry `mode_of_payment`. **No new payment fields.**

#### Package invoice vs. session invoice behavior
- **Session invoice:** one line, item `TRAINING-SESSION`, `qty = 1`, `rate = session.rate`, `custom_invoice_kind = Session`, `custom_fd_session = <session docname>`.
- **Package invoice:** one line, **item `TRAINING-SESSION` reused** (`qty = 1`, `rate = package price`, `description = custom_package_name`), `custom_invoice_kind = Package`, no `custom_fd_session`. **Recommendation: reuse the existing `TRAINING-SESSION` item for MVP** rather than provisioning a new `TRAINING-PACKAGE` item — `custom_invoice_kind` already distinguishes the two, so a separate item is unnecessary schema. A dedicated `TRAINING-PACKAGE` item is a Later nicety.

---

## 5. Billing Mode Semantics

`custom_billing_mode` is the single authoritative switch. Behavior per mode:

### 5.1 `Package`

| Stage | Behavior |
|---|---|
| **Creation / setup** | Set `custom_billing_mode = Package`; set `custom_remaining_sessions` = sessions bought; set `custom_package_name`. Auto-create the **package invoice** (§9.1). Handle Paid now / Pay later / Send link (§10). |
| **Booking** | Sessions booked normally. `rate` is **not** the billing driver — consumption is mode-driven. `packageOptIn` per-booking toggle is phased out (§6). `PackageBalanceGate` may stay as a read-only "N sessions left" preview, driven by mode. |
| **Completion** | Decrement `custom_remaining_sessions` by 1 (guarded — §6, §13). Set `session_consumed_package = 1`. **No invoice created.** `invoice_id` stays `null`. |
| **Invoicing** | Only at the package sale. Never per session. |
| **Payment** | Recorded against the package invoice. |
| **Switching** | → Pay Per Session: set mode + `custom_default_session_rate`; existing balance left as-is (can still be consumed or zeroed by policy — recommend leave it, future sessions invoice). → renew: top-up balance + new package invoice. Existing invoices never mutated. |

### 5.2 `Pay Per Session`

| Stage | Behavior |
|---|---|
| **Creation / setup** | Set `custom_billing_mode = Pay Per Session`; store `custom_default_session_rate` (> 0, required). **No invoice at creation.** |
| **Booking** | New sessions inherit `rate = custom_default_session_rate` (trainer may override, never blank/zero). |
| **Completion** | Auto-create the **session invoice** (§9.2), item `TRAINING-SESSION`, `rate = session.rate`. Set `invoice_id`. Trainer then picks payment status. |
| **Invoicing** | One Sales Invoice per completed session. |
| **Payment** | Paid now / Pay later / Send link, per §10. |
| **Switching** | → Package: set mode + balance + package invoice; future sessions consume the package. Already-outstanding per-session invoices remain (they were real sessions). |

### 5.3 `Trial`

| Stage | Behavior |
|---|---|
| **Creation / setup** | Set `custom_billing_mode = Trial`. No invoice, no balance, no default rate. |
| **Booking** | Sessions booked normally. A free-trial session is marked `is_trial_session = 1`. |
| **Completion** | If `is_trial_session = 1` → mark complete, **no invoice, no balance change**. If a **billable** session (`is_trial_session = 0`) and the client is still `Trial`/`null` → **block completion**, surface "Set up billing first", open billing setup. After a real mode is set, completion proceeds down the Package or Pay Per Session branch. |
| **Invoicing** | None while `Trial`. |
| **Payment** | None while `Trial`. |
| **Switching** | → Package or → Pay Per Session via billing setup; identical to §5.1 / §5.2 setup minus customer creation. This is the normal "convert" path. |

**Null `custom_billing_mode`** (existing/un-backfilled clients) is treated exactly like `Trial` for the completion guard — paid completion is blocked until a mode is set.

---

## 6. Package Balance Model

- **How balance is set:** on a package **sale** to a client with no active package — absolute set of `custom_remaining_sessions` to the number bought, alongside the package invoice.
- **Renewals / top-ups:** **additive read-modify-write** — read current balance, add the new package size, write back. **Never overwrite** (a renewal stacks onto remaining sessions). Each renewal creates its own package invoice.
- **Decrement:** on completion of a session for a `Package`-mode client — `custom_remaining_sessions -= 1`. Performed by a dedicated `decrementRemainingSessions` service.
- **Avoiding double decrement:** two guards combined —
  1. **Per-session guard:** a session with `session_consumed_package = 1` is never decremented again (idempotent retries).
  2. **Optimistic concurrency:** read balance + the Customer `modified` token, decrement, write conditionally; on conflict, re-read and retry (§13).
- **At zero balance:** the next attempt to complete a session **as a package session is blocked**. The trainer is prompted to **Renew package** (→ top-up flow) or **Switch to Pay Per Session** (→ set mode + default rate). The trainer is never silently allowed to keep completing free sessions.
- **Overdraw:** **not allowed.** Recommendation: balance floors at `0`; completion is blocked at `0` rather than going negative. (Today's booking-time `PackageBalanceGate` already surfaces an `overdraw` status — the new model enforces it at completion, the point where money state actually changes.)
- **`packageOptIn` phase-out:** the per-booking `packageOptIn` draft flag becomes redundant — whether a session consumes the package is determined by the client's `custom_billing_mode`, not a per-booking toggle. Recommendation: **phase `packageOptIn` out**; derive package context from billing mode. `PackageBalanceState` / `PackageBalanceGate` can remain as a **read-only** balance indicator, fed from the client's mode + balance instead of the opt-in toggle. (Exact removal mechanics are a Phase B/E detail — confirmed `packageOptIn` is UI-only and unpersisted, so removal carries no schema risk.)

---

## 7. Pay-Per-Session Price Model

- **Where the default price lives:** `custom_default_session_rate` on the Customer — the single source of the agreed price.
- **How booking inherits the price:** when a session is booked for a `Pay Per Session` client, the booking flow **pre-fills `rate` from `custom_default_session_rate`**. The rate field is never blank or zero on screen.
- **Per-session override:** **yes** — the trainer may override `rate` for an individual session at booking (e.g. a discounted or extended session). Override changes only that session.
- **Preventing 0-rate sessions:** two layers —
  1. Booking pre-fills a non-zero default, so the common path is never zero.
  2. `completeSession()` adds a **non-zero guard**: it refuses to auto-create an invoice for a `rate = 0` Pay Per Session session and prompts the trainer to set a rate. (`Package` and free-`Trial` completions are exempt — they do not invoice.)
- **How price changes affect existing future sessions:** editing `custom_default_session_rate` changes the **inherited default for sessions booked afterward only**. Already-booked future sessions keep their stored `rate` unless individually edited. **No retroactive change** to booked sessions or issued invoices — past `rate` values are history.

---

## 8. Trial / Decide Later Model

- **Free trial session:** marked `is_trial_session = 1`. Completing it marks the session `completed`, creates **no invoice**, changes **no balance**. This is the genuine "try before you buy" path.
- **Paid trial behavior:** if the trainer intends the trial to be billable, the client must have a real billing mode first. A billable session (`is_trial_session = 0`) for a `Trial` (or `null`) client **cannot be completed** — completion is blocked and the billing-setup flow opens. Once the client is `Package` or `Pay Per Session`, completion proceeds normally. There is **no "paid trial" as a distinct mode** — a paid trial is simply a Pay Per Session (or Package) client; `Trial` means strictly "not yet billable".
- **When billing setup is required:** before the **first billable completion**. Booking and free-trial completion do not require it; the first attempt to complete a non-trial session for a `Trial`/`null` client forces it.
- **Conversion to Package / Pay Per Session:** done through the same billing-setup flow used at client creation, reachable from the client detail page:
  - → **Package:** set `custom_billing_mode = Package`, set `custom_remaining_sessions`, set `custom_package_name`, auto-create package invoice, handle payment status.
  - → **Pay Per Session:** set `custom_billing_mode = Pay Per Session`, store `custom_default_session_rate`. No invoice. Future sessions inherit the rate.
  - Conversion **never mutates** any session already completed as a free trial.

---

## 9. Invoice Creation Rules

### 9.1 Package sale invoice
- Created automatically by a `sellPackageToClient` action when a package is sold (at client creation or renewal).
- One Sales Invoice: item `TRAINING-SESSION` (reused), `qty = 1`, `rate = package price`, `description = custom_package_name`, `custom_invoice_kind = Package`.
- Then Paid now / Pay later / Send link per §10.

### 9.2 Pay-per-session completion invoice
- Created automatically by `completeSession()` when a `Pay Per Session` session is completed.
- One Sales Invoice: item `TRAINING-SESSION`, `qty = 1`, `rate = session.rate` (guaranteed non-zero by §7 guard), `custom_invoice_kind = Session`, `custom_fd_session = <session docname>`. `invoice_id` written back to the session.

### 9.3 No invoice for package completion
- A `Package` session completion **never creates an invoice** — the package invoice (§9.1) already covered it. Completion only decrements the balance.

### 9.4 No invoice for free-trial completion
- A session with `is_trial_session = 1` completes with **no invoice and no balance change**.

### 9.5 Idempotency
- **Session invoice:** keyed on FD Session `invoice_id` — if already set, the existing invoice is reused; completion is never re-invoiced. (Existing `completeSession()` behavior, preserved.)
- **Package invoice:** `sellPackageToClient` must be keyed so a retried sale does not double-invoice — e.g. guard on a per-sale idempotency key / check for an existing un-paired `Package` invoice for that client+amount before creating. Exact mechanism is a Phase D detail; the requirement is: **a retried package sale does not produce two package invoices.**
- **Balance decrement:** keyed on `session_consumed_package` (§6).

### 9.6 If invoice creation fails
- **Order preserved:** invoice is created **before** the session status flips to `completed` (today's order). If invoice creation fails, the session stays `scheduled`/`confirmed` and **retryable** — no partial completion.
- A draft invoice that was created but not finalized lands in the **Drafts / Needs-review** surface for the trainer to retry. **No auto-retry.** FitDesk never silently double-charges — idempotency (§9.5) covers the retry.

---

## 10. Payment Recording Rules

All four payment outcomes reuse existing, proven actions — **no new payment-write action**.

- **Paid now:** record a Payment Entry against the invoice immediately. Reuse `collectPayment()` (`actions/invoices.ts:328`) → `recordPayment()` → `createAndSubmitPaymentEntry()` (`lib/erpnext/client.ts:571`). `collectPayment` already finalizes a draft first if needed.
- **Pay later:** invoice is finalized and left **outstanding**; it appears in the Money tab "To Collect". No payment action taken.
- **Send payment link later:** generate a link via the existing `getPaymentLink()` / `generatePaymentLink()` path (currently the Whish **mock**), store it on `custom_payment_link`, open a WhatsApp **preview** (no auto-send). Recording the actual payment is still a separate explicit `recordPayment()` step.
- **Manual payment entry:** the existing `RecordPaymentForm` flow stays as the always-available fallback (FitDesk `CLAUDE.md` Payment Rules require manual marking to always be available).
- **Reuse map:** `collectPayment`, `recordPayment`, `createAndSubmitPaymentEntry`, `getPaymentLink`, `enabledPaymentMethods()`, `RecordPaymentForm`. **No new payment-write code for MVP.**
- **MVP vs Later:**
  - **MVP:** Paid now, Pay later, manual payment entry; payment-link generation via the **mock** + WhatsApp preview; methods **Cash + Whish** enabled (OMT shown disabled).
  - **Later:** real Whish API + webhook/status sync; unifying `PaymentMethod` (`lib/payments/methods.ts`) and `PaymentProvider` (`lib/whish.ts`) into one registry behind the §7.5 chips; auto-reconciliation. **ERPNext Payment Request is not introduced** — the Payment Entry workflow is sufficient.

---

## 11. ERPNext / Provisioning Changes

All ERPNext field/doctype and provisioning changes are **approval-gated** (workspace `CLAUDE.md` §4) and belong to Master Plan **Phase B** — not this note.

| Change | File | Detail | Scope |
|---|---|---|---|
| Add `custom_billing_mode` (Customer, Select `Package`/`Pay Per Session`/`Trial`) | `fitdesk_setup.py` `_CUSTOM_FIELDS` | reqd=0 | **MVP required** |
| Add `custom_default_session_rate` (Customer, Currency) | `fitdesk_setup.py` `_CUSTOM_FIELDS` | — | **MVP required** |
| Add `custom_package_name` (Customer, Data) | `fitdesk_setup.py` `_CUSTOM_FIELDS` | — | **MVP** (recommended) |
| Add `custom_fd_session` (Sales Invoice, Data) | `fitdesk_setup.py` `_CUSTOM_FIELDS` | — | **MVP** (recommended) |
| Add `custom_invoice_kind` (Sales Invoice, Select `Package`/`Session`) | `fitdesk_setup.py` `_CUSTOM_FIELDS` | — | **MVP required** |
| Add `is_trial_session` (FD Session, Check) | `doctype/fd_session/fd_session.json` | default 0 | **MVP required** |
| Add `session_consumed_package` (FD Session, Check) | `doctype/fd_session/fd_session.json` | default 0 | **MVP required** |
| Update `verify_fitdesk_schema()` expected count | `fitdesk_setup.py` | `10` → `15` (the 5 new `_CUSTOM_FIELDS` entries) and extend the fieldname list | **MVP required** |
| `custom_default_payment_method` (Customer) | `fitdesk_setup.py` | — | **Later** |
| `custom_package_expiry_date` (Customer, Date) | `fitdesk_setup.py` | — | **Later** |
| Dedicated `TRAINING-PACKAGE` Item | `fitdesk_setup.py` `_create_training_item` | reuse `TRAINING-SESSION` for MVP | **Later** |
| `CreateClientPayload` / `UpdateClientPayload` / `ERPClient` — add new Customer fields | `lib/erpnext/types.ts` | — | **MVP required** |
| `clientFields()` projection — add `custom_billing_mode`, `custom_default_session_rate`, `custom_package_name` | `lib/erpnext/client.ts:256` | otherwise new fields are never fetched | **MVP required** |
| `normalizeClient()` — map new fields into the `Client` type | `lib/erpnext/client.ts:197` | — | **MVP required** |
| `updateClient()` — allow patching `custom_remaining_sessions` (balance writer) | `lib/erpnext/client.ts` / `lib/erpnext/types.ts` | enables decrement + top-up | **MVP required** |
| FD Session adapter / `FDSession` type — add `is_trial_session`, `session_consumed_package` | `lib/scheduling/*`, `types/scheduling.ts` | — | **MVP required** |
| `ERPInvoice` / invoice payload types — add `custom_fd_session`, `custom_invoice_kind` | `lib/erpnext/types.ts` | — | **MVP** (recommended) |

**Count math:** new `_CUSTOM_FIELDS` entries for MVP = 3 Customer (`custom_billing_mode`, `custom_default_session_rate`, `custom_package_name`) + 2 Sales Invoice (`custom_fd_session`, `custom_invoice_kind`) = **5**, so `verify_fitdesk_schema()` expected `custom_fields` goes **10 → 15**. FD Session Check fields live in the doctype JSON and do **not** affect the `_CUSTOM_FIELDS` count.

---

## 12. Migration / Backfill Strategy

One-off, **approval-gated** backfill (Master Plan Phase B). Dry-run on a test tenant first.

- **Existing clients with `custom_remaining_sessions > 0`:** infer `custom_billing_mode = Package`. Set `custom_package_name` to a generic label (e.g. "Existing Package") if blank — do not invent a price; the original package invoice is not reconstructed.
- **Existing clients with no billing mode and no remaining sessions:** **do not guess** Pay Per Session. Leave `custom_billing_mode = null` → treated as "needs setup". The trainer sets it on the next interaction (the completion guard forces it before any paid completion). A null is safer than a wrong guess.
- **Existing sessions with `rate = 0`:** **not auto-changed.** They keep `rate = 0`. The §7 non-zero guard applies only to *future* auto-invoicing; historical zero-rate sessions are left as-is. Flag them in a dry-run report so the trainer can correct any that are still open/future.
- **Existing invoices / session links:** **not touched.** Past invoices are accounting history. `custom_fd_session` / `custom_invoice_kind` are backfilled **only** for invoices that can be confidently matched (e.g. via the existing `remarks` `FitDesk session {id}` string); unmatched invoices are left null. Optional and low-priority — can be skipped for MVP.
- **Safe dry-run / rollback:** the backfill script runs in a **report-only dry-run mode first** (lists every intended write, makes none). Field additions are **additive** — no field is removed or retyped, so rollback of the schema change is "leave the new fields unused". Data backfill rollback = the inferred-Package set is small and reversible (set `custom_billing_mode` back to null). No destructive operation, no invoice mutation.

---

## 13. Concurrency and Idempotency

- **Package decrement locking:** optimistic concurrency on the Customer balance write — read `custom_remaining_sessions` + the Customer `modified` token, compute `balance - 1`, write **conditionally** (reject if `modified` changed since read), retry on conflict with a bounded retry count. **Never blind-set** the balance. Top-ups use the same read-add-write-conditional pattern. (FD Session already has a `version` field for its own optimistic lock; the Customer write needs the analogous `modified`-token guard since Customer has no `version` field.)
- **Session completion retry:** `completeSession()` already does a `version` check and an immutable-state check, and reuses an existing `invoice_id`. Preserved. A retry after a transient failure is safe: either the session is still `scheduled`/`confirmed` (full retry) or already `completed` (no-op / idempotent reuse).
- **Invoice creation retry:** keyed on FD Session `invoice_id` (session invoice) and a per-sale idempotency guard (package invoice) — §9.5. A retry never produces a duplicate invoice.
- **Payment entry retry:** `recordPayment()` re-fetches the invoice after submitting the Payment Entry and verifies the outstanding amount actually decreased; a payment that did not reconcile surfaces as **Needs review** rather than being blindly retried. No auto-retry.
- **Recovery states:** the **Drafts / Needs-review** tab in the Money view is the human recovery surface — invoices created but not finalized, or finalized but not paid, land there with a retry affordance. ERPNext records are append-only history; recovery is always forward (retry/complete), never destructive.

---

## 14. UX Dependencies

Flows that depend on this data model (Master Plan Phases C–F):

- **Add Client → billing setup step:** needs `custom_billing_mode`, `custom_default_session_rate`, `custom_remaining_sessions` write support, `custom_package_name`. Cannot be built before Phase B fields exist.
- **Sell Package:** needs `custom_remaining_sessions` write support, `custom_package_name`, package invoice with `custom_invoice_kind = Package`.
- **Complete Session:** needs `custom_billing_mode` (branch), `session_consumed_package` (idempotent decrement), `is_trial_session` (trial branch), `custom_invoice_kind = Session` + `custom_fd_session` on the session invoice.
- **Money tab:** needs `custom_invoice_kind` to label Package vs Session cards; the Drafts/Needs-review tab depends on §13 recovery states.
- **Payment chips:** depend on the (Later) unified `PaymentMethod`/`PaymentProvider` registry; MVP uses the existing `enabledPaymentMethods()` (Cash + Whish).
- **WhatsApp preview:** package-sale links, session-completion links, and reminders all reuse `generateDraftMessage` / `sendMessage`, preview-gated — no model change, but the link value is read from `custom_payment_link`.

**Sequencing consequence:** the data model (Phase B) is a hard prerequisite for every billing UX flow. This decision note must be approved, then Phase B implemented and verified on a test tenant, before Phases C–F.

---

## 15. Approval Decisions

The following must be explicitly approved before any code, ERPNext, or provisioning change:

1. **Field names** — `custom_billing_mode`, `custom_default_session_rate`, `custom_package_name` (Customer); `custom_fd_session`, `custom_invoice_kind` (Sales Invoice); `is_trial_session`, `session_consumed_package` (FD Session). Approve exact names.
2. **Select values** — `custom_billing_mode` = `Package` / `Pay Per Session` / `Trial`; `custom_invoice_kind` = `Package` / `Session`. Approve exact strings (hard to change after provisioning).
3. **Required/optional** — `custom_billing_mode` provisioned `reqd=0`, enforced as required in the FitDesk UI, `null` = "needs setup". `custom_default_session_rate` required (>0) only for Pay Per Session, enforced in the action layer. Approve this "FitDesk-required, ERPNext-optional" approach.
4. **Package expiry** — `custom_package_expiry_date` **deferred to Later** (not provisioned in MVP). Confirm.
5. **Package overdraw policy** — overdraw **not allowed**; balance floors at 0; package completion blocked at 0 with renew/switch prompt. Approve.
6. **Decrement locking strategy** — optimistic concurrency via the Customer `modified` token + `session_consumed_package` per-session guard; never blind-set. Approve.
7. **Backfill policy** — infer `Package` from `custom_remaining_sessions > 0`; leave everyone else `null` ("needs setup"); do not auto-change zero-rate historical sessions; dry-run first; approval-gated run. Approve approach and the eventual run.
8. **Payment methods for MVP** — Cash + Whish enabled; OMT shown disabled; no `custom_default_payment_method` field in MVP. Approve.
9. **Hide manual invoice route now** — remove the trainer-facing entry point to `/dashboard/invoices/new`; keep the route + `issueInvoice` action as an admin/fallback; do not delete. Approve "hide now, don't delete".
10. **`custom_package_type`** — keep as a descriptive label, `custom_billing_mode` authoritative; do not remove. Approve.
11. **Package invoice item** — reuse the existing `TRAINING-SESSION` item for package invoices in MVP (no new `TRAINING-PACKAGE` item). Approve.
12. **`custom_package_name` / `custom_fd_session` in MVP** — both included as MVP (low cost). Approve, or downgrade either to Later for a leaner first cut.
13. **`completeSession()` behavior change** — completion currently invoices unconditionally; the new branch makes Package completions decrement-only (no invoice). Confirm this is the intended product change.

---

## 16. Final Recommendation

**Build the FitDesk billing model on Customer custom fields only — no package/subscription doctype.**

- **Customer:** add `custom_billing_mode` (Select `Package`/`Pay Per Session`/`Trial`, the authoritative branching field), `custom_default_session_rate` (Currency, the pay-per-session agreed price — this closes the 0-rate gap at source), and `custom_package_name` (Data label). Add **write support** to the existing `custom_remaining_sessions` (Int) for decrement and additive top-up. Keep `custom_package_type` as a deprecated-in-place label. Defer `custom_default_payment_method` and `custom_package_expiry_date` to Later.
- **FD Session:** add `is_trial_session` (Check) and `session_consumed_package` (Check). Keep `rate` and `invoice_id`; add a non-zero rate guard before completion-invoicing; `invoice_id` is now set only for Pay Per Session completions.
- **Sales Invoice:** add `custom_invoice_kind` (Select `Package`/`Session`) and `custom_fd_session` (Data). Reuse the existing `custom_payment_link` / `custom_payment_reference`. Reuse the `TRAINING-SESSION` item for both invoice kinds.

**Behavior:** `custom_billing_mode` drives every branch. Package sale auto-creates the package invoice and sets the balance; Package completion decrements the balance (optimistic-concurrency + `session_consumed_package` guarded) and creates **no** invoice; Pay Per Session completion auto-creates the session invoice at the inherited non-zero rate; Trial completion is free (no invoice) or blocked-until-setup for billable sessions. Overdraw is blocked at zero. Backfill infers `Package` from a positive balance and leaves everyone else `null` ("needs setup"). All payment recording reuses `collectPayment` / `recordPayment` — **no new payment-write code, no ERPNext Payment Request**. ERPNext stays the financial source of truth; FitDesk only triggers documented create/submit calls through the adapter layer.

This is the **minimum** schema that satisfies all 12 approved product rules: 5 new `_CUSTOM_FIELDS` (count `10 → 15`) + 2 FD Session Check fields + adapter/type updates. It introduces no new doctype, no new service layer, and no new external integration in MVP. Every change is additive and reversible, and every ERPNext/provisioning/accounting change stays approval-gated.

---

### Files inspected
- `FitDesk/docs/FitDesk Client Billing Invoice Payment UX Master Plan.md`
- `provisioning_api/provisioning_api/api/fitdesk_setup.py`
- `provisioning_api/provisioning_api/api/doctype/fd_session/fd_session.json`, `fd_session.py`
- `FitDesk/lib/erpnext/types.ts`, `FitDesk/lib/erpnext/client.ts`
- `FitDesk/lib/scheduling/sessionService.ts`, `FitDesk/lib/scheduling/bookingService.ts`
- `FitDesk/actions/clients.ts`, `FitDesk/actions/invoices.ts`, `FitDesk/actions/schedulingActions.ts`
- `FitDesk/lib/payments/methods.ts`, `FitDesk/lib/whish.ts`
- `FitDesk/types/scheduling.ts`, `FitDesk/components/scheduling/BookingSheet.tsx`, `FitDesk/components/scheduling/booking/PackageBalanceGate.tsx`, `BookingReviewStep.tsx`
- `FitDesk/CLAUDE.md`, workspace `CLAUDE.md`

### Files changed
This document only (`FitDesk/docs/FitDesk Client Billing Data Model Decision Note.md`). No code, ERPNext, provisioning, or component files were modified. Nothing staged or committed.

### Tests run
None — planning task only; only read-only inspection was performed.

### Recommended next approval step
Review and approve the 13 items in **§15 Approval Decisions** — primarily the field names, the `custom_billing_mode` / `custom_invoice_kind` Select strings, and the MVP-vs-Later scope. Once approved, this note becomes the input to Master Plan **Phase B** (data model + provisioning), which is itself approval-gated per workspace `CLAUDE.md` §4 before any ERPNext field/doctype or `fitdesk_setup.py` change is implemented.
