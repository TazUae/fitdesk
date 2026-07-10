# Execution Kit v1.0

> Governed by [`docs/DOCUMENTATION_AUTHORITY_MAP.md`](../DOCUMENTATION_AUTHORITY_MAP.md).

## What this is

Execution Kit v1.0 is a bounded Claude Code execution environment for FitDesk:
a `CLAUDE.md` patch, an on-demand `fitdesk-spec` skill, five read-only review
subagents, and two deterministic PreToolUse guard hooks. It exists to make
`/plan` and `/goal` work on Sprint 1 stories safer and better-anchored to
approved docs — it changes nothing about how the app runs.

## Runtime neutrality

Execution Kit v1.0 is **runtime-neutral**: no application code, ERP/proxy
code, or auth code was touched; no dependencies were added; no migrations
were run. Every asset in this kit lives under `.claude/`, `CLAUDE.md`, or
`docs/execution/` and only affects how Claude Code behaves in this repo — it
has no effect on the deployed FitDesk application.

## Canonical source

Per [`EXECUTION_KIT_SUBMODULE_POLICY.md`](EXECUTION_KIT_SUBMODULE_POLICY.md),
this repo (`FitDesk/`) is the **canonical** source for all Execution Kit
assets. `fitdesk-platform/services/fitdesk` is a pinned deployment submodule
and is expected to lag. It must **never** be hand-edited to pick up these
changes — after this kit merges here, a separate, deliberate
`fitdesk-platform` PR must bump the `services/fitdesk` submodule pin. That PR
is out of scope for this change.

## Hooks: how they were verified

`.claude/hooks/guard-bash.mjs` and `.claude/hooks/guard-writes.mjs` are
Node-only (no dependencies) PreToolUse guards, wired via `.claude/settings.json`.
Before wiring, all of the following were verified from the `FitDesk/` repo
root:

```bash
node --check .claude/hooks/lib/hook-io.mjs
node --check .claude/hooks/guard-bash.mjs
node --check .claude/hooks/guard-writes.mjs
```

Behavior tests (PreToolUse JSON piped via stdin):

- A destructive Bash command (`rm -rf /`, `git push --force`, `docker system prune`, etc.) → guard-bash exits `2` (blocked).
- A read-only Bash command (`git status`, `docker ps`, `npm test`) → guard-bash exits `0` (allowed).
- A raw ERP credential literal (`ERP_API_KEY`/`ERP_API_SECRET`) written into a FitDesk source file → guard-writes exits `2` (blocked).
- A heuristic direct-ERP-bypass pattern (`/api/resource/`, `/api/method/`) outside `lib/erpnext/`/`lib/controlplane/` → guard-writes warns to stderr and exits `0` (allowed, not blocked).

All four cases passed on this host, so `.claude/settings.json` was created
with both hooks wired. If a future change to either script fails any of
these four cases, `.claude/settings.json` should be reverted to unwired
(scripts kept, hooks block removed) until the failing case is fixed and
re-verified — see the manual-invocation fallback below for how to run the
guards without `settings.json` wiring in the meantime.

### Manual invocation (fallback, if hooks are ever unwired)

```bash
# Check a Bash command before running it:
echo '{"tool_name":"Bash","tool_input":{"command":"<command>"}}' | node .claude/hooks/guard-bash.mjs

# Check a file write before applying it:
echo '{"tool_name":"Write","tool_input":{"file_path":"<path>","content":"<content>"}}' | node .claude/hooks/guard-writes.mjs
```

Exit `0` = allow, exit `2` = block (message on stderr in both cases; warnings
also print to stderr but still exit `0`).

## What is still open

- **Sprint 1 acceptance criteria are not authored.** No `docs/product/US-*.md`
  files exist yet for US-018, US-025, US-026, or US-030. The `fitdesk-spec`
  skill routes to this fact rather than fabricating criteria.
- **US-025 (Tenant-Isolation Test Coverage) `/plan` is the next Sprint 1
  planning target** after this kit merges — it has the clearest existing
  evidence trail ([`docs/security/H5-trainer-ownership.md`](../security/H5-trainer-ownership.md),
  [`SPRINT_1_STORY_TRACEABILITY_MAP.md`](SPRINT_1_STORY_TRACEABILITY_MAP.md))
  and the new `tenant-isolation-auditor` subagent is built to support it
  directly.
- The `fitdesk-platform` submodule pin bump (see above) remains a separate,
  future PR.
