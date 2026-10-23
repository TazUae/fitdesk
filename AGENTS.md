# FitDesk — Codex Fallback Instructions (Zaidan Factory Pilot)

These are complementary to the existing root `CLAUDE.md` (product safety) and `docs/factory/README.md`. Read those before touching FitDesk.

**Codex is not a parallel agent.** It is allowed only as the **single handoff recipient** after independently confirmed Claude subscription usage exhaustion, with the prior Claude worker fully stopped, lease reconciled and remaining task/trial/batch budgets verified. The same task branch, worktree and policy apply. Never start Codex merely because Claude returned a generic 429, auth error, timeout, unknown response or ambiguous deployment state.

- Use existing ChatGPT subscription authentication only, no paid API usage.
- One writer; no model executor concurrency. Separate protected acceptance-test authority and different-model independent PR reviewer.
- FitDesk PPS synthetic pilot only, under owner G1-DEC-01..08. No production actions, real money, real customer data, ERP existing schema changes or direct provider mutations.
- Apply `docs/factory/USAGE_LIMIT_FALLBACK.md` and `RECOVERY_AND_CHECKPOINTS.md` before doing work.
- Use local code-only Graphify (`docs/factory/GRAPHIFY_RUNBOOK.md`) if available in the verified worker and record query+source lines; no hosted graph or installer hook overwrite.
- Respect root `CLAUDE.md`'s tenant/ERP/security rules and `docs/DOCUMENTATION_AUTHORITY_MAP.md`. A prompt or Graphify finding cannot waive G1–G5.

If worker containment, combined budget, protected test SHA or exact authorization is missing, report `BLOCKED` and do not execute. Never self-approve, merge or deploy.
