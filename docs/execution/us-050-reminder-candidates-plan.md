# US-050 — Trainer-Approved Reminder Candidates — Implementation Note

> Short plan note per the batch instructions (implementation shape wasn't obvious,
> and the batch's own stop condition is directly triggered below).
> Governed by `docs/execution/phase-1-plus-safe-run-plan.md` and
> `docs/execution/us-049-attendance-truth-plan.md`.

## Stop-condition check: package low-balance source — confirmed unclear, not faked

Audited `lib/billing/package-ledger-repository.ts` and `lib/billing/client-package-purchase-repository.ts`:
only **per-client** balance queries exist (`deriveBalancesByClient`, `listPurchasesByClient`, etc.) —
**no tenant-wide/bulk "which clients are low on package balance" query exists anywhere**. There is also
**no product-decided "low" threshold** (confirmed absent from the codebase, consistent with the prior
audit finding recorded in memory). Per the batch's explicit instruction, this is documented as a
confirmed limitation — **not faked** with an invented threshold or an N+1 per-client scan bolted on
without a product decision behind it.

**Scope decision:** this story builds the **generic, consent-gated, trainer-approved reminder-candidate
infrastructure** — not a specific "low package balance" detector. A future story can supply the
low-balance trigger once a bulk query and threshold are decided; this story's `createWhatsAppReminderCandidate`
accepts a caller-supplied reason and doesn't care what triggered the call.

## Consent gating: following CLAUDE.md (tier-1) over the batch prompt's looser phrasing

`FitDesk/CLAUDE.md`'s WhatsApp Consent States section (tier-1, always wins per
`docs/DOCUMENTATION_AUTHORITY_MAP.md`) says verbatim: *"unknown blocks reminder generation and instead
offers 'Send Initial Opt-In Request'."* This is stricter than the batch prompt's "unknown requires
trainer review / cannot be auto-send eligible" (which could be read as "still create it, just mark
non-eligible"). Following the more authoritative, more conservative CLAUDE.md wording:

- `opted_out` → **no candidate created** (blocked, no override).
- `unknown` → **no candidate created** (blocked — CLAUDE.md's "blocks reminder generation").
  A future story building "Send Initial Opt-In Request" is a *different* action type, out of scope here.
- `opted_in` → candidate created (the only state `canSendAutomatedWhatsApp` — built in US-059 — returns
  true for). Reused directly as the single gate, so the two stories can never drift apart.

## Infrastructure reuse — no new approval mechanism needed

`ClientRepository.completeActionIntent` / `dismissActionIntent` (already built, already tested) **are**
the "trainer must approve" mechanism — completing an intent = the trainer acted on it; dismissing = the
trainer declined it. A new `client_action_intent` type (`'whatsapp_reminder_candidate'`) plugs directly
into this existing pending → completed/dismissed lifecycle. No new schema table, no new approval logic.

## Wiring: Client Hub's existing pending-actions list (already-safe surface)

`getClientHubOverview` → `listPendingActions` (no type filtering) → `mapToClientHubOverview` already
surfaces every pending `client_action_intent` row generically. A new intent type appears there
automatically — no new UI needed for this story, matching Story 1/2's "wire only where a safe surface
already exists" precedent. Building a *dedicated* reminder-candidates dashboard panel is future work.

## Not in scope

- No package low-balance detection/trigger (see above — explicitly deferred, not faked).
- No WhatsApp send, no Evolution API call, no message_log write (that's US-048).
- No retention/cancellation-risk scoring (US-046), no missing-next-session automation (US-038).
- No new schema/migration — reuses the existing `client_action_intent` table's `type` column (free
  TEXT, no CHECK constraint — same as every other `client_action_intent` type today).
