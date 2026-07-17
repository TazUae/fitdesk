# Overnight Final Doc Pack Audit

> Governed by `docs/DOCUMENTATION_AUTHORITY_MAP.md`. This is an **audit** (tier 6:
> factual record of what was found), not a source of new product intent. Where this
> audit's findings conflict with `docs/execution/SPRINT_1_STORY_TRACEABILITY_MAP.md`
> (written 2026-07-10, before PRs #25–#27 merged), **this document is more current**
> for US-025/026/030 test-coverage status — the earlier map should be treated as
> partially stale, not deleted, per the authority map's "silence is not archival" rule.

- **Branch:** `chore/overnight-final-doc-pack-build`
- **Base:** `main` @ `744c014` (clean tree at audit start)
- **Input pack:** `axis-erp/_inputs/fitdesk-final-doc-pack-v1-1/` (12 Markdown files)
- **Scope:** Read-only audit + doc creation only. No runtime code touched.

---

## 1. Docs Found

All 12 files listed in `FITDESK_FINAL_DOCUMENTATION_PACK_MANIFEST_V1_1.md` are present
in the input folder:

| # | File | Role |
|---|---|---|
| 1 | `FITDESK_PRODUCT_PRINCIPLE_V1_1.md` | Core non-negotiable product/UX/architecture principles |
| 2 | `FITDESK_CANONICAL_TRAINER_JOURNEY_V1_1.md` | 10-stage trainer journey all epics must support |
| 3 | `FITDESK_FLOW_EPICS_V1_1.md` | FE-001…FE-006 epic definitions, scope bands, acceptance criteria |
| 4 | `FITDESK_SOVEREIGN_PRODUCT_BACKLOG_V2_1.md` | NOW/NEXT/LATER canonical backlog (59 stories) |
| 5 | `FITDESK_BUILT_UPGRADE_NOT_BUILT_STATUS_V1_1.md` | Per-story build-status classification (as claimed by doc pack author, **not yet cross-checked against `main` when written**) |
| 6 | `FITDESK_PRE_PILOT_GATES_V1_0.md` | G1–G6 pilot-readiness gates |
| 7 | `FITDESK_FUTURE_ARCHITECTURE_V1_0.md` | Deferred architecture roadmap (FA-001…FA-010) |
| 8 | `FITDESK_PRODUCT_DECISIONS_V1_0.md` | PD-001…PD-012 decision ledger |
| 9 | `FITDESK_SOVEREIGN_PRODUCT_STRATEGY_PRE_PILOT_EXECUTIVE_MANIFEST_V2_2.md` | Executive summary + sprint plan, synthesizes 1–8 |
| 10 | `FITDESK_USER_STORIES_BY_FLOW_EPIC_V1_0.md` | Predecessor story-to-epic mapping (superseded by #4 per PD-012, kept for traceability) |
| 11 | `FITDESK_SOVEREIGN_PRODUCT_BACKLOG_REVIEW_AND_APPROVAL_PATCH_V2_1.md` | Review notes explaining the v2.0→v2.1 backlog cleanup |
| 12 | `FITDESK_CANONICAL_TRAINER_JOURNEY_V1_1.md` (manifest lists as #16 review order item; already counted at #2) | — |

All 12 were read in full during Phase 0. No corrupt, empty, or truncated files.

---

## 2. Source-of-Truth Hierarchy (as declared by the pack itself)

The pack is internally consistent about its own hierarchy:

1. `FITDESK_PRODUCT_PRINCIPLE_V1_1.md` — non-negotiable, all else must comply
2. `FITDESK_CANONICAL_TRAINER_JOURNEY_V1_1.md` — depends on #1
3. `FITDESK_FLOW_EPICS_V1_1.md` — depends on #1, #2
4. `FITDESK_SOVEREIGN_PRODUCT_BACKLOG_V2_1.md` — canonical implementation backlog (per PD-012), depends on #1–#3, #5, #6, #8
5. `FITDESK_BUILT_UPGRADE_NOT_BUILT_STATUS_V1_1.md` — status tracking, separate axis from backlog priority
6. `FITDESK_PRE_PILOT_GATES_V1_0.md` — gates derived from #5
7. `FITDESK_PRODUCT_DECISIONS_V1_0.md` — decision ledger, referenced by all of the above when behavior is ambiguous
8. `FITDESK_SOVEREIGN_PRODUCT_STRATEGY_PRE_PILOT_EXECUTIVE_MANIFEST_V2_2.md` — executive synthesis of 1–7, not a new source of truth
9. `FITDESK_USER_STORIES_BY_FLOW_EPIC_V1_0.md` — explicitly superseded by #4 (PD-012), retained as long-form traceability reference only
10. `FITDESK_SOVEREIGN_PRODUCT_BACKLOG_REVIEW_AND_APPROVAL_PATCH_V2_1.md` — meta-document explaining how #9 became #4; historical once #4 is adopted
11. `FITDESK_FUTURE_ARCHITECTURE_V1_0.md` — sequencing only; explicitly must not gate pre-pilot work

**This audit's placement:** per `docs/DOCUMENTATION_AUTHORITY_MAP.md`, once imported these
become **tier 3** (`docs/product/*`) candidates. This audit itself is **tier 6**
(`docs/audits/*`) — evidence, not new product intent. The doc pack's internal
hierarchy above should be preserved if/when these files are imported into
`docs/product/`.

---

## 3. Conflicts or Duplicates Found

### 3.1 Doc-pack-internal (already resolved by the pack)

- **US-044 vs US-053** — the pack already merges US-044 (Client Notes / Events
  Timeline) into US-053 (Client Notes as Daily Workflow) per PD-012 and the review
  patch §3.5. No action needed; both story IDs still appear in
  `FITDESK_CANONICAL_TRAINER_JOURNEY_V1_1.md` §8 as a residual reference, harmless.
- **US-054** demoted to Future/Discovery per PD-012 and review patch §3.6 — resolved.
- **[cite: N] placeholder tokens** — the review patch (§3.1) says these should be
  removed before commit. **None were found in the actual 12 pack files during this
  audit** — the cited placeholders appear to already be absent from this v1.1 pack
  (they were a problem in the *prior* v2.0 upload the patch document reviews, not in
  the delivered pack). No cleanup action needed.
- **ERP wording** ("ERPNext Core Sync Proxy") and **WhatsApp wording** ("native device
  WhatsApp protocols") flagged for normalization by the review patch (§3.2, §3.3) —
  **also not found verbatim in the delivered v1.1 pack.** The pack already uses
  "approved ERP client/proxy path" and "approved WhatsApp integration path"
  consistently. Cleanup already applied upstream of this delivery.

### 3.2 Doc-pack vs repo reality (found during this audit, not resolved by the pack)

- **`FITDESK_BUILT_UPGRADE_NOT_BUILT_STATUS_V1_1.md` is stale on US-025/026/030.**
  The doc pack classifies these three as "Pre-pilot validation gate" with no build
  detail beyond "gate, not built as a feature." As of `main` @ `744c014` (this
  branch's base, merged **the same day** the doc pack covers), all three already have
  merged, passing, tenant-scoped/mocked unit and integration test coverage:
  - US-025 → `lib/clients/__tests__/repository.test.ts` (tenant-isolation guard +
    cross-tenant denial suite, PR #25)
  - US-026 → `app/onboarding/actions.test.ts` (zero-row happy path, existing-row
    no-reset guarantee, fail-closed validation, PR #26)
  - US-030 → `lib/__tests__/pilot.test.ts` (`PILOT_MODE`, external-payments gate,
    WhatsApp allowlist matcher, PR #27)

  This is **narrower** than the full G1–G3 gate scope in `FITDESK_PRE_PILOT_GATES_V1_0.md`
  §3–5 (e.g. US-025 coverage is at the `ClientRepository` layer, not yet extended to
  sessions/packages/invoices repositories or to a documented feature-flag inventory
  across every flag in `.env.example` for US-030). See the Traceability Map
  (`docs/execution/FINAL_DOC_PACK_TRACEABILITY_MAP.md`) for the precise per-story gap.
  **Recommendation:** treat the doc pack's Built/Upgrade/Not-Built table as directionally
  correct but do not treat "Pre-pilot validation gate" as "0% done" for these three —
  update it during the next docs-authoring pass, not silently.

- **US-017 (No-Show) / US-039 (Cancel/Reschedule) are less built than the doc pack
  claims.** The doc pack (`FITDESK_BUILT_UPGRADE_NOT_BUILT_STATUS_V1_1.md` §6, §11)
  classifies both as "Built but needs upgrade." Repo inspection shows:
  - `actions/sessions.ts` (`cancelSession`, `noShowSession`) **does** have
    ownership/tenant gates (`getSessionById(sessionId, resolved.trainerId)` before
    mutation) — this is **more current and safer** than the H5 security doc's stale
    claim of "no ownership check," which the existing
    `SPRINT_1_STORY_TRACEABILITY_MAP.md` had already flagged as needing re-verification.
  - However, `actions/sessions.ts` imports its mutations from
    `lib/business-data/erp-adapter` → `lib/erpnext/client.ts`, which
    `docs/plans/FITDESK_REMAINING_ROADMAP_V2.md` §1 documents as the **dead/stubbed PT
    Session path** (`createSession`/`markSessionComplete` throw 503; `getSessions()`
    returns `[]`).
  - The **live** session architecture is FD Session
    (`lib/scheduling/sessionRepository.ts`, `sessionCompletionService.ts`), whose
    `MUTABLE_STATUSES = ['scheduled', 'confirmed']` only ever transitions sessions to
    `'completed'`. No FD Session code path sets `'cancelled'`, `'no_show'`, or
    `'skipped'`, even though `FDSessionStatus` (`types/scheduling.ts`) already defines
    all three.
  - **Confirmed, not just inferred:** `lib/business-data/erp-adapter.ts` is a one-line
    re-export of `lib/erpnext/client.ts` (`export * from '@/lib/erpnext/client'`).
    In that file, `createSession`, `markSessionComplete`, `cancelSession`, and
    `markSessionMissed` (lines ~456–480) are unconditional stubs — every one
    immediately calls the 503 `'Not Implemented'` error helper against the `PT Session`
    doctype, with all parameters prefixed `_` (unused). There is no live/stub branch;
    these functions cannot succeed in any environment as currently written.
  - **`actions/sessions.test.ts` exists and passes, but does not exercise this stub.**
    It `vi.mock('@/lib/business-data/erp-adapter', ...)`s the entire module (line 10),
    so `markSessionComplete`/`cancelSession`/`markSessionMissed` are replaced with
    `vi.fn()` mocks returning fake success objects. The test suite correctly proves the
    trainer-ownership gate (`getSessionById` check before mutation) — it does **not**
    and cannot prove the mutation itself would succeed outside the test, because the
    real implementation always throws.
  - **Net effect:** cancel/no-show/reschedule/complete via `actions/sessions.ts` will
    throw a 503 in every real environment today, despite well-guarded, well-tested
    ownership logic sitting in front of it. This is a materially different risk picture
    than "needs UX polish" — it is a **broken/dead code path with a passing test suite
    that doesn't cover the part that's broken**. Flagged as **Risk R-1** below; this is
    a runtime-behavior finding, not something this overnight task is authorized to fix
    (Hard Rule: no billing/session runtime changes without approval).

### 3.3 No conflicts found between the 12 pack documents themselves

Cross-references (Flow Epic IDs, US-IDs, PD-IDs, Gate IDs) are internally consistent
across all 12 files. Sprint 1/2/3 recommendations match verbatim across the manifest,
backlog, and executive manifest.

---

## 4. MVP / Pilot-Safe Now

Per the doc pack (`FITDESK_BUILT_UPGRADE_NOT_BUILT_STATUS_V1_1.md` §13), cross-checked
against repo evidence during this audit:

| Story | Doc pack status | Repo evidence check |
|---|---|---|
| US-004 Today Timeline | Built | `lib/dashboard/derive.ts` (`getTodaySections`) + tests — confirmed |
| US-007 Add Client | Built | `lib/clients/repository.ts` (`createClientRow`) + extensive tests — confirmed |
| US-008 ERP-Linked Client Identity | Built | Confirmed via `client_index.erpCustomerId` schema + repo tests |
| US-009 Local Client Read Model | Built | Confirmed, `lib/clients/repository.ts` |
| US-010 Duplicate Detection | Built | `lib/clients/__tests__/duplicates.test.ts` — confirmed |
| US-013/US-014 Billing modes | Built | `lib/billing/package-*` + `sessionCompletionService.ts` PPS path — confirmed |
| US-015 Session Booking | Built | `lib/scheduling/bookingService.ts` — confirmed (not independently re-verified this pass) |
| US-016 Session Completion | Built | `sessionCompletionService.ts` — confirmed, only for `'completed'` transition |
| US-020–US-024 Goal System | Built | `lib/goals/{taxonomy,mapping,conflicts,safety}.ts` + tests — confirmed |

No discrepancies found in this "Built" tier — repo evidence supports the doc pack's
claims for the goal system and core Add-Client/billing/booking foundation.

---

## 5. Production-Hardening Soon

Per doc pack (§6, §12) and confirmed/refined by this audit:

- **US-018 Statement of Account UX** — doc pack says "Built but needs upgrade"; repo
  shows the **specific required copy already shipped**: `components/clients/StatementSheet.tsx`
  contains both `"Payment rows are temporarily unavailable..."` and `"Totals from
  invoice balances"` (matching PD-009 and Gate G4 verbatim). This story is **further
  along than the doc pack credits** — likely already satisfies G4. Recommend
  re-verifying against the doc pack's specific "Applied amount + empty Payments filter"
  screenshot scenario before closing the gate formally.
- **US-001/002/003/005/006/027/028/037/039/042/045/049/053** — doc pack's "needs
  upgrade" classification is broadly consistent with repo state (dashboard exists but
  Needs Attention is invoice-only per `lib/dashboard/derive.ts`'s `getAttentionItems`
  — no session/package/communication signals yet, matching doc pack's stated gap
  exactly).
- **US-040/US-041 Backfill/Repair, ERP-unavailable recovery** — doc pack "Built but
  needs upgrade"; not independently re-verified this pass — lower priority than the
  above.

## 6. Future Platform Architecture Later

Confirmed as **not built**, matching the doc pack exactly:

- US-031 Client Self-Onboarding Portal, US-032 Native Contact Import, US-033 Program
  Generation, US-034 Advanced Progress Reporting, US-035 Event/Outbox Architecture,
  US-036 Offline-Safe Client Creation, US-055 Workout Plan Creation, US-056 Nutrition
  Support. No code found for any of these during exploration; correctly deferred.

## 7. Risks Requiring Architect Approval

- **R-1 — No-show/cancel/reschedule/complete via `actions/sessions.ts` is dead code
  that will 503 in any real environment (see §3.2, confirmed by direct code read, not
  inference).** `lib/business-data/erp-adapter.ts` → `lib/erpnext/client.ts`'s
  `createSession`/`markSessionComplete`/`cancelSession`/`markSessionMissed` are
  unconditional stubs. `actions/sessions.test.ts` passes only because it mocks that
  entire module away — the passing test suite creates false confidence. If any UI
  entry point still calls `completeSession`/`cancelSession`/`noShowSession` from
  `actions/sessions.ts` (as opposed to `sessionCompletionService.ts`, the real FD
  Session path), that entry point is currently broken in production. This is a
  **runtime-behavior finding, not a fix** — flagged for architect triage, not actioned
  by this overnight run (CLAUDE.md §4/hard rules forbid session/billing runtime changes
  without approval). **Blast radius checked this session:** no component or `app/`
  route was found calling `completeSession`/`cancelSession`/`noShowSession` from
  `actions/sessions.ts` — the live UI (`components/scheduling/SessionCompletionSheet.tsx`)
  calls `completeSessionAction` from `actions/schedulingActions.ts` instead, which
  routes through the real FD Session path (`sessionCompletionService.ts`). So this
  specific dead path appears **orphaned, not reachable from the UI today** — lower
  urgency than initially framed, but still worth a scoped cleanup PR (delete the three
  dead functions + their action wrappers + `actions/sessions.test.ts`'s
  now-misleading ownership-only coverage, or wire them to FD Session if a genuine
  no-show/cancel/reschedule UI is planned to reuse this file). Recommended as a
  future-session task, not urgent.
- **R-2 — WhatsApp consent state (US-059/PD-005) does not exist in schema or code.**
  No `opted_in`/`opt_in_requested`/`opted_out`/`unknown` field was found anywhere in
  `lib/db/schema.ts` or client types. `lib/goals/safety.ts` uses the word "consent" in
  an unrelated (goal-safety) context. This means **any WhatsApp reminder workflow built
  before this ships would have no consent gate to enforce** — directly contradicts
  Gate G5 and PD-005. Flagged for architect awareness before any US-048/US-050/US-059
  work begins; matches the doc pack's own "Not built" classification, so this is
  confirmation, not new risk.
- **R-3 — Unresolved Sessions (US-057) does not exist.** No code implements batch
  resolution of skipped session outcomes; the only repo hit for "unresolved session" is
  a historical architecture doc mention, not a component or service. Matches doc pack's
  "Not built, high-priority near-term" classification — confirmed, not new.
- **R-4 — PD-004 (Manual Invoice QuickAction placement) and PD-012 (canonical backlog
  adoption) remain open product decisions** per the doc pack itself. No code risk;
  flagged because Sprint 2/3 work referenced by this pack assumes these are resolved.

None of R-1..R-4 were acted on beyond documentation — consistent with the hard rule
against runtime changes to session/billing/WhatsApp/auth code during this run.

---

## 8. Summary Verdict

The doc pack is internally coherent, already cleaned up per its own review patch, and
directionally accurate against the live repo — **with two notable exceptions**: it
undercredits US-025/026/030 (test coverage landed the same day, likely just before or
concurrent with doc pack delivery) and it overcredits US-017/US-039 (action-layer code
exists but targets a dead backend path). Both corrections are captured in the
Traceability Map. Recommended posture: adopt the Sovereign Product Backlog v2.1 as
canonical per PD-012, but refresh
`FITDESK_BUILT_UPGRADE_NOT_BUILT_STATUS_V1_1.md` in a future docs-only pass before
using it to scope Sprint 2.
