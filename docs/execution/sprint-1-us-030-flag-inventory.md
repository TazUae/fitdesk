# Sprint 1 — US-030 Production Feature Flag Inventory

> Governed by `docs/DOCUMENTATION_AUTHORITY_MAP.md` (tier 4). This is the
> canonical, up-to-date enumeration of every production-relevant flag/gate in
> FitDesk, built by reading `.env.example` and every call site in code — **not**
> by reading the real `.env`/`.env.local` files (never read per `CLAUDE.md` §8
> and this session's own safety rules). No flag *value* from a real environment
> appears anywhere in this document — only flag *names*, *code-level defaults*,
> and *whether the code that should check them actually does*.

## Acceptance criteria (from the backlog)

```
Client Hub, Directory, Dashboard, Add Client, payment, WhatsApp, AI, goal, and scheduling flags are documented.
External payment and WhatsApp automation gates are verified.
Fallback routes do not expose unsafe workflows.
Manual invoice behavior follows the Product Decisions document.
```

## Flag inventory

| Flag | Area | Default (unset) behavior | Enforcement point | Verified wired? |
|---|---|---|---|---|
| `NEXT_PUBLIC_GOAL_WORKSPACE` | Goal system (Add Client) | `0`/unset → legacy `GoalAccordion` renders | `components/clients/AddClientForm.tsx:252` (`GOAL_WORKSPACE_ENABLED = process.env.NEXT_PUBLIC_GOAL_WORKSPACE === '1'`) | Yes — read once, used consistently through the whole form (goal capture, conflict check, edit-prefill) |
| `FITDESK_CLIENT_DIRECTORY_LOCAL_READ` | Client Directory | unset → always reads live ERP Customers (safe default) | `lib/clients/directory.ts` | Yes — tested in `lib/clients/__tests__/directory.test.ts`, automatic fallback to ERP on any local-read error or empty table |
| `FITDESK_CLIENT_DIRECTORY_LOCAL_TENANTS` | Client Directory | unset → local-read flag (if on) applies to all tenants | `lib/clients/directory.ts` | Yes — same test file |
| `PILOT_MODE` | WhatsApp sends | unset/`false` → normal sending (no allowlist gate) | `lib/pilot.ts` `isPilotMode()`, consumed in `actions/messages.ts:132` | **Yes** — `isPilotMode()` is actually called before every WhatsApp send attempt |
| `FITDESK_ALLOWED_TEST_PHONE` / `FITDESK_ALLOWED_TEST_PHONE_PREFIXES` | WhatsApp sends (pilot mode only) | unset → `matchAllowlist` fails closed ("no allowlisted test phone configured") | `lib/pilot.ts` `matchAllowlist()`, consumed in `actions/messages.ts:134` | **Yes** — wired into the same send path as `PILOT_MODE` |
| `PILOT_ALLOW_EXTERNAL_PAYMENTS` | External/live payment provider calls | unset/`false` → `isExternalPaymentsAllowed()` returns `false` | `lib/pilot.ts` `isExternalPaymentsAllowed()` | **No — see Finding F-1 below.** Function exists, is unit-tested (`lib/__tests__/pilot.test.ts`), but has **zero call sites** anywhere outside `lib/pilot.ts` itself and its own test |
| `ANTHROPIC_API_KEY` (not a boolean flag, but functions as one) | AI drafting (WhatsApp message suggestions) | unset → falls back to professional templates, never errors | `lib/claude.ts:223` | Yes — matches PD-003 "if AI fails/unavailable, manual workflow continues unaffected"; AI never blocks a core action |
| `WHISH_API_URL` / `WHISH_API_KEY` / `WHISH_MERCHANT_ID` | Whish payment-link generation | any unset → `generateLink` fails closed with "Whish is not configured" | `lib/whish.ts` `whishAdapter.generateLink` | Yes, fails closed — but see F-1: the real Whish HTTP call is **commented out** (`lib/whish.ts:104-128`); today this always returns a deterministic mock URL once all three vars are set, never a live external call |

## Areas with no dedicated flag (confirmed intentional, not a gap)

Per Gate G3's list, these areas were checked for a feature flag and have none —
each is a core, always-on MVP surface, not conditionally rolled out:

- **Client Hub** — no flag; always visible to an authenticated trainer for their own tenant's clients.
- **Dashboard Command Center** — no flag; the primary landing surface.
- **Add Client** (sheet + fallback route) — no flag; both paths always available (see US-042 Add Client Path Parity in the traceability map for the separate question of whether the two paths behave identically).
- **Scheduling / session completion** — no flag; core booking and completion flows are always on.

None of these expose anything unsafe by being unconditional — they're the
product's baseline MVP surface, not gated rollouts. Documenting this list is
itself the Gate G3 deliverable for these areas (there is nothing to "verify
is off" because nothing here was ever meant to be conditionally hidden).

## Finding F-1 — `isExternalPaymentsAllowed()` is defined, tested, and documented, but never enforced

`lib/pilot.ts` exports `isExternalPaymentsAllowed()`. `.env.example` (lines
56–60) documents it precisely: *"Safety gate for live/external payment provider
calls. Must stay unset/false unless external payments have been explicitly
approved."* `lib/__tests__/pilot.test.ts` unit-tests the function itself
thoroughly (PR #27).

**No code anywhere calls it.** Confirmed by repo-wide grep: the only files
containing `isExternalPaymentsAllowed` are `lib/pilot.ts` (the definition) and
`lib/__tests__/pilot.test.ts` (its own test). In particular:

- `actions/invoices.ts`'s `getPaymentLink` (the action that calls into the
  Whish adapter to generate a live/external payment link) does not check it.
- `lib/whish.ts`'s `generateLink` does not check it either.

**Why this is lower-risk than it first appears, today:** the actual external
HTTP call to Whish's API is commented out in `lib/whish.ts:104-128` — the
adapter currently returns a deterministic **mock** URL once
`WHISH_API_URL`/`WHISH_API_KEY`/`WHISH_MERCHANT_ID` are all set, and fails
closed with "not configured" otherwise (verified in `lib/whish.test.ts`, added
tonight). So today, no genuinely external network call happens regardless of
`PILOT_ALLOW_EXTERNAL_PAYMENTS`'s value — there is nothing live for the flag to
currently gate.

**Why this still matters:** if/when the real Whish API integration is
completed (uncommenting the `fetch()` call), `isExternalPaymentsAllowed()`
must be wired into that call path **at that time** — it will not happen
automatically just because the flag and its tests already exist. Per Gate G3's
fail condition ("A production flag exposes unapproved billing... execution
behavior"), an unwired flag that *looks* like it's protecting something is
arguably worse than no flag at all, because it creates false confidence.

**Not fixed tonight:** wiring this gate into `getPaymentLink`/`generateLink`
is a payment-logic change, which requires explicit approval per `CLAUDE.md`
§4 ("Modifying payment logic"). Flagged here and in the overnight report as
the top follow-up item before the real Whish integration is built — the gate
should be added in the same change that uncomments the live API call, not
retrofitted after.

## Manual Invoice placement — verified against PD-004

PD-004 recommends Option A (fully hidden from normal trainer UI) or, if an
operational shortcut is needed, Option B (Admin/Power shortcut only, not a
primary action). Option C (primary Quick Action) is explicitly rejected.

Verified by reading the actual UI wiring:

- `features/dashboard/components/QuickActions.tsx` has an "Invoice" quick
  action, but it routes to `/dashboard/invoices` (the **list**), not
  `/dashboard/invoices/new`. The file has an explicit code comment: *"manual
  invoice creation is not part of the normal trainer workflow (invoices are
  generated automatically from package assignment / pay-per-session
  completion)."*
- `/dashboard/invoices/new` (the manual creation route) exists and builds
  successfully, but **no component anywhere links to it** — not the dashboard
  quick actions, not `InvoicesView.tsx` (the invoice list), nowhere. Confirmed
  by grepping the whole `components/` and `app/dashboard/invoices/` trees for
  any `href`/`Link` reference to `invoices/new`: zero matches outside the
  route's own page file.

**Verdict: compliant, closer to Option A than Option B.** The route is
reachable only by direct URL, with zero discoverable links from the normal
trainer UI, and zero "Admin/Power" labeling exists anywhere (which would be
required if this were meant to be Option B). This satisfies "Manual invoice
behavior follows the Product Decisions document" without needing a code
change. PD-012 still lists "Confirm PD-004" as an open decision on the
product-owner side (which of A vs. B is the intended long-term state) — that
open decision is unaffected by this finding; today's *code* already behaves
like Option A regardless of which is eventually chosen as the documented
final answer.

## Fallback-route safety check

Checked whether any route reachable outside the primary navigation exposes
unsafe workflows (Gate G3's "fallback routes do not expose unsafe workflows"):

- `/dashboard/invoices/new` — reachable only by direct URL (see above);
  creates a real invoice but requires trainer authentication + tenant
  resolution like every other action; not "unsafe," just intentionally
  unlinked per PD-004.
- No other unlinked/fallback routes were found during this pass beyond what
  US-042 (Add Client Path Parity, tracked separately in
  `docs/execution/FINAL_DOC_PACK_TRACEABILITY_MAP.md`) already covers.

## Summary against acceptance criteria

| Criterion | Status |
|---|---|
| Client Hub, Directory, Dashboard, Add Client, payment, WhatsApp, AI, goal, scheduling flags documented | Done — table above |
| External payment and WhatsApp automation gates verified | WhatsApp: verified wired. Payment: verified **not** wired (F-1) — documented, not silently passed |
| Fallback routes do not expose unsafe workflows | Verified for `/dashboard/invoices/new` |
| Manual invoice behavior follows Product Decisions | Verified compliant (Option A in practice) |
