# Sprint 1 Follow-up — Item 1: Wire `isExternalPaymentsAllowed()` — Plan

> Governed by `docs/DOCUMENTATION_AUTHORITY_MAP.md` (tier 4). Follows up on
> Finding F-1 in `docs/execution/sprint-1-us-030-flag-inventory.md`.

## Every place external-payment logic exists (full inventory, confirmed by grep)

| File | Role |
|---|---|
| `lib/pilot.ts` | Defines `isExternalPaymentsAllowed()`. Reads `PILOT_ALLOW_EXTERNAL_PAYMENTS`, defaults `false`. Already unit-tested (`lib/__tests__/pilot.test.ts`, PR #27). |
| `lib/whish.ts` | `whishAdapter.generateLink()` (lines ~91–134) — the one digital/external provider. The real `fetch()` call to Whish's API is commented out (lines ~104–128); today it returns a deterministic **mock** URL once `WHISH_API_URL`/`WHISH_API_KEY`/`WHISH_MERCHANT_ID` are all set, or a "not configured" error otherwise. `cashAdapter`/`bankTransferAdapter` are manual providers (`supportsLink: false`) — no external call, not in scope for this flag. |
| `actions/invoices.ts` | `getPaymentLink()` (line 87) — the server action `InvoicesView.tsx` calls. Delegates to `lib/whish.ts`'s `generatePaymentLink()`. Does not itself branch on provider — provider-specific gating belongs in the adapter, not here. |
| `components/modules/InvoicesView.tsx` | The only UI caller of `getPaymentLink` (line 245). No other component or route calls it — confirmed by repo-wide grep for `getPaymentLink`/`generatePaymentLink`. |
| `app/api/health/route.ts` | Reports `whish: !!(WHISH_API_URL && WHISH_API_KEY)` as a config-presence boolean for the health endpoint. Not a payment call site — no gating needed here. |

**Call chain (single path, confirmed no other entry point):**
`InvoicesView.tsx` → `actions/invoices.ts:getPaymentLink` → `lib/whish.ts:generatePaymentLink` → `getPaymentAdapter('whish')` → `whishAdapter.generateLink()` → (real API call, currently commented out) → mock URL.

## Assessment: gating fix, not provider-integration work

Adding a check is a guard clause against an existing, already-implemented,
already-tested pure function (`isExternalPaymentsAllowed()`) — the same shape
as the WhatsApp pilot gate already wired into `actions/messages.ts`
(`if (isPilotMode()) { ... matchAllowlist(...) ... }`). No change to the
Whish API integration itself (still commented out either way), no new
provider code, no schema change. **This is Option A ("small, contained
gating fix"), not Option B.**

## Where exactly to add the check

Inside `whishAdapter.generateLink()` in `lib/whish.ts`, before the
configured/unconfigured branch — not in `generatePaymentLink()`'s dispatcher
and not in `actions/invoices.ts`. Reasoning:

- Only Whish is an "external/live payment provider call" per the flag's own
  documented purpose (`.env.example` lines 57–60). Cash and bank transfer are
  manual (`supportsLink: false`, "trainer confirms, no URL generated") — they
  never call anything external and must not be gated by this flag.
- Gating in the adapter (not the dispatcher) keeps the check next to the
  exact code it protects, and matches the file's own stated design goal
  ("New providers are added by implementing `PaymentProviderAdapter`... no
  other files need to change" — the gate belongs to the provider that needs
  it, not to shared dispatch logic).

## Behavior-change disclosure (this is a real production behavior change, made deliberately)

Today, `generateLink('whish', ...)` returns a mock URL whenever all three
Whish env vars are configured — **regardless of `PILOT_ALLOW_EXTERNAL_PAYMENTS`**,
because nothing checks it. After this change, it will additionally require
`PILOT_ALLOW_EXTERNAL_PAYMENTS=true` (or `'1'`) to return that URL; otherwise
it returns a safe "not allowed" error, the same shape as the existing
"not configured" error.

This is judged safe and correct, not a regression, because:

1. The flag's own documented purpose is exactly this: *"Must stay unset/false
   unless external payments have been explicitly approved — do not enable
   without sign-off."* Any environment currently generating Whish links
   without ever having set this flag was already out of step with that
   documented policy — this change makes the code match the policy that was
   already written down, not invent a new one.
2. The URL returned today is a **mock** (`lib/whish.ts` line ~104: *"the
   copy/share UX can be built and tested end-to-end"*) — it exists for
   building/testing the UI, not for a real customer to actually pay through.
   No live payment capability is being removed by gating it.
3. This exact wiring was explicitly requested and authorized in this
   conversation turn — satisfying `CLAUDE.md` §4's requirement for explicit
   approval before "Modifying payment logic."

If a real deployed environment turns out to depend on the current unwired
mock-URL behavior (unlikely, per point 2, but not something this session can
verify without reading `.env`/`.env.local`, which is never done), the fix is
one env var: set `PILOT_ALLOW_EXTERNAL_PAYMENTS=true` once external payments
have been explicitly approved for that environment, exactly as the flag was
always documented to work.

## Correction made during implementation

The original plan (below) called for `lib/whish.ts` to import
`isExternalPaymentsAllowed` directly from `lib/pilot.ts`. **This broke `next
build`**: `lib/pilot.ts` has `import 'server-only'`, and `lib/whish.ts`'s
types/constants (`PaymentProvider`, `PAYMENT_PROVIDERS`) are — despite the
file's own "NEVER import this file in a client component" header comment —
already imported directly by `components/modules/InvoicesView.tsx`, a client
component (for building the payment-method `<select>`). Adding the
server-only import made Next.js reject the whole client bundle at build
time: *"You're importing a component that needs server-only... not
supported in the pages/ directory."*

Caught by running the gate (`node scripts/story-gate.mjs`) before committing,
exactly as it's meant to catch this class of mistake.

**Fix:** dependency injection instead of a module-level import.
`generatePaymentLink()`'s signature gained a 6th parameter,
`externalPaymentsAllowed = false` (fails closed by default — a future caller
that forgets to pass it stays blocked, not open), which `whishAdapter.generateLink`
checks. `actions/invoices.ts` (a real `'use server'` file, safe to import
`lib/pilot.ts`) now imports `isExternalPaymentsAllowed`, calls it, and passes
the result through to `generatePaymentLink`. This is the same pattern already
used by `PackageAssignmentService`, which is injected its ERP adapter rather
than importing the ERP client module directly.

This does not weaken the guarantee: the gate is still enforced inside
`lib/whish.ts` itself (not trusted from the caller blindly), and the
parameter's `false` default means any caller — today or in the future — that
doesn't explicitly resolve and pass the flag gets the fail-closed blocked
behavior, not an accidental open gate.

The pre-existing architectural inconsistency this surfaced (`lib/whish.ts`'s
own header comment says never import it client-side, but `InvoicesView.tsx`
already does, for the non-secret constants) is **not fixed** — flagged as a
separate, smaller finding in the report, out of scope for this change.

## Implementation plan (original, executed with the correction above)

1. `lib/whish.ts` — add `isExternalPaymentsAllowed()` check at the top of
   `whishAdapter.generateLink()`. When `false`, return
   `{ success: false, error: 'External payments are not enabled for this workspace.' }`
   before checking env config, so a misconfigured-but-also-disallowed
   environment gets the clearer "not enabled" message rather than "not
   configured" (matches Gate G3's "External payment... gates are verified"
   framing — the safety gate should be the first thing checked, not an
   afterthought behind config presence).
2. `lib/whish.test.ts` — add tests:
   - `generateLink('whish', ...)` returns the "not enabled" error when
     `PILOT_ALLOW_EXTERNAL_PAYMENTS` is unset, **even when all three Whish env
     vars are fully configured** (this is the regression test: it fails if the
     check is ever removed, since without it the existing "returns a mock URL
     once configured" test from tonight's earlier session would take over and
     a URL would come back instead of the blocked error).
   - `generateLink('whish', ...)` still succeeds (mock URL) when the flag
     **and** all three env vars are set — proves the check is additive, not a
     full block.
   - `generateLink('cash', ...)` / `generateLink('bank_transfer', ...)` are
     unaffected by the flag either way — proves the gate is Whish-specific,
     not a blanket payment block.
3. No change to `actions/invoices.ts` or `InvoicesView.tsx` — the gate is
   fully contained in the adapter that owns the external call.

## Gate

`node scripts/story-gate.mjs` must pass before commit.
