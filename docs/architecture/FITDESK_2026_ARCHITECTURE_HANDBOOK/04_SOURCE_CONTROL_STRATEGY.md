# 04 — Source Control Strategy

> **Purpose:** Define how branches, worktrees, untracked ERP files, and pushes are governed so the
> "which copy is authoritative?" drift cannot recur.
> **Last verified:** 2026-06-25.

## Scope

All seven repos under `C:\Users\Lenovo\Dev\axis-erp` (the workspace root is **not** a git repo).

## Current known state (verified)

- **Canonical repos (7):** `FitDesk`, `control-plane`, `erp-execution-service`, `provisioning-agent`,
  `provisioning_api`, `bench-agent`, `fitdesk-app`.
- **FitDesk** on `main`, **ahead 17**, 2 untracked (`.claude/launch.json`, `docs/research/`).
- **`erp-execution-service`, `provisioning-agent`** in **detached HEAD**.
- **`provisioning_api`** **behind 1** with **untracked ERP-app files** (FD Session, `api/scheduling.py`, …).
- **17 extra git worktrees** across CP/EES/PA/prov_api (the sibling `*-suffix` directories).
- **`FitDesk;C`** — not a repo, not a worktree (accidental directory).

## Architecture rules

### Worktree policy
- Worktrees are a **temporary** tool for parallel work, never a permanent topology.
- **One canonical checkout per repo** is the steady state.
- Inventory with `git worktree list`. Each worktree must map to an **active** branch with a clear owner.
- Remove obsolete worktrees with `git worktree remove <path>` then `git worktree prune`. This is
  **non-destructive to commits/branches** — only the working directory is removed.
- Do not create new worktrees during the cleanup program except those a phase explicitly requires.

### Branch cleanup policy
- A branch may be deleted only if it is **merged into `main`** *or* has been **snapshot-tagged**
  (`git tag <name>-archive <sha>`) first. Verify with `git branch --merged` and `git log main..<branch>`.
- **Never delete a branch with unmerged commits without a tag.** (E.g. `backup/prepush-schedule-c0`
  has 72 unmerged commits — archive, do not delete, until reviewed.)
- Detached HEADs are resolved by `git switch <branch>` (re-attach), never by committing while detached.
- Target end-state branch counts are reduced but specific names require the A.8 triage (see `01`).

### Untracked ERP file policy
- **Untracked ERP/Frappe app files are a deployment risk.** They must be either committed (after
  per-file classification) or removed deliberately — never left to ship implicitly.
- DocType / server-script / API files (`provisioning_api/api/*`, `provisioning_api/api/doctype/*`)
  are **data-contract changes**: committing them is approval-gated (see `00`, `09`).
- The two FitDesk untracked items are config/notes, not app code — gitignore or track explicitly.

### Push / production-mutation rules
- **No push without explicit instruction.**
- **No force-push** (`--force` / `--force-with-lease`), **no rebase/amend of shared history**,
  **no branch switching of shared repos** without approval.
- **No direct production mutation:** no production server edits, env changes, container restarts,
  volume deletion, or provisioning retries. VPS debugging is read-only first.
- Local Docker state never proves VPS/Dokploy state.

### Safety-net rule
- Before any history-adjacent operation in a repo: `git tag pre-cleanup-<date>` and capture
  `git for-each-ref` output. Rollback = restore from tag/ref list.

## Do-not-touch areas

- `scheduler/*` and `backup/prepush-schedule-c0-before-rewrite` branches until F0.
- Production branches/remotes (push only on instruction).

## Open decisions

- **`fitdesk-app`** — live Frappe app or abandoned? (classification gates its branch policy).
- **`FitDesk;C`** — inspect contents, then remove (Phase D).
- **A.8 worktree-branch triage** — per-branch keep/drop list.

## Verification checklist

- [ ] `git worktree list` shows one justified checkout per active line of work.
- [ ] No repo in detached HEAD (`git rev-parse --abbrev-ref HEAD` ≠ `HEAD`).
- [ ] `provisioning_api` clean and not behind; ERP files committed or removed by decision.
- [ ] Safety tags exist before any prune/delete.
- [ ] No branch deleted without merge-or-tag.

## Related files

- All repos' `.git`; `provisioning_api/api/*`; `FitDesk/.gitignore`.

## Related ADRs

- Missing: **Source Control / Worktree Policy ADR** (see `14`). This document is the interim authority.

## Next actions

- Execute Phase A per `03`; promote a Source-Control ADR to formalize this policy.
