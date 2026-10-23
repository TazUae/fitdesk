---
name: factory-resume
description: Reconcile authorized factory task, Forge state, Git, budget and ambiguity before continuing a bounded task; never replay uncertain writes.
---
# Factory Resume — Checkpoint-driven Continuation

1. Read `docs/factory/README.md`, `OWNER_DECISIONS.md`, `EXECUTION_QUEUE.md`, `EVIDENCE_STATUS.md`, and live GitHub issue/PR.
2. Confirm factory target identity and resource ownership. Differentiate Windows SSH/Tailscale, WSL, Forge controller, isolated worker, GitHub and Dokploy faults.
3. Before any writer is resumed, inventory task ID, branch/worktree, Git HEAD/status, dirty-diff hash, active writer/lease/PID, latest checkpoint, execution budget and last API/merge/deploy side effect. Save sanitized reconciliation.
4. Continue only **after** actual authenticated ACP credential/tool containment and enforced budget/lease recovery are independently PASS. Do not start a worker based solely on a container canary or a login-status line.
5. If Claude subscription limit is **confirmed**, stop/reap it, reconcile the previous effect, and hand off once to independently isolated subscription-authenticated Codex within the **remaining** task/trial/batch counts. A generic 429/auth/timeout/unknown is not confirmed usage exhaustion.
6. For a permitted next task: one branch/worktree/writer; work within approved G1 spec and protected-test SHA; use Graphify for dependency mapping; add nonprotected tests; open PR; never merge without enforced final-candidate checks and independent review.
7. Stop at any reserved approval or failing mandatory gate. Record Completed/Verified/Pending/Blocked and GO/NO-GO; continue only unrelated authorized safe work.

No infinite retries, unattended background promise, production credentials, paid API usage or skipped security gates.
