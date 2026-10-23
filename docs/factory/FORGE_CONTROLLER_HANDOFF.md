# Controller Integration Boundary — Forge vs FitDesk

The FitDesk repository contains **product-code Claude instructions**. Its own `CLAUDE.md` remains sovereign. These docs describe the **factory integration** and must not be treated as executable Forge code or a remote login grant.

## Source locations
- FitDesk: `TazUae/fitdesk` GitHub repository, branch protections and application code.
- Forge: read-only last inspected WSL checkout `/home/forge/novarra-core`, HEAD `e787851ab3549c57d8df81436f602aa6e2b893a5`. Existing `AGENTS.md` in Forge is separate. Do not copy/overwrite it.
- VPS3: Dokploy test resource confirmed on host `vmi3678859`. Helper pinned to fixed disposable Hello World test app. Not an authorization for arbitrary FitDesk staging.
- Access: only preauthorized Tailscale/SSH routes with StrictHostKeyChecking; verify actual VPS identity and resource ownership before mutation; no public-IP fallback.

## Forge reconciliation tasks
1. Verify hooks, `protected-paths.json`, worker launcher and actual enforcement; controller owns leases/checkpoints.
2. Diagnose hanging Forge tests without weakening test timeouts or removing protected tests. Historical 51+24 targeted unittest PASS do not qualify whole controller.
3. Prove credential isolation of the actual authenticated ACP subprocess/tool including environment, file descriptors and `/proc`. Synthetic user/canary/container success alone is insufficient.
4. Test one-writer/one-worktree fencing and crash recovery, verify no duplicate PR merge/deploy.
5. Integrate approved limits and confirmed usage-limit fallback. No arbitrary retry replay.
6. Only then allow one conditional FitDesk coding worker and independent different-model reviewer.

## Where to put controller-specific CLAUDE.md
**Not** inside the FitDesk repo as if it controls Forge. In a separately approved Forge documentation branch/worktree, add a short additive link to its existing `AGENTS.md` and independently reviewed policy; do not mutate its detached checkout or replace its existing rules here.

Stop any operation blocked by operator tooling; don't work around by switching identities or endpoints.
