# FitDesk Phase B Data Model + Provisioning Implementation Plan

> Planning document — Phase B of the FitDesk Client Billing roadmap. Planning only: no code, no ERPNext/provisioning edits, nothing staged or committed. Phase B is **approval-gated** before any implementation.

## Context

Phase A is complete and committed as documentation:
- `43f8671` — Client Billing Invoice Payment UX Master Plan
- `fc3d7c6` — Client Billing Data Model Decision Note

The Decision Note locked the MVP data model. Phase B is the first **code** phase: it lands the additive schema and TypeScript plumbing so later phases (client-creation UX, package sale, completion branch, payment UX) have fields to build on. Phase B deliberately changes **no billing behavior** — `completeSession()` still invoices unconditionally, no balance is decremented, no invoice automation, no UI. It only adds fields and the read/write support to carry them. Every change is additive (nothing removed or retyped) and reversible.

---

## 1. Executive Summary

Phase B adds, additively:

- **5 ERPNext Custom Fields** — 3 on Customer (`custom_billing_mode`, `custom_default_session_rate`, `custom_package_name`), 2 on Sales Invoice (`custom_fd_session`, `custom_invoice_kind`) — via `fitdesk_setup.py`.
- **2 FD Session doctype fields** — `is_trial_session`, `session_consumed_package` — via `fd_session.json`.
- **TypeScript plumbing** — widen the ERP type interfaces, fetch projections, and normalizers so FitDesk can **read** the new Customer/Invoice/Session fields, and make the existing `custom_remaining_sessions` **writable** by adding it to `UpdateClientPayload`.
- **Schema verification** — bump `verify_fitdesk_schema()` from `10` to `15` and extend its fieldname list.
- **Backfill** — Phase B produces the **strategy only** (this plan). The backfill is not run.

No behavior changes: no session-completion branch, no `decrementRemainingSessions`, no invoice automation, no payment logic, no UI. Those are Phases C–G.

The single most important constraint: **provisioning must be live and verified on every tenant before the FitDesk app ships the widened fetch projections** — Frappe returns HTTP 417 for unknown field names, so requesting an unprovisioned field breaks every Customer/Invoice/Session fetch.

---

## 2. Exact Files Likely Affected

### provisioning_api repo
- `provisioning_api/provisioning_api/api/fitdesk_setup.py`
  - `_CUSTOM_FIELDS` list (lines 171–184) — append 5 tuples
  - `_create_custom_fields()` docstring (line ~188) — fix stale "7" → "15"
  - `verify_fitdesk_schema()` (lines 621–672) — count `10`→`15` (line 666), extend fieldname list (lines 645–656)

### FD Session doctype files (provisioning_api repo)
- `provisioning_api/provisioning_api/api/doctype/fd_session/fd_session.json`
  - `field_order` array (lines 7–28) — append 2 fieldnames
  - `fields` array (lines 30–156) — append 2 field objects
- `provisioning_api/.../doctype/fd_session/fd_session.py` — **no change in Phase B**

### FitDesk TypeScript types (FitDesk repo)
- `FitDesk/lib/erpnext/types.ts` — `ERPClient` (28–41), `CreateClientPayload` (124–136), `UpdateClientPayload` (138–149), `ERPInvoice` (47–81), `CreateInvoicePayload` (151–159)
- `FitDesk/types/index.ts` — `Client` (53–74), `Invoice` (82–96)
- `FitDesk/types/scheduling.ts` — `FDSession` (89–110), and the raw `ERPFDSession` interface consumed by `normalizeSession()`

### ERP adapter / client files (FitDesk repo)
- `FitDesk/lib/erpnext/client.ts` — `clientFields()` (256–267), `invoiceFields()` (269–275, private), `normalizeClient()` (197–211), `normalizeInvoice()` (213–237)
- `FitDesk/lib/scheduling/sessionRepository.ts` — `sessionFields()` (48–55), `normalizeSession()` (66–88), and the `updateSession()` patch type (~216–237)

### tests (FitDesk repo)
- `FitDesk/lib/erpnext/client.test.ts` — update `clientFields()`, `normalizeClient()`, `normalizeInvoice()` cases
- **New:** `FitDesk/lib/scheduling/sessionRepository.test.ts` — `normalizeSession()` coverage for the 2 new fields (no such test exists today)

### docs
- No documentation edits required. The Master Plan and Decision Note already cover Phase B intent. (An optional backfill-spec doc is unnecessary — §7 below is sufficient.)

---

## 3. Field-by-Field Implementation Plan

The `_CUSTOM_FIELDS` tuple shape is `(target_doctype, fieldname, label, fieldtype, options, insert_after)` — all 5 new Customer/Invoice fields fit it unchanged. Frappe Custom Field `reqd` defaults to `0`; no tuple extension is needed for the "not mandatory" requirement.

### 3.1 `custom_billing_mode` (Customer)
- **DocType:** Customer · **Type:** Select · **Options:** `"Package\nPay Per Session\nTrial"` (exact)
- **Default:** none · **Required:** `reqd=0` (Frappe default; FitDesk-layer required, ERPNext optional — Decision Note §15.3)
- **Provisioned:** `_CUSTOM_FIELDS`, `insert_after = "custom_remaining_sessions"`
- **Read/written in FitDesk:** add to `clientFields()` projection; map in `normalizeClient()` → `Client.billingMode`; add optional field to `CreateClientPayload` + `UpdateClientPayload`. Phase B writes nothing automatically — types only.
- **Tests:** `clientFields()` projection includes it; `normalizeClient()` maps when present / `undefined` when absent.

### 3.2 `custom_default_session_rate` (Customer)
- **DocType:** Customer · **Type:** Currency · **Options:** none
- **Default:** none · **Required:** `reqd=0` (FitDesk-layer enforces `>0` only for Pay Per Session — that enforcement is Phase C, not B)
- **Provisioned:** `_CUSTOM_FIELDS`, `insert_after = "custom_billing_mode"`
- **Read/written in FitDesk:** projection + `normalizeClient()` → `Client.defaultSessionRate`; `CreateClientPayload` + `UpdateClientPayload`.
- **Tests:** projection + normalizer cases.

### 3.3 `custom_package_name` (Customer)
- **DocType:** Customer · **Type:** Data · **Options:** none
- **Default:** none · **Required:** `reqd=0`
- **Provisioned:** `_CUSTOM_FIELDS`, `insert_after = "custom_default_session_rate"`
- **Read/written in FitDesk:** projection + `normalizeClient()` → `Client.packageName`; `CreateClientPayload` + `UpdateClientPayload`.
- **Tests:** projection + normalizer cases.

### 3.4 `custom_fd_session` (Sales Invoice)
- **DocType:** Sales Invoice · **Type:** Data (stores FD Session docname; Data not Link — keeps symmetry with FD Session `invoice_id` and avoids cross-doctype Link validation) · **Options:** none
- **Default:** none · **Required:** `reqd=0`
- **Provisioned:** `_CUSTOM_FIELDS`, `insert_after = "custom_payment_reference"`
- **Read/written in FitDesk:** add to `invoiceFields()` projection; map in `normalizeInvoice()` → `Invoice.fdSessionId`; add optional field to `CreateInvoicePayload` (top-level Sales Invoice field).
- **Tests:** `normalizeInvoice()` maps/omits; projection includes it.

### 3.5 `custom_invoice_kind` (Sales Invoice)
- **DocType:** Sales Invoice · **Type:** Select · **Options:** `"Package\nSession"` (exact)
- **Default:** none · **Required:** `reqd=0`
- **Provisioned:** `_CUSTOM_FIELDS`, `insert_after = "custom_fd_session"`
- **Read/written in FitDesk:** `invoiceFields()` + `normalizeInvoice()` → `Invoice.invoiceKind`; `CreateInvoicePayload`.
- **Tests:** `normalizeInvoice()` maps/omits.

### 3.6 `is_trial_session` (FD Session)
- **DocType:** FD Session (custom doctype) · **Type:** Check · **Default:** `"0"` · **Required:** no
- **Provisioned:** **not** `_CUSTOM_FIELDS` — added directly to `fd_session.json` `fields` + `field_order`. Does **not** count toward `verify_fitdesk_schema()`.
- **Read/written in FitDesk:** add to `sessionFields()` projection; map in `normalizeSession()` (`raw.is_trial_session === 1`) → `FDSession.isTrialSession`; add `is_trial_session?: 0 | 1` to the raw `ERPFDSession` type.
- **Tests:** new `sessionRepository.test.ts` — `normalizeSession()` maps `1`→`true`, `0`/absent→`false`.

### 3.7 `session_consumed_package` (FD Session)
- **DocType:** FD Session · **Type:** Check · **Default:** `"0"` · **Required:** no
- **Provisioned:** `fd_session.json` `fields` + `field_order`.
- **Read/written in FitDesk:** `sessionFields()` + `normalizeSession()` → `FDSession.sessionConsumedPackage`; raw `ERPFDSession` gets `session_consumed_package?: 0 | 1`.
- **Tests:** `normalizeSession()` mapping.

### 3.8 `custom_remaining_sessions` (Customer — existing field, make writable)
- Already provisioned (Int) and already read (`clientFields()` + `normalizeClient()` → `Client.remainingSessions`).
- **Phase B change:** add `custom_remaining_sessions?: number` to `UpdateClientPayload` so `updateClient()` can patch it. `updateClient()` already forwards the payload verbatim — no function-body change needed.
- **No new write call in Phase B.** The `decrementRemainingSessions` service and any balance mutation are Phase E. Phase B only removes the type-level block on writing the field.
- **Tests:** a payload-construction test confirming `UpdateClientPayload` accepts `custom_remaining_sessions` (compile-enforced by strict `tsc`; optionally an explicit test).

---

## 4. Provisioning Plan (`fitdesk_setup.py`)

### 4.1 `_CUSTOM_FIELDS` additions
Append 5 tuples (existing 6-element shape, no shape change):

```python
# On Customer
("Customer", "custom_billing_mode",          "Billing Mode",          "Select",   "Package\nPay Per Session\nTrial", "custom_remaining_sessions"),
("Customer", "custom_default_session_rate",  "Default Session Rate",  "Currency", None,                              "custom_billing_mode"),
("Customer", "custom_package_name",          "Package Name",          "Data",     None,                              "custom_default_session_rate"),
# On Sales Invoice
("Sales Invoice", "custom_fd_session",   "FD Session",   "Data",   None,              "custom_payment_reference"),
("Sales Invoice", "custom_invoice_kind", "Invoice Kind", "Select", "Package\nSession", "custom_fd_session"),
```

### 4.2 `verify_fitdesk_schema()` updates
- Change the count assertion (line 666): `checks["custom_fields"] == 10` → `== 15`.
- Extend the `fieldname ["in", [...]]` list (lines 645–656) with the 5 new fieldnames.
- The `dt ["in", ["Customer", "Sales Invoice"]]` filter already covers both target doctypes — no change there.

### 4.3 Docstring correction
`_create_custom_fields()` docstring currently says "Create the 7 FitDesk Custom Field records" — it is already stale (10 entries today). Update to "15" while the file is open. Cosmetic.

### 4.4 Existing tenants — rerun required
- `_create_custom_fields()` is idempotent (`frappe.db.exists` skip). Re-running `setup_fitdesk_schema` on an already-provisioned tenant inserts **only** the 5 new fields and skips the 10 existing — safe.
- Every existing tenant must have `setup_fitdesk_schema` re-run (via bench-agent) to gain the new Customer/Invoice fields. **This is an approval-gated bench operation** (workspace `CLAUDE.md` §4).
- The bench-agent parser `_parse_fitdesk_result()` only checks `ok=true` and extracts `custom_fields=<int>` — it does **not** assert a specific count, so a higher count does not break the contract.

### 4.5 Keeping it additive and safe
- Only **inserts** — no field is removed, renamed, or retyped. Idempotent and re-runnable.
- Rollback = leave the new fields unused (or, if ever needed, delete the 5 Custom Field records — a separate approval-gated step).

---

## 5. FD Session Doctype Plan (`fd_session.json`)

### 5.1 Fields to add
Append two objects to the `fields` array (style mirrors the existing `is_override` Check field):

```json
{ "default": "0", "fieldname": "is_trial_session",         "fieldtype": "Check", "label": "Is Trial Session" },
{ "default": "0", "fieldname": "session_consumed_package", "fieldtype": "Check", "label": "Session Consumed Package" }
```

### 5.2 Placement
- Append both fieldnames to the end of `field_order` (after `notes`). `field_order` controls form layout only — end-append is the minimal, fully additive diff and does not move any existing field.

### 5.3 Default values
- Both `"0"` — every new record and every existing row reads as `false` with no migration of data.

### 5.4 `fd_session.py` validation — no change in Phase B
- `validate()` keeps only `_validate_occurrence_uniqueness()`.
- The non-zero `rate` guard, trial-session handling, and package-consumption logic all belong to **Phase E** (session-completion branch). Phase B adds the fields but no validation or behavior.

### 5.5 Deployment mechanism
- FD Session is an **app-owned doctype** (part of `provisioning_api`). New fields apply to a tenant via `bench migrate` after the app is updated — a **different mechanism** from the runtime Custom Field inserts in §4. `bench migrate` on any tenant is **approval-gated**.

---

## 6. TypeScript Adapter Plan

### 6.1 `lib/erpnext/types.ts`
- `ERPClient` — add: `custom_billing_mode?: 'Package' | 'Pay Per Session' | 'Trial'`, `custom_default_session_rate?: number`, `custom_package_name?: string`.
- `CreateClientPayload` — add the same 3 as optional.
- `UpdateClientPayload` — add the same 3 as optional **plus** `custom_remaining_sessions?: number` (the writable-balance enabler).
- `ERPInvoice` — add: `custom_fd_session?: string`, `custom_invoice_kind?: 'Package' | 'Session'`.
- `CreateInvoicePayload` — add: `custom_fd_session?: string`, `custom_invoice_kind?: 'Package' | 'Session'` (top-level Sales Invoice fields, not `CreateInvoiceItem`).

### 6.2 `lib/erpnext/client.ts`
- `clientFields()` — add `'custom_billing_mode'`, `'custom_default_session_rate'`, `'custom_package_name'` to the projected array.
- `invoiceFields()` — add `'custom_fd_session'`, `'custom_invoice_kind'`.
- `normalizeClient()` — map the 3 new raw fields → `Client.billingMode` / `.defaultSessionRate` / `.packageName` (using the existing `?? undefined` pattern).
- `normalizeInvoice()` — map the 2 new raw fields → `Invoice.fdSessionId` / `.invoiceKind`.
- `createClient()`, `updateClient()`, `createInvoice()` — **no body change**. They forward the payload verbatim (`createInvoice` already spreads `payload`); widening the payload types is sufficient.

### 6.3 App domain types (`types/index.ts`)
- `Client` — add `billingMode?: 'Package' | 'Pay Per Session' | 'Trial'`, `defaultSessionRate?: number`, `packageName?: string`.
- `Invoice` — add `fdSessionId?: string`, `invoiceKind?: 'Package' | 'Session'`.

### 6.4 Scheduling types + repository
- `types/scheduling.ts` — `FDSession`: add `isTrialSession: boolean`, `sessionConsumedPackage: boolean` (non-optional; the normalizer always produces a boolean). The raw `ERPFDSession` interface: add `is_trial_session?: 0 | 1`, `session_consumed_package?: 0 | 1`.
- `lib/scheduling/sessionRepository.ts`:
  - `sessionFields()` — add `'is_trial_session'`, `'session_consumed_package'`.
  - `normalizeSession()` — add `isTrialSession: raw.is_trial_session === 1`, `sessionConsumedPackage: raw.session_consumed_package === 1`.
  - `bulkCreateSessions` payload — **no change required**: the doctype `default: "0"` covers new rows, and Phase B introduces no trial/consumption behavior. (Optional: add explicit `is_trial_session: 0, session_consumed_package: 0` — equivalent to the default; recommend leaving the create payload untouched for a zero-behavior diff.)
  - `updateSession()` patch type — optionally widen the patch interface to permit the 2 new fields so Phase E can write them. Recommended but optional in Phase B; no caller writes them yet.

### 6.5 Deployment-ordering constraint (critical)
`clientFields()`, `invoiceFields()`, and `sessionFields()` request explicit field names. Frappe returns **HTTP 417** for unknown field names (documented in the existing `clientFields()` comment). Therefore the FitDesk app build that widens these projections must ship **only after** §4 + §5 provisioning is live and verified on every tenant. See §10 ordering.

---

## 7. Backfill Plan (strategy only — not run in Phase B)

Phase B defines the strategy; it does **not** run any backfill. The backfill is a one-off, **approval-gated**, dry-run-first operation (Decision Note §12).

### 7.1 Shape
A `bench execute`-able function in `provisioning_api` (e.g. `provisioning_api.api.fitdesk_backfill.backfill_billing_mode`) with a `dry_run: bool = True` parameter. **Default dry-run.** Authoring this script is optional in Phase B; if authored, it ships dry-run-default with **no automatic caller** and is **never executed** during Phase B.

### 7.2 Rules
- **Clients with `custom_remaining_sessions > 0` and empty `custom_billing_mode`** → set `custom_billing_mode = "Package"`; set `custom_package_name = "Existing Package"` if blank. Do not invent a price; do not reconstruct the original package invoice.
- **Clients with no balance and empty `custom_billing_mode`** → leave `null` (= "needs setup"). Do not guess Pay Per Session.
- **Existing sessions with `rate = 0`** → not modified. Listed in the dry-run report so the trainer can correct still-open/future ones.
- **Existing invoices** → not modified. `custom_fd_session` / `custom_invoice_kind` optionally backfilled only where confidently matchable via the existing `remarks` string `FitDesk session {id}` — optional, low priority, may be skipped entirely for MVP.

### 7.3 Dry-run, logging, rollback
- **Dry-run mode** lists every intended write (`docname: field old → new`) and writes nothing.
- **Logging** — per-record old→new, per-category totals, and a final summary (clients set to Package, clients left null, zero-rate sessions flagged).
- **Rollback** — purely additive; to revert the inferred-Package set, clear `custom_billing_mode` on the affected docnames (the dry-run/run log provides the exact list). No invoice or session data is mutated, so there is nothing else to undo.
- **Run gate** — executed only after explicit approval, on a **test tenant first**, dry-run reviewed before any live write.

---

## 8. Tests Plan

All FitDesk tests run under **Vitest** (`vitest.config.ts`; `npm test` → `vitest run`).

### 8.1 Update `lib/erpnext/client.test.ts`
- `clientFields()` test — assert the projected array now includes `custom_billing_mode`, `custom_default_session_rate`, `custom_package_name` (and still excludes the unprovisioned blood-type/emergency-contact fields).
- `normalizeClient()` tests — add cases: 3 new fields present → mapped to `billingMode`/`defaultSessionRate`/`packageName`; absent → `undefined`.
- `normalizeInvoice()` tests — add cases: `custom_fd_session`/`custom_invoice_kind` present → mapped to `fdSessionId`/`invoiceKind`; absent → `undefined`.
- If a Sales Invoice fetch/projection test exists, update it for the 2 new invoice fields. (`invoiceFields()` is private — assert indirectly via a `getInvoiceById`-style test, or test the public fetch path.)

### 8.2 New `lib/scheduling/sessionRepository.test.ts`
- No test covers `normalizeSession()` today. Add one: raw `is_trial_session: 1` → `isTrialSession: true`; `0` or absent → `false`; same for `session_consumed_package`.
- Assert `sessionFields()` includes the 2 new fieldnames.

### 8.3 Payload type checks
- `CreateClientPayload` / `UpdateClientPayload` / `CreateInvoicePayload` accepting the new fields is enforced by strict `tsc` at build. Optionally add a tiny test that constructs each payload with the new fields to make the intent explicit.

### 8.4 Provisioning schema verification
- `provisioning_api` has **no Python test harness** today. Do **not** add one in Phase B — new test infra would be overbuild for a 5-tuple addition.
- The `verify_fitdesk_schema()` count change (`10`→`15`) is verified by **running `verify_fitdesk_schema()` on a test tenant** after provisioning (manual / integration check), not by a unit test.

### 8.5 Run
- `npm test` (FitDesk) — must stay green after the type/adapter/test changes.

---

## 9. Safety / Approval Gates

| Item | Gate |
|---|---|
| ERPNext Custom Field additions (Customer, Sales Invoice) | **Approval-gated** — `CLAUDE.md` §4 |
| FD Session doctype JSON change (`fd_session.json`) | **Approval-gated** — DocType change |
| Re-running `setup_fitdesk_schema` on any tenant | **Approval-gated** — provisioning operation |
| `bench migrate` on any tenant (to apply FD Session fields) | **Approval-gated** — provisioning operation |
| Backfill run | **Approval-gated** — not run in Phase B; dry-run + test tenant first |
| Payment / accounting / invoice-automation behavior | **None in Phase B** — explicitly excluded (§11) |
| Session-completion behavior | **No change in Phase B** — `completeSession()` untouched |
| Deployment ordering | Provisioning live + `verify_fitdesk_schema` green on every tenant **before** the FitDesk app ships the widened projections — otherwise 417 errors |

Phase B writes editable files in two separate repos (`provisioning_api`, `FitDesk`). The TypeScript-only changes (types, normalizers, tests) are low-risk and locally verifiable; the ERPNext/provisioning changes are the approval-gated portion.

---

## 10. Commit Boundaries (recommended — do not commit in this planning phase)

`provisioning_api` and `FitDesk` are **separate git repositories** (workspace `CLAUDE.md` §3). Commits land in their respective repos.

1. **provisioning_api — Custom Fields:** `fitdesk_setup.py` (`_CUSTOM_FIELDS` +5, `verify_fitdesk_schema` count/list, docstring fix).
2. **provisioning_api — FD Session doctype:** `fd_session.json` (+2 fields, +2 `field_order` entries).
   *(1 and 2 may be combined into one `provisioning_api` schema commit; separate commits are cleaner for review and rollback.)*
3. **FitDesk — types + adapter:** `lib/erpnext/types.ts`, `types/index.ts`, `types/scheduling.ts`, `lib/erpnext/client.ts`, `lib/scheduling/sessionRepository.ts`.
4. **FitDesk — tests:** updated `lib/erpnext/client.test.ts` + new `lib/scheduling/sessionRepository.test.ts`. *(May fold into commit 3.)*
5. **(Optional) provisioning_api — backfill script:** dry-run-default function, no caller, never executed. Separate commit so it is independently reviewable.

Each commit is small, additive, and reversible. **Phase B planning produces no commits** — commits happen only in the implementation phase, after approval.

---

## 11. Out of Scope (explicitly excluded from Phase B)

- Client-creation UX / billing-setup step / stepped bottom sheet
- `sellPackageToClient` action and automatic package-invoice creation
- `completeSession()` billing branch (mode-keyed completion)
- `decrementRemainingSessions` balance service and any balance mutation
- Session-invoice automation / invoice-kind tagging at creation time
- The non-zero `rate` guard and any `fd_session.py` validation change
- Payment chips, unified `PaymentMethod`/`PaymentProvider` registry
- Whish real API / webhook / payment-link integration
- WhatsApp preview/send changes
- Running the backfill
- Hiding the manual invoice route / Money-tab rename

All of the above are Phases C–G of the Master Plan.

---

## 12. Final Recommendation — safe implementation order

1. **Approve** this plan and the §4–§5 schema changes (ERPNext field/doctype changes are approval-gated).
2. **provisioning_api — schema:** edit `fitdesk_setup.py` (`_CUSTOM_FIELDS` +5, `verify_fitdesk_schema` `10`→`15` + fieldname list, docstring) and `fd_session.json` (+2 Check fields, +2 `field_order` entries). Commit (commits 1–2).
3. **Deploy provisioning + apply to a test tenant:** re-run `setup_fitdesk_schema` (idempotent — inserts the 5 new Custom Fields) and `bench migrate` (applies the 2 FD Session fields) on a **test tenant**. Run `verify_fitdesk_schema()` and confirm `custom_fields == 15` and all checks green. *(Approval-gated bench operations.)*
4. **FitDesk — types + adapter:** widen `types.ts`, `types/index.ts`, `types/scheduling.ts`; update `client.ts` (`clientFields`, `invoiceFields`, `normalizeClient`, `normalizeInvoice`) and `sessionRepository.ts` (`sessionFields`, `normalizeSession`); add `custom_remaining_sessions` to `UpdateClientPayload`. Commit (commit 3).
5. **FitDesk — tests:** update `client.test.ts`, add `sessionRepository.test.ts`. Run `npm test` until green. Commit (commit 4).
6. **Verify end-to-end on the test tenant:** with the test tenant provisioned (step 3), point FitDesk at it and confirm Customer / Sales Invoice / FD Session fetches succeed (no 417), the new fields normalize correctly, and a `custom_remaining_sessions` patch via `updateClient()` round-trips.
7. **Roll provisioning to remaining tenants** (re-run `setup_fitdesk_schema` + `bench migrate`, verify) **before** the FitDesk app build with widened projections reaches those tenants — this ordering prevents 417 errors.
8. **Backfill stays a separate, later, approved step** — dry-run on a test tenant, review, then run. Not part of Phase B.
9. Phase B ends here. Phases C–G build on the fields it lands.

**Verification summary:** local — `npm test` (Vitest) green, `tsc`/`next build` clean; tenant — `verify_fitdesk_schema()` returns `custom_fields: 15` and `ok: true`, and live Customer/Invoice/Session fetches succeed against a provisioned test tenant.

---

### Files changed
None — this is a planning document. No code, ERPNext, provisioning, or test files were modified.

### Tests run
None — planning only; exploration was read-only.

### Approval needed before implementation
Yes. Before any code is written, approval is required for: the 5 ERPNext Custom Field additions, the FD Session doctype change, re-running `setup_fitdesk_schema` and `bench migrate` on tenants, and (separately, later) running the backfill. Phase B introduces no payment, accounting, completion, or UI behavior — only additive schema and read/write plumbing.
