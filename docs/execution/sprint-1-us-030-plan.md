# Sprint 1 — US-030 Production Feature Flag Verification — Plan

> Governed by `docs/DOCUMENTATION_AUTHORITY_MAP.md` (tier 4). Acceptance criteria
> source: `FITDESK_SOVEREIGN_PRODUCT_BACKLOG_V2_1.md` §4.1 US-030, cross-checked
> against `FITDESK_PRE_PILOT_GATES_V1_0.md` §5 Gate G3.

## What already exists

`lib/__tests__/pilot.test.ts` (PR #27) already unit-tests `isPilotMode`,
`isExternalPaymentsAllowed`, and `matchAllowlist` in isolation.
`actions/messages.ts` already wires `isPilotMode()` + `matchAllowlist()` into
the real WhatsApp send path.

## Gap: no canonical flag inventory existed

Per `docs/execution/SPRINT_1_STORY_TRACEABILITY_MAP.md` (prior session): *"No
dedicated doc. ... this is the story with the least existing evidence."* True —
nothing enumerated all flags, their defaults, and whether the code that should
enforce them actually does.

## Implementation

1. Built `docs/execution/sprint-1-us-030-flag-inventory.md` — a flag-by-flag
   table (name, area, default behavior, enforcement point, verified-wired
   yes/no) built entirely from `.env.example` + direct code/grep inspection.
   **`.env`/`.env.local` were never read** — only `.env.example` (comments and
   variable names, no real values) and source code call sites.
2. While building the inventory, found **Finding F-1**: `isExternalPaymentsAllowed()`
   is defined, documented, and unit-tested, but has zero call sites anywhere —
   `actions/invoices.ts`'s `getPaymentLink` and `lib/whish.ts`'s `generateLink`
   never check it. Lower current risk than it sounds: the real Whish HTTP call
   is commented out in `lib/whish.ts` (mock-only today), so nothing genuinely
   external happens regardless of this flag's value right now. Documented in
   full in the inventory doc, **not fixed** — wiring it in is a payment-logic
   change requiring approval per `CLAUDE.md` §4, and the natural place to add
   it is the same future change that uncomments the live Whish API call, not a
   retrofit tonight.
3. Verified Manual Invoice placement (PD-004) against the actual UI: the
   dashboard Quick Action routes to the invoice *list*, not creation; the
   `/dashboard/invoices/new` route exists but has zero discoverable links from
   anywhere in the app. Verdict: compliant, behaves like PD-004 Option A today.
4. Verified fallback-route safety for `/dashboard/invoices/new` specifically.
5. Added `lib/whish.test.ts` (test-only) — `generatePaymentLink`/`getPaymentAdapter`/
   `PAYMENT_PROVIDERS` had zero test coverage before tonight, despite being the
   exact code path Finding F-1 is about. Covers: Whish fails closed when
   unconfigured (the real default), Whish returns a mock URL once configured
   (never a live call — matches the commented-out fetch), and cash/bank_transfer
   always succeed with no URL (manual providers).

## Gate

`node scripts/story-gate.mjs` must pass before commit.
