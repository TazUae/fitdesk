# Zaidan AI Software Factory — Claude Code Execution Pack (v0.6.2)

**Purpose:** repo-local, reviewable instructions for Claude Code acting as **one bounded coding executor** in the FitDesk PPS invoicing factory qualification. No extra orchestrator, paid API billing, unapproved secrets or production launch.

**Status of this pack:** **PROPOSED / docs-only** until this PR is reviewed and merged. Writing Markdown alone does not activate secure worker containment, Graphify in a remote runtime, protected CI or production authorization.

## Read in order (only as needed)
1. Existing root `CLAUDE.md` and `docs/DOCUMENTATION_AUTHORITY_MAP.md` — sovereign FitDesk source, do not replace.
2. `OWNER_DECISIONS.md` — recorded owner decisions and the specific reservations.
3. `EXECUTION_QUEUE.md` — next task in dependency order, not an invitation to start a blocked worker.
4. `FITDESK_PPS_G1.md` — approved business behavior vs still-unapproved protected suite.
5. `USAGE_LIMIT_FALLBACK.md`, `RECOVERY_AND_CHECKPOINTS.md` — durable Claude/Codex boundaries.
6. `GRAPHIFY_RUNBOOK.md` — local code-only dependency graph; not enforcement.
7. `QUALITY_GATES_AND_TRIALS.md` — mandatory gates, seed trials, exit criteria.
8. `EVIDENCE_STATUS.md` — observed evidence and live/old distinction.
9. `PROTECTED_CHANGE_REQUESTS.md` — small exact approvals still reserved.
10. `FORGE_CONTROLLER_HANDOFF.md` — bounded controller responsibilities and source-repo separation.

## Responsibilities
- **Authority:** GitHub issue/PR + protected branch and Actions checks. Owner retains reserved approvals.
- **Control:** pre-existing Forge only after safe-autonomy hooks, leases and recovery are verified.
- **Executor:** one restricted Claude Code agent per task, on a unique branch/worktree.
- **Fallback:** one confirmed limit → isolated Codex; same budget and writer lease.
- **Verification:** deterministic checks + independent reviewer; separate protected acceptance owner.
- **Staging:** Dokploy tested **only for the fixed Hello World test app**; FitDesk target and rollout are separate.
- **Graphify:** local, code-only navigation for cross-file impact; always double-check the exact code.

## Start procedure
Run `/factory-resume` to **inspect and reconcile**, not immediately execute a worker; run `/graphify` before cross-file code design; use `/factory-qualify` to independently classify gate evidence.

Use existing subscriptions only, $0 incremental API-billed spending. Do not ask again for Q1–Q14, the eight approved business rules, or turn/time/retry limits.

## References
- Owner source of truth and current status: https://github.com/TazUae/fitdesk/issues/53
- FitDesk source baseline at last checkpoint: `3fdf1aa51873887b36e9ec9a82c9a3214cc1e434` (reverify every run).
- Original Project Pack v0.6.2 is the requirement baseline; October 19 audit is **historical evidence**, not live service status.
- Graphify earlier code-only audit: `docs/audits/PHASE_B0_GRAPHIFY_KNOWLEDGE_GRAPH_AUDIT.md`.
