# Zaidan Factory — Always-On Governance

Applies when work is labeled **Zaidan AI Software Factory**, **factory pilot**, or is connected to GitHub issue [#53](https://github.com/TazUae/fitdesk/issues/53). The existing root `CLAUDE.md` is the FitDesk sovereign product/security policy and is not replaced by this file. If instructions conflict, prefer the stricter safety/control boundary and raise the exact conflict.

## Approved project envelope
- v0.6.2 qualification pilot: **one FitDesk pay-per-session invoicing slice**. A second minimal synthetic project is permitted **only** to test concurrency and isolation.
- No full FitDesk/ClinicOS rebuild, banking, real payments, real customer/medical/financial data, public launch or production release.
- Preserve current source until versioned acceptance criteria are approved. Human-approved business rules **G1-DEC-01 through G1-DEC-08** are settled; do **not** ask again.
- User selected **A to Q1–Q14**, with conditions recorded in `docs/factory/OWNER_DECISIONS.md`. This is **scoped permission**, not blanket authorization.
- Funded by existing Claude Pro and ChatGPT subscriptions only. **Incremental API-billed usage: USD $0.** No API-key fallback, credits/top-ups or metered overage.
- Scope and limits: 1 active model executor globally; 1 writer/task; 8 combined model prompt turns and 10 min/task; 12 turns and 25 min/trial; 36 turns and 75 min/three-trial batch; 120s/prompt; one repair retry and at most one confirmed Claude-usage-limit-to-Codex handoff.
- Durable controller, not Claude's prompt, **must** enforce limits, leases, identity, permissions and unique side effects. Missing proof = fail closed.

## Required working style
1. Read `docs/factory/README.md`, the live issue/PR and relevant canonical FitDesk docs. Reconcile earlier decisions and commits; do not restart the approval questionnaire.
2. Use Graphify local code graph before structural/invoicing-path edits. See `.claude/skills/graphify/SKILL.md` and `docs/factory/GRAPHIFY_RUNBOOK.md`. Graph insights are advisory; verify file:line directly.
3. Create one branch/worktree/writer **only after** task authorization and authenticated-worker containment. Never resume interrupted work without the `RECOVERY_AND_CHECKPOINTS.md` procedure.
4. Required statuses: PLANNED, INSPECTED, IMPLEMENTED, TESTED, QUALIFIED, BLOCKED. Gate statuses PASS, FAIL, NOT_RUN; NOT_APPLICABLE only by preapproved policy. Any mandatory FAIL or NOT_RUN = NO-GO.
5. Never self-approve, merge, disable tests, weaken branch rules, edit protected acceptance suite, modify host network/secrets/permissions or perform production/staging writes without the **specific existing approval**.
6. Preserve evidence IDs and exact SHAs. Existing tests or source annotations do not prove deployed behavior. Independently review final candidate and rerun affected checks after repairs.

## Autonomous continuity
Continue on the next **authorized, independent and non-destructive** item after each verified checkpoint, without asking routine questions. If blocked, preserve work, classify the precise barrier, record evidence, and continue another approved independent task if available. **Never bypass a hard stop or let a new agent replay ambiguous effects.**

Detailed execution queue: `docs/factory/EXECUTION_QUEUE.md`. Report format: `docs/factory/EVIDENCE_STATUS.md`.
