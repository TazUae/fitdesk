# "US-038" Missing Next Session Action Signal — Implementation Note

> Short plan note per the batch instructions. Flags a real story-ID mismatch found during the
> canonical-definition confirmation step the batch itself requires before implementation.

## ID mismatch — confirmed, not silently resolved

`_inputs/fitdesk-final-doc-pack-v1-1/FITDESK_SOVEREIGN_PRODUCT_BACKLOG_V2_1.md`'s actual **US-038 is
"Client Pulse"** (shows client risk reason, connects to follow-up, deterministic rules before
predictive scoring — i.e. retention-risk signals, not session-booking detection).

The feature this batch's Story 3 actually **describes** ("detect clients who need a next session...
create an action intent suggesting booking... no auto-booking") is the canonical acceptance criterion
already present under **US-003 / US-027 ("Needs Attention")**: *"Includes missing next sessions where
data exists" / "Surfaces clients with no next session."* This is independently confirmed by
`lib/dashboard/derive.ts`'s own doc comment on the existing (ephemeral, dashboard-only)
`getMissingNextSessionAttentionItems` function, which cites itself as *"US-003 'missing next sessions
where data exists'"* — the codebase already attributes this exact feature to US-003, not US-038.

**Decision:** implement exactly what the task describes (it's safe, well-specified, additive, and
does not need a new product decision) — but flag this ID mismatch rather than silently building either
"the wrong thing under the right label" (Client Pulse) or "the right thing under the wrong label"
unannounced. This is recorded here and in the final batch report.

## Reliability check: `client_index.next_session_at_utc` vs. live session query

The task says: *"Detect... using existing next_session_at_utc / session data... if existing data
cannot reliably detect missing next session, document limitation and stop before faking it."*
`next_session_at_utc` is a **known-stale projection field, never written in production**
(`lib/clients/reconcile.ts` is dry-run only — already documented in `ClientHubPanel.tsx`'s own comment
on why it prefers a live computation instead). **Do not use it.** Instead, reuse the same live,
reliable source `getNextUp`/`getClientAttendanceCounts` (US-049) already use:
`findSessionsForClient` → `FDSession[]`, queried fresh per request.

## Design — reuses the exact existing exclusion rule, not a new one

New pure predicates in `lib/scheduling/attendance.ts` (alongside the US-049 outcome-counting helper):
`hasSessionHistory(sessions)` (any FDSession row ever, any status) and `hasUpcomingSession(sessions,
now)` (any `scheduled`/`confirmed` session with `startAt > now`). These exactly mirror
`getMissingNextSessionAttentionItems`'s own two conditions (`clientIdsWithHistory` /
`clientIdsWithFutureSession`) — same product decision (a client with **zero** session history is
excluded; that's the Add Client / first-booking loop's job, not this signal's), just reused for a
**persisted, dismissible** signal instead of an ephemeral per-page-load dashboard card.

New `ActionIntentType`: `'missing_next_session'`. New repository method
`createMissingNextSessionCandidate(ctx, clientIndexId)` — duplicate-prevention only (checks for an
existing **pending** intent of this type for the client before creating a second one); the
session-based *decision* of whether to call it lives in the new action
(`createMissingNextSessionSignalAction`, `actions/clients.ts`), which fetches the client's sessions,
applies the two predicates, and only then calls the repository. No consent gating needed (this isn't a
WhatsApp send).

## Not in scope

- No auto-booking, no WhatsApp send, no invoice/package mutation.
- No automatic wiring into page load / no background job — this is a callable action, matching the
  US-048 precedent of backend-only infrastructure this batch. A trigger surface (button, scheduled
  job) is future work.
- No retention-risk scoring (that's the *actual* US-038, explicitly out of scope for this story).
