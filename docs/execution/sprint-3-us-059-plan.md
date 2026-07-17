# Sprint 3 — US-059 WhatsApp Consent and Opt-In Safeguards — Plan / Audit

> Governed by `docs/DOCUMENTATION_AUTHORITY_MAP.md` (tier 4). Acceptance criteria
> pulled directly from `FITDESK_SOVEREIGN_PRODUCT_BACKLOG_V2_1.md` §4.4 (lines
> 329–353).
>
> **Scope for tonight: plan and audit only.** No schema changes, no consent-
> model code, no WhatsApp behavior changes. `CLAUDE.md` §4 lists both
> "Modifying WhatsApp or external messaging behavior" and "Changing database
> schemas" as CRITICAL — requires explicit approval before touching. You
> selected "plan and audit only" for tonight when asked; this document is the
> audit and the plan for a future, explicitly-approved implementation session,
> not a partial implementation.

## Acceptance criteria (verbatim from the backlog)

```
Priority: NOW

Story:
As a trainer,
I want FitDesk to track WhatsApp opt-in status,
so that reminder workflows do not create messaging or compliance risk.

Acceptance criteria:
Consent states include unknown, opt_in_requested, opted_in, opted_out.
Unknown blocks reminder workflows and offers initial opt-in request.
Opted-out clients are excluded.
Trainer approves every send.
Consent changes and send attempts are auditable.
```

## Current state, confirmed by direct code audit tonight

| Criterion | Status |
|---|---|
| Consent states (unknown/opt_in_requested/opted_in/opted_out) | **Does not exist.** `clientIndex` (`lib/db/schema.ts` lines 134–169) has `whatsappEnabled` (boolean) — a trainer-toggled preference, not a consent record. No consent-state field anywhere in the schema. |
| Unknown blocks reminder workflows | **Not enforced** — there's nothing to enforce; no reminder workflow exists yet (see US-048), and no consent check exists in the one real send path that does exist. |
| Opted-out clients excluded | **Not enforced**, same reason. |
| Trainer approves every send | **Already true**, and unrelated to consent modeling — `actions/messages.ts`'s `sendMessage()` (lines 116–198) is only ever called from the trainer-facing composer (`features/messaging/components/MessagesView.tsx`) after the trainer reviews/edits a draft and confirms. No auto-send path exists anywhere. |
| Consent changes and send attempts are auditable | **Send attempts: yes** — every call to `sendMessage()` writes to `messageLog` (`actions/messages.ts` lines 178–191), success or failure. **Consent changes: no** — there's no consent state to change yet, and the generic `clientEvent` table (`lib/db/schema.ts` lines 219–228) that could carry this kind of audit event is not wired to anything consent-related. |

**Net assessment: this is 100% new construction, correctly classified "NOW"
priority and correctly identified in tonight's own sprint ordering as the
prerequisite for US-050/047/048** — none of the other three stories can
honestly claim "WhatsApp follow-up respects consent" (US-050) or "consent
state is required" (US-048) without this existing first.

## What a real implementation would require (for a future approved session)

This is deliberately a specification, not a partial build — every item below
crosses a `CLAUDE.md` §4 CRITICAL gate and needs your explicit sign-off
before any of it is written.

1. **Schema change** (`lib/db/schema.ts`): add a `whatsapp_consent_state`
   column to `clientIndex` (or a dedicated `client_consent` table if you want
   consent-state history rather than current-state-only — that's a real
   design choice: a single mutable column is simpler; a small append-only
   table matches this codebase's existing `package_ledger`-style pattern for
   things that need a history, and would double as the "consent changes are
   auditable" requirement without inventing a second logging mechanism).
   Values: `'unknown' | 'opt_in_requested' | 'opted_in' | 'opted_out'`,
   defaulting existing rows to `'unknown'` (fails closed — matches this
   repo's existing "missing tenant context fails closed" convention, now
   applied to consent).
2. **Migration** for existing `clientIndex` rows — needs a decision on
   whether `whatsappEnabled: true` clients should default to `'unknown'`
   (safest, but re-asks consent from clients who may have already
   effectively consented by using WhatsApp with their trainer) or some other
   backfill rule. Not something to infer from the code — a product decision.
3. **Enforcement point**: `actions/messages.ts`'s `sendMessage()` (lines
   116–198) is the one real send path — a consent check belongs here,
   structurally identical to the existing `isPilotMode()`/`matchAllowlist()`
   gate already in the same function (lines 132–150), so this is a small,
   well-precedented code shape once the schema exists. The distinction: this
   gate must differentiate *reminder-type* sends (which need `opted_in`)
   from other message types if any exist that shouldn't be consent-gated
   (e.g., is a trainer manually messaging a client about something
   unrelated to marketing/reminders also consent-gated, or only automated
   reminder-class messages? The backlog says *"reminder workflows"*
   specifically — not "all messages" — this scoping question needs an
   answer before writing the gate, not an assumption).
4. **"Unknown blocks + offers initial opt-in request"**: needs a defined
   opt-in-request message flow — is this a special `messageType` in the
   existing draft system (`lib/claude.ts` already has an `invoice` /
   `reminder` / `follow_up` / `reengagement` type enum it could extend), or
   a separate UI action? Small either way, but needs the schema to exist
   first.
5. **Audit for consent changes**: use `clientEvent` (already exists,
   currently unused for this) or a dedicated table — same simplicity-vs-
   history tradeoff as item 1.

## Dependency note for the other three Sprint 3 stories

US-050, US-047, and US-048 all either directly require this consent model
(US-048's "consent state is required", US-050's "WhatsApp follow-up respects
consent") or would need to explicitly avoid sending anything until it
exists. Their plan docs point back here rather than re-deriving this finding.
