# Sprint 1 — US-018 Statement of Account UX Upgrade — Plan

> Governed by `docs/DOCUMENTATION_AUTHORITY_MAP.md` (tier 4). Acceptance criteria
> source: `FITDESK_SOVEREIGN_PRODUCT_BACKLOG_V2_1.md` §4.2 US-018, cross-checked
> against `FITDESK_PRE_PILOT_GATES_V1_0.md` §6 Gate G4 and PD-009.

## Acceptance criteria (from the backlog)

```
Payment totals remain visible.
Payment row unavailable state is clearly labeled.
Generic empty state is not shown when payment rows are unavailable.
Copy explains: "Payment rows are temporarily unavailable, but totals are calculated from invoice balances."
Source/status labels exist:
- Totals from invoice balances
- Payment rows unavailable
- Retry
Currency is visible.
No payment is marked recorded before confirmation.
```

## What already exists (verified by reading `components/clients/StatementSheet.tsx` directly)

Every criterion except one was already fully shipped:

| Criterion | Where |
|---|---|
| Payment totals remain visible | `SummaryGrid` always renders regardless of `paymentHistoryAvailable` |
| Payment row unavailable state clearly labeled | `PaymentHistoryWarning` component, shown whenever `!statement.paymentHistoryAvailable` |
| Generic empty state not shown when unavailable | `StatementSheet.tsx:487-496` — a specific "payment rows are currently unavailable" message replaces the generic "No invoices or payments yet" empty state |
| Required copy | `assembleStatement.ts`'s `warning` field: "Payment history is temporarily unavailable. Totals below use invoice balances. Individual payment rows cannot be shown right now." |
| "Totals from invoice balances" badge | `StatementSheet.tsx:196` |
| "Payment rows unavailable" badge | `StatementSheet.tsx:195` |
| "Retry" action | `StatementSheet.tsx:199-208`, wired to `handleRetryPayments` which re-runs the same read-only fetch without closing the sheet |
| No payment marked recorded before confirmation | `recordPayment` (`actions/invoices.ts:140`) is a distinct, explicit server action requiring trainer-submitted `amount`/`method`/`date`; `StatementSheet.tsx` is read-only and never calls it |

## Gap found: "Currency is visible" was not actually true

`ClientStatementSummary` (`lib/statements/assembleStatement.ts`) had **no
`currency` field**, and `StatementSheet.tsx`'s `SummaryGrid` called
`fmtMoney(card.value)` with no currency argument — `fmtMoney`'s default
parameter (`currency = 'USD'`) silently applied to every client's statement
summary. For a MENA-focused product supporting AE/SA/LB/KW/QA workspaces (per
`app/onboarding/actions.ts`'s `ALLOWED_COUNTRY_CODES`), a client billed in AED
would see their statement totals labeled "USD" — not a missing nicety, an
actively misleading financial label, which is exactly the class of trust
problem Gate G4 exists to prevent.

Individual statement rows (`ClientStatementRow` — invoice/payment line items,
debit/credit/running-balance figures) have the same gap, but are lower-value
to fix tonight: `Invoice`/`Payment` already have a `.currency` field the row
builders currently drop, and threading it through touches more surface
(`buildInvoiceRow`, `buildPaymentRow`, `StatementRowCard`'s several `fmtMoney`
calls) for a same-currency-per-client assumption that already holds
everywhere else in the app. Documented as a follow-up, not done tonight, to
keep this change scoped and reviewable.

## Implementation

1. `lib/statements/assembleStatement.ts` — added `currency: string` to
   `ClientStatementSummary`; `buildSummary` now derives it from the first
   real invoice with a currency (`realInvoices.find(i => i.currency)?.currency
   ?? 'USD'`), matching the exact fallback pattern already used in
   `lib/dashboard/derive.ts`'s `getMoneySnapshot`.
2. `components/clients/StatementSheet.tsx` — `SummaryGrid`'s `fmtMoney(card.value)`
   calls now pass `summary.currency` explicitly.
3. Updated two pre-existing exact-shape (`toEqual`) test assertions that would
   otherwise fail once `currency` was added to the summary object:
   `lib/statements/assembleStatement.test.ts` and `actions/statements.test.ts`.
4. Added two new tests to `assembleStatement.test.ts`: currency is derived
   correctly for a non-USD (AED) invoice, and defaults to USD when there are
   no invoices to derive it from.
5. `StatementSheet.tsx`'s prop-threading change (`fmtMoney(card.value,
   summary.currency)`) itself has no direct test — same pre-existing
   `"jsx": "preserve"` / vitest transform gap documented in
   `sprint-1-us-026-plan.md` blocks `.tsx` component tests in this repo today.
   Verified correct by inspection: `fmtMoney`'s signature is
   `(n: number, currency = 'USD')`, and this is now called with the real,
   just-added `summary.currency` value.

## Not touched

- Row-level currency (invoice/payment line items) — documented above as a
  scoped follow-up, not attempted tonight to keep this change reviewable.
- No change to `recordPayment`, `getPaymentLink`, or any other write-path
  payment logic — this story's change is a read-only display correctness fix
  (deriving and displaying an already-correct value), not a financial mutation.

## Gate

`node scripts/story-gate.mjs`: build:verify + full vitest suite (1846/1846) +
lint, all green.
