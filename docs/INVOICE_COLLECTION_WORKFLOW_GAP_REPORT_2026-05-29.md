# FitDesk Invoice Collection Workflow — Read-Only Audit & 2026 UX Gap Report

**Date:** 2026-05-29
**Type:** Read-only audit (no code/test/ERP/runtime changes)
**Repository:** FitDesk (`C:\Users\Lenovo\Dev\axis-erp\FitDesk`)
**Branch / HEAD:** `wip/main-2026-04-25` @ `bd87f5a` (clean tree, 26 commits ahead of origin)

---

## 0. Conclusion First — The Six Critical Questions

**1. Are the 4 "Preparing" invoices money the trainer should collect, or not?**
In business terms: almost certainly **yes** — they represent earned-but-uncollected amounts. In ERPNext accounting terms: **not yet** — they are **Draft (docstatus 0)** Sales Invoices, which have posted no receivable and cannot receive a payment until submitted. The only auto-invoicing mechanism in the current code is `completeSession()` (`lib/scheduling/sessionService.ts:228`), which **drafts** a per-session invoice (item `TRAINING-SESSION`, `rate = session.rate`) on every completed session and never submits it. So the 4 drafts are most plausibly completed pay-per-session sessions (and/or manual invoices whose finalize step failed). **Definitive attribution of the 4 specific invoices needs one read-only ERP query** (see §8) — the code proves the *mechanism*, not the provenance of those exact four.

**2. Why are they not appearing under "To collect"?**
By explicit design. `lib/invoices/status.ts:33-37` defines the outstanding set as `{ sent, overdue, partially_paid }` and **excludes `draft`** with the comment *"a draft (unsubmitted) invoice cannot receive a Payment Entry in ERPNext."* The "To collect" tab filters on `isOutstandingInvoiceStatus()`, so drafts are routed to the separate "Preparing" tab and shown with **no payment action**. They are drafts at all because `completeSession()` calls `createInvoice()` (draft) rather than `issueInvoice()` (create **and** submit).

**3. UI naming problem, billing-lifecycle problem, or both?**
**Both — and the lifecycle problem dominates.**
- *Lifecycle/workflow*: completed pay-per-session invoices are left as drafts and never auto-finalized, so owed money is structurally invisible in the trainer's primary collection queue.
- *UI naming*: "Preparing" is ERP-draft jargon (fails NN/g heuristic #2, "match between the system and the real world"); even when found it does not read as "unpaid money," and the "To collect" empty-state actively misdirects.

**4. Is the existing invoice workflow safe for pilot users?**
**Partially.** The payment-*recording* engine is robust and well-tested (`recordPayment` / `collectPayment` / `finalizeInvoice` / `issueInvoice` — re-fetch verification, no false-success, missing-deposit-account guard, idempotent finalize, partial payments). That core is pilot-safe. The *collection-visibility* layer is **not** pilot-safe: a trainer who trusts "To collect" will miss money owed from completed sessions. Two further risks: the manual-invoice route is still linked from client screens (guardrail violation), and `completeSession()` drafts an invoice for **every** completed session regardless of billing mode (double-billing exposure for package clients). None are data-destructive.

**5. Smallest safe change so the trainer immediately sees who owes money?**
A **UI-only** change in `InvoicesView.tsx` (no ERP/accounting change): (a) make the list's "Record payment" call **`collectPayment`** (which already finalizes a draft then records — exactly what the detail page does) instead of `recordPayment` (which rejects drafts); (b) include draft-with-amount invoices in the collection queue, relabel "To collect" → **"Need payment,"** sort overdue→oldest; (c) fix the empty-state copy. This reuses the already-built, ERP-safe finalize-on-pay composition and needs founder sign-off only because it changes what the primary tab *means*.

**6. What must NOT change until further accounting/ERP verification?**
The ERP write path (`createInvoice`→draft, `submitSalesInvoice`, Payment Entry create+submit, `paid_to` resolution); the `completeSession` billing-mode branch / package decrement / package auto-invoice (Phases D/E); any ERPNext custom-field provisioning; `PaymentMethod`/`PaymentProvider` unification and real Whish; deletion of the manual route. And **never** mutate the 4 existing drafts to "fix" the display.

---

## 1. Executive Summary

FitDesk's invoice surface is two systems wearing one coat. Underneath sits a **carefully built, well-tested payment engine** that talks to ERPNext through the Control-Plane proxy, never holds ERP credentials, verifies every write by re-fetch, and refuses to report a false success. On top sits a **collection UI that hides earned money**: the only automatic invoice the product creates today — the pay-per-session completion invoice — is left as an ERPNext *Draft*, and drafts are deliberately excluded from the "To collect" queue and its totals. The result the founder is seeing (8 invoices: 4 "Preparing," 4 "Paid," $120 collected, "To collect" empty) is the predictable output of that design: the four drafts are money the trainer earned but the queue cannot show.

This is **both** a terminology problem (ERP words like "Preparing"/draft leaking into trainer nav) **and** a workflow problem (completion drafts but never finalizes). The good news: the smallest fix is UI-only and reuses code that already exists and is tested — `collectPayment()` already finalizes a draft and records payment in one step on the invoice *detail* page; the list view simply doesn't use it. The deeper correctness fixes (finalize-on-completion, billing-mode branching, package auto-invoicing) are already designed in two approved planning docs (`Master Plan`, `Data Model Decision Note`) and are correctly gated behind founder/ERP approval.

The proposed "Need payment / Paid / All / Needs attention" direction is **sound and aligns with both ERPNext and Stripe lifecycles and with NN/g guidance** — accepted here with refinements about how to treat drafts during the pilot.

---

## 2. Audit Scope & Safety Constraints

**Performed (read-only):** git verification; full-tree file discovery; close reading of invoice UI, status mapping, server actions, ERP client/adapter, billing helpers, session-completion service, types, and tests; reading the two authoritative billing design docs; external benchmark research (ERPNext, Stripe, NN/g).

**Explicitly NOT done (per task + workspace `CLAUDE.md`):** no application/UI/test/config edits; no ERPNext reads or writes against any tenant; no invoice created/submitted/cancelled; no payment recorded; no DB/seed mutation; no Docker/env/deploy change; nothing committed or pushed. ERP architecture boundary respected — all ERP I/O in the codebase goes through `erpFetch()` → Control-Plane proxy; no recommendation bypasses the proxy or stores ERP credentials in FitDesk.

**One deliverable file** created: this report.

---

## 3. Repository / Branch / Commit Verification

| Check | Result |
|---|---|
| `git rev-parse --show-toplevel` | `C:/Users/Lenovo/Dev/axis-erp/FitDesk` |
| Repository identity | `package.json` name = **`fitdesk`** — the product/app repo (not provisioning-agent / erp-execution-service) |
| Active branch | `wip/main-2026-04-25` |
| HEAD | `bd87f5a` — *fix(schedule): scroll selected day to first appointment context* |
| Working tree | Clean (only ahead/behind line on `git status --short --branch`) |
| Position vs origin | 26 commits ahead of `origin/wip/main-2026-04-25` |

> Note: the two billing design docs were written against commit `43f8671`. The current tree (`bd87f5a`) has since wired Phase B/C (billing-mode fields + client-creation billing step), but Phases D/E (package auto-invoice, completion billing-branch) remain unbuilt — see §5/§6.

---

## 4. Complete Invoice File Map

**UI / routes**
- `components/modules/InvoicesView.tsx` — the Money/Invoices list: tabs, summary cards, invoice cards, record-payment bottom sheet.
- `app/dashboard/invoices/page.tsx` — server component; fetches invoices + clients, renders `InvoicesView`.
- `app/dashboard/invoices/[id]/page.tsx` — invoice detail; allows paying a **draft** (`canCollectPayment`).
- `app/dashboard/invoices/[id]/FinalizeInvoiceButton.tsx` — "Mark as sent" (finalize without payment).
- `app/dashboard/invoices/[id]/pay/page.tsx` + `RecordPaymentForm.tsx` — payment page; uses `collectPayment`.
- `app/dashboard/invoices/new/page.tsx` — **manual** invoice creation (uses `issueInvoice`, default line rate 0).
- `app/dashboard/invoices/loading.tsx` — route skeleton.

**Status / labels**
- `lib/invoices/status.ts` (+ `status.test.ts`) — single source of trainer-facing labels and the outstanding-grouping predicate.

**Server actions**
- `actions/invoices.ts` (+ `invoices.test.ts`) — `fetchInvoices`, `fetchInvoiceById`, `addInvoice`, `getPaymentLink`, `recordPayment`, `finalizeInvoice`, `collectPayment`, `issueInvoice`.
- `actions/clients.ts` — `addClient`/`editClient` (no invoice creation).
- `actions/schedulingActions.ts` — `completeSessionAction` (`:295`) wraps `completeSession`.

**Facade / ERP**
- `lib/business-data/index.ts` — server-action facade consumed by UI.
- `lib/business-data/erp-adapter.ts` — `export * from '@/lib/erpnext/client'`.
- `lib/erpnext/client.ts` (+ `client.test.ts`) — the **only** ERP I/O; status mappers, normalizers, `createInvoice`, `submitSalesInvoice`, `createAndSubmitPaymentEntry`.
- `lib/erpnext/types.ts` — raw ERPNext shapes + payloads.

**Billing / payments / session**
- `lib/clients/billing.ts` (+ `billing.test.ts`) — billing-mode draft validation + Customer-field mapping (no invoice automation).
- `lib/payments/methods.ts` (+ `methods.test.ts`) — `PaymentMethod` registry (cash + whish_money enabled; omt disabled).
- `lib/whish.ts` — payment-link mock + `PaymentProvider` + audit logging.
- `lib/scheduling/sessionService.ts` (+ `__tests__/sessionService.test.ts`) — `completeSession` drafts the per-session invoice.
- `lib/scheduling/sessionRepository.ts` — FD Session read/write incl. `invoice_id`.
- `components/scheduling/SessionDetailsSheet.tsx` — `handleComplete` triggers completion (`:101-120`).

**Types**
- `types/index.ts` — `InvoiceStatus` (`:18`), `Invoice` (`:88`), `Payment` (`:112`), `RecordPaymentResult` (`:133`), `IssueInvoiceResult` (`:147`).

**Authoritative design docs**
- `docs/FitDesk Client Billing Invoice Payment UX Master Plan.md`
- `docs/FitDesk Client Billing Data Model Decision Note.md`

---

## 5. Existing Architecture & Data Flow

```
UI (InvoicesView / detail / pay / new)
   │  imports server actions via the facade
   ▼
lib/business-data/index.ts  ──►  actions/invoices.ts  (auth + trainer scope + validation)
   │                                   │
   │                                   ▼
   │                         lib/business-data/erp-adapter.ts  (re-export)
   │                                   ▼
   └──────────────────────►  lib/erpnext/client.ts   (ONLY ERP I/O)
                                       │  erpFetch(): signs 5-min tenant JWT,
                                       │  rewrites /api/resource/* → /api/erp/doctype/*,
                                       │  cache:'no-store'
                                       ▼
                          Control-Plane proxy ──► ERPNext / Frappe (source of truth)
```

Key properties (all verified):
- **Credential isolation**: FitDesk holds only `FITDESK_JWT_SECRET`; ERP credentials live in the Control Plane. No raw ERP fetch anywhere outside `lib/erpnext/client.ts`.
- **Normalization boundary**: raw `ERPInvoice` (snake_case) → app `Invoice` only in `normalizeInvoice()` (`client.ts:216`). UI/actions never see ERP field names.
- **Trainer scoping**: invoices are scoped by first listing the trainer's customers, then filtering `customer in [...]` (with an N+1 per-customer fallback if the `in` operator is unsupported) — `getInvoices()` (`client.ts:373`).
- **Verify-by-refetch discipline**: both payment recording and finalize re-fetch the invoice and assert the expected state change before reporting success (`recordPayment` `actions/invoices.ts:224-234`; `finalizeInvoice` `:301-306`; `createAndSubmitPaymentEntry` `client.ts:654-658`).

**Status mapping** (`client.ts:168-184`):

| ERPNext status | App `InvoiceStatus` | Trainer label |
|---|---|---|
| `Draft` | `draft` | Preparing |
| `Unpaid` / `Submitted`* | `sent` | To collect |
| `Overdue` | `overdue` | Overdue |
| `Partly Paid` | `partially_paid` | Partly paid |
| `Paid` | `paid` | Paid |
| `Cancelled` / `Return` / `Credit Note Issued` | `cancelled` | Cancelled |
| *(unknown / fallback)* | `draft` | Preparing |

*`Submitted` is a legacy/back-compat mapping; a submitted unpaid invoice is reported by ERPNext as `Unpaid`, not `Submitted`.

---

## 6. Current Invoice Lifecycle — Per Billing Mode

### Flow A — Package + Paid Now  → **NOT IMPLEMENTED**
There is no `sellPackageToClient` and no package-invoice automation anywhere in code (grep across `lib/`, `actions/`, `app/` returns only design-doc references). `addClient()` (`actions/clients.ts:58`) only creates the Customer; `lib/clients/billing.ts` only validates and maps billing-mode fields onto the Customer (`custom_billing_mode`, `custom_default_session_rate`, `custom_package_name`, `custom_remaining_sessions`). **No invoice is created when a package client is created.** "Paid Now" for a package therefore has no path today.

### Flow B — Package + Pay Later  → **NOT IMPLEMENTED**
Same as A: no package invoice is raised, so there is nothing to show as outstanding. Package billing intent is stored on the Customer but produces no financial document.

### Flow C — Pay-per-session + completed + unpaid  → **IMPLEMENTED, BUT DRAFTS (the core defect)**
```
Trainer taps Complete (SessionDetailsSheet.tsx:108)
   → completeSessionAction (schedulingActions.ts:295)
   → completeSession (sessionService.ts:228)
        → createInvoice({ item TRAINING-SESSION, qty 1, rate=session.rate })   // DRAFT (docstatus 0)
              ↳ sets NEITHER custom_invoice_kind NOR custom_fd_session
        → updateSession(status:'completed', invoiceId)
   → toast "Session marked complete"   // no money-owed signal
ERPNext state: Draft  →  app status 'draft'  →  label "Preparing"
Visible in:  Preparing tab only.  EXCLUDED from "To collect" + outstanding total.
Trainer collection path from the LIST: none (no action button on draft cards).
Trainer collection path from DETAIL: open invoice → "Record Payment" → collectPayment finalizes+pays.
```

### Flow D — Pay-per-session + completed + paid immediately  → **NO ONE-STEP PATH**
Completion drafts the invoice and stops. To take payment the trainer must navigate to the invoice detail/pay page, where `collectPayment` (`actions/invoices.ts:328`) finalizes the draft then records the Payment Entry. There is **no "complete and take payment now" affordance** at completion time (this is the Master Plan §6.2 target, not yet built).

### Flow E — Manual invoice creation  → **EXISTS AND IS REACHABLE (guardrail concern)**
`/dashboard/invoices/new` uses `issueInvoice()` (create + finalize → "To collect"), default line rate `0`. It is linked from `app/dashboard/clients/[id]/page.tsx:223` and `app/dashboard/clients/new/page.tsx:104`. The product guardrail ("manual invoice creation must remain hidden from the normal trainer workflow"; Decision Note §15.9 "hide now, don't delete") is **violated** today. Minor secondary bug: `clients/new` passes `?clientId=…&clientName=…` but the page reads `searchParams.get('client')` (`new/page.tsx:20`), so preselect silently fails from that entry point.

---

## 7. Current UI Status / Filter Matrix

Source: `lib/invoices/status.ts` + `components/modules/InvoicesView.tsx`.

| UI Label | Exact filter in code | ERP field/status used | Business situation entering it | Trainer action available | Problem / risk |
|---|---|---|---|---|---|
| **To collect** (`outstanding`) | `filterInvoices` → `isOutstandingInvoiceStatus(status)` = `status ∈ {sent, overdue, partially_paid}`; sorted overdue-first (`InvoicesView.tsx:41-46`) | ERPNext `Unpaid`/`Overdue`/`Partly Paid` (docstatus 1) | Finalized invoice with balance > 0 | Card shows **Record payment** + **Send** (`:175-195`) → `recordPayment` | **Excludes drafts** — completed-session money never lands here; empty-state misdirects |
| **Preparing** (`preparing`) | `status === 'draft'` (`:47`) | ERPNext `Draft` (docstatus 0) | Auto-drafted completion invoices; manual invoices whose finalize failed; fallback/unknown statuses | **None on the card** (not actionable from list) | ERP-jargon label; holds real owed money with no CTA |
| **Paid** (`paid`) | `status === 'paid'` (`:48`) | ERPNext `Paid` | Fully settled | None needed | "Collected" KPI uses `amount`, not Payment Entry sum (see below) |
| **All** (`all`) | no filter (`:49`) | any | everything visible | per-card | Mixed states; no kind label (Package vs Session) |
| **Collected** KPI | `Σ amount where status==='paid'` (`:70-72`) | `grand_total` of paid invoices | — | — | Sums invoice totals, not actual payments; would misstate if an invoice were marked paid for less than its total |
| **Outstanding** KPI | `Σ outstandingAmount where isOutstanding` (`:66-68`) | `outstanding_amount` | — | — | **Excludes drafts**, so completed-session receivables are invisible in the headline number |

Specific sub-questions:
- **Drafts excluded from outstanding/collection totals?** Yes — by design (`status.ts:33-37`; `InvoicesView.tsx:66-72`).
- **Submitted-unpaid correctly in "To collect"?** Yes — `Unpaid → sent → outstanding`.
- **Overdue separate treatment?** Only a sort-to-top inside "To collect" (`:45`); no dedicated tab/badge.
- **Partial payments?** Supported end-to-end: `partially_paid` is outstanding & payable; card shows `owed {amount}` (`:165-169`). Tested in actions.
- **Failed issuance distinguishable from legitimate drafts?** **No.** A finalize failure (`IssueInvoiceResult.issueWarning`, `types/index.ts:147-156`) and a normal draft both render as "Preparing." The list discards `issueWarning`.
- **Cancelled/void safely excluded?** Yes — `cancelled` is neither outstanding nor paid nor draft; only in "All".
- **Reversals/refunds?** **Not implemented** anywhere (no credit-note / payment-reversal path).

---

## 8. Explanation of the Screenshot State (8 / $120 / To-collect empty / 4 Preparing / 4 Paid)

- **4 Paid, Collected $120**: 4 invoices map to `paid`; `Σ grand_total = $120`. The "Collected" card shows because `collected > 0` (`InvoicesView.tsx:74`). Consistent.
- **Outstanding card hidden**: `outstanding === 0` (no `sent/overdue/partially_paid` invoices), so the red card is suppressed (`:74,:78`). Consistent — only "Collected" shows.
- **To collect empty + "You have invoices still preparing…"**: zero outstanding invoices, and `hasDrafts === true` (`:459`), so the empty-state renders the "Open Preparing to review them" copy (`:526-528`).
- **4 Preparing**: 4 invoices are ERPNext `Draft`. Given the code, the overwhelmingly likely origin is **completed pay-per-session sessions** (each completion drafts one invoice via `completeSession`), and/or **manual invoices** created with finalize incomplete. 

**Is this expected behavior or a bug?** It is the *expected output of the current design*, and that design is a **defect for the trainer**: earned money is parked in a non-collectible, jargon-named tab and removed from the headline numbers.

**Is the trainer actually owed money on those 4?** Almost certainly yes in business terms; not yet as a booked ERPNext receivable (drafts post nothing).

**Is "Collected $120" computed correctly?** Mechanically yes for fully-paid invoices (`grand_total == paid`). It is **not** reconciliation-grade: it sums invoice totals, not Payment Entry amounts, so a "paid" invoice settled for less than its total would overstate "Collected." Low risk today.

**Read-only evidence needed to fully attribute the 4 drafts (NOT executed here):** a single read-only `GET /api/resource/Sales Invoice?filters=[["status","=","Draft"]]&fields=["name","customer","grand_total","custom_invoice_kind","custom_fd_session","remarks","creation"]` via the existing proxy. Drafts created by `completeSession` carry `remarks = "FitDesk session <id>"` and **null** `custom_invoice_kind`/`custom_fd_session`; manual `issueInvoice` drafts won't carry the session remark. This is read-only and within the architecture, but is **not** run as part of this audit per the no-ERP-I/O rule.

---

## 9. ERPNext Lifecycle Compliance Review

ERPNext Sales Invoice lifecycle (verified against official docs + frappe/erpnext source): **docstatus 0 = Draft, 1 = Submitted, 2 = Cancelled.** A REST POST creates docstatus 0; on **submit**, ERPNext posts GL entries and computes `status` as `Unpaid` → `Overdue` (past due date) → `Partly Paid` → `Paid` as Payment Entries are submitted against it. **A draft invoice cannot receive a Payment Entry.**

Where FitDesk **aligns**:
- `createInvoice()` correctly treats a POST as a draft and documents it (`client.ts:470-486`).
- `submitSalesInvoice()` uses the whitelisted `frappe.client.submit`, re-normalizes `set_posting_time`/`due_date` to avoid the due-date-before-posting-date trap, and re-fetches post-submit state (`client.ts:502-528`).
- `createAndSubmitPaymentEntry()` resolves `paid_to` from the Mode-of-Payment accounts table and **fails loudly** if no deposit account is configured rather than leaving an unreconciled draft (`client.ts:609-619`) — strong, correct behavior.
- The "draft cannot be paid" invariant in `status.ts` is **accounting-correct**.
- `recordPayment` re-fetches and requires `outstanding` to actually drop, else reports failure (`actions/invoices.ts:224-234`) — protects against false success.

Where FitDesk **maps ERP states poorly for the trainer**:
- It surfaces the raw **Draft** state as a primary navigation tab ("Preparing"). ERPNext treats Draft as an internal, pre-financial state; exposing it as a top-level trainer destination is the mismatch.
- The normal business event (session completion) **stops at Draft**, so the ERP "Unpaid" (collectible) state is never reached automatically — the product underuses its own correct submit path.
- `Submitted → sent` back-compat mapping is harmless but should not be relied on (ERPNext won't emit it for a normal submitted invoice).

---

## 10. 2026 Benchmark Research

**ERPNext / Frappe (financial source of truth).** Draft (docstatus 0) is non-collectible; submit (docstatus 1) makes it Unpaid/Overdue and enables Payment Entries; Cancelled = docstatus 2. This is the authoritative lifecycle FitDesk must respect.
- ERPNext Sales Invoice docs & status updater: `docs.erpnext.com/docs/user/manual/en/customer-orders-invoices-and-shipping-status`, `github.com/frappe/erpnext/blob/develop/erpnext/controllers/status_updater.py`.

**Stripe Invoicing (modern payments benchmark).** Five statuses: **draft, open, paid, uncollectible, void.** A *draft* is fully editable and **not collectible**; *finalizing* sets `open` (the collectible state). Drafts are explicitly an internal pre-issue state, never the customer's "you owe" surface.
- `docs.stripe.com/invoicing/overview`, `support.stripe.com/questions/invoice-states`.

Both leading systems agree: **a draft is not money owed; only a finalized/submitted/open invoice is collectible.** FitDesk's *internal* model already matches this; the *UI* breaks it by surfacing drafts as a trainer tab and by leaving completion invoices in draft.

**UX — Nielsen Norman Group Heuristic #2, "Match Between the System and the Real World."** Speak the user's language; avoid system-oriented terms; order information naturally. "Draft/Submitted/Preparing/docstatus" are system terms; "Need payment / Paid" is user language.
- `nngroup.com/articles/match-system-real-world/`.

**Coaching/PT software patterns (industry).** Tools in this category (e.g. Trainerize, TrueCoach, Mindbody-style booking-billing) present trainers with "unpaid / outstanding / overdue" money queues and a one-tap "mark/record paid," never accounting docstatus. (General industry pattern; treat as directional, not a spec.)

**Benchmark answers to the seven questions:**
1. Should a trainer see Draft/Submitted/Preparing as primary nav? **No** (NN/g #2; ERPNext/Stripe treat these as internal).
2. Primary unpaid-money queue name? **"Need payment"** (clear, action-oriented) — accept the proposal.
3. Separate collectible invoices from system/problem invoices? **Yes** — collectible money in "Need payment"; broken/misconfigured invoices in a "Needs attention" alert, not mixed in.
4. Pay-Later package invoices? Finalize immediately → outstanding → appears in "Need payment." (Requires Phase D package automation.)
5. Pay-per-session completed without payment? Auto-create **and finalize** (submit) the session invoice so it lands in "Need payment" — the missing half of today's flow.
6. Overdue — tab, badge, or prioritization? **Prioritization** (sort-to-top + badge) inside "Need payment" for MVP; not a separate tab.
7. Safest trainer-action → ERP mapping? See §13.

---

## 11. Gaps & Risks (ranked)

**CRITICAL**
- **C1 — Earned money invisible in the collection queue.** `completeSession` drafts the pay-per-session invoice (`sessionService.ts:243`) and `isOutstandingInvoiceStatus` excludes drafts (`status.ts:33-37`), so completed-session receivables never appear in "To collect" or the outstanding total, and have no list-level payment action. Direct cause of the founder's report. *Revenue-leak risk.*

**HIGH**
- **H1 — Unconditional invoicing / double-billing exposure.** `completeSession` creates an invoice for **every** completed session regardless of `custom_billing_mode` (no branch). A package client (pre-paid) who completes a session would still get a per-session draft → double billing once package flow exists (Master Plan §2.7).
- **H2 — Manual-invoice guardrail violated.** `/dashboard/invoices/new` is linked from `clients/[id]:223` and `clients/new:104`, contrary to the "hidden from normal flow" rule. Plus the `client` vs `clientId` param mismatch breaks preselect from one entry point.
- **H3 — $0-rate invoices.** No non-zero guard; a `rate = 0` session drafts a $0 invoice on completion; the manual form also defaults rate `0`.

**MEDIUM**
- **M1 — Terminology + misleading empty state.** "Preparing"/"To collect" is ERP-ish; the "Nothing to collect right now" copy fires while real owed money sits in "Preparing."
- **M2 — List/detail inconsistency.** Detail page pays drafts via `collectPayment` (`[id]/page.tsx:37-38`); the list uses `recordPayment` (rejects drafts) and hides the action — so drafts are unactionable exactly where the trainer looks first.
- **M3 — No `InvoicesView` component tests.** Tab membership, SummaryCards math, and empty-state copy are untested (only the `status.ts` predicate is unit-tested).
- **M4 — Weak invoice→session linkage.** Completion invoices set neither `custom_invoice_kind` nor `custom_fd_session` (`sessionService.ts:243-254`); reconciliation relies on a free-text remark.
- **M5 — "Collected" KPI** sums invoice totals, not Payment Entry amounts.
- **M6 — Stale doc/comment.** `completeSessionAction` says "Phase A: status flip only — no invoice side effects" (`schedulingActions.ts:290`) but it drafts an invoice — misleading for the next engineer.

**LOW**
- **L1 — No refund/reversal/credit-note path.**
- **L2 — Overdue/partial have no dedicated surfacing beyond sort + `owed` line.**
- **L3 — `trainerId` left `''` on normalized `Invoice`/`Payment`** (cosmetic; scoping is via client list).
- **L4 — Single-trainer-per-tenant assumption** (no `custom_trainer_id`) — acceptable for pilot, documented in code.

---

## 12. Recommended Trainer-Facing UX & Terminology

Adopt the proposed model with refinements:

- **Primary tabs:** **Need payment** · **Paid** · **All**. Hide Draft/Submitted/Preparing/docstatus from primary nav.
- **"Need payment"** = collectible money. Definition depends on the chosen depth:
  - *Pilot-now (UI-only):* `outstanding (sent/overdue/partially_paid)` **plus** `draft with amount > 0`, each actionable via `collectPayment` (finalize-then-pay). Sort overdue → oldest due date.
  - *Hardened (target):* completion/sale **finalizes** invoices, so "Need payment" = outstanding only and drafts become a near-empty recovery state (matches Master Plan §7.3 and Stripe/ERPNext).
- **"Needs attention"** = an **alert/card shown only when non-empty**, surfacing finalize/payment failures (`issueWarning`), $0-rate, and missing-config invoices — not a permanent tab.
- **Cards:** client + amount + due (overdue in red) + a **kind label** (Package/Session) once `custom_invoice_kind` is populated; actions relabeled to trainer language ("Record payment", "Send reminder").
- **Empty states:** when "Need payment" is truly empty, say so plainly; never point the trainer at internal "Preparing".

---

## 13. Recommended ERP-Safe Status Mapping

| Trainer action / event | ERPNext operation | Resulting ERP status | Trainer tab |
|---|---|---|---|
| Package sold — Paid now *(Phase D)* | Create SI (`custom_invoice_kind=Package`) → submit → Payment Entry submit | Paid | Paid |
| Package sold — Pay later *(Phase D)* | Create SI → submit | Unpaid (→Overdue) | Need payment |
| Pay-per-session completed — pay later *(fix C1/H1)* | Create SI (`Session`) → **submit** | Unpaid | Need payment |
| Pay-per-session completed — paid now *(Flow D)* | Create SI → submit → Payment Entry submit | Paid | Paid |
| Package session completed *(Phase E)* | **No invoice**; decrement balance (guarded) | — | (none) |
| Free-trial session completed *(Phase E)* | No invoice | — | (none) |
| Record payment on outstanding | Payment Entry create+submit (re-fetch verify) | Paid / Partly Paid | Paid / Need payment |
| Finalize/payment failed | Leave draft/outstanding + surface warning | Draft / Unpaid | Needs attention |

Non-negotiable: every state transition goes through the existing `lib/erpnext/client.ts` calls via the Control-Plane proxy; FitDesk never writes ERP directly and never books a receivable by faking UI state.

---

## 14. MVP / Pilot-Safe Now (UI-only, reversible — no accounting change)

1. **Make the list collect drafts**: switch `InvoicesView`'s record-payment call from `recordPayment` to **`collectPayment`** (already finalizes-then-pays; already tested). Show the "Record payment" action on draft-with-amount cards.
2. **Relabel + requeue**: "To collect" → **"Need payment"**; include `draft (amount>0)` in that queue alongside outstanding; sort overdue → oldest.
3. **Demote "Preparing"**: remove it as a primary tab; if kept, scope it to a "Needs attention" recovery surface shown only when non-empty.
4. **Fix empty-state copy** so it never says "nothing to collect" while owed drafts exist.
5. **Hide manual-invoice entry points** (remove links in `clients/[id]:223` and `clients/new:104`; keep the route as admin/fallback) and fix the `client`/`clientId` param mismatch.
6. **Add `InvoicesView` tests** for the new filter/labels/empty states.
7. **Correct the stale comment** on `completeSessionAction`.

> Items 1–4 change what the primary tab *means* → **founder sign-off required** before implementation, but they touch no ERP/accounting code.

---

## 15. Production-Hardening Soon (correctness; approval-gated where noted)

1. **Finalize pay-per-session completion invoices** — make `completeSession` produce a *submitted* invoice (reuse `issueInvoice`/`submitSalesInvoice`) or offer paid-now/pay-later at completion (Master Plan §6.2). **Approval-gated (accounting timing).**
2. **Billing-mode branch in `completeSession`** (package = decrement, no invoice; pay-per-session = invoice; trial = guard). Fixes H1. **Approval-gated.** (Decision Note §15.13.)
3. **$0-rate guard** before auto-invoicing (H3).
4. **Populate `custom_invoice_kind` + `custom_fd_session`** on auto invoices (provisioning + adapter). **Approval-gated (ERP fields).**
5. **"Needs attention" recovery surface** consuming `issueWarning` + missing-deposit-account + $0 cases.
6. **Overdue prioritization & partial-payment polish**; define **refund/reversal** treatment (currently none).
7. **"Collected" from Payment Entries**, not invoice totals, for reconciliation.
8. **Financial regression test matrix** (§17).

---

## 16. Future Platform Architecture (Later — do not overbuild for pilot)

Package sale auto-invoice (`sellPackageToClient`, Phase D) + balance decrement service; unified `PaymentMethod`/`PaymentProvider` registry + payment chips; real Whish API + webhook/status reconciliation; automated reminders/dunning; receivables/financial dashboards; multi-trainer scoping (`custom_trainer_id`); package catalog / subscriptions / expiry automation. (All consistent with Master Plan §14 "Later".)

---

## 17. Minimum Regression Test Matrix (specify now; do not write yet)

- **InvoicesView (new):** tab membership for every `InvoiceStatus`; "Need payment" includes draft-with-amount + outstanding and excludes paid/cancelled; SummaryCards outstanding/collected math; per-tab empty-state copy; overdue sort-to-top.
- **List collect path:** draft → `collectPayment` finalizes+pays; outstanding → pays directly; paid/cancelled rejected; `issueWarning`/failure routes to "Needs attention".
- **completeSession (per mode, once branched):** pay-per-session → submitted invoice with `Session` kind + `custom_fd_session`; package → no invoice + guarded decrement (idempotent via `session_consumed_package`); trial → no invoice; **$0-rate guard**; existing `invoice_id` reuse (idempotency).
- **Package (Phase D):** Paid-now vs Pay-later branches independently; retried sale does not double-invoice.
- **ERP mapping:** `mapInvoiceStatus` for all ERPNext values incl. `Submitted`/`Return`/`Credit Note Issued`/unknown-fallback; `normalizeInvoice` `paidAt`/`outstanding` edges.
- **Edge:** partial payment; overdue; cancelled exclusion; refund/reversal (once designed).

Current coverage (for reference): `actions/invoices.test.ts` thoroughly covers `recordPayment`, `finalizeInvoice`, `collectPayment`, `issueInvoice` (incl. draft→pay, partial, finalize-fail recovery, auth). `lib/invoices/status.test.ts` covers labels + predicate. `sessionService.test.ts` covers `completeSession` calling `createInvoice` with the right item/rate/client but **does not** assert invoice kind/links or billing-mode behavior. **No** `InvoicesView` component test exists.

---

## 18. Questions Requiring Founder Approval Before Implementation

1. **Business confirmation:** do draft completed-session invoices represent money the trainer should collect? (Drives whether drafts join "Need payment" or are treated as recovery-only.)
2. **Terminology + queue semantics:** approve "Need payment / Paid / All" + "Needs attention" alert; approve including draft-with-amount in "Need payment" for the pilot **vs** finalize-on-completion first.
3. **Hide manual invoice entry points now?** (Keep route as admin/fallback.)
4. **Accounting-timing change (gated):** approve making pay-per-session completion *finalize* its invoice, and approve the `completeSession` billing-mode branch (Phases D/E) — these are accounting-behavior changes per workspace `CLAUDE.md` §4.
5. **ERP field provisioning (gated):** approve populating `custom_invoice_kind`/`custom_fd_session`.
6. **Report location:** confirm flat `docs/` placement (this file) vs creating a `docs/audits/` subfolder.

---

## 19. Recommended Next Implementation Prompt Scope (no implementation here)

**Scope a single UI-only PR** (smallest safe change, founder-approved, reversible):
- Files: `components/modules/InvoicesView.tsx` (+ new `components/modules/__tests__/InvoicesView.test.tsx`), and the two client-page links (`app/dashboard/clients/[id]/page.tsx`, `app/dashboard/clients/new/page.tsx`).
- Behavior: relabel "To collect" → "Need payment"; include draft-with-amount in that queue; switch the list record-payment to `collectPayment`; demote "Preparing"; fix empty-state copy; remove manual-invoice entry links.
- Guardrails: **no** change to `lib/erpnext/*`, `actions/invoices.ts`, `lib/scheduling/sessionService.ts`, or any ERP/provisioning/payment-write code. Verify with `npx next lint` + `npx vitest run` + `npm run build:verify`.
- Separately (gated, later): a Phase-E prompt to add the `completeSession` billing-mode branch + finalize-on-completion, scoped against a **test tenant** with explicit approval.

---

## 20. Appendix — Evidence (paths · functions · line refs)

- **Labels & grouping:** `lib/invoices/status.ts` — `INVOICE_STATUS_LABELS` (`:12-19`, `draft → 'Preparing'`, `sent → 'To collect'`), `OUTSTANDING_STATUSES` excludes draft (`:33-37`), `isOutstandingInvoiceStatus` (`:43-45`).
- **List view:** `components/modules/InvoicesView.tsx` — `FilterTab` (`:25`), `filterInvoices` (`:41-50`), `tabCount` (`:52-57`), `SummaryCards` outstanding/collected (`:65-72`), `isActionable`/card actions (`:122`,`:175-195`), `recordPayment` call (`:16`,`:234`), `TABS` (`:438-443`), `hasDrafts` (`:459`), empty-state copy (`:514-543`).
- **Server actions:** `actions/invoices.ts` — `addInvoice` draft (`:83-96`), `recordPayment` rejects non-outstanding incl. draft (`:157-262`, gate `:194-199`, verify `:224-234`), `finalizeInvoice` (`:274-312`), `collectPayment` draft→finalize→pay (`:328-388`), `issueInvoice` create+finalize (`:400-425`).
- **ERP client:** `lib/erpnext/client.ts` — `mapInvoiceStatus` (`:168-184`), `normalizeInvoice` (`:216-242`), `getInvoices` scoping/fallback (`:373-451`), `createInvoice` draft (`:471-486`), `submitSalesInvoice` (`:502-528`), `createAndSubmitPaymentEntry` + `paid_to` guard (`:578-659`,`:609-619`).
- **ERP types:** `lib/erpnext/types.ts` — `ERPInvoice.status` union incl. `Draft`/`Unpaid`/`Submitted` (`:71-80`), `custom_fd_session`/`custom_invoice_kind` (`:82-83`), `CreateInvoicePayload` (`:169-179`).
- **Session completion:** `lib/scheduling/sessionService.ts` — `completeSession` drafts via `createInvoice`, no kind/link fields (`:228-259`, create `:243-254`); `actions/schedulingActions.ts` — `completeSessionAction` + stale "Phase A" comment (`:287-308`); `components/scheduling/SessionDetailsSheet.tsx` — `handleComplete` (`:101-120`).
- **Detail/pay/finalize:** `app/dashboard/invoices/[id]/page.tsx` — `canCollectPayment` incl. draft (`:37-38`), `FinalizeInvoiceButton` (`:143-145`); `FinalizeInvoiceButton.tsx` (`:17-53`); `app/dashboard/invoices/[id]/pay/RecordPaymentForm.tsx` — `collectPayment` (`:7`,`:31`).
- **Manual route + links:** `app/dashboard/invoices/new/page.tsx` — `issueInvoice` (`:69`), default rate 0 (`:26`), reads `?client` (`:20`); links `app/dashboard/clients/[id]/page.tsx:223`, `app/dashboard/clients/new/page.tsx:104` (passes `clientId`).
- **Billing helpers:** `lib/clients/billing.ts` — "No invoice automation" (`:1-7`), `billingPayloadFields` (`:92-110`).
- **Types:** `types/index.ts` — `InvoiceStatus` (`:18`), `Invoice` (`:88-106`), `RecordPaymentResult` (`:133-142`), `IssueInvoiceResult.issueWarning` (`:147-156`).
- **Facade:** `lib/business-data/index.ts` — `getInvoices` (`:33-38`), `collectPayment` (`:82-92`).
- **Tests:** `actions/invoices.test.ts` (recordPayment/finalize/collect/issue, 518 lines), `lib/invoices/status.test.ts` (labels/predicate), `lib/scheduling/__tests__/sessionService.test.ts` (completeSession `:334-421`).
- **Design docs:** `docs/FitDesk Client Billing Invoice Payment UX Master Plan.md` (§2.4 unconditional draft, §2.7 risks, §6 completion flows, §7 Money/tabs), `docs/FitDesk Client Billing Data Model Decision Note.md` (§9 invoice rules, §15 approvals).

**External sources:**
- ERPNext Sales Invoice lifecycle — https://docs.erpnext.com/docs/user/manual/en/customer-orders-invoices-and-shipping-status ; status updater — https://github.com/frappe/erpnext/blob/develop/erpnext/controllers/status_updater.py
- Stripe invoice states — https://docs.stripe.com/invoicing/overview ; https://support.stripe.com/questions/invoice-states
- NN/g Heuristic #2, Match Between the System and the Real World — https://www.nngroup.com/articles/match-system-real-world/

---

*End of report. No application code, tests, ERPNext data, or runtime state were modified in producing this audit.*
