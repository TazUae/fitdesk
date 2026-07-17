# Final Doc Pack Traceability Map

> Governed by `docs/DOCUMENTATION_AUTHORITY_MAP.md`. This is a tier-4 execution
> artifact: it maps `docs/product/*`-candidate story IDs (once imported from
> `axis-erp/_inputs/fitdesk-final-doc-pack-v1-1/`) to current repo state. It updates
> and extends `docs/execution/SPRINT_1_STORY_TRACEABILITY_MAP.md`, which only covered
> 4 of the 59 stories and predates PRs #25–#27. That file is not deleted or
> superseded wholesale — its US-018/025/026/030 rows are refined here with newer
> evidence; everything else in it (the mapping-problem framing, the "not ready for
> /goal" caveats) still applies.
>
> Companion doc: `docs/audits/OVERNIGHT_FINAL_DOC_PACK_AUDIT.md` (doc-pack-level
> findings). This file is the per-story breakdown.

## How to read this table

- **Code area** — the file(s)/module(s) that own or would own this story.
- **Status** — `Built` / `Partially built` / `Not built`, based on direct repo
  inspection during this pass (not the doc pack's self-reported status, though the
  two agree in most rows — divergences are called out).
- **Test coverage** — `Exists` / `Partial` / `Missing`.
- **Risk** — `Low` / `Medium` / `High`, from a pre-pilot-safety lens (tenant
  isolation, financial integrity, external-send safety), not general code quality.
- **Recommended next action** — the smallest safe next step, respecting this
  session's hard rules (no runtime changes to billing/session/auth/WhatsApp code).

---

## Part 1 — NOW Backlog (Sprint 1–3 candidates, full detail)

### FE-006 Platform Trust Loop

| Story | Code area | Status | Test coverage | Risk | Recommended next action |
|---|---|---|---|---|---|
| **US-025** Tenant-Isolation Test Coverage | `lib/clients/repository.ts` (`ClientRepository`), `actions/sessions.ts` (trainer-ownership gate) | Partially built | Exists (client repo + session-action ownership) — `lib/clients/__tests__/repository.test.ts` (PR #25): tenant guard on blank `tenantId`, cross-tenant read/write denial, `findClientsByStatus`, `listGoals`/`listEvents`/`listPendingActions`, `completeActionIntent`/`dismissActionIntent`, server-ctx-governs-tenant (payload tenantId ignored). Additionally, `actions/sessions.test.ts` (pre-existing, not part of PR #25) independently covers trainer-ownership denial for `completeSession`/`cancelSession`/`noShowSession` — real coverage for the ownership-gate concern the H5 doc originally flagged, even though (per R-1) the underlying ERP call those three actions guard is itself dead code. | Medium | Extend the `ClientRepository` pattern to the live session path (`lib/scheduling/sessionRepository.ts` / `sessionCompletionService.ts`), billing/package repositories (`lib/billing/*`), and invoices — none of these currently have a dedicated tenant-isolation test file found in this pass. This is real, scoped follow-up work, not a doc task — flag for a future test-only PR. |
| **US-026** Zero-Row Onboarding Validation | `app/onboarding/actions.ts` (`startWorkspace`) | Partially built | Exists (mocked) — `app/onboarding/actions.test.ts` (PR #26): zero-row happy path, existing-row no-reset guarantee (`completed`/`queued`/`running`), fail-closed validation (blank name, invalid country), Control-Plane-failure and orphan-safe-failure copy | Medium | Coverage is fully mocked (no live Control Plane, no DB). `docs/audits/PHASE_1C_ONBOARDING_CURRENT_USER_VALIDATION.md` records the *live* validation as still blocked on a test-data precondition (no confirmed zero-row test account existed as of that audit). Mocked unit coverage does not close that live-validation gap — it only proves the code's own logic is correct in isolation. Live re-validation requires provisioning a fresh zero-row test account, which is a tenant-provisioning action requiring explicit approval per `CLAUDE.md` §4. |
| **US-030** Production Feature Flag Verification | `lib/pilot.ts`, `.env.example` | Partially built | Exists — `lib/__tests__/pilot.test.ts` (PR #27): `isPilotMode`, `isExternalPaymentsAllowed`, `matchAllowlist` (exact/prefix, fail-closed, `+`-tolerant, multi-value) fully unit-tested | Low | Covers the *pilot-safety* flags (`PILOT_MODE`, `PILOT_ALLOW_EXTERNAL_PAYMENTS`, allowlist). Does **not** yet cover the full flag inventory Gate G3 requires (Client Hub visibility, Directory visibility, `NEXT_PUBLIC_GOAL_WORKSPACE`, `FITDESK_CLIENT_DIRECTORY_LOCAL_READ`/`_LOCAL_TENANTS`) as a single documented, verified inventory. A docs-only "flag inventory" table (flag → purpose → default → verified-safe-for-pilot) would close this gap without touching code — good next-session candidate. |

### FE-003 Session Outcome to Billing Loop

| Story | Code area | Status | Test coverage | Risk | Recommended next action |
|---|---|---|---|---|---|
| **US-018** Statement of Account UX Upgrade | `components/clients/StatementSheet.tsx`, `lib/statements/*`, `actions/statements.ts` | **Built** (further along than doc pack credits — see audit §5) | Exists — `lib/statements/groupAndFilter.test.ts`, `actions/statements.test.ts` | Low | The required copy ("Payment rows are temporarily unavailable...", "Totals from invoice balances") is already shipped. Recommend a docs-only pass to mark Gate G4 as satisfied pending one live/manual QA check against the exact doc-pack screenshot scenario (Applied amount visible + Payments filter selected + rows unavailable). No code change needed. |

### FE-001 Daily Command Center Loop

| Story | Code area | Status | Test coverage | Risk | Recommended next action |
|---|---|---|---|---|---|
| **US-057** Unresolved Sessions Batch Resolution | None found | **Not built** | Missing | Medium (revenue/attendance leakage if sessions silently age out) | No existing dashboard/session-outcome code models an "unresolved" state distinct from `scheduled`. Confirmed via repo-wide search — only a documentation mention exists (`docs/architecture/.../11_DASHBOARD_ARCHITECTURE.md`). This is a genuine build task, not a docs task — out of scope for tonight (would require new runtime code + schema decisions). Recommend as the top Sprint-2 candidate per the doc pack's own ordering. |
| **US-003 / US-027** Needs Attention (expansion) | `lib/dashboard/derive.ts` (`getAttentionItems`) | Partially built | Exists (for what's built) — `lib/dashboard/derive.test.ts` | Low | Confirmed: `getAttentionItems` only derives `overdue_invoice` / `pending_invoice` / `invoice_overflow` from `Invoice[]`. No session-outcome, no low-package-balance, no cancellation-risk, no follow-up-due signal — matches the doc pack's stated gap exactly. Expanding this is a runtime feature change (out of scope tonight); the function is well-isolated and pure, so it's a good future test-first target once approved. |

### FE-004 Retention and Renewal Loop

| Story | Code area | Status | Test coverage | Risk | Recommended next action |
|---|---|---|---|---|---|
| **US-059** WhatsApp Consent and Opt-In Safeguards | None found in `lib/db/schema.ts` or client types | **Not built** | Missing | **High** — this is a pre-pilot gate (G5) and currently has zero enforcement surface | No `opted_in`/`opt_in_requested`/`opted_out`/`unknown` field exists anywhere in the schema. `lib/evolution.ts` (WhatsApp/Evolution API adapter) exists but nothing gates it on consent state. This must be schema + runtime work, requires explicit approval (CLAUDE.md: WhatsApp behavior changes need approval), and should land **before** any US-048/US-050/US-047 work, exactly as the doc pack's own dependency ordering says (Gate G5 blocks Sprint 3). |
| **US-050** Package Renewal Reminder | None found | **Not built** | Missing | Low (no auto-charge risk since nothing exists yet) | Blocked behind US-059 per PD-010 and the doc pack's own sequencing — do not build reminder delivery before consent gating exists. |

---

## Part 2 — NEXT / LATER Backlog (summary, spot-checked)

The doc pack's own Built/Upgrade/Not-Built classification (§5–§7 of
`FITDESK_BUILT_UPGRADE_NOT_BUILT_STATUS_V1_1.md`) was spot-checked against the repo
for the stories with the clearest code footprint. No further disagreement found
beyond what's noted in the audit (§3.2 R-1 for US-017/US-039).

| Story | Doc pack status | Spot-check result |
|---|---|---|
| US-011 Client Hub | Built but needs upgrade | Not independently re-verified this pass — large surface area, lower pre-pilot priority |
| US-012 Action Queue | Built but needs upgrade | `client_action_intent` table + `completeActionIntent`/`dismissActionIntent` confirmed to exist and are tenant-scoped (see US-025 test evidence above) — consistent with doc pack |
| US-017 No-Show Session Outcome | Built but needs upgrade | **Disagreement** — see audit §3.2/§7 R-1. `actions/sessions.ts`'s `noShowSession` is tenant-guarded and unit-tested, but its ERP call (`lib/erpnext/client.ts`'s `markSessionMissed`) is an unconditional 503 stub, and its own test file mocks that stub away — so the passing tests don't prove the mutation works. Confirmed via grep: **no component or `app/` route calls this action** — it's orphaned, not wired to any UI. The live FD Session path (`sessionCompletionService.ts`) has no no-show transition at all (`MUTABLE_STATUSES` only allows `'scheduled'`/`'confirmed'` → `'completed'`). Actual status: **not built on the live path; dead code on the legacy path.** |
| US-039 Session Cancel / Reschedule Outcome | Built but needs upgrade | Same R-1 finding as US-017 — `actions/sessions.ts`'s `cancelSession` targets the dead PT Session stub and has no confirmed UI caller; FD Session has no cancel/reschedule transition. |
| US-013/US-014 Billing modes | Built | Confirmed — `lib/billing/*`, `sessionCompletionService.ts` PPS path |
| US-020–024 Goal System | Built | Confirmed — `lib/goals/{taxonomy,mapping,conflicts,safety}.ts` + full test suites |
| US-038 Client Pulse | Not built | Confirmed — no code found |
| US-043 AI Quick Add | Not built (doc pack) | **Disagreement** — `lib/clients/ai-parse.ts` + `lib/clients/__tests__/ai-parse.test.ts` exist. This appears **more built** than the doc pack credits; not independently verified end-to-end (UI wiring not checked), but the core parse logic is real, not absent. |
| US-046/047/052 | Not built | Not independently re-verified — consistent with doc pack, no contradicting evidence found |
| US-031–036, 055, 056 (future architecture) | Not built | Confirmed absent — matches doc pack exactly |

---

## Part 3 — Cross-Cutting Findings

1. **US-025/026/030 unit-test PRs (#25, #26, #27) landed on `main` the same day as
   this doc pack's dates**, immediately before this branch was cut. The prior
   `SPRINT_1_STORY_TRACEABILITY_MAP.md` (written before those merges) is now stale on
   those three rows specifically — its framing of "no US-ID convention, zero matches
   anywhere in the repo" is no longer true; `US-025`/`US-026`/`US-030` now appear
   verbatim in code comments in the corresponding test files.
2. **US-043 AI Quick Add is more built than the doc pack states** — worth a follow-up
   docs correction pass (not done here to stay within the 3-doc-file budget for this run).
3. **US-017/US-039 are less built than the doc pack states** on the live session
   backend — this is the single most important correction in this map, since Gate G6
   (Unresolved Sessions) and general session-outcome trust both depend on this being
   accurately scoped before Sprint 2 starts.

## Explicitly Out of Scope for This File

No acceptance criteria are authored here. No code changes were made to produce this
table — all findings are from read-only inspection of `main` @ `744c014` and the
doc pack input files.
