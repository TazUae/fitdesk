# Sprint 3 — US-050 Package Renewal Reminder — Plan / Audit

> Governed by `docs/DOCUMENTATION_AUTHORITY_MAP.md` (tier 4). Acceptance criteria
> pulled directly from `FITDESK_SOVEREIGN_PRODUCT_BACKLOG_V2_1.md` §4.4 (lines
> 357–381).
>
> **Scope for tonight: plan and audit only** — same reasoning as
> `sprint-3-us-059-plan.md`. This story is WhatsApp-follow-up-adjacent by its
> own acceptance criteria ("WhatsApp follow-up respects consent"), so it
> inherits the same `CLAUDE.md` §4 gate even for its non-messaging half
> (the dashboard/Client Hub prompt).

## Acceptance criteria (verbatim from the backlog)

```
Priority: NOW / NEXT

Story:
As a trainer,
I want FitDesk to remind me when a client's package is nearly finished,
so that I can renew before the balance reaches zero.

Acceptance criteria:
Low package balance triggers prompt.
Prompt appears in Dashboard and/or Client Hub.
Trainer can prepare a renewal follow-up.
WhatsApp follow-up respects consent.
No auto-charge occurs.
```

## Current state, confirmed by direct code audit tonight

| Criterion | Status |
|---|---|
| Low package balance triggers prompt | **Not built.** No "low balance" threshold is defined anywhere in the codebase (no constant, config, or schema field). The only balance query that exists (`PackageLedgerRepository.deriveBalancesByClient`, `lib/billing/package-ledger-repository.ts` lines 151–170) is per-client, not a bulk/tenant-wide query — same underlying gap flagged and deferred in Sprint 2's US-003/US-027 (`docs/execution/sprint-2-us-003-plan.md`), not re-derived here. |
| Prompt appears in Dashboard and/or Client Hub | **Not built** — no such component exists (confirmed: no "renewal" or "nearly finished" logic anywhere in `lib/`, `actions/`, `components/`, `features/`). |
| Trainer can prepare a renewal follow-up | **Partially available as general infrastructure, not wired to renewal specifically.** `lib/claude.ts`'s draft generator already has a message-type enum that could plausibly grow a `renewal` type alongside its existing `invoice`/`reminder`/`follow_up`/`reengagement` types, and `actions/messages.ts`'s `generateDraftMessage()`/`sendMessage()` already implement the trainer-review-then-approve-then-send flow generically. Nothing renewal-specific exists yet. |
| WhatsApp follow-up respects consent | **Cannot be satisfied until US-059 exists** — there is no consent model to respect. This is the direct dependency this sprint's own story ordering anticipated. |
| No auto-charge occurs | **Trivially true today** (nothing auto-charges anywhere in the app — `recordPayment` is always an explicit trainer-submitted action, confirmed in Sprint 1's audit), but also not yet a tested guarantee *specific to a renewal flow* because that flow doesn't exist. |

**Net assessment:** two independent prerequisites block this story, neither
resolved by more planning tonight:
1. **US-059** (consent model) — for the WhatsApp-follow-up half.
2. **A bulk package-balance query + a product-decided "low" threshold** — for
   the detection half. This is the *same* open item Sprint 2 flagged for
   US-003 ("low package balance") and US-027 ("package renewal prompts") —
   pointing at it again here rather than re-analyzing it, per this session's
   own discipline about not duplicating already-made findings.

## What a real implementation would require (for a future approved session)

1. **Threshold decision** (product, not engineering): what counts as "nearly
   finished" — an absolute count (e.g., ≤1 or ≤2 sessions remaining), a
   percentage of the original package size, or a time-based signal
   (expiry date approaching, using `clientPackagePurchase.expiresAtUtc`,
   which already exists in the schema per `lib/db/schema.ts` and was
   confirmed present in tonight's audit)? Each implies different detection
   logic. Not recorded in `FITDESK_PRODUCT_DECISIONS_V1_0.md`.
2. **Bulk balance query**: a `PackageLedgerRepository` method that returns
   low-balance clients tenant-wide in one query (not N+1 per client) —
   architecturally straightforward once the threshold is decided (same
   `SUM(delta_units) GROUP BY client_index_id` shape
   `deriveBalancesByClient` already uses, widened to drop the per-client
   filter and add a `HAVING` clause).
3. **Dashboard/Client Hub prompt**: once the query exists, this follows the
   same `AttentionItem`/`ActionCenter.tsx` pattern Sprint 2 already
   established for `unresolved_session`/`missing_next_session` — a
   mechanical extension of an existing, working pattern, not new UI
   architecture.
4. **Renewal follow-up drafting**: extend `lib/claude.ts`'s draft-type enum
   and `actions/messages.ts`'s draft generator with a `renewal` type,
   following the exact shape of the three existing types.
5. **Consent gate on the send**: depends entirely on US-059 landing first —
   this story's WhatsApp-follow-up half cannot be built correctly before
   that schema exists, only stubbed in a way that would need rework.

## Recommended sequencing note (not a decision made here, just recorded)

Item 3 (the dashboard prompt) does **not** require US-059 or WhatsApp at
all — it's a pure "surface a signal on the dashboard" feature, same
category as Sprint 2's work. If you want partial progress on this story
without touching the WhatsApp/consent gate, the detection + dashboard-prompt
half (items 1–3 above) could be sequenced as its own, smaller, non-gated
piece of work, leaving only the "prepare a WhatsApp follow-up" half blocked
on US-059. Flagged as an option for you to decide, not started tonight.
