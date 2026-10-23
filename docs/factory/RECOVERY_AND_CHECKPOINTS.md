# Forge/Claude Durable Task Recovery Contract

Controller owns authoritative persisted state, not model conversation memory. Use GitHub Issues/PRs/checks as authority and a minimal durable task ledger (verified atomic storage) for checkpoints. Do not add Redis, Temporal or Kubernetes.

## Required checkpoint fields
- Task ID, approved issue/spec SHA, protected test SHA, repository and origin/main commit.
- Unique branch/worktree IDs, worker and credential-broker identities, holder/lease epoch and heartbeat, active writer count.
- Git HEAD/index/status, dirty-diff hash, files touched and staged/uncommitted changes.
- Stage state (isolate/build/test/review/merge/staging), last confirmed side effect and idempotency key.
- Combined Claude+Codex turn counts, wall-clock deadline, retry count, handoff count and subscription mode.
- Required CI/test results, artifacts, independent reviewer identity, deployment digest/ID and verified rollback status.
- Sanitized failure category and latest evidence references; never secrets/log payloads.

## Resume algorithm
1. Read latest checkpoint and live GitHub refs; verify target VPS and process ownership. Freeze further writers.
2. Distinguish transport failure (SSH/Tailscale/Windows) from WSL, Forge, worker, GitHub and Dokploy failure; do not infer task state from transport reachability.
3. Inspect worktree path, symlink/canonical root, expected remote, Git status/HEAD/diff hash, active owner process and leases.
4. Verify no task writer remains before reacquiring one lease. Fencing tokens prevent stale writers; do not keep two model sessions alive.
5. Reconcile pending PR/merge/deploy by **observing external effects**. An API JSON parse error may hide an already successful deploy; check history and commit/digest before retry.
6. Rehydrate remaining counters; if missing or exhausted, BLOCKED. Resume only an idempotent next step with task ID and new lease epoch.
7. Run affected tests again after repair or merge rebase. Preserve old logs and checkpoints; append, don't rewrite history.
8. On exit record Completed / Verified / Pending / Blocked and GO/NO-GO with exact evidence IDs.

## Bounded fault tests
- Kill worker mid-task, no duplicated writer/PR/merge/deploy; resume only once with provable lease ownership.
- SSH failure must not kill an unrelated healthy worker; stale WSL process must not be mistaken for latest task.
- Docker crash, provider auth error, prompt timeout and previously accepted but ambiguous Dokploy write are distinct codes.
- Lease expiry and task budget exhaustion fail closed.

Known last check: Forge checkout `/home/forge/novarra-core` HEAD `e787851ab3549c57d8df81436f602aa6e2b893a5` clean, 51 launcher tests + 24 process-observation tests PASS, full discovery 90s TIMEOUT and a Linux config test 15s TIMEOUT. **Do not claim Forge recovery QUALIFIED.**
