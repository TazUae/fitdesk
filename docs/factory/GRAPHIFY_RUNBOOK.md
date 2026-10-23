# Graphify — Local-Only Claude Code Integration Runbook

## Proven baseline
FitDesk has a historical `docs/audits/PHASE_B0_GRAPHIFY_KNOWLEDGE_GRAPH_AUDIT.md` recording code-only Graphify 0.8.49 on 2026-06-25: 2,296 nodes, 3,665 links and ignored local `graphify-out/`. That audit is **historical**, not proof current graph is fresh. On 2026-10-23, Graphify CLI **0.9.90** was found on the authorized Windows machine; Forge WSL `/home/forge/novarra-core` reported **GRAPHIFY_NOT_INSTALLED**. Target coding-worker environment is **NOT_VERIFIED**.

## Activation after review
1. Check exact repository identity, clean worktree and permitted scope. Reuse existing `.gitignore` (already ignores `graphify-out/`).
2. On the **approved worker machine**, verify `graphify --version` and approved/pinned package provenance. Package is `graphifyy` (two y's); do **not** install binaries on VPS or change network/secret policy without reviewed authorization.
3. Use the repo-local `.claude/skills/graphify/SKILL.md`. Claude Code may invoke `/graphify`. The skill/CLI route suffices; hosted Graphify Cloud and remote MCP are **not** approved.
4. For local code-only graph on a reviewed clean repository, run `graphify update .`; review generated `graphify-out/graph.json` (ignored), then `graphify query "PPS invoice creation path"` and targeted `graphify path`/`graphify explain`. Query outputs must include source file:line and provenance tags.
5. Do not trust prior graph after commit change: check Git HEAD, refresh incrementally after code edits with `graphify update .`, and verify source before acceptance.
6. Keep credentials, logs, .env, synthetic-to-real data, patient/customer exports, files outside current repo, binary secrets and auth stores outside graph ingestion. No semantic-doc extraction, embeddings, hosted storage, external API/model backend without explicit scope/privacy review.
7. Record graph version, HEAD, query summary, evidence ref and whether source verification passed.

## Do not disturb existing safety hooks
Existing `.claude/settings.json` has `guard-bash.mjs` and `guard-writes.mjs`. **Do not run `graphify install --project` or `graphify hook install` directly in the production/active repo**: both may write hooks/settings and require a reviewed diff + bypass tests first. Do not install `--strict` or block independent required test tooling before safety review. The new repo-local `graphify` skill is a non-executable instruction surface. An optional future Graphify MCP server would need a verified local Python environment and security review; **no .mcp.json included**.

## Acceptance for "Graphify is used"
`GRAPHIFY=TESTED` only if the real coding environment has the CLI, a current graph for the exact repository SHA, recorded query/path evidence, verified source line targets, and no ignored files committed. A Markdown instruction by itself is `IMPLEMENTED/NOT_TESTED`, not runtime enforcement.

Reference: https://graphify.com/integrations/claude-code
