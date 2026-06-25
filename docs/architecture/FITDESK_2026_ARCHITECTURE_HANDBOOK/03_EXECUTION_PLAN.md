# 03 — Execution Plan

> **Purpose:** Convert the roadmap (`02`) into an execution **order** governed by **phase gates**.
> **Deliberately contains no time/hour estimates** — progress is measured by gates passed, not hours spent.
> **Last verified:** 2026-06-25.

## Scope

The order in which work is done, the gate that must pass before moving on, and **commit-sequence
guidance** (the shape of commits) — not literal commits.

## Current known state

Program progress: **0 / 9 phases started.** Recommended next phase: **A**.

## Execution order & gates

Execute strictly in this order. Do not begin a phase until the prior gate is **GREEN**.

```text
A → C → B → D → E1 → E2 → E3 → F0 → F1 → E4 → H → I
                                   └─ G branches off AFTER F1, only when unfrozen
```

> Note: B and D may run in parallel with C if capacity allows, but A must finish first and E4 must
> follow F1.

### Gate sequence (each must be GREEN to advance)

| Step | Entry condition | Exit gate (GREEN means…) |
|---|---|---|
| **A** Source Control | safety tags created in all repos | no detached HEADs; `provisioning_api` clean & not-behind; worktrees justified; `git fsck` clean |
| **C** Token Repair | A green | shadcn utilities render correct palette (screenshot); build + tests green |
| **B** Deploy Contract | A green | `local:up` + `local:check` green on canonical compose/env; one env template; no prod edits |
| **D** Dead Code | A green | every removal grep-proven; build/tests green; scheduler primitives untouched |
| **E1** Migration Audit | D green | a file-by-file `features/*` move map + shim plan exists |
| **E2** Clients Migration | E1 green | clients build/test green; no `UI→ERP` direct calls |
| **E3** Dashboard Migration | E2 green | dashboard build/test green |
| **F0** UX Archaeology | A green | capability diff across 3 scheduler versions documented & signed off |
| **F1** Reconcile | F0 green | one scheduler; `ADR-SCH-001` committed; no UX regression unaddressed; branches archived as tags |
| **E4** Scheduling Migration | F1 green | canonical scheduler moved to `features/scheduling`; green |
| **H** CI/CD | E + F green | per-repo pipelines green; token-governance guard enforced |
| **I** Readiness Gate | all above green | `15` checklist passes; explicit deploy approval given |
| **G** Sessions | A+B+C+F green **and** PT/FD decision **and** approval | (frozen — see `09`) |

## Commit-sequence guidance (shape, not literal commits)

- **One atomic commit per logical unit.** Each builds and passes its checks. No "WIP" commits on `main`.
- **Phase A:** prefer git *operations* (re-attach via `switch`, `worktree remove`, snapshot tags)
  over commits; the few commits are: track `provisioning_api` ERP backend (classify each file first;
  approval-gated), and gitignore/track the two FitDesk untracked items.
- **Phase C:** a single `fix(ui): correct OKLCH token bridge` commit; optional separate lint-guard commit.
- **Phase D:** one commit per confirmed dead item; archive junk (root, unversioned) as a separate op.
- **Phase E (each sub-phase):** move → add re-export shim → update importers → green, one feature per commit.
- **Phase F:** `docs(adr): ADR-SCH-001` first; then a conditional UX-port commit; then orphan removal;
  then branch archival (tags) + deletion.
- **Phase H:** one `ci:` commit per repo.
- **Phase I:** no new commits; push only on instruction.

## Architecture rules

- Gates are binary. A "mostly done" phase is **not** GREEN.
- No phase may borrow scope from a later phase (e.g. no scheduler deletion during D — that is F).
- G never starts on schedule pressure; it starts when its entry conditions are literally true.

## Do-not-touch areas

- Anything frozen by `00`/`02` (scheduler until F0; session DocType until the decision).

## Open decisions

- Whether B/D run parallel to C (capacity call) — does not change the gates.
- The PT/FD Session decision (blocks G's entry condition).

## Verification checklist

- [ ] Before advancing, the current phase's exit gate is demonstrably GREEN (command output or screenshot attached).
- [ ] F0 sign-off recorded before any scheduler deletion.
- [ ] Deploy approval recorded before I.

## Related files / ADRs

- `02_CLEANUP_ROADMAP.md`, `04_SOURCE_CONTROL_STRATEGY.md`, `09_SCHEDULING_ARCHITECTURE.md`,
  `13_CI_CD_AND_DEPLOYMENT_STANDARDS.md`, `15_PRODUCTION_READINESS_CHECKLIST.md`.

## Next actions

- Create safety tags, then begin Phase A.
