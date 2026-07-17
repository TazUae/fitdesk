# Production Hardening Closeout Report

> **Type:** Docs-only closeout report (tier-6 execution artifact — historical/contextual record,
> not a forward-looking spec). Governed by `docs/DOCUMENTATION_AUTHORITY_MAP.md`; `CLAUDE.md` is
> tier 1 and always wins on any conflict.
> **Date:** 2026-07-12 · **Branch:** `docs/production-hardening-closeout` (from `main` @ `4dcf14b`).
> **Scope:** docs only. No runtime code, tests, schema, migrations, Docker, Dokploy, provisioning,
> ERP credentials, or production files were touched to produce this report.

---

## 1. Executive verdict

The 13-story production-hardening wave is **engineering-complete**:

- **12 of 13 stories implemented and merged** to `main` via PRs #33–#38.
- **1 of 13 stories (US-046, Cancellation Risk Management) is blocked on a missing product
  decision** (a concrete cancellation-risk threshold) — correctly stopped rather than faked, per
  its own plan note and the batch's forbidden-scope rule against inventing thresholds.
- **0 stories unattempted.**

All merged work followed the audit → plan → implement → targeted-test → `story-gate.mjs` →
commit discipline, one US-ID (or one clearly-scoped labeled feature) per commit, with tenant
isolation tests on every tenant-sensitive change. No schema migration, WhatsApp send-path change,
or payment-logic change occurred without an explicit approved design (see Phase 1's approved
financial-impact design and Phase 2's consent model in
`docs/execution/phase-1-plus-safe-run-plan.md`).

**The wave is not yet pilot-ready.** Engineering completion is not the same as pilot readiness —
see §6 for the required manual QA pass and §8 for the recommended next sequence before any
production/pilot decision.

---

## 2. Current repo state

| Item | Value |
|---|---|
| Branch (this report) | `docs/production-hardening-closeout` |
| Created from | `main` @ `4dcf14b` |
| HEAD (before this commit) | `4dcf14b631e412b4e5f36930cebee0c4056029c9` |
| `main` / `origin/main` sync | In sync — both at `4dcf14b` (confirmed via `git rev-parse main origin/main`) |
| Working tree before this report | Clean (`git status --short` empty) |
| Last merge | PR #38 — `Merge pull request #38 from TazUae/hardening/remaining-production-hardening-batch` |

---

## 3. Story-by-story closeout table

Audit range: `git log d05dd96..HEAD` (the "Phase 1+ safe-run" audit merge through the current
`main` tip), cross-checked against `_inputs/fitdesk-final-doc-pack-v1-1/FITDESK_SOVEREIGN_PRODUCT_BACKLOG_V2_1.md`
for canonical titles, and `docs/execution/phase-1-plus-safe-run-plan.md` for the two pre-existing
stories (US-043, US-058) that predate this range.

| Story | Title (canonical) | Status | Commit(s) | PR | Notes |
|---|---|---|---|---|---|
| US-017 | No-Show Session Outcome | ✅ Complete | `4fd2f08`, `a6b753f` | #33, #34 | Approved financial-impact design (PPS: charge/waive; package: deduct/waive; no silent mutation). |
| US-039 | Session Cancel / Reschedule Outcome | ✅ Complete | `f3ff0ac`, `298e2c2`, `faa6fa1`, `62d13d3` | #35, #36 | Cancel keeps history + reason; reschedule preserves billing/invoice/package context, no financial side effect, no duplicate billing. |
| US-049 | Attendance Tracking | ✅ Complete | `bc7af0c` | #37 | Pure `getSessionOutcomeCounts` over raw `FDSession[]` (not the lossy legacy-adapted view); no fabricated "rescheduled" count — documented as a limitation. See `docs/execution/us-049-attendance-truth-plan.md`. |
| US-059 | WhatsApp Consent and Opt-In Safeguards | ✅ Complete | `d86ff21` | #37 | `whatsapp_consent_state` on `client_index` (`unknown│opted_in│opted_out`); every change audited via `client_event`; single `canSendAutomatedWhatsApp` guard reused everywhere downstream. |
| US-050 | Package Renewal Reminder | ✅ Complete (generic infra) | `603e8fd` | #37 | Built the generic, consent-gated, trainer-approved reminder-candidate infra (`whatsapp_reminder_candidate` intent type). The specific low-package-balance *trigger* was explicitly deferred — no bulk balance query and no product-set "low" threshold exist yet; not faked. See `docs/execution/us-050-reminder-candidates-plan.md`. |
| US-048 | WhatsApp Reminder Workflow | ✅ Complete | `cd80215` | #38 | `deliverWhatsAppReminderAction` reuses the existing, unmodified `sendMessage()`/`lib/evolution.ts` path; re-checks consent at send time (not just at candidate-creation time); completes the intent only after a confirmed send success. See §5 for a known edge case. See `docs/execution/us-048-delivery-approval-plan.md`. |
| US-047 | Automated Follow-Up Suggestions | ✅ Complete (hardening only) | `e3076a8` | #38 | Confirmed already fully built (generic `client_action_intent` review/complete/dismiss lifecycle) — this story closed two small test gaps only; no repository or action source changed. See `docs/execution/us-047-action-intent-followthrough-audit.md`. |
| "US-038" | *(labeled)* Missing Next Session Signal | ✅ Complete — **ID mismatch flagged** | `1f3e307` | #38 | The feature built matches US-003/US-027's "missing next session" criterion, not canonical US-038 ("Client Pulse"). Deliberately implemented as described and flagged rather than silently mislabeled either way. See §5 and `docs/execution/us-038-missing-next-session-plan.md`. |
| US-046 | Cancellation Risk Management | 🛑 **Blocked** | `0a21786` (stop-decision doc only) | #38 | No code, tests, or UI written — correctly stopped. See §4. |
| US-053 | Client Notes as Daily Workflow | ✅ Complete | `c9d98a4` | #38 | Fast note entry from the Client Hub; reuses the existing `client_event` table (`type: 'client.note'`) — no schema change. Session-card entry point deferred as follow-up UI work. See `docs/execution/us-053-client-notes-plan.md`. |
| US-052 | Client Progress Tracking | ✅ Complete | `9b33434` | #38 | Progress entries optionally linked to a goal; reuses `client_event` (`type: 'client.progress'`); goal link is validated fail-closed against the client's own `client_goal` rows before being stored. |
| US-043 | AI Quick Add / Parse Draft | ✅ Complete (pre-existing) | `f638475` (origin) | pre-#31 (Sprint-era) | Verified already built and tested during the Phase 0/Phase 1+ audit (`docs/execution/phase-1-plus-safe-run-plan.md` §1, §Phase 6) — draft-only, schema-validated, 3s-timeout-then-fallback, never blocks the manual form. No dedicated commit in this wave's range; predates `d05dd96`. |
| US-058 | Network-Degraded Client Capture | ✅ Complete (pre-existing) | inherent in `addClient` design | pre-#31 (Sprint-era) | Verified already built and tested during the same audit — confirmed-first create (`addClient` returns success only after ERP **and** local both succeed), clear pending/error state, no billing before ERP Customer exists. No single dedicated commit; behavior predates `d05dd96`. |

**Totals: 12 complete, 1 blocked, 0 unattempted — matches the stated engineering-complete state.**

---

## 4. US-046 blocker — explicit detail

**Story:** US-046 — Cancellation Risk Management.
**Canonical acceptance criteria** (`FITDESK_SOVEREIGN_PRODUCT_BACKLOG_V2_1.md:851`):
```
Defines cancellation-risk thresholds.
Shows risk reason.
Suggests follow-up.
Allows dismiss/snooze with reason.
```

**Missing product decision:** the first acceptance criterion — *"Defines cancellation-risk
thresholds"* — is itself a required product decision, not an implementation detail derivable from
existing code or data.

**Why implementation was stopped, not worked around:**
- An exhaustive search (Product Decisions ledger PD-001–PD-012, the full doc pack, `docs/execution/*`,
  `docs/product/*`, `docs/plans/*`) found **no concrete numeric threshold anywhere** (no "N
  cancellations in M days," no "X consecutive no-shows" rule).
- The batch's own fallback — *"prefer flags/reasons over a fake numeric score if thresholds are not
  defined"* — does not resolve the gap: a flags-only implementation still has to answer *at what
  point does a pattern count as risk*, which is exactly the undefined threshold. Any self-chosen
  number would be exactly the fabricated, undocumented threshold `CLAUDE.md`'s AI rules and this
  wave's forbidden scope both disallow.
- This mirrors the same class of gap already correctly deferred for US-050's package-low-balance
  trigger (a real bulk query exists conceptually, but no "low" threshold is decided either).

**Required decision to unblock:** a product decision recording a concrete, explainable
cancellation-risk threshold — ideally as a new `PD-0xx` ledger entry (mirroring how `PD-010` defined
the package-renewal workflow) — e.g. "flag when `noShow + cancelled ≥ N` in the client's session
history."

**What data already exists to support it, the moment a threshold is decided:**
- `lib/scheduling/attendance.ts`'s `getSessionOutcomeCounts` (US-049) already returns per-client
  `noShow`/`cancelled`/`skipped`/`completed` counts, ready to be the direct input to a threshold rule.
- The `client_action_intent` pending → completed/dismissed lifecycle (US-047) and the
  dismiss-with-reason pattern already exist and are already tested — a new `cancellation_risk` intent
  type would plug into the same infrastructure `US-050`'s reminder candidates use, with no new
  approval mechanism needed.
- **No new data infrastructure is required — only the missing product decision.**

---

## 5. Risk register

| # | Risk | Detail | Severity |
|---|---|---|---|
| 1 | **US-048 delivery idempotency edge case** | `deliverWhatsAppReminderAction` calls the existing `sendMessage()` and only calls `completeActionIntent` *after* a confirmed send success (by design, so a failed send never falsely resolves the candidate). However, if the WhatsApp send itself succeeds but the subsequent `completeActionIntent` call fails (e.g. a transient DB error between the two steps), the candidate intent remains `pending` — meaning a trainer could see the same "reminder candidate" as still-actionable and press "send" again for a message that already went out. There is no send-side deduplication token tying a specific send attempt to a specific intent resolution. | Low-likelihood, real edge case. No customer-facing double-charge risk (this is messaging, not billing), but a client could receive a duplicate reminder. Worth hardening before pilot if reminder volume is meaningful — e.g. wrap the send + complete as a single retryable unit, or check `message_log` for a very-recent successful send to the same intent before allowing a repeat send. |
| 2 | **"US-038" label mismatch** | The feature implemented and labeled `"US-038"` in this wave (missing-next-session action signal) does not match canonical US-038 ("Client Pulse" — deterministic cancellation-risk-style reasoning connected to a follow-up action). The implemented feature actually satisfies US-003/US-027's "missing next sessions where data exists" criterion. This was flagged in-repo (code comments, the plan note, and the commit message) rather than silently mislabeled, but the mismatch is still live in the codebase's `ActionIntentType` naming (`'missing_next_session'`, which is accurately named) and in any tracking system that keys off the string `"US-038"`. | Low — cosmetic/tracking risk only, not a functional bug. Should be corrected in whatever backlog-tracking system uses these labels; canonical US-038 (Client Pulse) remains genuinely unbuilt and should be tracked as such going forward. |
| 3 | **Remaining browser/manual QA required** | This wave's verification was `story-gate.mjs` (typecheck/build + full `vitest run` + lint + a tenant-isolation heuristic) plus, for a subset of Phase 1 stories, local-stack ERP QA against a test tenant. No end-to-end browser walkthrough of the full merged surface (all 13 stories together, in the live UI, across billing modes) has been performed in this session. Automated tests verify code correctness; they do not verify that the assembled feature *reads* correctly to a trainer in the actual app. | Must-do before pilot — see §6 checklist. |

---

## 6. Pre-pilot QA checklist

Manual, browser-driven verification required before any pilot decision. None of this has been
performed as part of this closeout report (docs-only).

- [ ] **Onboarding validation** — zero-row / first-login state renders correctly (US-026).
- [ ] **Client creation** — Add Client end-to-end, including AI Quick Add parse-then-confirm (US-043)
      and the confirmed-first / network-degraded capture behavior (US-058: no ERP-linked success
      shown before confirmation, no billing before ERP Customer exists).
- [ ] **Package-mode billing** — assign a package, complete a session, confirm ledger-first
      consumption and balance display.
- [ ] **Pay-per-session completion billing** — complete a PPS session, confirm idempotent
      invoice create+submit, confirm no duplicate invoice on retry.
- [ ] **No-show charge/deduct/waive** — exercise all three PPS/package outcome paths (US-017);
      confirm no silent financial mutation and correct audit rows.
- [ ] **Cancel/reschedule** — cancel a session (reason captured, history preserved); reschedule a
      session (no duplicate billing, context preserved) (US-039).
- [ ] **Attendance summary** — Client Hub / detail page shows correct completed/no-show/
      cancelled/skipped counts (US-049).
- [ ] **WhatsApp consent states** — walk all three states (`unknown`, `opted_in`, `opted_out`);
      confirm `opted_out` clients are excluded with no override anywhere
      (US-059).
- [ ] **Reminder candidate creation** — trigger a `whatsapp_reminder_candidate` intent; confirm it
      is consent-gated at creation time and appears in the Client Hub's pending actions (US-050).
- [ ] **Explicit WhatsApp delivery approval** — approve and send a reminder candidate; confirm the
      send goes through the real (or mocked/pilot) Evolution path, is logged, and the candidate
      resolves only after a confirmed send (US-048); manually attempt a rapid double-send to probe
      risk #1 above.
- [ ] **Client notes** — add a note from the Client Hub; confirm it appears in Recent Activity
      immediately and is tenant-scoped (US-053).
- [ ] **Progress entries** — add a progress entry with and without a goal link; confirm the goal
      selector only offers the client's own goals and the entry displays correctly (US-052).

---

## 7. Deployment note

- **Git is the source of truth.** All 12 completed stories are merged into `main` via reviewed PRs
  (#33–#38); nothing in this wave was hand-applied to a running server.
- **No manual server edits were made or are implied by this report.** This report is purely
  descriptive of already-merged, already-deployed-via-Git history.
- **Dokploy deploys from Git** — any promotion of this work to a live environment happens through
  the existing Dokploy Git-driven deploy pipeline, not through direct server/container edits.
- **This report performs no production mutation.** It is a docs-only artifact: no runtime code,
  test, schema, migration, Docker, Dokploy, provisioning, or ERP-credential file was created,
  edited, or deleted to produce it.

---

## 8. Recommended next sequence

1. **This closeout docs commit** — land this report on `docs/production-hardening-closeout`
   (docs-only, no runtime change; do not push/merge without explicit instruction).
2. **Browser smoke QA** — run through §6's checklist against a real (or local-stack test-tenant)
   environment before treating the wave as pilot-ready.
3. **US-046 product decision** — record a concrete cancellation-risk threshold (new `PD-0xx` entry)
   to unblock the one remaining story; implementation can then reuse existing US-049 attendance
   counts and the US-047/US-050 action-intent infrastructure with no new data plumbing.
4. **Final pilot-readiness gate** — once §6 QA passes and US-046 is either implemented or formally
   deferred to post-pilot by the product owner, re-run `story-gate.mjs` on the final state and make
   the go/no-go pilot call.
