# Statement of Account — "Payment history is temporarily unavailable" — Read-Only Audit

> Audit only. No files edited, no commits, no pushes, no ERP/Docker/Dokploy actions taken.
> Scope: why the Rami Saad Statement of Account shows the degraded-payments warning in
> production (`b07d722`), even though invoice totals (Invoiced 200 / Applied 100 /
> Outstanding 100 / Overdue 100) render correctly.

## 1. Files inspected

| File | Role |
|---|---|
| [components/clients/StatementButton.tsx](../../components/clients/StatementButton.tsx) | Entry point — "View statement" button on the full client profile page |
| [components/clients/StatementSheet.tsx](../../components/clients/StatementSheet.tsx) | UI — loads the statement, renders summary/rows, renders the degraded-mode warning banner and retry |
| [actions/statements.ts](../../actions/statements.ts) | Server action `getClientStatement` — orchestrates client/invoice/payment reads, decides `paymentHistoryAvailable` |
| [actions/statements.test.ts](../../actions/statements.test.ts) | Existing tests, incl. a `describe('payment history fallback', ...)` block explicitly labeled "production hotfix" |
| [lib/statements/assembleStatement.ts](../../lib/statements/assembleStatement.ts) | Pure assembly — builds rows/summary, produces the exact warning string |
| [lib/statements/assembleStatement.test.ts](../../lib/statements/assembleStatement.test.ts) | Unit coverage for degraded-mode summary math |
| [lib/statements/groupAndFilter.ts](../../lib/statements/groupAndFilter.ts) | Client-side filter/grouping — disables the "Payments" tab in degraded mode |
| [lib/erpnext/client.ts](../../lib/erpnext/client.ts) | `getPaymentsForCustomer` (Payment Entry list read), `erpFetch` (CP proxy HTTP wrapper), `ERPNextError` |
| [lib/business-data/erp-adapter.ts](../../lib/business-data/erp-adapter.ts) | Thin re-export of `lib/erpnext/client.ts` — no extra logic |
| [lib/errors/is-unavailable-error.ts](../../lib/errors/is-unavailable-error.ts) | Marker-string check used only to distinguish "ERP still connecting" from other failures |
| `control-plane/src/modules/erp-proxy/erp-proxy.routes.ts` | CP-side proxy — forwards `GET /api/erp/doctype/Payment Entry` to the tenant's Frappe site |
| `provisioning_api/provisioning_api/api/user.py` | `PROVISIONING_ROLES` / `setup_roles` — the Frappe roles granted to the ERP API user at provisioning time |
| Git history of `actions/statements.ts`, `lib/erpnext/client.ts` | Confirms this is a three-times-hotfixed area, not new/untested code |

## 2. Data flow: Statement button → UI

```
StatementButton (client component)
  └─ opens StatementSheet

StatementSheet (client component, on open)
  └─ calls getClientStatement(clientId)   [actions/statements.ts, 'use server']
       1. resolveTrainerId()                          — auth/tenant resolution
       2. getClientById(clientId, trainerId)           — ownership gate (fails closed)
       3. getInvoices({ clientId })                    — REQUIRED; failure fails the whole action
       4. getPaymentsForCustomer(clientId)              — BEST-EFFORT; failure is caught, never
                                                           fails the action
       └─ assembleStatement(invoices, payments, { paymentHistoryAvailable })
            [lib/statements/assembleStatement.ts]
            - builds invoice rows (always, from invoice.amount / outstandingAmount)
            - builds payment rows only if paymentHistoryAvailable
            - builds summary.totalPaid from real Payment Entries when available,
              else from invoice-balance math (amount - outstanding, clamped)
            - sets warning string when paymentHistoryAvailable is false

StatementSheet renders:
  - PaymentHistoryWarning banner (only when !paymentHistoryAvailable)
  - SummaryGrid (Invoiced / Paid-or-Applied / Outstanding / Overdue)
  - Row list (invoice rows only, in degraded mode; ledger footer hidden)
  - "Payments" filter tab disabled + retry button (re-runs getClientStatement)
```

Both `getInvoices` and `getPaymentsForCustomer` go through the same path: `lib/erpnext/client.ts` → `erpFetch()` → HTTP call to `CONTROL_PLANE_URL` + `/api/erp/doctype/...` → `control-plane`'s `erp-proxy.routes.ts` → `forwardToFrappe()` → the tenant's actual Frappe site, using the tenant's stored `erpApiKey`/`erpApiSecret` (Control Plane holds these; FitDesk never sees them — only signs a short-lived tenant JWT). This is the sanctioned Control Plane proxy path in both cases; there is no separate/alternate path for payments.

## 3. Exact degraded-mode trigger

[actions/statements.ts:51-67](../../actions/statements.ts#L51-L67):

```ts
let payments: Payment[] = []
let paymentHistoryAvailable = true
try {
  payments = await getPaymentsForCustomer(erpCustomerId)
} catch (err) {
  paymentHistoryAvailable = false
  const status = err instanceof ERPNextError ? err.status : 'n/a'
  const detail = err instanceof ERPNextError ? err.detail.slice(0, 300) : ...
  console.error(`[getClientStatement] Payment Entry read failed (doctype=Payment Entry, status=${status}):`, detail)
}
```

Any non-2xx response (or thrown error) from `getPaymentsForCustomer` — regardless of the specific HTTP status — sets `paymentHistoryAvailable = false`. The real status/detail is logged server-side only (truncated to 300 chars) and is **never returned to the client or surfaced in the UI/action result** — by design, per the function's own docstring, so no raw ERP error text can leak to the trainer. This means the exact production cause cannot be determined from the code or the UI alone; it requires reading that specific server-side log line.

`assembleStatement` then fixes the exact warning text word-for-word:

```ts
warning: paymentHistoryAvailable ? undefined : 'Payment history is temporarily unavailable. Totals below use invoice balances. ' + 'Individual payment rows cannot be shown right now.'
```

— matching what Rami Saad's statement shows exactly.

## 4. Why invoice totals still work

`getInvoices` and `getPaymentsForCustomer` are two independent ERP reads against two different doctypes (`Sales Invoice` vs `Payment Entry`). Invoice fetching is **required** — its failure fails the whole `getClientStatement` call (statement wouldn't load at all). Its success is unaffected by whatever is failing on the Payment Entry read.

More importantly, once `paymentHistoryAvailable` is false, `buildSummary()` ([lib/statements/assembleStatement.ts:151-178](../../lib/statements/assembleStatement.ts#L151-L178)) stops trying to sum real `Payment[]` records entirely and instead derives `totalPaid` ("Applied") purely from each invoice's own fields:

```ts
appliedAmountForInvoice(invoice) = clamp(invoice.amount - invoice.outstandingAmount, 0, invoice.amount)
```

So "Invoiced 200 / Applied 100 / Outstanding 100 / Overdue 100" for Rami Saad is arithmetic entirely internal to the invoice record(s) already fetched successfully — it does not depend on Payment Entry data being readable at all. This is intentional (see the type's own doc comment: "Never blocks the statement from loading").

## 5. Why payment rows are unavailable — classification

Per the audit-focus checklist:

- **Not implemented** — false. `getPaymentsForCustomer` ([lib/erpnext/client.ts:798](../../lib/erpnext/client.ts#L798)) is fully implemented, tested, and used.
- **Intentionally disabled** — false. There is no feature flag gating this; it always attempts the read.
- **Failing from ERP/proxy** — **most likely**, given the pattern below. The CP proxy (`erp-proxy.routes.ts`) does a generic passthrough (`GET /api/erp/doctype/:type` → `GET /api/resource/:type` on Frappe) with no doctype allowlist, so a Payment Entry-specific failure has to originate either in Frappe itself (permission/validation/internal error) or in the proxy's bounded-fetch layer (15s timeout, 5 MB cap → mapped to a generic 502, per `withProxyError`).
- **Missing from local projection** — not applicable; there is no local (SQLite/Drizzle) projection of payments in this flow, it's a live ERP read.
- **Blocked by tenant/trainer ownership guard** — ruled out. The ownership gate (`getClientById`) runs first and, per `sprint-1-us-025-plan.md` and `actions/statements.test.ts:105`, a cross-tenant/missing client is rejected *before* `getInvoices`/`getPaymentsForCustomer` are ever called. Since invoices *did* load for this client, the trainer/tenant context is valid.
- **ERP response shape changed** — possible but lower-likelihood; `normalizePayment` only reads fields FitDesk itself requests (`paymentFields()`), and that field list was deliberately trimmed twice already (see §6) to match ERPNext's actual Payment Entry schema.

### Historical pattern (git history, not guesswork)

This exact feature has been hotfixed **three separate times**, all within the same 2026-07-10 session, all in direct response to production Payment Entry read failures:

| Commit | PR | Fix |
|---|---|---|
| `074645c` | — | `fix(clients): tolerate missing statement payments` — introduced the best-effort catch/fallback itself |
| `71ba491` | #19 (`fix/fitdesk-statement-payment-entry-417`) | `fix(statement): trim Payment Entry query fields` — removed a field ERPNext's query validator rejected |
| `62c4296` | #20 (`fix/fitdesk-statement-payment-entry-posting-date`) | `fix(statement): use posting_date for Payment Entry reads` — `payment_date` isn't a real Payment Entry field; querying it caused an ERPNext `417 Expectation Failed` ("Field not permitted in query") |
| `0657f36` / `5b2520f` / `93b343f` | #22 | Warning banner, retry action, disabled "Payments" filter — the UI degraded-mode surfacing seen today |

All of these are already merged and are ancestors of the currently-deployed `b07d722` (confirmed via `git log -1 b07d722` and `git log --oneline -- lib/erpnext/client.ts`). **The specific 417/field bugs already found and fixed are not the current cause** — they were fixed before this deploy. The fact that the warning is showing again in production, on top of a build that already contains all three of those fixes, means either:

1. A **different** Payment Entry field/filter/permission issue is now surfacing (the `party_type`/`party`/`docstatus`/`payment_type` filters and the trimmed `paymentFields()` list all look like valid standard Frappe fields on inspection — nothing jumps out as obviously wrong), or
2. A **permissions gap** specific to this tenant's ERP API user — `provisioning_api/api/user.py`'s `PROVISIONING_ROLES` includes `Accounts Manager`/`Accounts User` (the roles Frappe requires to read `Payment Entry`), but whether `setup_roles` actually ran and succeeded for *this* tenant at provisioning time is not verifiable from source code — it's tenant-specific provisioning state, not code, and reading it would mean querying the live ERP site (out of scope for this audit; also excluded by "no direct ERP database queries as the fix"), or
3. A **transient upstream condition** (timeout, oversized response, or a genuine 5xx from Frappe) — plausible but not distinguishable from (1)/(2) without the log line.

None of these can be conclusively narrowed further from static code alone, because `actions/statements.ts` deliberately discards the raw status/detail before it ever reaches anything this audit can read (UI, action result, or committed docs). The only artifact that would disambiguate is the production log line already being written:

```
[getClientStatement] Payment Entry read failed (doctype=Payment Entry, status=<N>): <truncated detail>
```

That is a **read-only** diagnostic (`docker logs <fitdesk-container> | grep getClientStatement`), consistent with `CLAUDE.md` §7's safe-diagnostics guidance, and is the recommended next step — not part of this audit's actions.

## 6. Invoice totals vs. Payment Entry rows — confirmed

Confirmed by direct code inspection (§4): in degraded mode, every summary figure (Invoiced, Applied, Outstanding, Overdue) is computed from `Invoice.amount` / `Invoice.outstandingAmount` fields already present on the successfully-fetched invoices — none of it touches `Payment[]`. This is explicit in `buildSummary()` and documented in the `ClientStatementSummary.totalPaid` doc comment.

## 7. Is this expected MVP behavior or a bug?

**Two separate things, both true at once:**

- **The degraded-mode UI/fallback behavior itself is expected, intentional, and correct.** It is not a bug. It was purpose-built on 2026-07-10 as a resilience feature so that a Payment Entry read failure (of any kind) degrades gracefully to invoice-balance totals instead of failing the whole Statement of Account. It is covered by unit tests (`actions/statements.test.ts` — "payment history fallback", `lib/statements/assembleStatement.test.ts`) and does not misstate any figures — it clamps and derives conservatively.
- **The underlying Payment Entry read currently failing for Rami Saad (or more broadly, in production) is the open, unresolved question.** Given the track record (three prior incidents, same doctype, same read path), it is very likely another instance of the same class of problem (a query/permission issue against ERPNext's `Payment Entry` doctype) rather than a new architectural issue — but which specific instance it is cannot be confirmed without reading the scrubbed production log line. This is **not** a payment-allocation bug: no money is mis-totaled, no payment is lost or duplicated — only the row-level list view of individual payments is unavailable.

**Pilot-blocking?** No — trainers can still see accurate totals (Invoiced/Applied/Outstanding/Overdue) and know a client owes/paid what they think they do. What they lose is the itemized payment ledger (who paid what, when) until the underlying read is fixed. This is a real but non-blocking gap for a pilot, and should be prioritized fix-forward rather than block launch.

## 8. Minimal fix plan (not executed — audit only)

1. **Diagnose first (read-only):** pull the production log line(s) matching `[getClientStatement] Payment Entry read failed` for the time window Rami Saad's statement was viewed. This single step will disambiguate §5's three hypotheses (query/field issue vs. permission/role gap vs. transient/upstream) without touching any code.
2. **If a field/filter/417 issue (recurrence of the known class):** compare the exact `detail` string against `paymentFields()`/the filter list in `lib/erpnext/client.ts:338-343,798-817`; trim/rename the offending field the same way `71ba491`/`62c4296` did previously.
3. **If a permission/403 issue:** confirm (via Control Plane / provisioning records, not direct ERP DB access) whether this tenant's ERP API user has `Accounts Manager`/`Accounts User` roles per `provisioning_api/api/user.py`'s `PROVISIONING_ROLES`; if missing, re-run `setup_roles` for that tenant through the existing provisioning path (requires explicit approval per `CLAUDE.md` §4 — "Creating, deleting, or retrying tenant provisioning jobs").
4. **If transient/upstream (502/timeout):** no code change — confirm via the "Retry" button already in the UI (`handleRetryPayments` in `StatementSheet.tsx`) that a second attempt succeeds; if it's flaky at the ERP host level, that's a hosting/network issue, not a FitDesk defect.
5. In all cases, no change to the degraded-mode UI/fallback logic itself is warranted — it is already doing its job correctly.

## 9. Tests to add/update (once root cause is confirmed — not written yet)

- If (2)/field issue: add a regression test in `lib/erpnext/client.test.ts` asserting the exact fixed field/filter list for `getPaymentsForCustomer`, mirroring the existing pattern for `posting_date`.
- If (3)/permission issue: no FitDesk-side test applies (this would be a provisioning-side fix); consider a `provisioning_api` test asserting `Payment Entry` read succeeds for a freshly-`setup_roles`'d user, if such coverage doesn't already exist there.
- Regardless of cause: consider (separately, out of scope tonight) surfacing the ERPNextError `status` (not `detail`) into the existing structured log already at `actions/statements.ts:66`, e.g. as a queryable/alertable metric, so a recurrence doesn't require manually grepping container logs again.

## 10. Risks

- Reading production logs to disambiguate is safe (read-only) but has not been done as part of this audit — the report's root-cause ranking is therefore a hypothesis prioritized by historical pattern, not a confirmed diagnosis.
- If the real cause turns out to be a tenant-wide ERP permission gap (hypothesis 2), it could affect other tenants/clients beyond Rami Saad — worth a quick read-only check of whether other clients' statements show the same warning before assuming this is client-specific.
- No production, ERP, schema, billing, or deployment changes were made or are proposed to be made without further approval.

## 11. Explicit non-scope

- No ERP/Frappe database queries were run or suggested as a fix.
- No production log access was performed as part of this audit (recommended as the next read-only step only).
- No code was edited.
- No tenant provisioning, role, or credential changes were made or suggested to be executed directly — only referenced as an approval-gated follow-up if hypothesis 2 is confirmed.
- No commits, pushes, or Docker/Dokploy actions were taken.

---

## Final report

**Likely root cause:** `getPaymentsForCustomer` (Payment Entry list read via the Control Plane ERP proxy) is failing for this tenant/client, and `actions/statements.ts`'s existing best-effort fallback (built 2026-07-10 as a production hotfix, and already proven necessary three times for this exact doctype) is catching it and degrading gracefully — exactly as designed. Given the track record of prior incidents against this same read (query-field validation errors and, potentially, tenant ERP-role gaps), the most probable specific cause is another instance of an ERPNext query/permission problem on `Payment Entry`, but the exact status code is intentionally not surfaced anywhere this audit can read — it requires one read-only production log check to confirm.

**Exact files likely to change later** (once the specific cause is confirmed):
- [lib/erpnext/client.ts](../../lib/erpnext/client.ts) (`paymentFields()` / filters in `getPaymentsForCustomer`, if a field/query issue)
- `provisioning_api/provisioning_api/api/user.py` / tenant role state (if a permissions issue — provisioning-side, approval-gated)
- No changes anticipated to `actions/statements.ts`, `lib/statements/assembleStatement.ts`, or `StatementSheet.tsx` — their degraded-mode behavior is already correct.

**Pilot-blocking:** No. Totals remain accurate; only the itemized payment ledger is temporarily hidden. Recommend fixing promptly (it's now recurred multiple times against the same doctype) but it does not block a pilot launch.

**DO NOT PUSH.** No commits were made; this is a new, uncommitted markdown file only.
