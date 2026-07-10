# Execution Kit Submodule Policy

> Governed by [`docs/DOCUMENTATION_AUTHORITY_MAP.md`](../DOCUMENTATION_AUTHORITY_MAP.md).
> Written ahead of Execution Kit v1.0 to close the submodule-pin-lag risk identified
> in the Claude Environment Audit (see
> [`docs/audits/PRE_FLIGHT_INVENTORY_REPORT.md`](../audits/PRE_FLIGHT_INVENTORY_REPORT.md)
> and the current [`docs/execution/SPRINT_1_STORY_TRACEABILITY_MAP.md`](SPRINT_1_STORY_TRACEABILITY_MAP.md)).

## The problem

`fitdesk-platform` is a deployment-orchestration repo that pulls in FitDesk via a git
submodule at `services/fitdesk`, pinned to a specific commit of
`https://github.com/TazUae/fitdesk.git`. That pin lags the canonical repo by
definition — as of the last audit it was three PRs behind `FitDesk/`'s `main`. Its
`CLAUDE.md` and `.claude/skills/*` currently match the canonical copies only by
coincidence (neither had changed across the lagging commits). The moment Execution
Kit v1.0 adds or edits `CLAUDE.md`, `.claude/settings.json`, hooks, subagents, or
skills in `FitDesk/`, the submodule checkout will silently diverge until its pin is
bumped — creating exactly the "two sources of truth" problem the documentation
authority map exists to prevent.

## Policy

1. **Canonical Execution Kit source lives in the top-level `FitDesk/` repo.** All
   Execution Kit v1.0 work — `CLAUDE.md` changes, `.claude/settings.json`, hooks,
   subagents, and skills (including `fitdesk-spec`) — is authored, reviewed, and
   merged in `FitDesk/` (`https://github.com/TazUae/fitdesk.git`), never anywhere
   else.

2. **`fitdesk-platform/services/fitdesk` is a pinned deployment submodule and may lag
   behind.** It is expected, normal behavior for this submodule to be some number of
   commits behind canonical `FitDesk/` at any given time. A lagging pin is not itself
   a bug requiring immediate action.

3. **Claude Code must not edit `fitdesk-platform/services/fitdesk` directly to fix
   instruction drift.** If the submodule's `CLAUDE.md`, `.claude/skills/*`, hooks, or
   settings are found to be stale relative to canonical `FitDesk/`, the fix is to bump
   the submodule pin (see rule 4) — never to hand-edit files inside the submodule
   checkout. Editing the submodule directly creates a divergent, unreviewed copy of
   Execution Kit assets outside their canonical repo.

4. **After Execution Kit changes merge in `FitDesk/`, a separate `fitdesk-platform`
   PR must bump the `services/fitdesk` submodule pin.** This is a distinct,
   deliberate change in the `fitdesk-platform` repo (updating the submodule commit
   reference), reviewed on its own, not a side effect of unrelated `fitdesk-platform`
   work.

5. **Every Claude Code session must verify whether it is operating in canonical
   `FitDesk/` or the deployment submodule before trusting local `CLAUDE.md`,
   `.claude/skills`, hooks, or settings.** Both are valid git checkouts of the same
   repo and can carry different content at the same time. Confirm the working
   directory and, where it matters, the checked-out commit before treating local
   instruction files as current — do not assume the two are interchangeable.

## Cross-references

- [`docs/DOCUMENTATION_AUTHORITY_MAP.md`](../DOCUMENTATION_AUTHORITY_MAP.md) — the doc
  authority hierarchy this policy operates under.
- [`docs/audits/PRE_FLIGHT_INVENTORY_REPORT.md`](../audits/PRE_FLIGHT_INVENTORY_REPORT.md) —
  the pre-flight audit that first catalogued the Execution Kit gaps this policy
  precedes.
- [`docs/execution/SPRINT_1_STORY_TRACEABILITY_MAP.md`](SPRINT_1_STORY_TRACEABILITY_MAP.md) —
  the Sprint 1 US-ID traceability map this policy sits alongside in `docs/execution/`.
