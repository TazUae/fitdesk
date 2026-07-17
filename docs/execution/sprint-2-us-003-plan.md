# Sprint 2 — US-003 Needs Attention Upgrade — Plan

> Governed by `docs/DOCUMENTATION_AUTHORITY_MAP.md` (tier 4). Acceptance criteria
> pulled directly from `FITDESK_SOVEREIGN_PRODUCT_BACKLOG_V2_1.md` §4.3 (lines
> 269–294).

## Acceptance criteria (verbatim from the backlog)

```
Priority: NOW

Story:
As a trainer,
I want FitDesk to show clients and sessions that need action,
so that I do not miss payments, session outcomes, renewals, or follow-ups.

Acceptance criteria:
Includes overdue payments.
Includes unresolved session outcomes.
Includes missing next sessions where data exists.
Includes low package balance where data exists.
Cards explain why they appear.
Actions open approved workflows, not hidden mutations.
```

## What already exists

`lib/dashboard/derive.ts`'s `getAttentionItems(invoices, today)` — already
covers **overdue payments** (`overdue_invoice`) and a related
`pending_invoice` signal, with capping/overflow, explanatory labels, and
`href`-only navigation (no inline mutation). Rendered by
`features/dashboard/components/ActionCenter.tsx`. This satisfies "cards
explain why they appear" and "actions open approved workflows" for the
existing invoice signals — the new signals below must match that same
contract, not invent a different one.

**Unresolved session outcomes** — the detection function
(`getUnresolvedSessions`) was built as part of US-057 tonight, per the
sprint's own stated ordering ("the Needs Attention expansion work builds on
what US-057 adds"). Not yet surfaced as an `AttentionItem`.

## A real rendering risk found while planning this story

`ActionCenter.tsx`'s render loop is an `if/else if` chain: `invoice_overflow`,
then `pending_invoice`, then a **fallthrough final `return`** that assumes
`overdue_invoice` shape (`outstandingAmount`, `currency`, `ageDays` fields) —
it does not explicitly check for that type. **Adding a new `AttentionItem`
variant to the union without also adding an explicit render branch for it
would make that new item silently fall into the overdue-invoice branch** —
wrong icon, wrong color, and it would try to read `outstandingAmount`/
`currency` fields that don't exist on the new item, rendering blank/broken
meta text. This is exactly the kind of "looks fine until you look closely"
bug this session has been asked to watch for. Any new `AttentionItem` type
this story introduces gets its own explicit branch in `ActionCenter.tsx` —
not an implicit fallthrough.

## Scope decision: 2 of the 3 new signals built and wired tonight; 1 deferred

**Built and wired:** unresolved session outcomes, missing next sessions.
Both are derivable from data the dashboard page **already fetches** —
`sessions: Session[]` and `clients: Client[]` — zero new backend
architecture, zero new tenant-scoped queries.

**Deferred, documented, not guessed past: low package balance.** Package
balance lives in the local `package_ledger` table, which is tenant-scoped
and currently only has a *per-client* balance query
(`PackageLedgerRepository.deriveBalancesByClient`, built for US-057's
preview). Surfacing "low package balance" on the dashboard for *every*
client needing attention requires either:
  (a) a new bulk tenant-wide balance query (real new backend surface,
      including deciding what "low" means as a product threshold — not
      recorded anywhere in `FITDESK_PRODUCT_DECISIONS_V1_0.md`), or
  (b) an N+1 per-client query loop on every dashboard load (a real
      performance/scalability risk to introduce silently).

Neither is "a gating fix" — both are genuine new architecture decisions,
the same category of thing Sprint 1's follow-up Item 1 explicitly drew a
line at ("if it requires more than a small, contained change... don't build
that, document instead"). `FITDESK_PRODUCT_DECISIONS_V1_0.md` has no
recorded threshold for "low balance" (US-050 Package Renewal Reminder, the
story that would define this, is Sprint-3-adjacent and not built). Building
a bulk query AND inventing a threshold unattended, for a financial-adjacent
signal, is exactly the "don't guess on a decision not recorded in Product
Decisions" case this session was told to stop on. Flagged as the top open
item for US-003 in the Sprint 2 report — needs a product decision on the
threshold before it's built, not a judgment call from this session.

## Implementation plan

1. `lib/dashboard/derive.ts`:
   - `AttentionItem`'s `type` union gains `'unresolved_session'` and
     `'missing_next_session'`.
   - `getUnresolvedSessionAttentionItems(items: UnresolvedSessionItem[]):
     AttentionItem[]` — maps US-057's detection output into the existing
     card shape (label explains days overdue, `href` points at the schedule
     view — no inline mutation, consistent with "actions open approved
     workflows").
   - `getMissingNextSessionAttentionItems(clients: Client[], sessions:
     Session[], today: string): AttentionItem[]` — active clients with no
     future scheduled session in the already-fetched window.
2. `features/dashboard/components/ActionCenter.tsx` — explicit render
   branches for both new types, matching the existing visual pattern
   (amber for unresolved-session, calm/neutral for missing-next-session).
   Not test-covered — `.tsx` files can't be unit-tested in this repo
   (Sprint 1 finding); verified by close pattern-matching against the
   existing, working branches only.
3. `app/dashboard/page.tsx` — call the two new derive functions with data
   already on the page, merge into the `attentionItems` array passed to
   `DashboardView`.

## Gate

`node scripts/story-gate.mjs` must pass before commit.
